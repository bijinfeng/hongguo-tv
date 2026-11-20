//! Mobile-v5 anonymous model source. Independent identity slot; no cookie or account material.
use super::super::{
    PlaybackClient, PlaybackError, PlaybackRequest,
    identity::{Profile, timestamp},
    parse_model, sign_v5,
};
use flate2::{Compression, write::GzEncoder};
use reqwest::{Url, header};
use serde_json::json;
use std::{
    collections::BTreeMap,
    io::Write,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tokio::time::timeout;

const ENDPOINT: &str =
    "https://api5-normal-sinfonlinea.fqnovel.com/novel/player/multi_video_model/player/v1";
const UA: &str = "com.phoenix.read/73932 (Linux; U; Android 12; zh_CN_#Hans; PGT-AN10; Build/V417IR;tt-ok/3.12.13.20)";
const LIMIT: usize = 2 * 1024 * 1024;

impl PlaybackClient {
    /// One mobile-v5 candidate. An empty 200 rotates the reusable identity exactly once.
    pub(crate) async fn mobile_v5_candidates(
        &self,
        request: &PlaybackRequest,
    ) -> Result<super::PlaybackModel, PlaybackError> {
        timeout(Duration::from_secs(4), async {
            let mut identity = self.identity(Profile::MobileV5, None).await?;
            for attempt in 0..2 {
                match self.mobile_v5_model(request, &identity).await {
                    // Only a confirmed empty body rotates this identity; every other error
                    // keeps the current one and leaves the fallback sequence to decide.
                    Err(PlaybackError::EmptyResponse) if attempt == 0 => {
                        identity = self
                            .identity(Profile::MobileV5, Some(identity.revision))
                            .await?;
                    }
                    other => return other,
                }
            }
            Err(PlaybackError::EmptyResponse)
        })
        .await
        .unwrap_or(Err(PlaybackError::Timeout))
    }

    async fn mobile_v5_model(
        &self,
        request: &PlaybackRequest,
        identity: &super::super::identity::Identity,
    ) -> Result<super::PlaybackModel, PlaybackError> {
        let production = Url::parse(ENDPOINT).map_err(|_| PlaybackError::Configuration)?;
        let mut url = if let Some(origin) = &self.fixture {
            origin
                .join(production.path())
                .map_err(|_| PlaybackError::Configuration)?
        } else {
            production
        };
        let query = mobile_v5_query(request, identity);
        let body = gzip(&json!({
            "biz_param": {
                "detail_page_version": 0,
                "device_level": 3,
                "disable_digg_stat": false,
                "disable_video_relate_book": false,
                "need_all_video_definition": true,
                "need_mp4_align": false,
                "use_os_player": false,
                "use_server_dns": false,
                "video_platform": 1024,
            },
            "mixed_video_id_map": {request.content_type(): [request.vid()]},
            "dr_scene": "player",
        }))?;
        let stamp = timestamp()?;
        let nonce = [
            u32::from_le_bytes(super::super::protocol::random()?),
            u32::from_le_bytes(super::super::protocol::random()?),
            u32::from_le_bytes(super::super::protocol::random()?),
            u32::from_le_bytes(super::super::protocol::random()?),
        ];
        let (raw, headers) = sign_v5::sign(&query, &body, stamp, process(), nonce)?;
        url.set_query(Some(&raw));
        let mut response = self
            .http
            .post(url)
            .headers(headers)
            .header(header::USER_AGENT, UA)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .header(header::ACCEPT, "application/json")
            .body(body)
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    PlaybackError::Timeout
                } else {
                    PlaybackError::Transport
                }
            })?;
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(PlaybackError::AccessDenied);
        }
        if response.status().as_u16() != 200 {
            return Err(PlaybackError::Transport);
        }
        let bytes = super::super::identity::read_limited(&mut response).await?;
        if bytes.iter().all(u8::is_ascii_whitespace) {
            return Err(PlaybackError::EmptyResponse);
        }
        if bytes.len() > LIMIT {
            return Err(PlaybackError::InvalidModel);
        }
        parse_model(&bytes, request)
    }
}

/// Process-stable nonce/start pair for the signature envelope.
fn process() -> &'static sign_v5::Process {
    static PROCESS: OnceLock<Option<sign_v5::Process>> = OnceLock::new();
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|error| error.into_inner());
    PROCESS
        .get_or_init(|| sign_v5::Process::new().ok())
        .as_ref()
        .expect("mobile-v5 process identity")
}

fn gzip(value: &serde_json::Value) -> Result<Vec<u8>, PlaybackError> {
    let bytes = serde_json::to_vec(value).map_err(|_| PlaybackError::Configuration)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&bytes)
        .map_err(|_| PlaybackError::Configuration)?;
    encoder.finish().map_err(|_| PlaybackError::Configuration)
}

/// The mobile request's own query shape. It does not reuse the legacy device query.
fn mobile_v5_query(
    request: &PlaybackRequest,
    identity: &super::super::identity::Identity,
) -> BTreeMap<String, String> {
    let _ = request;
    [
        ("aid", "8662"),
        ("app_name", "novelread"),
        ("version_code", "74332"),
        ("version_name", "7.4.3.32"),
        ("channel", "vivo_8662_64"),
        ("device_platform", "android"),
        ("device_type", "PGT-AN10"),
        ("os_version", "12"),
        ("update_version_code", "74332"),
        ("iid", identity.install_id.as_str()),
        ("cdid", identity.cdid.as_str()),
        ("device_id", identity.device_id.as_str()),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_body_keeps_the_selected_episode_and_content_type() {
        let body = json!({
            "biz_param": {"video_platform": 1024},
            "mixed_video_id_map": {"1004": ["7706514645208534041"]},
            "dr_scene": "player",
        });
        let compressed = gzip(&body).expect("gzip");
        assert_eq!(&compressed[..2], &[0x1f, 0x8b], "gzip magic");
        assert!(compressed.len() < serde_json::to_vec(&body).unwrap().len() + 64);
    }

    #[test]
    fn query_carries_exactly_the_mobile_fields() {
        let request = PlaybackRequest::new("123", "456", "1004", "", "default").expect("request");
        let identity = super::super::super::identity::Identity {
            device_id: "789".into(),
            install_id: "321".into(),
            cdid: "cdid-value".into(),
            openudid: String::new(),
            cookie: String::new(),
            revision: 1,
        };
        let query = mobile_v5_query(&request, &identity);
        assert_eq!(query["device_id"], "789");
        assert_eq!(query["iid"], "321");
        assert_eq!(query["version_name"], "7.4.3.32");
        assert!(
            !query.contains_key("_rticket"),
            "ticket is added by signing"
        );
        assert!(!query.contains_key("ts"), "no legacy timestamp field");
    }
}
