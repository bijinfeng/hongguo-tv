use super::{PlaybackError, protocol};
use base64::{Engine, engine::general_purpose};
use reqwest::{Client, Url, header};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{sync::watch, task::AbortHandle, time::timeout};

const REGISTER: &str = "https://log.snssdk.com/";
const REGISTER_SINGLE: &str = "https://log5-applog-lq.fqnovel.com/";
const COOLDOWN: Duration = Duration::from_secs(600);
const IDENTITY_TTL: Duration = Duration::from_secs(1800);
const UA: &str = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";

/// Instance-scoped anonymous playback transport. No account or persisted client identity.
#[derive(Clone)]
pub struct PlaybackClient {
    pub(super) http: Client,
    pub(super) fixture: Option<Url>,
    caches: [Arc<IdentityCache>; 3],
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Profile {
    Legacy,
    Single,
    RegisteredSingle,
}

#[derive(Clone)]
pub(super) struct Identity {
    pub(super) device_id: String,
    pub(super) install_id: String,
    pub(super) cdid: String,
    pub(super) openudid: String,
    pub(super) cookie: String,
    pub(super) revision: u64,
}

#[derive(Default)]
struct CacheState {
    ready: Option<(Identity, Instant)>,
    pending: Option<Pending>,
    revision: u64,
    cooldown: Option<Instant>,
    last_error: Option<PlaybackError>,
}
type Registration = Option<Result<Identity, PlaybackError>>;
struct Pending {
    revision: u64,
    owners: usize,
    abort: AbortHandle,
    result: watch::Receiver<Registration>,
}
#[derive(Default)]
struct IdentityCache {
    state: Mutex<CacheState>,
}

struct Owner {
    cache: Arc<IdentityCache>,
    revision: u64,
}
impl Drop for Owner {
    fn drop(&mut self) {
        let Ok(mut state) = self.cache.state.lock() else {
            return;
        };
        if let Some(pending) = &mut state.pending
            && pending.revision == self.revision
        {
            pending.owners -= 1;
            if pending.owners == 0 {
                pending.abort.abort();
                state.pending = None;
                state.last_error = Some(PlaybackError::Transport);
            }
        }
    }
}

impl PlaybackClient {
    /// Initialize TLS and three finite of short-lived anonymous identity slots.
    pub fn new() -> Result<Self, PlaybackError> {
        Self::build(None)
    }

    /// Fixture-only transport; all provider and registration requests remain on this origin.
    /// Accepts bare HTTP loopback IP origins, never user/API configuration.
    pub fn for_loopback_tests(origin: &str) -> Result<Self, PlaybackError> {
        let url = Url::parse(origin).map_err(|_| PlaybackError::Configuration)?;
        let loopback = url
            .host_str()
            .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if url.scheme() != "http"
            || !loopback
            || url.port_or_known_default() == Some(0)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(PlaybackError::Configuration);
        }
        Self::build(Some(url))
    }

    fn build(fixture: Option<Url>) -> Result<Self, PlaybackError> {
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        let http = Client::builder()
            .http1_only()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| PlaybackError::Configuration)?;
        Ok(Self {
            http,
            fixture,
            caches: std::array::from_fn(|_| Arc::new(IdentityCache::default())),
        })
    }

    pub(super) async fn identity(
        &self,
        profile: Profile,
        rejected: Option<u64>,
    ) -> Result<Identity, PlaybackError> {
        let cache = &self.caches[profile as usize];
        let (mut result, _owner) = {
            let mut state = cache
                .state
                .lock()
                .map_err(|_| PlaybackError::Configuration)?;
            if state.pending.is_none()
                && let Some((ready, until)) = &state.ready
                && Instant::now() < *until
                && rejected != Some(ready.revision)
            {
                return Ok(ready.clone());
            }
            if state.pending.is_none() {
                if state.cooldown.is_some_and(|until| Instant::now() < until) {
                    return Err(state.last_error.unwrap_or(PlaybackError::EmptySource));
                }
                state.revision = state
                    .revision
                    .checked_add(1)
                    .ok_or(PlaybackError::Capacity)?;
                let revision = state.revision;
                if rejected.is_some() {
                    state.cooldown = Some(Instant::now() + COOLDOWN);
                }
                let (tx, rx) = watch::channel(None);
                let weak = Arc::downgrade(cache);
                let client = self.clone();
                let task = tokio::spawn(async move {
                    let result =
                        timeout(Duration::from_secs(8), client.register(profile, revision))
                            .await
                            .unwrap_or(Err(PlaybackError::Timeout));
                    if let Some(cache) = weak.upgrade()
                        && let Ok(mut state) = cache.state.lock()
                        && state
                            .pending
                            .as_ref()
                            .is_some_and(|p| p.revision == revision)
                    {
                        match &result {
                            Ok(identity) => {
                                state.ready =
                                    Some((identity.clone(), Instant::now() + IDENTITY_TTL));
                                state.last_error = None;
                            }
                            Err(error) => {
                                state.last_error = Some(*error);
                                state.cooldown = Some(Instant::now() + COOLDOWN);
                            }
                        }
                        tx.send_replace(Some(result));
                        state.pending = None;
                    }
                });
                state.pending = Some(Pending {
                    revision,
                    owners: 0,
                    abort: task.abort_handle(),
                    result: rx,
                });
            }
            let pending = state.pending.as_mut().ok_or(PlaybackError::Configuration)?;
            pending.owners += 1;
            (
                pending.result.clone(),
                Owner {
                    cache: cache.clone(),
                    revision: pending.revision,
                },
            )
        };
        loop {
            if let Some(result) = result.borrow().clone() {
                return result;
            }
            result
                .changed()
                .await
                .map_err(|_| PlaybackError::Transport)?;
        }
    }

    pub(super) async fn register(
        &self,
        profile: Profile,
        revision: u64,
    ) -> Result<Identity, PlaybackError> {
        let stamp = timestamp()?;
        let cdid = protocol::uuid()?;
        let clientudid = protocol::uuid()?;
        let openudid = protocol::hex(&protocol::random::<8>()?);
        let mut header = json!({
            "aid":8662,"access":"wifi","app_version":"7.3.5.32","app_version_minor":"","channel":"update_64",
            "device_brand":"Redmi","device_manufacturer":"Redmi","device_model":"25053RT47C","device_category":"phone","device_platform":"android",
            "os":"Android","os_api":36,"os_version":"16","density_dpi":520,"display_density":"xxxhdpi","resolution":"2772x1280",
            "language":"zh","timezone":8,"tz_name":"Asia/Shanghai","tz_offset":28800,"region":"CN","package":"com.phoenix.read"
        });
        let runtime_header = json!({
            "version_code":73532,"manifest_version_code":73532,"update_version_code":73532,"apk_first_install_time":stamp,
            "cdid":cdid,"clientudid":clientudid,"openudid":openudid,"cpu_abi":"arm64-v8a","display_name":"红果短剧",
            "sdk_version":"3.7.2","sdk_target_version":29,"sdk_flavor":"china","guest_mode":0,"is_system_app":0,"not_request_sender":0,"oaid_may_support":true,
            "ipv6_list":[],"sim_serial_number":[],"custom":{"is_android_fold":0,"filter_warn":0,"web_ua":"","is_android_pad":0,"client_ipv4":""}
        });
        header
            .as_object_mut()
            .ok_or(PlaybackError::Configuration)?
            .extend(
                runtime_header
                    .as_object()
                    .ok_or(PlaybackError::Configuration)?
                    .clone(),
            );
        if profile == Profile::Single {
            for (key,value) in json!({"display_name":"红果免费短剧","app_version":"7.3.9.32","app_version_minor":"7.3.9.32","version_code":73932,"manifest_version_code":73932,"update_version_code":73932,"channel":"xiaomi_8662_64","device_brand":"Xiaomi","device_manufacturer":"Xiaomi","device_model":"23127PN0CC","os_api":34,"os_version":"14","density_dpi":460,"resolution":"2670x1200","device_id":"0","install_id":"0","req_id":clientudid}).as_object().ok_or(PlaybackError::Configuration)? {header[key]=value.clone();}
            header["oaid"] = json!({"req_id":cdid,"hw_id_version_code":"0","take_ms":"6","is_track_limited":"false","query_times":"1","id":cdid,"time":(stamp-200).to_string()});
        }
        if profile == Profile::RegisteredSingle {
            let source = json!({"display_name":"红果免费短剧","aid":8662,"app_version":"7.3.5.32","version_code":73532,"manifest_version_code":73532,"update_version_code":73532,"channel":"update_64","package":"com.phoenix.read","app_language":"zh","os":"Android","os_version":"16","os_api":36,"device_model":"25053RT47C","device_brand":"Redmi","device_manufacturer":"Xiaomi","cpu_abi":"arm64-v8a","density_dpi":520,"display_density":"xxhdpi","resolution":"2772x1280"});
            header = source;
            let rest = json!({"language":"zh","timezone":8,"access":"wifi","openudid":openudid,"clientudid":clientudid,"cdid":cdid,"region":"CN","tz_name":"Asia/Shanghai","tz_offset":28800,"sim_region":"cn","device_platform":"android","not_request_sender":0,"is_system_app":0,"sdk_flavor":"china","rom":"OS2.0","rom_version":"BP2A.250605.031.A3"});
            header
                .as_object_mut()
                .ok_or(PlaybackError::Configuration)?
                .extend(
                    rest.as_object()
                        .ok_or(PlaybackError::Configuration)?
                        .clone(),
                );
        }
        let payload = serde_json::to_vec(
            &json!({"magic_tag":"ss_app_log","header":header,"_gen_time":stamp}),
        )
        .map_err(|_| PlaybackError::Configuration)?;
        let body = if profile == Profile::RegisteredSingle {
            payload
        } else {
            protocol::encrypt_device(&payload, &protocol::random::<32>()?)?
        };
        let mut query = device_query(profile, &cdid, &openudid);
        query.extend([
            ("tt_data".into(), "a".into()),
            ("ts".into(), (stamp / 1000).to_string()),
            ("_rticket".into(), stamp.to_string()),
            ("package".into(), "com.phoenix.read".into()),
        ]);
        if profile == Profile::RegisteredSingle {
            for key in ["tt_data", "ts", "package", "cdid", "openudid"] {
                query.remove(key);
            }
            query.insert("req_id".into(), protocol::uuid()?);
        }
        let query = encode_query(&query);
        let origin = self.fixture.clone().unwrap_or(
            Url::parse(if profile == Profile::Single {
                REGISTER_SINGLE
            } else {
                REGISTER
            })
            .map_err(|_| PlaybackError::Configuration)?,
        );
        let mut url = origin
            .join("/service/2/device_register/")
            .map_err(|_| PlaybackError::Configuration)?;
        url.set_query(Some(&query));
        let nonce = u16::from_le_bytes(protocol::random()?);
        let mut response = if profile == Profile::RegisteredSingle {
            self.http
                .post(url)
                .header(header::USER_AGENT, UA)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .header(header::ACCEPT, "application/json")
                .body(body)
                .send()
                .await
                .map_err(network_error)?
        } else {
            self.http
                .post(url)
                .header(
                    header::USER_AGENT,
                    if profile == Profile::Single {
                        SINGLE_UA
                    } else {
                        UA
                    },
                )
                .header(header::CONTENT_TYPE, "application/octet-stream;tt-data=a")
                .header(
                    header::ACCEPT,
                    "application/json; charset=utf-8,application/x-protobuf",
                )
                .header(header::CONTENT_ENCODING, "gzip")
                .header("X-Tt-Request-Tag", "t=0;n=1")
                .header("Log-Encode-Type", "gzip")
                .header("Lc", "102")
                .header("Sdk-Version", "2")
                .header("Passport-Sdk-Version", "60755")
                .header(
                    "Passport-Sdk-Settings",
                    "device_transfer_s_0,device_transfer_ab_1",
                )
                .header("X-SS-DP", "8662")
                .header("X-Vc-Bdturing-Sdk-Version", "4.0.3.cn")
                .header("X-Tt-Store-Region", "cn")
                .header("X-Tt-Store-Region-Src", "did")
                .header("X-Khronos", (stamp / 1000).to_string())
                .header(
                    "X-Argus",
                    general_purpose::STANDARD.encode(((stamp / 1000) as u32).to_le_bytes()),
                )
                .header("X-SS-Req-Ticket", stamp.to_string())
                .header("X-SS-STUB", protocol::hex(&protocol::md5(&body)))
                .header(
                    "X-Gorgon",
                    protocol::registration_gorgon(&query, &body, (stamp / 1000) as u32, nonce),
                )
                .body(body)
                .send()
                .await
                .map_err(network_error)?
        };
        if response.status().as_u16() != 200 {
            return Err(PlaybackError::Transport);
        }
        let mut cookies = BTreeMap::new();
        for value in response.headers().get_all(header::SET_COOKIE) {
            if let Ok(value) = value.to_str()
                && let Some((name, value)) = value.split(';').next().and_then(|s| s.split_once('='))
                && matches!(name, "ttreq" | "store-region" | "store-region-src")
                && !value.is_empty()
                && value
                    .bytes()
                    .all(|b| (0x21..=0x7e).contains(&b) && b != b';' && b != b',')
            {
                cookies.insert(name.to_string(), value.to_string());
            }
        }
        let mut body = read_limited(&mut response).await?;
        if body.starts_with(&[0x74, 0x63, 5, 0x10, 0, 0]) {
            body = protocol::decrypt_device(&body)?;
        }
        let root: Value = serde_json::from_slice(&body).map_err(|_| PlaybackError::InvalidModel)?;
        let id = |a: &str, b: &str| {
            root[a]
                .as_str()
                .map(str::to_owned)
                .or_else(|| match &root[b] {
                    Value::String(s) => Some(s.clone()),
                    Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
        };
        let device_id = id("device_id_str", "device_id").ok_or(PlaybackError::InvalidModel)?;
        let install_id = id("install_id_str", "install_id").ok_or(PlaybackError::InvalidModel)?;
        for value in [&device_id, &install_id] {
            if value.is_empty()
                || value.len() > 32
                || !value.bytes().all(|b| b.is_ascii_digit())
                || value.bytes().all(|b| b == b'0')
            {
                return Err(PlaybackError::InvalidModel);
            }
        }
        if profile != Profile::RegisteredSingle {
            cookies.insert("install_id".into(), install_id.clone());
        } else {
            cookies.clear();
        }
        Ok(Identity {
            device_id,
            install_id,
            cdid,
            openudid,
            cookie: cookies
                .into_iter()
                .map(|(k, v)| format!("{k}={v}"))
                .collect::<Vec<_>>()
                .join("; "),
            revision,
        })
    }
}

pub(super) const SINGLE_UA: &str = "com.phoenix.read/73932 (Linux; U; Android 14; zh_CN; 23127PN0CC; Build/UKQ1.230804.001; Cronet/TTNetVersion:8d40f833 2026-03-03 QuicVersion:21ac1950 2025-11-18)";
pub(super) fn timestamp() -> Result<u64, PlaybackError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|_| PlaybackError::Configuration)
}
pub(super) fn network_error(error: reqwest::Error) -> PlaybackError {
    if error.is_timeout() {
        PlaybackError::Timeout
    } else {
        PlaybackError::Transport
    }
}
pub(super) async fn read_limited(
    response: &mut reqwest::Response,
) -> Result<Vec<u8>, PlaybackError> {
    const LIMIT: usize = 4 * 1024 * 1024;
    if response.content_length().is_some_and(|n| n > LIMIT as u64) {
        return Err(PlaybackError::InvalidModel);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if chunk.len() > LIMIT - body.len() {
            return Err(PlaybackError::InvalidModel);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
pub(super) fn encode_query(query: &BTreeMap<String, String>) -> String {
    let mut encoded = reqwest::Url::parse("https://fixture.invalid/").expect("static URL");
    encoded.query_pairs_mut().extend_pairs(query);
    encoded.query().unwrap_or("").into()
}
pub(super) fn device_query(
    profile: Profile,
    cdid: &str,
    openudid: &str,
) -> BTreeMap<String, String> {
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
        ("cdid", cdid),
        ("openudid", openudid),
    ] {
        q.insert(k.into(), v.into());
    }
    if profile == Profile::Single {
        for (k, v) in [
            ("channel", "xiaomi_8662_64"),
            ("device_brand", "Xiaomi"),
            ("device_type", "23127PN0CC"),
            ("dpi", "460"),
            ("manifest_version_code", "73932"),
            ("os_api", "34"),
            ("os_version", "14"),
            ("resolution", "1200*2670"),
            ("update_version_code", "73932"),
            ("version_code", "73932"),
            ("version_name", "7.3.9.32"),
            ("host_abi", "arm64-v8a"),
            ("dragon_device_type", "phone"),
            ("pv_player", "73932"),
            ("compliance_status", "0"),
            ("need_personal_recommend", "1"),
            ("player_so_load", "1"),
            ("is_android_pad_screen", "0"),
        ] {
            q.insert(k.into(), v.into());
        }
    }
    q
}

#[cfg(test)]
mod tests;
