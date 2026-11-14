//! Versioned guest history. Mutations publish only after a durable transaction commits.
mod search;
mod store;
pub use search::{SearchHistory, SearchHistoryChange, SearchHistoryError, normalize_keyword};
pub use store::LibraryStore;

use crate::catalog::Drama;
use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};
use utoipa::ToSchema;

/// Compact saved progress, compatible with shared history clients.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Entry {
    /// Summary without episode arrays.
    pub drama: Drama,
    /// One-based episode number.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub episode: Option<u32>,
    /// Exact current video ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub video_id: Option<String>,
    /// Playback position in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub position: Option<f64>,
    /// Duration in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub duration: Option<f64>,
    /// Whether this episode finished.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub completed: Option<bool>,
    /// Server-assigned committed viewing time in milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub last_played_at: Option<i64>,
}

/// Guest history snapshot; account-backed libraries are not yet implemented.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Library {
    /// Most recently viewed first.
    pub entries: Vec<Entry>,
    /// Empty for guests; optional for compatibility with existing clients.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub owner_id: Option<String>,
}

/// An explicit playback checkpoint. Media resolution alone never writes it.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Progress {
    /// Expected library owner; absent or empty for guests.
    #[serde(default)]
    pub owner_id: Option<String>,
    /// Drama identity and display summary.
    pub drama: Drama,
    /// One-based episode, 1–10000.
    pub episode: u32,
    /// Nonzero decimal video ID, up to 32 digits.
    pub video_id: String,
    /// Finite seconds, 0–86400.
    #[serde(deserialize_with = "seconds")]
    pub position: f64,
    /// Finite seconds, 0–86400.
    #[serde(deserialize_with = "seconds")]
    pub duration: f64,
    /// Defaults to unfinished.
    #[serde(default)]
    pub completed: bool,
}

/// The only migrated record category.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum HistoryKind {
    /// Guest watch history.
    History,
}

/// Strict, explicit history mutations; favorites and likes remain unavailable.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum HistoryChange {
    /// Save a playback checkpoint.
    Progress(Box<Progress>),
    /// Remove one history item; repeating it is harmless.
    Remove {
        /// Expected owner, empty for guests.
        #[serde(default)]
        owner_id: Option<String>,
        /// Only history is migrated.
        kind: HistoryKind,
        /// Exact series ID.
        series_id: String,
    },
    /// Clear guest watch history.
    Clear {
        /// Expected owner, empty for guests.
        #[serde(default)]
        owner_id: Option<String>,
        /// Only history is migrated.
        kind: HistoryKind,
    },
}
impl HistoryChange {
    fn validate(&self) -> Result<(), LibraryError> {
        let owner = match self {
            Self::Progress(p) => &p.owner_id,
            Self::Remove { owner_id, .. } | Self::Clear { owner_id, .. } => owner_id,
        };
        if owner.as_ref().is_some_and(|s| !s.is_empty()) {
            return Err(LibraryError::OwnerChanged);
        }
        match self {
            Self::Progress(p) => p.validate(),
            Self::Remove { series_id, .. } if !valid_id(series_id) => {
                Err(LibraryError::InvalidInput)
            }
            _ => Ok(()),
        }
    }
}
impl Progress {
    fn validate(&self) -> Result<(), LibraryError> {
        if !valid_id(&self.drama.series_id)
            || self.drama.title.trim().is_empty()
            || self.drama.title.chars().count() > 256
            || self.drama.cover.len() > 4096
            || self
                .drama
                .cover_fallback
                .as_ref()
                .is_some_and(|s| s.len() > 4096)
            || self
                .drama
                .content_type
                .as_ref()
                .is_some_and(|s| s.len() > 32)
            || !(1..=10000).contains(&self.episode)
            || !valid_id(&self.video_id)
            || !valid_time(self.position)
            || !valid_time(self.duration)
        {
            return Err(LibraryError::InvalidInput);
        }
        Ok(())
    }
    fn into_entry(mut self, stamp: i64) -> Entry {
        self.drama.episodes = None;
        self.drama.intro = self.drama.intro.chars().take(1000).collect();
        self.drama.tags = self.drama.tags.map(|tags| {
            tags.into_iter()
                .take(8)
                .map(|s| s.chars().take(80).collect())
                .collect()
        });
        Entry {
            drama: self.drama,
            episode: Some(self.episode),
            video_id: Some(self.video_id),
            position: Some(self.position),
            duration: Some(self.duration),
            completed: Some(self.completed),
            last_played_at: Some(stamp),
        }
    }
}
fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 32
        && s.bytes().all(|c| c.is_ascii_digit())
        && s.bytes().any(|c| c != b'0')
}
fn valid_time(value: f64) -> bool {
    value.is_finite() && (0.0..=86400.0).contains(&value)
}

// Tagged enum buffering preserves arbitrary-precision JSON numbers as maps.
fn seconds<'de, D: serde::Deserializer<'de>>(de: D) -> Result<f64, D::Error> {
    serde_json::Number::deserialize(de)?
        .as_f64()
        .filter(|value| value.is_finite())
        .ok_or_else(|| serde::de::Error::custom("invalid seconds"))
}

/// Sanitized failures; database paths, SQL and stored data never cross the transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryError {
    /// Invalid history mutation.
    InvalidInput,
    /// A guest request refers to another owner.
    OwnerChanged,
    /// Unsupported database identity/version or invalid stored content.
    InvalidDatabase,
    /// Failed I/O, lock, transaction or worker.
    Storage,
}
impl LibraryError {
    /// Stable transport-independent error code.
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "LIBRARY_REQUEST_INVALID",
            Self::OwnerChanged => "LIBRARY_OWNER_CHANGED",
            Self::InvalidDatabase => "LIBRARY_DATABASE_INVALID",
            Self::Storage => "LIBRARY_STORAGE_UNAVAILABLE",
        }
    }
}
impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidInput => "观看记录参数无效",
            Self::OwnerChanged => "记录所属账号已变化，请重新加载",
            Self::InvalidDatabase => "记录数据库不兼容或已损坏，请保留数据并检查版本或备份",
            Self::Storage => "观看记录读写失败，请检查磁盘空间与目录权限后重试",
        })
    }
}
impl Error for LibraryError {}
impl From<rusqlite::Error> for LibraryError {
    fn from(_: rusqlite::Error) -> Self {
        Self::Storage
    }
}
