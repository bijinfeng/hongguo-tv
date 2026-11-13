use super::{
    PlaybackClient, PlaybackError, PlaybackModel, PlaybackRequest,
    identity::{
        Identity, Profile, SINGLE_UA, device_query, encode_query, network_error, read_limited,
        timestamp,
    },
    parse_model, sign,
};
use reqwest::{Url, header};
use serde_json::json;
use std::{collections::BTreeMap, time::Duration};
use tokio::time::timeout;

const TAB: &str =
    "https://api5-normal-sinfonlineb.fqnovel.com/reading/bookapi/video_tab/multi_video_model/v1/";
const LEGACY: &str =
    "https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_model/v1/";
const ALTERNATE: &str = "https://api5-normal-hl.fqnovel.com/novel/player/multi_video_model/v1/";
const REGISTERED: &str = "https://api5-normal-sinfonlineb.fqnovel.com/novel/player/video_model/v1/";
const SINGLE: &str = "https://api5-normal-sinfonlinea.fqnovel.com/novel/player/video_model/v1/";
const PLAYBACK_UA: &str = "com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)";
const REGISTERED_UA: &str = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";

/// Fixed anonymous providers, not caller-controlled endpoints or plugins.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaybackSource {
    /// Current official GET model.
    VideoTab,
    /// Fresh registered legacy POST, first host.
    RegisteredLegacy,
    /// Fresh registered legacy POST, alternate host.
    RegisteredLegacyAlternate,
    /// Dedicated 7.3.5.32 single protocol and identity.
    RegisteredSingle,
    /// Older 7.3.9.32 single protocol and identity.
    LegacySingle,
}

impl PlaybackClient {
    /// Fetch candidates from one fixed provider. This is NOT media readiness or playback success.
    /// Dropping the future cancels this attempt and detaches its registration lease.
    pub async fn candidates(
        &self,
        request: &PlaybackRequest,
        source: PlaybackSource,
    ) -> Result<PlaybackModel, PlaybackError> {
        timeout(
            Duration::from_secs(if source == PlaybackSource::RegisteredSingle {
                4
            } else {
                8
            }),
            async {
                let (profile, cached) = match source {
                    PlaybackSource::VideoTab => (Profile::Legacy, true),
                    PlaybackSource::RegisteredSingle => (Profile::RegisteredSingle, true),
                    PlaybackSource::LegacySingle => (Profile::Single, false),
                    _ => (Profile::Legacy, false),
                };
                let identity = if cached {
                    self.identity(profile, None).await?
                } else {
                    self.register(profile, 0).await?
                };
                let result = self.request_model(request, source, &identity).await;
                if cached && matches!(result, Err(PlaybackError::EmptyResponse)) {
                    let identity = self.identity(profile, Some(identity.revision)).await?;
                    self.request_model(request, source, &identity).await
                } else {
                    result
                }
            },
        )
        .await
        .unwrap_or(Err(PlaybackError::Timeout))
    }

    async fn request_model(
        &self,
        request: &PlaybackRequest,
        source: PlaybackSource,
        identity: &Identity,
    ) -> Result<PlaybackModel, PlaybackError> {
        let endpoint = match source {
            PlaybackSource::VideoTab => TAB,
            PlaybackSource::RegisteredLegacy => LEGACY,
            PlaybackSource::RegisteredLegacyAlternate => ALTERNATE,
            PlaybackSource::RegisteredSingle => REGISTERED,
            PlaybackSource::LegacySingle => SINGLE,
        };
        let production = Url::parse(endpoint).map_err(|_| PlaybackError::Configuration)?;
        let mut url = if let Some(origin) = &self.fixture {
            origin
                .join(production.path())
                .map_err(|_| PlaybackError::Configuration)?
        } else {
            production
        };
        let stamp = timestamp()?;
        let mut q = match source {
            PlaybackSource::LegacySingle => {
                device_query(Profile::Single, &identity.cdid, &identity.openudid)
            }
            _ => playback_query(identity),
        };
        let builder = if source == PlaybackSource::VideoTab {
            for (k, v) in [
                ("video_id", request.vid()),
                ("video_id_type", "0"),
                ("device_level", "1"),
                ("need_all_video_definition", "1"),
                ("need_mp4_align", "0"),
                ("use_os_player", "0"),
                ("video_platform", "1024"),
                ("source", "0"),
                ("from_video_id", ""),
            ] {
                q.insert(k.into(), v.into());
            }
            q.insert("_rticket".into(), stamp.to_string());
            url.set_query(Some(&encode_query(&q)));
            self.http
                .get(url)
                .header(header::USER_AGENT, PLAYBACK_UA)
                .header(header::ACCEPT, "application/json; charset=utf-8")
        } else {
            let body = match source {
                PlaybackSource::RegisteredLegacy | PlaybackSource::RegisteredLegacyAlternate => {
                    json!({"biz_param":{"detail_page_version":0,"device_level":3,"disable_digg_stat":false,"need_all_video_definition":true,"need_mp4_align":false,"use_os_player":false,"use_server_dns":false,"video_platform":1024},"mixed_video_id_map":{request.content_type():[request.vid()]}})
                }
                PlaybackSource::RegisteredSingle => {
                    json!({"biz_param":{"need_all_video_definition":true,"video_platform":3},"content_type":1,"video_id":request.vid()})
                }
                _ => {
                    json!({"biz_param":{"video_id_type":0,"need_all_video_definition":true,"video_platform":3},"video_id":request.vid()})
                }
            };
            if source == PlaybackSource::RegisteredSingle {
                q = device_query(Profile::Legacy, "", "");
                q.remove("cdid");
                q.remove("openudid");
            }
            q.insert("device_id".into(), identity.device_id.clone());
            q.insert("iid".into(), identity.install_id.clone());
            let bytes = serde_json::to_vec(&body).map_err(|_| PlaybackError::Configuration)?;
            let (raw, headers) =
                sign::sign(q, &bytes, stamp, source == PlaybackSource::RegisteredSingle)?;
            url.set_query(Some(&raw));
            let mut builder = self
                .http
                .post(url)
                .headers(headers)
                .header(
                    header::USER_AGENT,
                    if source == PlaybackSource::RegisteredSingle {
                        REGISTERED_UA
                    } else if source == PlaybackSource::LegacySingle {
                        SINGLE_UA
                    } else {
                        PLAYBACK_UA
                    },
                )
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .header(
                    header::ACCEPT,
                    "application/json; charset=utf-8,application/x-protobuf",
                )
                .header("X-XS-From-Web", "0")
                .header("Sdk-Version", "2")
                .body(bytes);
            if source != PlaybackSource::RegisteredSingle {
                builder = builder
                    .header("Passport-Sdk-Version", "50561")
                    .header("X-Tt-Request-Tag", "t=0;n=0")
                    .header("X-Vc-Bdturing-Sdk-Version", "3.7.2.cn")
                    .header("X-Tt-Store-Region", "cn")
                    .header("X-Tt-Store-Region-Src", "did");
            }
            builder
        };
        let builder = if identity.cookie.is_empty() {
            builder
        } else {
            builder.header(header::COOKIE, &identity.cookie)
        };
        let mut response = builder.send().await.map_err(network_error)?;
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(PlaybackError::AccessDenied);
        }
        if response.status().as_u16() != 200 {
            return Err(PlaybackError::Transport);
        }
        let body = read_limited(&mut response).await?;
        if body.iter().all(u8::is_ascii_whitespace) {
            return Err(PlaybackError::EmptyResponse);
        }
        let result = parse_model(&body, request);
        if matches!(
            result,
            Err(PlaybackError::EmptySource | PlaybackError::UnsupportedMedia)
        ) && let Some((fallback, duration, media_id)) =
            super::model::fallback_reference(&body, request)
        {
            return self
                .fallback_model(request, &fallback, duration, media_id.as_deref())
                .await;
        }
        result
    }

    async fn fallback_model(
        &self,
        request: &PlaybackRequest,
        raw: &str,
        duration: Option<f64>,
        media_id: Option<&str>,
    ) -> Result<PlaybackModel, PlaybackError> {
        let original = Url::parse(raw).map_err(|_| PlaybackError::InvalidModel)?;
        let fixture = self
            .fixture
            .as_ref()
            .is_some_and(|origin| origin.origin() == original.origin());
        let trusted = original.host_str().is_some_and(|host| {
            ["fqnovel.com", "snssdk.com"]
                .into_iter()
                .any(|suffix| host == suffix || host.ends_with(&format!(".{suffix}")))
        });
        if !original.username().is_empty()
            || original.password().is_some()
            || original.fragment().is_some()
            || if self.fixture.is_some() {
                !fixture
            } else {
                original.scheme() != "https"
                    || original.port_or_known_default() != Some(443)
                    || !trusted
            }
        {
            return Err(PlaybackError::InvalidModel);
        }
        let mut last = PlaybackError::UnsupportedMedia;
        for codec in [
            "",
            "codec_type=1",
            "codec_type=0&force_codec=h264",
            "codec_type=3",
        ] {
            let mut url = original.clone();
            if !codec.is_empty() {
                // Preserve signed query ordering, duplicate keys and escaping byte-for-byte.
                let kept = original
                    .query()
                    .unwrap_or("")
                    .split('&')
                    .filter(|part| {
                        let name = part.split('=').next().unwrap_or("");
                        let decoded =
                            reqwest::Url::parse(&format!("https://fixture.invalid/?{name}=x"))
                                .ok()
                                .and_then(|u| u.query_pairs().next().map(|(k, _)| k.into_owned()));
                        !matches!(decoded.as_deref(), Some("codec_type" | "force_codec"))
                            && !part.is_empty()
                    })
                    .collect::<Vec<_>>()
                    .join("&");
                url.set_query(Some(&if kept.is_empty() {
                    codec.into()
                } else {
                    format!("{kept}&{codec}")
                }));
            }
            let mut response = self
                .http
                .get(url)
                .header(header::USER_AGENT, PLAYBACK_UA)
                .header(header::ACCEPT, "application/json")
                .send()
                .await
                .map_err(network_error)?;
            if matches!(response.status().as_u16(), 401 | 403) {
                return Err(PlaybackError::AccessDenied);
            }
            if response.status().as_u16() != 200 {
                return Err(PlaybackError::Transport);
            }
            let body = read_limited(&mut response).await?;
            let root: serde_json::Value =
                serde_json::from_slice(&body).map_err(|_| PlaybackError::InvalidModel)?;
            for envelope in [&root, &root["video_info"]] {
                for name in ["code", "Code", "error_code"] {
                    if let Some(code) = envelope[name]
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| envelope[name].as_number().map(ToString::to_string))
                        && !code.is_empty()
                        && code != "0"
                    {
                        return Err(PlaybackError::AccessDenied);
                    }
                }
            }
            let model = &root["video_info"]["data"];
            if let Some(expected) = media_id {
                let same = ["video_id", "vid"].iter().any(|field| {
                    model[*field].as_str() == Some(expected)
                        || model[*field]
                            .as_number()
                            .is_some_and(|n| n.to_string() == expected)
                });
                if !same {
                    return Err(PlaybackError::IdentityMismatch);
                }
            }
            let actual_duration = model["video_duration"]
                .as_f64()
                .or_else(|| model["video_duration"].as_str()?.parse().ok());
            if let (Some(expected), Some(actual)) = (duration, actual_duration)
                && (!actual.is_finite() || (expected - actual).abs() > 0.5)
            {
                return Err(PlaybackError::IdentityMismatch);
            }
            let normalized =
                serde_json::to_vec(&json!({"code":0,"data":{request.vid():{"video_model":model}}}))
                    .map_err(|_| PlaybackError::InvalidModel)?;
            match parse_model(&normalized, request) {
                Ok(model) => return Ok(model),
                Err(error @ (PlaybackError::UnsupportedMedia | PlaybackError::EmptySource)) => {
                    last = error
                }
                Err(error) => return Err(error),
            }
        }
        Err(last)
    }
}

#[cfg(test)]
mod tests;
fn playback_query(identity: &Identity) -> BTreeMap<String, String> {
    let mut q = device_query(Profile::Legacy, &identity.cdid, "");
    q.remove("openudid");
    for (k, v) in [
        ("manifest_version_code", "71332"),
        ("update_version_code", "71332"),
        ("version_code", "71332"),
        ("version_name", "7.1.3.32"),
        ("dragon_device_type", "phone"),
        ("host_abi", "arm64-v8a"),
        ("is_android_pad_screen", "0"),
        ("need_personal_recommend", "1"),
        ("player_so_load", "1"),
        ("pv_player", "71332"),
        ("compliance_status", "0"),
        ("device_id", identity.device_id.as_str()),
        ("iid", identity.install_id.as_str()),
    ] {
        q.insert(k.into(), v.into());
    }
    q
}
