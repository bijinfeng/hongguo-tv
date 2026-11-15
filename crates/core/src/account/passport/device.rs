use super::{
    PassportClient, PassportError,
    client::{MAX_BODY, REGISTER, UA, cookie_pair, http_error, json, text},
    crypto, now_millis, sign, valid_id,
};
use reqwest::{
    Method, Url,
    header::{HeaderMap, HeaderValue},
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Device {
    pub(super) cdid: String,
    clientudid: String,
    pub(super) openudid: String,
    created: u64,
}
impl Device {
    pub(super) fn new() -> Result<Self, PassportError> {
        Ok(Self {
            cdid: crypto::uuid()?,
            clientudid: crypto::uuid()?,
            openudid: crypto::hex(&crypto::random::<8>()?),
            created: now_millis()?,
        })
    }
    pub(super) fn validate(&self) -> Result<(), PassportError> {
        let uuid = |s: &str| {
            s.len() == 36
                && s.bytes().enumerate().all(|(i, b)| {
                    if matches!(i, 8 | 13 | 18 | 23) {
                        b == b'-'
                    } else {
                        b.is_ascii_hexdigit()
                    }
                })
        };
        if !uuid(&self.cdid)
            || !uuid(&self.clientudid)
            || self.openudid.len() != 16
            || !self.openudid.bytes().all(|b| b.is_ascii_hexdigit())
            || self.created == 0
        {
            return Err(PassportError::InvalidResponse);
        }
        Ok(())
    }
    fn payload(&self, stamp: u64) -> Vec<u8> {
        let mut header = json!({
            "aid":8662,"access":"wifi","app_version":"7.3.5.32","app_version_minor":"","channel":"update_64",
            "device_brand":"Redmi","device_manufacturer":"Redmi","device_model":"25053RT47C","device_category":"phone","device_platform":"android",
            "os":"Android","os_api":36,"os_version":"16","density_dpi":520,"display_density":"xxxhdpi","resolution":"2772x1280",
            "language":"zh","timezone":8,"tz_name":"Asia/Shanghai","tz_offset":28800,"region":"CN","package":"com.phoenix.read"
        });
        let extra = json!({
            "version_code":73532,"manifest_version_code":73532,"update_version_code":73532,"apk_first_install_time":self.created,
            "cdid":self.cdid,"clientudid":self.clientudid,"openudid":self.openudid,"cpu_abi":"arm64-v8a","display_name":"红果短剧",
            "sdk_version":"3.7.2","sdk_target_version":29,"sdk_flavor":"china","guest_mode":0,"is_system_app":0,"not_request_sender":0,"oaid_may_support":true,
            "ipv6_list":[],"sim_serial_number":[],"custom":{"is_android_fold":0,"filter_warn":0,"web_ua":"","is_android_pad":0,"client_ipv4":""}
        });
        header
            .as_object_mut()
            .expect("literal header object")
            .extend(extra.as_object().expect("literal extra object").clone());
        json!({"magic_tag":"ss_app_log","_gen_time":stamp,"header":header})
            .to_string()
            .into_bytes()
    }
}
impl PassportClient {
    /// Registration is anonymous and never forwards a previous account's cookies or token.
    pub(crate) async fn register_device(&mut self) -> Result<(), PassportError> {
        if self.session.registered {
            return self.session.validate();
        }
        let stamp = now_millis()?;
        let ts = u32::try_from(stamp / 1000).map_err(|_| PassportError::Configuration)?;
        let body = crypto::encrypt_device(
            &self.session.device.payload(stamp),
            &crypto::random::<32>()?,
        )?;
        let mut query = self.query();
        query.remove("device_id");
        query.remove("iid");
        for (k, v) in [
            ("tt_data", "a".to_owned()),
            ("ts", ts.to_string()),
            ("_rticket", stamp.to_string()),
            ("package", "com.phoenix.read".to_owned()),
        ] {
            query.insert(k.into(), v);
        }
        let raw = sign::encode_query(&query);
        let mut h = HeaderMap::new();
        for (k, v) in [
            ("user-agent", UA),
            ("content-type", "application/octet-stream;tt-data=a"),
            (
                "accept",
                "application/json; charset=utf-8,application/x-protobuf",
            ),
            ("content-encoding", "gzip"),
            ("x-tt-request-tag", "t=0;n=1"),
            ("log-encode-type", "gzip"),
            ("lc", "102"),
            ("sdk-version", "2"),
            ("passport-sdk-version", "60755"),
            (
                "passport-sdk-settings",
                "device_transfer_s_0,device_transfer_ab_1",
            ),
            ("x-ss-dp", "8662"),
            ("x-vc-bdturing-sdk-version", "4.0.3.cn"),
            ("x-tt-store-region", "cn"),
            ("x-tt-store-region-src", "did"),
        ] {
            h.insert(k, HeaderValue::from_static(v));
        }
        for (k, v) in [
            ("x-khronos", ts.to_string()),
            ("x-argus", base64_encode(&ts.to_le_bytes())),
            ("x-ss-req-ticket", stamp.to_string()),
            ("x-ss-stub", crypto::hex(&crypto::md5(&body))),
            (
                "x-gorgon",
                crypto::registration_gorgon(&raw, &body, ts, u16::from_le_bytes(crypto::random()?)),
            ),
        ] {
            h.insert(
                k,
                HeaderValue::from_str(&v).map_err(|_| PassportError::Configuration)?,
            );
        }
        let target = Url::parse(&format!("{REGISTER}/service/2/device_register/?{raw}"))
            .map_err(|_| PassportError::Configuration)?;
        let response = self.send(target, Method::POST, h, body, MAX_BODY).await?;
        if response.status != 200 {
            return Err(http_error(&response));
        }
        let plain = if response.body.starts_with(&[0x74, 0x63, 5, 0x10, 0, 0]) {
            crypto::decrypt_device(&response.body)?
        } else {
            response.body
        };
        let payload = json(&plain)?;
        let id = |a: &str, b: &str| -> Result<String, PassportError> {
            let first = text(&payload[a]);
            let second = text(&payload[b]);
            let chosen = first
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(second.as_deref())
                .ok_or(PassportError::InvalidIdentity)?;
            if !valid_id(chosen)
                || second
                    .as_deref()
                    .is_some_and(|value| !valid_id(value) || value != chosen)
            {
                return Err(PassportError::InvalidIdentity);
            }
            Ok(chosen.into())
        };
        let device_id = id("device_id_str", "device_id")?;
        let install_id = id("install_id_str", "install_id")?;
        let mut next = self.session.clone();
        next.device_id = device_id;
        next.install_id = install_id;
        next.registered = true;
        for value in response.headers.get_all("set-cookie") {
            if let Ok(value) = value.to_str()
                && let Some((name, value, deleted)) = cookie_pair(value)
                && matches!(
                    name.as_str(),
                    "store-region" | "store-region-src" | "ttreq" | "odin_tt"
                )
            {
                if deleted {
                    next.cookies.remove(&name);
                } else {
                    next.cookies.insert(name, value);
                }
            }
        }
        next.cookies
            .insert("install_id".into(), next.install_id.clone());
        next.validate()?;
        self.session = next;
        Ok(())
    }
}
fn base64_encode(bytes: &[u8]) -> String {
    use base64::{Engine, engine::general_purpose};
    general_purpose::STANDARD.encode(bytes)
}
