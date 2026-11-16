use super::{
    MfaResult, PassportError, PersistedSession, PhoneChallenge, PhoneCodeResult, PhoneCodeState,
    PhoneLogin, PhoneNumber, VerifiedSession, header_value, now_millis, sign, valid_cookie,
    valid_id,
};
use reqwest::{
    Client, Method, Url,
    header::{HeaderMap, HeaderValue},
};
use serde_json::Value;
#[cfg(any(test, feature = "test-support"))]
use std::net::IpAddr;
use std::{collections::BTreeMap, time::Duration};

pub(super) const API: &str = "https://api5-normal-lq.fqnovel.com";
pub(super) const REGISTER: &str = "https://log.snssdk.com";
pub(super) const QR: &str = "https://hongguoduanju.com";
pub(super) const UA: &str = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";
pub(super) const MAX_BODY: usize = 4 * 1024 * 1024;

/// One attempt owns its mutable cookies. No shared/global account identity exists here.
pub(crate) struct PassportClient {
    pub(super) http: Client,
    pub(super) session: PersistedSession,
    pub(super) fixture: Option<Url>,
    pub(super) qr_cookies: super::qr::Cookies,
}
pub(super) struct Response {
    pub(super) status: u16,
    pub(super) headers: HeaderMap,
    pub(super) body: Vec<u8>,
}
impl PassportClient {
    pub(crate) fn anonymous() -> Result<Self, PassportError> {
        Self::new(PersistedSession::fresh()?)
    }
    pub(crate) fn new(session: PersistedSession) -> Result<Self, PassportError> {
        session.validate()?;
        let http = crate::http::client_builder()
            .timeout(Duration::from_secs(25))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| PassportError::Configuration)?;
        Ok(Self {
            http,
            session,
            fixture: None,
            qr_cookies: super::qr::Cookies::default(),
        })
    }
    /// Explicit loopback fixtures only; production never accepts an upstream destination.
    #[cfg(any(test, feature = "test-support"))]
    pub(crate) fn for_loopback_tests(
        session: PersistedSession,
        origin: &str,
    ) -> Result<Self, PassportError> {
        let url = Url::parse(origin).map_err(|_| PassportError::Configuration)?;
        if url.scheme() != "http"
            || !url
                .host_str()
                .and_then(|h| h.trim_matches(['[', ']']).parse::<IpAddr>().ok())
                .is_some_and(|ip| ip.is_loopback())
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || url.port_or_known_default() == Some(0)
        {
            return Err(PassportError::Configuration);
        }
        let mut client = Self::new(session)?;
        client.fixture = Some(url);
        Ok(client)
    }
    pub(crate) fn credential(&self) -> PersistedSession {
        self.session.clone()
    }
    pub(super) async fn send(
        &self,
        logical: Url,
        method: Method,
        headers: HeaderMap,
        body: Vec<u8>,
        limit: usize,
    ) -> Result<Response, PassportError> {
        let mut actual = logical;
        if let Some(fixture) = &self.fixture {
            actual
                .set_scheme(fixture.scheme())
                .map_err(|_| PassportError::Configuration)?;
            actual
                .set_host(fixture.host_str())
                .map_err(|_| PassportError::Configuration)?;
            actual
                .set_port(fixture.port())
                .map_err(|_| PassportError::Configuration)?;
        }
        let mut response = self
            .http
            .request(method, actual)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let mut body = Vec::new();
        // Error and redirect bodies are never needed or decoded.
        if status == 200 {
            if response
                .content_length()
                .is_some_and(|size| size > limit as u64)
            {
                return Err(PassportError::InvalidResponse);
            }
            while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                if chunk.len() > limit.saturating_sub(body.len()) {
                    return Err(PassportError::InvalidResponse);
                }
                body.extend_from_slice(&chunk);
            }
        }
        Ok(Response {
            status,
            headers,
            body,
        })
    }
    pub(super) async fn app_request(
        &mut self,
        path: &str,
        form: BTreeMap<String, String>,
        international: bool,
    ) -> Result<Value, PassportError> {
        if !self.session.registered {
            return Err(PassportError::MissingCredentials);
        }
        let body = sign::encode_query(&form).into_bytes();
        let (query, mut h) = sign::sign(
            self.query(),
            &body,
            now_millis()?,
            &self.session.device_id,
            international,
        )?;
        for (key, value) in [
            ("user-agent", UA),
            ("accept", "application/json"),
            ("x-xs-from-web", "0"),
            ("sdk-version", "2"),
            ("passport-sdk-version", "5051452"),
            ("x-ss-dp", "8662"),
            ("x-tt-store-region-src", "did"),
            ("x-vc-bdturing-sdk-version", "4.0.3.cn"),
            ("lc", "101"),
            (
                "content-type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            ),
        ] {
            h.insert(key, HeaderValue::from_static(value));
        }
        h.insert(
            "x-tt-store-region",
            HeaderValue::from_str(
                self.session
                    .cookies
                    .get("store-region")
                    .map_or("cn", String::as_str),
            )
            .map_err(|_| PassportError::InvalidResponse)?,
        );
        if !self.session.token.is_empty() {
            h.insert(
                "x-tt-token",
                HeaderValue::from_str(&self.session.token)
                    .map_err(|_| PassportError::InvalidResponse)?,
            );
        }
        let cookie = self
            .session
            .cookies
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("; ");
        if !cookie.is_empty() {
            h.insert(
                "cookie",
                HeaderValue::from_str(&cookie).map_err(|_| PassportError::InvalidResponse)?,
            );
        }
        let url = Url::parse(&format!("{API}{path}?{query}"))
            .map_err(|_| PassportError::Configuration)?;
        let response = self.send(url, Method::POST, h, body, MAX_BODY).await?;
        if response.status != 200 {
            return Err(http_error(&response));
        }
        let payload = json(&response.body)?;
        // Publish cookies only from a bounded, valid response from the fixed App API.
        let mut next = self.session.clone();
        for value in response.headers.get_all("set-cookie") {
            if let Ok(value) = value.to_str()
                && let Some((name, value, deleted)) = cookie_pair(value)
            {
                if deleted {
                    next.cookies.remove(&name);
                } else {
                    next.cookies.insert(name, value);
                }
            }
        }
        if let Some(token) = response.headers.get("x-tt-token") {
            let token = token.to_str().map_err(|_| PassportError::InvalidResponse)?;
            if token.len() > 16384 || !header_value(token) {
                return Err(PassportError::InvalidResponse);
            }
            next.token = token.to_owned();
        }
        next.validate()?;
        self.session = next;
        Ok(payload)
    }
    pub(super) fn query(&self) -> BTreeMap<String, String> {
        let mut q = BTreeMap::new();
        for (k, v) in [
            ("ac", "wifi"),
            ("aid", "8662"),
            ("app_name", "novelread"),
            ("channel", "update_64"),
            ("device_brand", "Redmi"),
            ("device_platform", "android"),
            ("device_type", "25053RT47C"),
            ("dpi", "520"),
            ("language", "zh"),
            ("manifest_version_code", "73532"),
            ("os", "android"),
            ("os_api", "36"),
            ("os_version", "16"),
            ("resolution", "1280*2772"),
            ("ssmix", "a"),
            ("update_version_code", "73532"),
            ("version_code", "73532"),
            ("version_name", "7.3.5.32"),
        ] {
            q.insert(k.to_owned(), v.to_owned());
        }
        for (k, v) in [
            ("device_id", &self.session.device_id),
            ("iid", &self.session.install_id),
            ("cdid", &self.session.device.cdid),
            ("openudid", &self.session.device.openudid),
        ] {
            q.insert(k.into(), v.clone());
        }
        q
    }
    /// Call register_device separately first so the service can persist identity before any SMS delivery.
    pub(crate) async fn send_code(
        &mut self,
        phone: &PhoneNumber,
    ) -> Result<PhoneCodeResult, PassportError> {
        let mut form = phone_form(phone);
        form.insert("auto_read".into(), "0".into());
        form.insert("unbind_exist".into(), "34".into());
        form.insert("type".into(), xor("24"));
        match self
            .app_request(
                "/passport/mobile/send_code/v1/",
                form,
                phone.international(),
            )
            .await
        {
            Ok(payload) => {
                let retry = data(&payload)
                    .and_then(|d| number(&d["retry_time"]))
                    .filter(|n| (1..=3600).contains(n))
                    .unwrap_or(0) as u32;
                if success(&payload) {
                    return Ok(PhoneCodeResult {
                        state: PhoneCodeState::Sent,
                        retry_after: if retry > 0 { retry } else { 60 },
                        error: None,
                    });
                }
                Ok(PhoneCodeResult {
                    state: PhoneCodeState::Rejected,
                    retry_after: retry,
                    error: Some(failure(&payload)),
                })
            }
            Err(error) => {
                let (state, retry) = match error {
                    PassportError::UpstreamHttp {
                        status: 429,
                        retry_after,
                    } => (PhoneCodeState::Limited, retry_after.max(60)),
                    PassportError::UpstreamHttp {
                        status: 400..=499,
                        retry_after,
                    } if !matches!(error, PassportError::UpstreamHttp { status: 408, .. }) => {
                        (PhoneCodeState::Rejected, retry_after)
                    }
                    PassportError::MissingCredentials | PassportError::Configuration => {
                        return Err(error);
                    }
                    _ => (PhoneCodeState::Uncertain, error.retry_after().max(60)),
                };
                Ok(PhoneCodeResult {
                    state,
                    retry_after: retry,
                    error: Some(error),
                })
            }
        }
    }
    pub(crate) async fn login(
        &mut self,
        phone: &PhoneNumber,
        code: &str,
        ticket: Option<&str>,
    ) -> Result<PhoneLogin, PassportError> {
        if !(4..=8).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
            return Err(PassportError::InvalidInput);
        }
        let mut form = phone_form(phone);
        form.insert("code".into(), xor(code));
        if let Some(ticket) = ticket {
            if ticket.is_empty() || ticket.len() > 8192 || !header_value(ticket) {
                return Err(PassportError::InvalidInput);
            }
            form.insert("passport_mfa_retry_tag".into(), "1".into());
            form.insert("sms_code_key".into(), xor(ticket));
        }
        let payload = self
            .app_request("/passport/mobile/sms_login/", form, phone.international())
            .await?;
        if success(&payload) {
            return Ok(PhoneLogin::Verified(self.verified(&payload)?));
        }
        if let Some(challenge) = challenge(&payload) {
            return Ok(PhoneLogin::Mfa(challenge));
        }
        Err(failure(&payload))
    }
    pub(crate) async fn verify(
        &mut self,
        challenge: &PhoneChallenge,
        phone: &PhoneNumber,
    ) -> Result<MfaResult, PassportError> {
        let mut form = BTreeMap::new();
        for (k, v) in [
            ("encrypt_uid", challenge.encrypt_uid.as_str()),
            ("verify_ticket", ""),
            ("verify_scene", "sms_login"),
            ("verify_reason", "ato"),
            ("copywriting_key", "sms_login"),
            ("ies_safety_diversion_tag", "mfa"),
            ("new_verify_flow", ""),
            ("new_authn_sdk_version", "1.1.31"),
            ("new_authn_sdk_verify_reason", "ato"),
            ("new_authn_sdk_verify_scene", "sms_login"),
            ("request_tag_from", "h5"),
            ("new_authn_sdk_log_id", challenge.log_id.as_str()),
        ] {
            form.insert(k.into(), v.into());
        }
        form.insert(
            "biz_params".into(),
            serde_json::json!({"passport_mfa_retry_tag":"1","sms_code_key":challenge.code_key})
                .to_string(),
        );
        let payload = self
            .app_request("/passport/upsms/verify/", form, phone.international())
            .await?;
        if error_code(&payload).as_deref() == Some("1045") {
            return Ok(MfaResult::Pending);
        }
        if !success(&payload) {
            return Err(failure(&payload));
        }
        let d = data(&payload).ok_or(PassportError::InvalidResponse)?;
        let ticket = text(&d["ticket"])
            .filter(|s| !s.is_empty())
            .or_else(|| text(&d["verify_ticket"]))
            .filter(|s| !s.is_empty() && s.len() <= 8192 && header_value(s))
            .ok_or(PassportError::InvalidResponse)?;
        Ok(MfaResult::Ticket(ticket))
    }
    pub(super) fn verified(&mut self, payload: &Value) -> Result<VerifiedSession, PassportError> {
        let uid = login_uid(payload)?;
        if !self.session.has_credentials() {
            return Err(PassportError::MissingCredentials);
        }
        let d = data(payload).ok_or(PassportError::InvalidResponse)?;
        let name = ["screen_name", "name", "username"]
            .iter()
            .find_map(|k| d[*k].as_str().map(str::trim).filter(|s| !s.is_empty()))
            .unwrap_or("红果用户")
            .chars()
            .take(120)
            .collect();
        self.session.uid = Some(uid.clone());
        self.session.validate_for_uid(&uid)?;
        Ok(VerifiedSession {
            uid,
            name,
            credential: self.session.clone(),
        })
    }
}
fn network_error(error: reqwest::Error) -> PassportError {
    if error.is_timeout() {
        PassportError::Timeout
    } else {
        PassportError::Transport
    }
}
pub(super) fn http_error(response: &Response) -> PassportError {
    let retry_after = response
        .headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|n| *n <= 3600)
        .unwrap_or(0);
    PassportError::UpstreamHttp {
        status: response.status,
        retry_after,
    }
}
pub(super) fn json(bytes: &[u8]) -> Result<Value, PassportError> {
    serde_json::from_slice::<Value>(bytes)
        .ok()
        .filter(Value::is_object)
        .ok_or(PassportError::InvalidResponse)
}
pub(super) fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
pub(super) fn number(value: &Value) -> Option<u64> {
    text(value).and_then(|s| s.parse().ok())
}
pub(super) fn data(value: &Value) -> Option<&Value> {
    value.get("data").filter(|d| d.is_object())
}
pub(super) fn error_code(value: &Value) -> Option<String> {
    data(value)
        .and_then(|d| d.get("error_code"))
        .or_else(|| value.get("error_code"))
        .and_then(text)
}
pub(super) fn success(value: &Value) -> bool {
    value["message"].as_str() == Some("success")
        && data(value).is_some()
        && error_code(value).is_none_or(|code| code == "0")
}
pub(super) fn login_uid(value: &Value) -> Result<String, PassportError> {
    if !success(value) {
        return Err(failure(value));
    }
    let d = data(value).ok_or(PassportError::InvalidResponse)?;
    let string = text(&d["user_id_str"]);
    let numeric = text(&d["user_id"]);
    let uid = string
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(numeric.as_deref())
        .ok_or(PassportError::InvalidIdentity)?;
    if !valid_id(uid) || numeric.as_deref().is_some_and(|n| !valid_id(n) || n != uid) {
        return Err(PassportError::InvalidIdentity);
    }
    Ok(uid.to_owned())
}
fn failure(payload: &Value) -> PassportError {
    if error_code(payload).as_deref() == Some("1105") {
        return PassportError::CodeRejected;
    }
    // Interpret the reference's expiry phrases without returning remote text or private codes.
    let description = data(payload)
        .and_then(|d| d["description"].as_str())
        .or_else(|| payload["description"].as_str())
        .unwrap_or("");
    if description.len() <= 1024
        && ["验证已过期", "验证过期", "验证已失效", "长时间未操作"]
            .iter()
            .any(|phrase| description.contains(phrase))
    {
        return PassportError::ChallengeExpired;
    }
    PassportError::LoginRejected
}

fn xor(value: &str) -> String {
    super::crypto::hex(&value.bytes().map(|b| b ^ 5).collect::<Vec<_>>())
}
fn phone_form(phone: &PhoneNumber) -> BTreeMap<String, String> {
    [
        ("mobile".into(), xor(&phone.wire())),
        ("account_sdk_source".into(), "app".into()),
        ("passport_support_flow".into(), "captcha,verify".into()),
        ("mix_mode".into(), "1".into()),
    ]
    .into()
}
fn challenge(payload: &Value) -> Option<PhoneChallenge> {
    let d = data(payload)?;
    let encrypt_uid = d["encrypt_uid"].as_str()?.to_owned();
    let code_key = d["sms_code_key"].as_str()?.to_owned();
    let log_id = d["event_params"]["log_id"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let way = d["verify_ways"].as_array()?.iter().find(|v| {
        v["verify_way"].as_str() == Some("upsms")
            || v["sms_content"].as_str().is_some_and(|s| !s.is_empty())
    })?;
    let sms_number = text(&way["channel_mobile"])?;
    let sms_content = way["sms_content"].as_str()?.to_owned();
    if encrypt_uid.is_empty()
        || encrypt_uid.len() > 8192
        || code_key.is_empty()
        || code_key.len() > 8192
        || log_id.len() > 1024
        || sms_number.is_empty()
        || sms_number.len() > 32
        || !sms_number.bytes().all(|b| b.is_ascii_digit() || b == b'+')
        || sms_content.is_empty()
        || sms_content.len() > 2048
        || !header_value(&sms_content)
    {
        return None;
    }
    Some(PhoneChallenge {
        sms_number,
        sms_content,
        encrypt_uid,
        code_key,
        log_id,
    })
}
pub(super) fn cookie_pair(value: &str) -> Option<(String, String, bool)> {
    if value.len() > 32768 {
        return None;
    }
    let mut parts = value.split(';');
    let (name, value) = parts.next()?.trim().split_once('=')?;
    if !valid_cookie(name, value) {
        return None;
    }
    let deleted = parts.any(|part| {
        part.trim().split_once('=').is_some_and(|(key, value)| {
            key.eq_ignore_ascii_case("max-age")
                && value.trim().parse::<i64>().is_ok_and(|age| age <= 0)
        })
    });
    Some((name.to_owned(), value.to_owned(), deleted))
}
