use super::client::{QR, cookie_pair, data, http_error, json, login_uid, number, success, text};
use super::{
    PassportClient, PassportError, PersistedSession, QrChallenge, QrConfirmation, QrPoll,
    VerifiedSession, now_millis, valid_cookie,
};
use base64::{Engine, engine::general_purpose};
use reqwest::{
    Method, Url,
    header::{HeaderMap, HeaderValue},
};
use std::collections::BTreeMap;

const QR_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

pub(super) fn valid_redirect(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && url.port_or_known_default() == Some(443)
        && url
            .host_str()
            .is_some_and(|host| host == "hongguoduanju.com" || host.ends_with(".hongguoduanju.com"))
}
impl PassportClient {
    async fn qr_request(&mut self, url: Url) -> Result<super::client::Response, PassportError> {
        if !valid_redirect(&url) {
            return Err(PassportError::InvalidRedirect);
        }
        let mut h = HeaderMap::new();
        for (k, v) in [
            ("user-agent", QR_UA),
            ("referer", "https://hongguoduanju.com/"),
            ("origin", QR),
            ("accept", "application/json, text/javascript"),
        ] {
            h.insert(k, HeaderValue::from_static(v));
        }
        if let Some(cookie) = self.qr_cookies.header(&url)? {
            h.insert(
                "cookie",
                HeaderValue::from_str(&cookie).map_err(|_| PassportError::InvalidResponse)?,
            );
        }
        let response = self
            .send(url.clone(), Method::GET, h, Vec::new(), 2 * 1024 * 1024)
            .await?;
        self.qr_cookies.receive(&url, &response.headers)?;
        Ok(response)
    }
    async fn qr_json(
        &mut self,
        path: &str,
        params: BTreeMap<String, String>,
    ) -> Result<serde_json::Value, PassportError> {
        let mut q: BTreeMap<String, String> = [
            ("aid", "513755"),
            ("passport_jssdk_version", "3.4.10"),
            ("passport_jssdk_type", "normal"),
            ("account_sdk_source", "web"),
            ("is_from_ttaccountsdk", "1"),
            ("language", "zh"),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
        q.extend(params);
        let target = Url::parse(&format!("{QR}{path}?{}", super::sign::encode_query(&q)))
            .map_err(|_| PassportError::Configuration)?;
        let response = self.qr_request(target).await?;
        if response.status != 200 {
            return Err(http_error(&response));
        }
        let payload = json(&response.body)?;
        if !success(&payload)
            || payload
                .get("code")
                .is_some_and(|value| text(value).as_deref() != Some("0"))
        {
            return Err(PassportError::LoginRejected);
        }
        Ok(payload)
    }
    pub(crate) async fn qr_start(&mut self) -> Result<QrChallenge, PassportError> {
        self.qr_cookies = Cookies::default();
        let payload = self
            .qr_json(
                "/passport/web/get_qrcode/",
                [("next".into(), format!("{QR}/"))].into(),
            )
            .await?;
        let d = data(&payload).ok_or(PassportError::InvalidResponse)?;
        let token = d["token"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 8192 && super::header_value(s))
            .ok_or(PassportError::InvalidResponse)?
            .to_owned();
        let image = png(d["qrcode"].as_str().ok_or(PassportError::InvalidResponse)?)?;
        let now = now_millis()?;
        let expiry = match d.get("expire_time").filter(|v| !v.is_null()) {
            None => now.saturating_add(180000),
            Some(value) => {
                let n = number(value).ok_or(PassportError::InvalidResponse)?;
                if n > 1_000_000_000_000 {
                    n
                } else if n > 1_000_000_000 {
                    n.saturating_mul(1000)
                } else {
                    now.saturating_add(n.saturating_mul(1000))
                }
            }
        };
        Ok(QrChallenge {
            image,
            expires_at: expiry.max(now).min(now.saturating_add(600000)),
            token,
        })
    }
    pub(crate) async fn qr_poll(
        &mut self,
        challenge: &QrChallenge,
    ) -> Result<QrPoll, PassportError> {
        if now_millis()? >= challenge.expires_at {
            return Ok(QrPoll::Expired);
        }
        let payload = self
            .qr_json(
                "/passport/web/check_qrconnect/",
                [
                    ("next".into(), format!("{QR}/")),
                    ("token".into(), challenge.token.clone()),
                ]
                .into(),
            )
            .await?;
        let d = data(&payload).ok_or(PassportError::InvalidResponse)?;
        match text(&d["status"]).as_deref().unwrap_or("") {
            "" | "1" | "new" | "pending" => Ok(QrPoll::Pending),
            "2" | "scanned" => Ok(QrPoll::Scanned),
            "3" | "confirmed" => {
                let redirect = d["redirect_url"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned);
                if redirect.as_ref().is_some_and(|s| s.len() > 8192) {
                    return Err(PassportError::InvalidRedirect);
                }
                Ok(QrPoll::Confirmed(QrConfirmation { redirect }))
            }
            "4" | "cancelled" => Ok(QrPoll::Cancelled),
            "5" | "expired" => Ok(QrPoll::Expired),
            _ => Err(PassportError::InvalidResponse),
        }
    }
    pub(crate) async fn qr_complete(
        &mut self,
        confirmation: QrConfirmation,
    ) -> Result<VerifiedSession, PassportError> {
        let base = Url::parse(&format!("{QR}/")).map_err(|_| PassportError::Configuration)?;
        if let Some(redirect) = confirmation.redirect {
            let mut target = base
                .join(&redirect)
                .map_err(|_| PassportError::InvalidRedirect)?;
            let mut completed = false;
            for _ in 0..5 {
                let response = self.qr_request(target.clone()).await?;
                match response.status {
                    200 => {
                        completed = true;
                        break;
                    }
                    301 | 302 | 303 | 307 | 308 => {
                        let location = response
                            .headers
                            .get("location")
                            .and_then(|v| v.to_str().ok())
                            .filter(|s| !s.is_empty() && s.len() <= 8192)
                            .ok_or(PassportError::InvalidRedirect)?;
                        target = target
                            .join(location)
                            .map_err(|_| PassportError::InvalidRedirect)?;
                    }
                    _ => return Err(http_error(&response)),
                }
            }
            if !completed {
                return Err(PassportError::InvalidRedirect);
            }
        }
        let cookies = self.qr_cookies.for_url(&base)?;
        if !cookies
            .iter()
            .any(|(k, v)| matches!(k.as_str(), "sessionid" | "sessionid_ss") && !v.is_empty())
        {
            return Err(PassportError::MissingCredentials);
        }
        let payload = self
            .qr_json("/passport/account/info/v2/", BTreeMap::new())
            .await?;
        login_uid(&payload)?;
        let mut app = Self::new(PersistedSession::fresh()?)?;
        app.fixture = self.fixture.clone();
        app.register_device().await?;
        for (name, value) in cookies {
            if name != "install_id" {
                app.session.cookies.insert(name, value);
            }
        }
        let verified = app.verified(&payload)?;
        self.session = app.session;
        self.qr_cookies = Cookies::default();
        Ok(verified)
    }
}

fn png(value: &str) -> Result<String, PassportError> {
    let raw = value
        .trim()
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(value.trim());
    if raw.len() > 1024 * 1024 {
        return Err(PassportError::InvalidResponse);
    }
    let bytes = general_purpose::STANDARD
        .decode(raw)
        .map_err(|_| PassportError::InvalidResponse)?;
    if bytes.len() < 33
        || &bytes[..8] != b"\x89PNG\r\n\x1a\n"
        || bytes[8..12] != 13u32.to_be_bytes()
        || &bytes[12..16] != b"IHDR"
    {
        return Err(PassportError::InvalidResponse);
    }
    let width = u32::from_be_bytes(
        bytes[16..20]
            .try_into()
            .map_err(|_| PassportError::InvalidResponse)?,
    );
    let height = u32::from_be_bytes(
        bytes[20..24]
            .try_into()
            .map_err(|_| PassportError::InvalidResponse)?,
    );
    let depth = bytes[24];
    let color = bytes[25];
    let valid_depth = match color {
        0 => matches!(depth, 1 | 2 | 4 | 8 | 16),
        2 | 4 | 6 => matches!(depth, 8 | 16),
        3 => matches!(depth, 1 | 2 | 4 | 8),
        _ => false,
    };
    let mut crc = !0u32;
    for byte in &bytes[12..29] {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
        }
    }
    if !(32..=2048).contains(&width)
        || !(32..=2048).contains(&height)
        || !valid_depth
        || bytes[26] != 0
        || bytes[27] != 0
        || bytes[28] > 1
        || (!crc).to_be_bytes() != bytes[29..33]
    {
        return Err(PassportError::InvalidResponse);
    }
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

// The QR flow needs only this fixed website's cookie scope; no external domain is accepted.
#[derive(Default)]
pub(super) struct Cookies(Vec<Cookie>);
struct Cookie {
    name: String,
    value: String,
    domain: String,
    host_only: bool,
    path: String,
    secure: bool,
    expires: Option<u64>,
}
impl Cookies {
    fn receive(&mut self, url: &Url, headers: &HeaderMap) -> Result<(), PassportError> {
        let host = url.host_str().ok_or(PassportError::InvalidRedirect)?;
        let now = now_millis()?;
        for value in headers.get_all("set-cookie") {
            let value = value.to_str().map_err(|_| PassportError::InvalidResponse)?;
            let Some((name, value_part, mut deleted)) = cookie_pair(value) else {
                continue;
            };
            let mut cookie = Cookie {
                name,
                value: value_part,
                domain: host.into(),
                host_only: true,
                path: url
                    .path()
                    .rsplit_once('/')
                    .map_or("/", |(dir, _)| if dir.is_empty() { "/" } else { dir })
                    .into(),
                secure: false,
                expires: None,
            };
            let mut valid = true;
            let mut max_age = None;
            for part in value.split(';').skip(1) {
                let (key, val) = part.trim().split_once('=').unwrap_or((part.trim(), ""));
                match key.to_ascii_lowercase().as_str() {
                    "domain" => {
                        let domain = val.trim_start_matches('.').to_ascii_lowercase();
                        if domain.is_empty()
                            || !(domain == "hongguoduanju.com"
                                || domain.ends_with(".hongguoduanju.com"))
                            || !(host == domain || host.ends_with(&format!(".{domain}")))
                        {
                            valid = false;
                            break;
                        }
                        cookie.domain = domain;
                        cookie.host_only = false;
                    }
                    "path" if val.starts_with('/') && val.len() <= 4096 => cookie.path = val.into(),
                    "secure" => cookie.secure = true,
                    "max-age" => max_age = val.parse::<i64>().ok(),
                    "expires" => {
                        cookie.expires = http_date(val);
                        if cookie.expires.is_none() {
                            valid = false;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            if !valid {
                continue;
            }
            if let Some(age) = max_age {
                if age <= 0 {
                    deleted = true;
                } else {
                    cookie.expires = Some(now.saturating_add((age as u64).saturating_mul(1000)));
                }
            }
            self.0.retain(|old| {
                !(old.name == cookie.name && old.domain == cookie.domain && old.path == cookie.path)
            });
            if !deleted && cookie.expires.is_none_or(|expires| expires > now) {
                self.0.push(cookie);
            }
            if self.0.len() > 64 {
                return Err(PassportError::InvalidResponse);
            }
        }
        Ok(())
    }
    fn for_url(&self, url: &Url) -> Result<BTreeMap<String, String>, PassportError> {
        let host = url.host_str().ok_or(PassportError::InvalidRedirect)?;
        let now = now_millis()?;
        let mut selected = self
            .0
            .iter()
            .filter(|c| {
                (host == c.domain || (!c.host_only && host.ends_with(&format!(".{}", c.domain))))
                    && (!c.secure || url.scheme() == "https")
                    && c.expires.is_none_or(|expires| expires > now)
                    && (url.path() == c.path
                        || url
                            .path()
                            .strip_prefix(&c.path)
                            .is_some_and(|suffix| c.path.ends_with('/') || suffix.starts_with('/')))
            })
            .collect::<Vec<_>>();
        selected.sort_by_key(|c| c.path.len());
        Ok(selected
            .into_iter()
            .map(|c| (c.name.clone(), c.value.clone()))
            .collect())
    }
    fn header(&self, url: &Url) -> Result<Option<String>, PassportError> {
        let values = self.for_url(url)?;
        if values.iter().any(|(k, v)| !valid_cookie(k, v)) {
            return Err(PassportError::InvalidResponse);
        }
        let header = values
            .into_iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("; ");
        if header.len() > 128 * 1024 {
            return Err(PassportError::InvalidResponse);
        }
        Ok((!header.is_empty()).then_some(header))
    }
}
fn http_date(value: &str) -> Option<u64> {
    let parts = value.split_ascii_whitespace().collect::<Vec<_>>();
    if parts.len() != 6 || parts[5] != "GMT" {
        return None;
    }
    let day = parts[1].parse::<i64>().ok()?;
    let month = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    .iter()
    .position(|m| *m == parts[2])? as i64
        + 1;
    let mut year = parts[3].parse::<i64>().ok()?;
    if !(1601..=9999).contains(&year) || !(1..=31).contains(&day) {
        return None;
    }
    let clock = parts[4]
        .split(':')
        .map(str::parse::<i64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if clock.len() != 3
        || !(0..24).contains(&clock[0])
        || !(0..60).contains(&clock[1])
        || !(0..60).contains(&clock[2])
    {
        return None;
    }
    year -= i64::from(month <= 2);
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100
        + (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5
        + day
        - 1
        - 719468;
    Some((days * 86400 + clock[0] * 3600 + clock[1] * 60 + clock[2]).max(0) as u64 * 1000)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qr_cookie_scope_expiry_deletion_and_redirect_destinations_are_bounded() {
        let base = Url::parse("https://hongguoduanju.com/").unwrap();
        let login = Url::parse("https://hongguoduanju.com/passport/web/check_qrconnect/").unwrap();
        let mut cookies = Cookies::default();
        let mut h = HeaderMap::new();
        for value in [
            "root=synthetic; Path=/; Secure",
            "host=synthetic; Path=/passport; Secure",
            "domain=synthetic; Domain=hongguoduanju.com; Path=/; Secure",
            "evil=synthetic; Domain=com; Path=/",
            "old=synthetic; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        ] {
            h.append("set-cookie", HeaderValue::from_str(value).unwrap());
        }
        cookies.receive(&login, &h).unwrap();
        assert!(cookies.for_url(&base).unwrap().len() == 2);
        assert!(cookies.for_url(&login).unwrap().len() == 3);
        assert!(
            cookies
                .for_url(&Url::parse("https://sub.hongguoduanju.com/").unwrap())
                .unwrap()
                .len()
                == 1
        );
        assert!(
            cookies
                .for_url(&Url::parse("http://hongguoduanju.com/").unwrap())
                .unwrap()
                .is_empty()
        );
        let mut h = HeaderMap::new();
        h.insert(
            "set-cookie",
            HeaderValue::from_static("root=gone; Path=/; Max-Age=0"),
        );
        cookies.receive(&base, &h).unwrap();
        assert!(!cookies.for_url(&base).unwrap().contains_key("root"));
        assert!(http_date("Thu, 01 Jan 1970 00:00:00 GMT") == Some(0));
        assert!(http_date("Wed, 09 Jun 2021 10:18:14 GMT") == Some(1623233894000));
        for target in [
            "http://hongguoduanju.com/",
            "https://hongguoduanju.com:444/",
            "https://user@hongguoduanju.com/",
            "https://hongguoduanju.com/#secret",
            "https://hongguoduanju.com.evil.invalid/",
            "https://evil.invalid/",
        ] {
            assert!(!valid_redirect(&Url::parse(target).unwrap()));
        }
    }
}
