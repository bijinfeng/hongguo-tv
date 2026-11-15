//! Versioned owner-scoped history. Mutations publish only after a durable transaction commits.
mod favorites;
mod guest_import;
mod migration;
mod operations;
mod search;
mod store;
mod sync;
pub use operations::{
    LibraryOperation, LibraryOperationIdentity, LibraryOperationOutcome, LibraryWriteSession,
    LibraryWriteSessionRequest,
};
pub use search::{SearchHistory, SearchHistoryChange, SearchHistoryError, normalize_keyword};
pub use store::LibraryStore;
pub(crate) use sync::{PendingChange, RemoteFavorite, RemoteHistory, RemoteLibrary, SyncMetadata};

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

/// Favorite membership without invented viewing progress.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FavoriteEntry {
    /// Compact summary without episode arrays.
    pub drama: Drama,
    /// Original favorite time in Unix milliseconds.
    pub favorite_at: i64,
}

/// Snapshot of the owner fixed when the local library was opened.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Library {
    /// Most recently viewed first.
    pub entries: Vec<Entry>,
    /// Independent favorite membership, empty when none is stored.
    #[serde(default)]
    #[schema(required = true)]
    pub favorites: Vec<FavoriteEntry>,
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

/// Independent local library categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    /// Watch history belonging to the opened library owner.
    History,
    /// Favorites, independent of viewing progress.
    Favorites,
}

/// Compatibility name for the same library category contract.
pub type HistoryKind = LibraryKind;

/// Strict mutations shared by registered writes; unknown fields are rejected.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum LibraryChange {
    /// Save a playback checkpoint.
    Progress(Box<Progress>),
    /// Remove one history item; repeating it is harmless.
    Remove {
        /// Expected owner, empty for guests.
        #[serde(default)]
        owner_id: Option<String>,
        /// Category whose one item is removed.
        kind: LibraryKind,
        /// Exact series ID.
        series_id: String,
    },
    /// Hide one category on this device without bulk remote deletion.
    Clear {
        /// Expected owner, empty for guests.
        #[serde(default)]
        owner_id: Option<String>,
        /// Category to clear locally.
        kind: LibraryKind,
    },
    /// Set exact favorite membership; does not create history.
    Favorite {
        /// Expected owner, absent or empty only for guests.
        #[serde(default)]
        owner_id: Option<String>,
        /// Summary for this exact series.
        drama: Drama,
        /// Desired membership; never an implicit toggle.
        value: bool,
    },
}

/// Compatibility name, not a second mutation model.
pub type HistoryChange = LibraryChange;

impl LibraryChange {
    /// Whether an unregistered compatibility endpoint may accept this history-only mutation.
    pub fn is_history(&self) -> bool {
        matches!(
            self,
            Self::Progress(_)
                | Self::Remove {
                    kind: LibraryKind::History,
                    ..
                }
                | Self::Clear {
                    kind: LibraryKind::History,
                    ..
                }
        )
    }

    fn validate(&self, expected_owner: &str) -> Result<(), LibraryError> {
        let owner = match self {
            Self::Progress(p) => &p.owner_id,
            Self::Remove { owner_id, .. }
            | Self::Clear { owner_id, .. }
            | Self::Favorite { owner_id, .. } => owner_id,
        };
        if owner.as_deref().unwrap_or_default() != expected_owner {
            return Err(LibraryError::OwnerChanged);
        }
        match self {
            Self::Progress(p) => p.validate(),
            Self::Remove { series_id, .. } if !valid_id(series_id) => {
                Err(LibraryError::InvalidInput)
            }
            Self::Favorite { drama, .. } => validate_drama(drama),
            _ => Ok(()),
        }
    }
}
impl Progress {
    fn validate(&self) -> Result<(), LibraryError> {
        validate_drama(&self.drama)?;
        if !(1..=10000).contains(&self.episode)
            || !valid_id(&self.video_id)
            || !valid_time(self.position)
            || !valid_time(self.duration)
        {
            return Err(LibraryError::InvalidInput);
        }
        Ok(())
    }
    fn into_entry(self, stamp: i64) -> Entry {
        Entry {
            drama: compact_drama(self.drama),
            episode: Some(self.episode),
            video_id: Some(self.video_id),
            position: Some(self.position),
            duration: Some(self.duration),
            completed: Some(self.completed),
            last_played_at: Some(stamp),
        }
    }
}
pub(super) fn compact_drama(mut drama: Drama) -> Drama {
    drama.episodes = None;
    drama.intro = drama.intro.chars().take(1000).collect();
    drama.tags = drama.tags.map(|tags| {
        tags.into_iter()
            .take(8)
            .map(|tag| tag.chars().take(80).collect())
            .collect()
    });
    drama
}
fn validate_drama(drama: &Drama) -> Result<(), LibraryError> {
    if !valid_id(&drama.series_id)
        || drama.title.trim().is_empty()
        || drama.title.chars().count() > 256
        || drama.cover.len() > 4096
        || drama
            .cover_fallback
            .as_ref()
            .is_some_and(|s| s.len() > 4096)
        || drama.content_type.as_ref().is_some_and(|s| s.len() > 32)
    {
        return Err(LibraryError::InvalidInput);
    }
    Ok(())
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
    /// Contract exists but its durable behavior has not been connected.
    NotImplemented,
    /// A new operation cannot fit in the bounded durable cloud queue.
    SyncQueueFull,
    /// Invalid history mutation.
    InvalidInput,
    /// A request or database refers to another owner.
    OwnerChanged,
    /// Unsupported database identity/version or invalid stored content.
    InvalidDatabase,
    /// Failed I/O, lock, transaction or worker.
    Storage,
    /// A write session was replaced, or was never issued by this store.
    SessionExpired,
    /// An operation identity was reused with a different payload.
    OperationConflict,
    /// Operations must use consecutive IDs and cannot replay older IDs.
    OperationSequence,
    /// The preceding operation has not reached its terminal result.
    OperationPending,
}
impl LibraryError {
    /// Stable transport-independent error code.
    pub fn code(self) -> &'static str {
        match self {
            Self::NotImplemented => "LIBRARY_NOT_IMPLEMENTED",
            Self::SyncQueueFull => "LIBRARY_SYNC_QUEUE_FULL",
            Self::InvalidInput => "LIBRARY_REQUEST_INVALID",
            Self::OwnerChanged => "LIBRARY_OWNER_CHANGED",
            Self::InvalidDatabase => "LIBRARY_DATABASE_INVALID",
            Self::Storage => "LIBRARY_STORAGE_UNAVAILABLE",
            Self::SessionExpired => "LIBRARY_SESSION_EXPIRED",
            Self::OperationConflict => "LIBRARY_OPERATION_CONFLICT",
            Self::OperationSequence => "LIBRARY_OPERATION_SEQUENCE",
            Self::OperationPending => "LIBRARY_OPERATION_PENDING",
        }
    }
}
impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NotImplemented => "此记录操作尚未开放",
            Self::SyncQueueFull => "待同步记录已满，请先同步后重试",
            Self::InvalidInput => "观看记录参数无效",
            Self::OwnerChanged => "记录所属账号已变化，请重新加载",
            Self::InvalidDatabase => "记录数据库不兼容或已损坏，请保留数据并检查版本或备份",
            Self::Storage => "观看记录读写失败，请检查磁盘空间与目录权限后重试",
            Self::SessionExpired => "观看记录写入会话已失效，请重新读取",
            Self::OperationConflict => "观看记录操作身份与原请求不一致",
            Self::OperationSequence => "观看记录操作顺序无效，请重新读取",
            Self::OperationPending => "上一项观看记录操作尚未结束，请先确认结果",
        })
    }
}
impl Error for LibraryError {}
impl From<rusqlite::Error> for LibraryError {
    fn from(_: rusqlite::Error) -> Self {
        Self::Storage
    }
}
