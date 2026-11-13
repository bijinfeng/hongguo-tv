use super::{PlaybackError, PlaybackRequest, normalize_quality};
use base64::{Engine, engine::general_purpose};
use reqwest::Url;
use serde_json::Value;
use std::{collections::BTreeSet, fmt};

const MODEL_LIMIT: usize = 4 * 1024 * 1024;

pub(super) fn fallback_reference(
    body: &[u8],
    request: &PlaybackRequest,
) -> Option<(String, Option<f64>)> {
    let root: Value = serde_json::from_slice(body).ok()?;
    let data = &root["data"];
    let keyed = if data["video_model_data"].is_object() {
        &data["video_model_data"]
    } else {
        data
    };
    let raw = if keyed[request.vid()]["video_model"].is_null() {
        &data["video_model"]
    } else {
        &keyed[request.vid()]["video_model"]
    };
    let decoded;
    let model = if let Some(text) = raw.as_str() {
        decoded = serde_json::from_str::<Value>(text).ok()?;
        &decoded
    } else {
        raw
    };
    let url = model["fallback_api"].as_str()?.trim();
    if url.is_empty() || url.len() > 16 * 1024 {
        return None;
    }
    let duration = scalar(&model["video_duration"])
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|s| s.is_finite() && *s > 0.0);
    Some((url.into(), duration))
}

/// Parsed model tied to one validated episode. Media URLs remain private to core.
pub struct PlaybackModel {
    representations: Vec<Representation>,
}

/// A supported representation. Debug deliberately omits its signed address.
#[derive(Clone)]
pub struct Representation {
    pub(crate) url: Url,
    pub(crate) key: Option<[u8; 16]>,
    codec: String,
    height: u32,
}

impl fmt::Debug for Representation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Representation")
            .field("codec", &self.codec)
            .field("height", &self.height)
            .field("scheme", &self.url.scheme())
            .finish_non_exhaustive()
    }
}

impl Representation {
    /// Ordinary AVC or HEVC codec, without vendor bytevc2 ambiguity.
    pub fn codec(&self) -> &str {
        &self.codec
    }
    /// Actual normalized resolution, or empty when the model omits it.
    pub fn quality(&self) -> String {
        if self.height == 0 {
            String::new()
        } else {
            format!("{}P", self.height)
        }
    }
}

impl PlaybackModel {
    /// Distinct available qualities in ascending resolution order.
    pub fn qualities(&self) -> Vec<String> {
        self.representations
            .iter()
            .filter_map(|r| (r.height > 0).then_some(r.height))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .map(|height| format!("{height}P"))
            .collect()
    }

    /// Select an exact requested quality; automatic prefers the highest resolution up to 720P.
    pub fn select(&self, request: &PlaybackRequest) -> Result<&Representation, PlaybackError> {
        let bounded = request.quality().is_empty()
            && self
                .representations
                .iter()
                .any(|r| (1..=720).contains(&r.height));
        self.representations
            .iter()
            .filter(|r| request.quality().is_empty() || r.quality() == request.quality())
            .filter(|r| !bounded || (1..=720).contains(&r.height))
            .max_by_key(|r| r.height)
            .ok_or(if request.quality().is_empty() {
                PlaybackError::UnsupportedMedia
            } else {
                PlaybackError::QualityUnavailable
            })
    }
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Parse video_tab, legacy or single envelopes without network or identity substitution.
/// Protected candidates require a valid content key and supported media preparation.
pub fn parse_model(body: &[u8], request: &PlaybackRequest) -> Result<PlaybackModel, PlaybackError> {
    if body.len() > MODEL_LIMIT {
        return Err(PlaybackError::InvalidModel);
    }
    if body.iter().all(u8::is_ascii_whitespace) {
        return Err(PlaybackError::EmptySource);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| PlaybackError::InvalidModel)?;
    if !root.is_object() {
        return Err(PlaybackError::InvalidModel);
    }
    for envelope in [&root, &root["data"]] {
        for field in ["code", "Code", "error_code"] {
            if let Some(code) = scalar(&envelope[field])
                && !code.is_empty()
                && code != "0"
            {
                return Err(PlaybackError::AccessDenied);
            }
        }
    }
    let data = &root["data"];
    let keyed = if data["video_model_data"].is_object() {
        &data["video_model_data"]
    } else {
        data
    };
    let raw = if !keyed[request.vid()]["video_model"].is_null() {
        &keyed[request.vid()]["video_model"]
    } else if !data["video_model"].is_null() {
        &data["video_model"]
    } else {
        // A model under another ID is not an empty response eligible for identity refresh.
        if keyed
            .as_object()
            .is_some_and(|rows| rows.values().any(|row| row.get("video_model").is_some()))
        {
            return Err(PlaybackError::IdentityMismatch);
        }
        return Err(PlaybackError::EmptySource);
    };
    let decoded;
    let model = if let Some(text) = raw.as_str() {
        decoded = serde_json::from_str::<Value>(text).map_err(|_| PlaybackError::InvalidModel)?;
        &decoded
    } else {
        raw
    };
    if !model.is_object() {
        return Err(PlaybackError::InvalidModel);
    }
    for field in ["video_id", "vid"] {
        if !model[field].is_null() && scalar(&model[field]).is_none() {
            return Err(PlaybackError::InvalidModel);
        }
        if let Some(id) = scalar(&model[field])
            && id != request.vid()
        {
            return Err(PlaybackError::IdentityMismatch);
        }
    }
    // Direct models need affirmative identity; exact keyed envelopes establish it themselves.
    if keyed[request.vid()]["video_model"].is_null()
        && scalar(&model["video_id"]).is_none()
        && scalar(&model["vid"]).is_none()
    {
        return Err(PlaybackError::IdentityMismatch);
    }
    let rows: Vec<&Value> = match &model["video_list"] {
        Value::Array(rows) => rows.iter().collect(),
        Value::Object(rows) => rows.values().collect(),
        Value::Null => return Err(PlaybackError::EmptySource),
        _ => return Err(PlaybackError::InvalidModel),
    };
    if rows.is_empty() {
        return Err(PlaybackError::EmptySource);
    }
    let mut representations = Vec::new();
    for row in rows {
        let meta = &row["video_meta"];
        if [&row["codec_type"], &meta["codec_type"]]
            .into_iter()
            .filter_map(Value::as_str)
            .any(|codec| matches!(codec.to_ascii_lowercase().as_str(), "bytevc2" | "bvc2"))
        {
            continue;
        }
        let codec = row["codec_type"]
            .as_str()
            .or_else(|| meta["codec_type"].as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let codec = match codec.as_str() {
            "h264" | "avc" | "avc1" => "h264",
            "h265" | "hevc" | "hvc1" | "hev1" | "bytevc1" => "hevc",
            _ => continue,
        };
        let spade = row["encrypt_info"]["spade_a"]
            .as_str()
            .or_else(|| row["spade_a"].as_str())
            .filter(|s| !s.is_empty());
        let key = if let Some(spade) = spade {
            let Ok(key) = super::protocol::content_key(spade) else {
                continue;
            };
            Some(key)
        } else {
            None
        };
        if key.is_none() && (row["encrypt"] == true || meta["encrypt"] == true) {
            continue;
        }
        let raw = row["main_url"]
            .as_str()
            .filter(|s| !s.is_empty())
            .or_else(|| row["backup_url"].as_str().filter(|s| !s.is_empty()))
            .or_else(|| {
                row["backup_url_list"]
                    .as_array()?
                    .iter()
                    .filter_map(Value::as_str)
                    .find(|s| !s.is_empty())
            });
        let Some(raw) = raw else { continue };
        let decoded_url;
        let url = if let Some(seed) = model["key_seed"].as_str().filter(|s| !s.is_empty()) {
            let Ok(text) = super::protocol::decode_url(raw, seed) else {
                continue;
            };
            decoded_url = text;
            &decoded_url
        } else if raw.starts_with("https://") {
            raw
        } else {
            let bytes = general_purpose::STANDARD
                .decode(raw)
                .or_else(|_| general_purpose::STANDARD_NO_PAD.decode(raw));
            let Ok(bytes) = bytes else { continue };
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            decoded_url = text;
            &decoded_url
        };
        let Ok(url) = Url::parse(url) else { continue };
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || url.port_or_known_default() != Some(443)
        {
            continue;
        }
        let definition = row["quality_desc"]
            .as_str()
            .or_else(|| row["definition"].as_str())
            .or_else(|| meta["definition"].as_str());
        let height = definition
            .and_then(|s| normalize_quality(s).ok())
            .and_then(|s| s.strip_suffix('P')?.parse::<u32>().ok())
            .or_else(|| {
                [
                    &row["vheight"],
                    &row["height"],
                    &meta["vheight"],
                    &meta["height"],
                ]
                .into_iter()
                .filter_map(scalar)
                .filter_map(|s| s.parse::<u32>().ok())
                .find(|h| *h > 0)
            })
            .unwrap_or(0);
        if height > 9999 {
            continue;
        }
        representations.push(Representation {
            url,
            key,
            codec: codec.into(),
            height,
        });
    }
    if representations.is_empty() {
        return Err(PlaybackError::UnsupportedMedia);
    }
    Ok(PlaybackModel { representations })
}
