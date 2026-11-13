//! Episode playback rules. Anonymous protocols and media secrets stay inside core.
mod identity;
mod model;
mod protocol;
mod provider;
mod sign;
pub use identity::PlaybackClient;
pub use model::{PlaybackModel, Representation, parse_model};
pub use provider::PlaybackSource;

use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};
use utoipa::ToSchema;

/// Validated selection; constructing this is required before any upstream work.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PlaybackRequest {
    series_id: String,
    vid: String,
    quality: String,
    codec: CodecMode,
}

impl PlaybackRequest {
    /// Validate exact string IDs, ordinary drama content, quality and codec aliases.
    pub fn new(
        series_id: &str,
        vid: &str,
        content_type: &str,
        quality: &str,
        codec: &str,
    ) -> Result<Self, PlaybackError> {
        let valid_id = |id: &str| {
            !id.is_empty()
                && id.len() <= 32
                && id.bytes().all(|b| b.is_ascii_digit())
                && id.bytes().any(|b| b != b'0')
        };
        if !valid_id(series_id) || !valid_id(vid) {
            return Err(PlaybackError::InvalidInput);
        }
        if quality.len() > 32 || codec.len() > 32 || content_type.len() > 32 {
            return Err(PlaybackError::InvalidInput);
        }
        if !matches!(content_type.trim(), "" | "1004") {
            return Err(PlaybackError::UnsupportedContent);
        }
        let quality = normalize_quality(quality)?;
        let codec = match codec.trim().to_ascii_lowercase().as_str() {
            "" | "default" | "standard" => CodecMode::Default,
            "auto" | "mpv_auto" => CodecMode::Auto,
            "software" | "mpv_software" => CodecMode::Software,
            _ => return Err(PlaybackError::InvalidInput),
        };
        Ok(Self {
            series_id: series_id.into(),
            vid: vid.into(),
            quality,
            codec,
        })
    }
    /// Exact selected drama ID.
    pub fn series_id(&self) -> &str {
        &self.series_id
    }
    /// Exact selected video ID.
    pub fn vid(&self) -> &str {
        &self.vid
    }
    /// Supported drama family; album and other families are not migrated.
    pub fn content_type(&self) -> &str {
        "1004"
    }
    /// Uppercase requested resolution, or empty for automatic selection.
    pub fn quality(&self) -> &str {
        &self.quality
    }
    /// Normalized decoder capability profile.
    pub fn codec(&self) -> CodecMode {
        self.codec
    }
}

fn normalize_quality(value: &str) -> Result<String, PlaybackError> {
    let value = value.trim().to_ascii_uppercase();
    if value.is_empty() || value == "AUTO" {
        return Ok(String::new());
    }
    let digits = value.strip_suffix('P').ok_or(PlaybackError::InvalidInput)?;
    if !(3..=4).contains(&digits.len())
        || digits.starts_with('0')
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(PlaybackError::InvalidInput);
    }
    Ok(value)
}

/// Finite capability profiles, never an arbitrary upstream codec parameter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CodecMode {
    /// Host's ordinary supported codecs.
    Default,
    /// Host chooses hardware or software decoding.
    Auto,
    /// Host supports software decoding of ordinary AVC/HEVC.
    Software,
}

/// Prepared local resource; never contains upstream addresses, keys or device IDs.
#[derive(Clone, Debug, Default, Serialize, Deserialize, ToSchema)]
#[non_exhaustive]
pub struct PlayInfo {
    /// Same-service opaque media route.
    pub path: String,
    /// Selected episode video ID.
    pub vid: String,
    /// Actual media codec; vendor bytevc2 is not supported.
    pub video_codec: String,
    /// Actual selected resolution.
    pub quality: String,
    /// Distinct resolutions available from this accepted source.
    pub qualities: Vec<String>,
}

/// Stable, secret-free failure categories. Do not attach raw upstream errors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaybackError {
    /// Invalid episode or playback option.
    InvalidInput,
    /// Only the ordinary drama family is implemented.
    UnsupportedContent,
    /// Explicit business or access rejection; stop fallback.
    AccessDenied,
    /// The source model belongs to another episode.
    IdentityMismatch,
    /// Missing, malformed or oversized model.
    InvalidModel,
    /// Media metadata, sample layout or bytes are malformed.
    InvalidMedia,
    /// The media exceeds the fixed per-file limit.
    MediaTooLarge,
    /// The upstream media representation changed during incremental reading.
    MediaChanged,
    /// Local media storage failed; never expose filesystem paths.
    Storage,
    /// Valid response without a model or video list.
    EmptySource,
    /// Confirmed HTTP 200 with an empty body; eligible for one bounded refresh.
    EmptyResponse,
    /// No supported media codec or protected representation.
    UnsupportedMedia,
    /// Requested quality is absent; no implicit fallback.
    QualityUnavailable,
    /// Upstream deadline expired.
    Timeout,
    /// Upstream network or non-success HTTP failure.
    Transport,
    /// Service initialization failed.
    Configuration,
    /// Resource has expired or was released.
    Expired,
    /// Preparation or cache limit reached.
    Capacity,
}

impl PlaybackError {
    /// Stable transport-independent machine code.
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "INVALID_PLAYBACK_QUERY",
            Self::UnsupportedContent => "UNSUPPORTED_CONTENT_TYPE",
            Self::AccessDenied => "PLAYBACK_ACCESS_DENIED",
            Self::IdentityMismatch => "PLAYBACK_IDENTITY_MISMATCH",
            Self::InvalidModel => "PLAYBACK_INVALID_MODEL",
            Self::InvalidMedia => "PLAYBACK_INVALID_MEDIA",
            Self::MediaTooLarge => "PLAYBACK_MEDIA_TOO_LARGE",
            Self::MediaChanged => "PLAYBACK_MEDIA_CHANGED",
            Self::Storage => "PLAYBACK_STORAGE_FAILED",
            Self::EmptySource | Self::EmptyResponse => "PLAYBACK_SOURCE_EMPTY",
            Self::UnsupportedMedia => "PLAYBACK_UNSUPPORTED_MEDIA",
            Self::QualityUnavailable => "PLAYBACK_QUALITY_UNAVAILABLE",
            Self::Timeout => "PLAYBACK_TIMEOUT",
            Self::Transport => "PLAYBACK_UPSTREAM_UNAVAILABLE",
            Self::Configuration => "PLAYBACK_CONFIGURATION_ERROR",
            Self::Expired => "PLAYBACK_RESOURCE_EXPIRED",
            Self::Capacity => "PLAYBACK_CAPACITY_REACHED",
        }
    }
}

impl fmt::Display for PlaybackError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidInput => "播放参数无效",
            Self::UnsupportedContent => "暂不支持此内容类型",
            Self::AccessDenied => "本集暂不可观看",
            Self::IdentityMismatch | Self::InvalidModel | Self::InvalidMedia => {
                "视频来源数据无效，请重试"
            }
            Self::MediaChanged => "视频来源已更新，请重新加载",
            Self::Storage => "视频缓存不可用，请重试",
            Self::MediaTooLarge => "本集视频超过播放大小限制",
            Self::EmptySource | Self::EmptyResponse => "本集暂无可用视频源，请重试",
            Self::UnsupportedMedia => "本集暂无兼容的视频格式",
            Self::QualityUnavailable => "本集不提供此清晰度，请重新选择",
            Self::Timeout => "视频准备超时，请重试",
            Self::Transport => "视频来源连接失败，请重试",
            Self::Configuration => "播放服务初始化失败",
            Self::Expired => "视频地址已过期，请重试",
            Self::Capacity => "播放服务繁忙，请稍后重试",
        })
    }
}
impl Error for PlaybackError {}

#[cfg(test)]
mod tests;
