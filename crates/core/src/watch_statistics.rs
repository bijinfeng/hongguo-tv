//! Independent, local watch-time statistics.
//!
//! Statistics deliberately live outside the history and account-sync stores.  The
//! service accepts only bounded playback batches; it never stores a title, episode,
//! position, URL or credential.  AccountService is responsible for checking the
//! caller's owner/epoch before calling this service.

use ring::{
    digest::{SHA256, digest},
    rand::{SecureRandom, SystemRandom},
};
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior, params,
};
use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    fmt,
    fs::{self, DirBuilder, OpenOptions},
    io::ErrorKind,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use utoipa::ToSchema;

const APPLICATION_ID: i64 = 0x48475354; // "HGST"
const VERSION: i64 = 1;
const RETENTION_DAYS: i64 = 366;
const DAY_MS: i64 = 86_400_000;
const MAX_BATCH_ITEMS: usize = 128;
const MAX_BATCH_DURATION_MS: u64 = 120_000;
const MAX_ITEM_DURATION_MS: u32 = 60_000;
const MAX_GENRES: usize = 16;
const MAX_GENRE_CHARS: usize = 40;
const MAX_BATCH_ID_BYTES: usize = 96;
const MAX_EPOCH_BYTES: usize = 128;

/// The only content buckets accepted by the local statistics contract.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum WatchStatisticsContentType {
    /// Real-person short drama.
    Real,
    /// Animated content.
    Comic,
    /// AI-generated content.
    Ai,
    /// Missing or unrecognized classification.
    Unknown,
}

impl WatchStatisticsContentType {
    fn key(self) -> &'static str {
        match self {
            Self::Real => "real",
            Self::Comic => "comic",
            Self::Ai => "ai",
            Self::Unknown => "unknown",
        }
    }
}

/// One actual advancing playback segment.  It contains no content identity.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsSegment {
    /// Local civil date in `YYYY-MM-DD` form.
    #[serde(rename = "day")]
    pub day: String,
    /// Milliseconds during which media time actually advanced in the foreground.
    #[serde(rename = "ms")]
    pub ms: u32,
    /// Coarse content bucket; unavailable classification is `unknown`.
    #[serde(rename = "type")]
    pub kind: WatchStatisticsContentType,
    /// One bounded primary genre.  Missing classification is stored as `unknown`.
    #[serde(default)]
    pub genre: Option<String>,
}

/// Current owner scope.  AccountService validates that the ID and epoch belong to
/// the active account before invoking this storage service.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsScope {
    /// Expected active account ID; empty identifies the guest scope.
    pub owner_id: String,
    /// Current process/account generation.
    pub owner_epoch: String,
}

/// A retriable bounded batch.  The batch ID is the idempotency key.
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsBatch {
    /// Expected active account ID.
    pub owner_id: String,
    /// Expected active process/account generation.
    pub owner_epoch: String,
    /// Client generated id, 8–96 ASCII letters, digits, `_` or `-`.
    #[serde(rename = "id")]
    pub id: String,
    /// Reset revision observed before collecting this batch.
    pub revision: String,
    /// One to 128 actual playback items.
    pub items: Vec<WatchStatisticsSegment>,
}

/// A duration bucket in a snapshot.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsBucket {
    /// Content type or genre name.
    pub key: String,
    /// Accumulated milliseconds.
    pub duration_ms: u64,
}

/// One daily total, retained for at most 366 days.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsDay {
    /// Local civil date.
    pub day: String,
    /// Total actual playback milliseconds for the day.
    pub duration_ms: u64,
    /// Type buckets for the day.
    pub content_types: Vec<WatchStatisticsBucket>,
    /// Genre buckets for the day.
    pub genres: Vec<WatchStatisticsBucket>,
}

/// Authoritative local statistics for one already validated owner scope.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsSnapshot {
    /// DTO version.
    pub version: u32,
    /// Oldest retained day or reset start day.
    pub since: String,
    /// Unix milliseconds of the last reset.
    pub reset_at_ms: i64,
    /// Random reset fence.
    pub revision: String,
    /// Daily totals, newest first.
    pub days: Vec<WatchStatisticsDay>,
}

/// Result of appending a batch.  A duplicate returns `applied=false` and the same
/// authoritative snapshot, so a lost response can be recovered with the same ID.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WatchStatisticsAppendResult {
    /// Idempotency ID echoed from the request.
    pub id: String,
    /// Whether this request added the batch.
    pub applied: bool,
    /// Authoritative post-append snapshot.
    pub snapshot: WatchStatisticsSnapshot,
}

/// Sanitized statistics failures.  No SQL or filesystem details cross the boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WatchStatisticsError {
    /// The request did not meet bounded input rules.
    InvalidInput,
    /// The owner or epoch is not the active scope.
    OwnerChanged,
    /// A reset occurred after this batch was collected.
    RevisionChanged,
    /// An idempotency ID was reused with another payload.
    BatchConflict,
    /// The statistics database is incompatible or corrupt.
    InvalidDatabase,
    /// The storage operation failed.
    Storage,
    /// A day would exceed 24 hours.
    DailyLimit,
}

impl WatchStatisticsError {
    /// Stable transport error code.
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "WATCH_STATISTICS_REQUEST_INVALID",
            Self::OwnerChanged => "WATCH_STATISTICS_OWNER_CHANGED",
            Self::RevisionChanged => "WATCH_STATISTICS_REVISION_CHANGED",
            Self::BatchConflict => "WATCH_STATISTICS_BATCH_CONFLICT",
            Self::InvalidDatabase => "WATCH_STATISTICS_DATABASE_INVALID",
            Self::Storage => "WATCH_STATISTICS_STORAGE_UNAVAILABLE",
            Self::DailyLimit => "WATCH_STATISTICS_DAILY_LIMIT",
        }
    }
}
impl fmt::Display for WatchStatisticsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidInput => "观看统计参数无效",
            Self::OwnerChanged => "统计所属账号已变化，请重新加载",
            Self::RevisionChanged => "统计已重置，请重新读取后再提交",
            Self::BatchConflict => "统计批次身份与原请求不一致",
            Self::InvalidDatabase => "观看统计数据库不兼容或已损坏，请保留数据并检查备份",
            Self::Storage => "观看统计读写失败，请检查磁盘空间与目录权限后重试",
            Self::DailyLimit => "单日观看统计已达到上限",
        })
    }
}
impl Error for WatchStatisticsError {}
impl From<rusqlite::Error> for WatchStatisticsError {
    fn from(_: rusqlite::Error) -> Self {
        Self::Storage
    }
}

/// Independent SQLite store.  Clones serialize access to one connection.
#[derive(Clone)]
pub struct WatchStatisticsService {
    connection: Arc<Mutex<Connection>>,
}

impl WatchStatisticsService {
    /// Open or initialize an application-owned statistics database.
    pub async fn open(path: impl Into<PathBuf>) -> Result<Self, WatchStatisticsError> {
        let path = path.into();
        tokio::task::spawn_blocking(move || open_connection(path))
            .await
            .map_err(|_| WatchStatisticsError::Storage)?
    }

    /// Read the current snapshot for an already checked owner scope.
    pub async fn snapshot(
        &self,
        scope: &WatchStatisticsScope,
        as_of_day: &str,
    ) -> Result<WatchStatisticsSnapshot, WatchStatisticsError> {
        validate_scope(scope)?;
        let as_of_day = validate_as_of_day(as_of_day)?;
        let scope = scope.clone();
        let connection = self.connection.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = connection
                .lock()
                .map_err(|_| WatchStatisticsError::Storage)?;
            let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let _owner = ensure_owner(&tx, &scope.owner_id, &as_of_day)?;
            prune(&tx, &scope.owner_id, parse_date(&as_of_day)?)?;
            let owner = ensure_owner(&tx, &scope.owner_id, &as_of_day)?;
            let snapshot = read_snapshot(&tx, &scope.owner_id, owner)?;
            tx.commit()?;
            Ok(snapshot)
        })
        .await
        .map_err(|_| WatchStatisticsError::Storage)?
    }

    /// Append one bounded batch atomically and at most once.
    pub async fn append(
        &self,
        scope: &WatchStatisticsScope,
        as_of_day: &str,
        batch: WatchStatisticsBatch,
    ) -> Result<WatchStatisticsAppendResult, WatchStatisticsError> {
        validate_scope(scope)?;
        let as_of_day = validate_as_of_day(as_of_day)?;
        validate_batch(scope, &batch)?;
        let connection = self.connection.clone();
        let scope = scope.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = connection.lock().map_err(|_| WatchStatisticsError::Storage)?;
            let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let owner = &scope.owner_id;
            let as_of = parse_date(&as_of_day)?;
            let _metadata = ensure_owner(&tx, owner, &as_of_day)?;
            prune(&tx, owner, as_of)?;
            let metadata = ensure_owner(&tx, owner, &as_of_day)?;
            if batch.revision != metadata.revision {
                return Err(WatchStatisticsError::RevisionChanged);
            }
            let hash = batch_hash(&batch)?;
            let batch_id = batch.id.clone();
            if let Some(existing) = tx
                .query_row(
                    "SELECT revision, payload_hash FROM batches WHERE owner_id=?1 AND batch_id=?2",
                    params![&owner, &batch_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Vec<u8>>(1)?,
                        ))
                    },
                )
                .optional()?
            {
                if existing.0 != metadata.revision {
                    return Err(WatchStatisticsError::RevisionChanged);
                }
                if existing.1 != hash {
                    return Err(WatchStatisticsError::BatchConflict);
                }
                let snapshot = read_snapshot(&tx, owner, metadata)?;
                tx.commit()?;
                return Ok(WatchStatisticsAppendResult {
                    id: batch_id.clone(),
                    applied: false,
                    snapshot,
                });
            }
            apply_batch(&tx, owner, &metadata.revision, &batch, as_of)?;
            tx.execute(
                "INSERT INTO batches(owner_id,batch_id,revision,payload_hash,committed_at) VALUES (?1,?2,?3,?4,?5)",
                params![owner, &batch_id, &metadata.revision, hash, now_millis()?],
            )?;
            let snapshot = read_snapshot(&tx, owner, metadata)?;
            tx.commit()?;
            Ok(WatchStatisticsAppendResult {
                id: batch_id,
                applied: true,
                snapshot,
            })
        })
        .await
        .map_err(|_| WatchStatisticsError::Storage)?
    }

    /// Atomically clear the owner's statistics and advance its reset revision.
    pub async fn reset(
        &self,
        scope: &WatchStatisticsScope,
        as_of_day: &str,
    ) -> Result<WatchStatisticsSnapshot, WatchStatisticsError> {
        validate_scope(scope)?;
        let as_of_day = validate_as_of_day(as_of_day)?;
        let connection = self.connection.clone();
        let scope = scope.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = connection.lock().map_err(|_| WatchStatisticsError::Storage)?;
            let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let owner = &scope.owner_id;
            let revision = random_revision()?;
            tx.execute(
                "INSERT INTO owners(owner_id,revision,since,reset_at_ms) VALUES (?1,?2,?3,?4)
                 ON CONFLICT(owner_id) DO UPDATE SET revision=excluded.revision,since=excluded.since,reset_at_ms=excluded.reset_at_ms",
                params![owner, revision, &as_of_day, now_millis()?],
            )?;
            for table in ["daily", "content_types", "genres", "batches"] {
                tx.execute(&format!("DELETE FROM {table} WHERE owner_id=?1"), [&owner])?;
            }
            let metadata = ensure_owner(&tx, owner, &as_of_day)?;
            let snapshot = read_snapshot(&tx, owner, metadata)?;
            tx.commit()?;
            Ok(snapshot)
        })
        .await
        .map_err(|_| WatchStatisticsError::Storage)?
    }
}

fn open_connection(path: PathBuf) -> Result<WatchStatisticsService, WatchStatisticsError> {
    if path.file_name().is_none() || path == std::path::Path::new(":memory:") {
        return Err(WatchStatisticsError::InvalidInput);
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        let mut builder = DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(parent)
            .map_err(|_| WatchStatisticsError::Storage)?;
    }
    let mut file = OpenOptions::new();
    file.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        file.mode(0o600);
    }
    match file.open(&path) {
        Ok(file) => file.sync_all().map_err(|_| WatchStatisticsError::Storage)?,
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return Err(WatchStatisticsError::Storage),
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| WatchStatisticsError::Storage)?;
    if !metadata.file_type().is_file() {
        return Err(WatchStatisticsError::InvalidDatabase);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|_| WatchStatisticsError::Storage)?;
    }
    let mut connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|_| WatchStatisticsError::InvalidDatabase)?;
    connection.busy_timeout(Duration::from_secs(2))?;
    connection.pragma_update(None, "secure_delete", "ON")?;
    connection.pragma_update(None, "synchronous", "FULL")?;
    let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let id: i64 = tx.query_row("PRAGMA application_id", [], |row| row.get(0))?;
    let version: i64 = tx.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if id == 0 && version == 0 {
        let tables: i64 = tx.query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get(0),
        )?;
        if tables != 0 {
            return Err(WatchStatisticsError::InvalidDatabase);
        }
        tx.execute_batch(
            "CREATE TABLE owners(owner_id TEXT PRIMARY KEY NOT NULL, revision TEXT NOT NULL, since TEXT NOT NULL, reset_at_ms INTEGER NOT NULL CHECK(reset_at_ms>0));
             CREATE TABLE daily(owner_id TEXT NOT NULL, day TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms>0), PRIMARY KEY(owner_id,day));
             CREATE TABLE content_types(owner_id TEXT NOT NULL, day TEXT NOT NULL, key TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms>0), PRIMARY KEY(owner_id,day,key));
             CREATE TABLE genres(owner_id TEXT NOT NULL, day TEXT NOT NULL, key TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms>0), PRIMARY KEY(owner_id,day,key));
             CREATE TABLE batches(owner_id TEXT NOT NULL, batch_id TEXT NOT NULL, revision TEXT NOT NULL, payload_hash BLOB NOT NULL, committed_at INTEGER NOT NULL, PRIMARY KEY(owner_id,batch_id));
             PRAGMA application_id=1212633940; PRAGMA user_version=1;",
        )?;
    } else if id != APPLICATION_ID || version != VERSION {
        return Err(WatchStatisticsError::InvalidDatabase);
    }
    let integrity: String = tx.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(WatchStatisticsError::InvalidDatabase);
    }
    tx.commit()?;
    connection.pragma_update(None, "journal_mode", "DELETE")?;
    Ok(WatchStatisticsService {
        connection: Arc::new(Mutex::new(connection)),
    })
}

fn validate_owner(owner: &str) -> Result<(), WatchStatisticsError> {
    if owner.is_empty()
        || (owner.len() <= 32
            && owner.bytes().all(|byte| byte.is_ascii_digit())
            && owner.bytes().any(|byte| byte != b'0'))
    {
        Ok(())
    } else {
        Err(WatchStatisticsError::OwnerChanged)
    }
}

fn validate_scope(scope: &WatchStatisticsScope) -> Result<(), WatchStatisticsError> {
    validate_owner(&scope.owner_id)?;
    if scope.owner_epoch.is_empty()
        || scope.owner_epoch.len() > MAX_EPOCH_BYTES
        || !scope
            .owner_epoch
            .bytes()
            .all(|byte| byte.is_ascii() && !byte.is_ascii_control())
    {
        return Err(WatchStatisticsError::OwnerChanged);
    }
    Ok(())
}

fn validate_batch(
    scope: &WatchStatisticsScope,
    batch: &WatchStatisticsBatch,
) -> Result<(), WatchStatisticsError> {
    if batch.owner_id != scope.owner_id
        || batch.owner_epoch != scope.owner_epoch
        || !(8..=MAX_BATCH_ID_BYTES).contains(&batch.id.len())
        || !batch
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        || batch.items.is_empty()
        || batch.items.len() > MAX_BATCH_ITEMS
    {
        return Err(WatchStatisticsError::InvalidInput);
    }
    let mut total = 0_u64;
    for item in &batch.items {
        validate_date(&item.day)?;
        if item.ms == 0 || item.ms > MAX_ITEM_DURATION_MS {
            return Err(WatchStatisticsError::InvalidInput);
        }
        total = total
            .checked_add(u64::from(item.ms))
            .ok_or(WatchStatisticsError::InvalidInput)?;
        if total > MAX_BATCH_DURATION_MS {
            return Err(WatchStatisticsError::InvalidInput);
        }
        if let Some(genre) = &item.genre
            && (genre.is_empty()
                || genre.trim() != genre
                || genre.chars().count() > MAX_GENRE_CHARS
                || genre.chars().any(char::is_control)
                || genre
                    .chars()
                    .any(|c| matches!(c, '/' | '\\' | '<' | '>' | ':'))
                || matches!(genre.as_str(), "__proto__" | "constructor" | "prototype"))
        {
            return Err(WatchStatisticsError::InvalidInput);
        }
    }
    Ok(())
}

fn validate_as_of_day(value: &str) -> Result<String, WatchStatisticsError> {
    let day = parse_date(value)?;
    let today = today_days()?;
    if (day - today).abs() > 1 {
        return Err(WatchStatisticsError::InvalidInput);
    }
    Ok(value.to_owned())
}

#[derive(Clone)]
struct OwnerMetadata {
    revision: String,
    since: String,
    reset_at_ms: i64,
}

fn ensure_owner(
    tx: &Transaction<'_>,
    owner: &str,
    since: &str,
) -> Result<OwnerMetadata, WatchStatisticsError> {
    if let Some(metadata) = tx
        .query_row(
            "SELECT revision,since,reset_at_ms FROM owners WHERE owner_id=?1",
            [owner],
            |row| {
                Ok(OwnerMetadata {
                    revision: row.get(0)?,
                    since: row.get(1)?,
                    reset_at_ms: row.get(2)?,
                })
            },
        )
        .optional()?
    {
        if metadata.revision.is_empty()
            || metadata.revision.len() != 32
            || !metadata
                .revision
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            || parse_date(&metadata.since).is_err()
            || metadata.reset_at_ms <= 0
        {
            return Err(WatchStatisticsError::InvalidDatabase);
        }
        return Ok(metadata);
    }
    let revision = random_revision()?;
    let reset_at_ms = now_millis()?;
    tx.execute(
        "INSERT INTO owners(owner_id,revision,since,reset_at_ms) VALUES (?1,?2,?3,?4)",
        params![owner, &revision, since, reset_at_ms],
    )?;
    Ok(OwnerMetadata {
        revision,
        since: since.to_owned(),
        reset_at_ms,
    })
}

fn apply_batch(
    tx: &Transaction<'_>,
    owner: &str,
    revision: &str,
    batch: &WatchStatisticsBatch,
    as_of_day: i64,
) -> Result<(), WatchStatisticsError> {
    let mut by_day = std::collections::HashMap::<String, u64>::new();
    for item in &batch.items {
        let day = parse_date(&item.day)?;
        if day > as_of_day || day <= as_of_day - RETENTION_DAYS {
            return Err(WatchStatisticsError::InvalidInput);
        }
        *by_day.entry(item.day.clone()).or_default() += u64::from(item.ms);
    }
    for (day, duration) in &by_day {
        let previous: i64 = tx
            .query_row(
                "SELECT COALESCE(duration_ms,0) FROM daily WHERE owner_id=?1 AND day=?2",
                params![owner, day],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0);
        if previous < 0 || u64::try_from(previous).unwrap_or(u64::MAX) + duration > 86_400_000 {
            return Err(WatchStatisticsError::DailyLimit);
        }
    }
    let mut distinct =
        std::collections::HashMap::<String, std::collections::HashSet<String>>::new();
    for item in &batch.items {
        distinct
            .entry(item.day.clone())
            .or_default()
            .insert(item.genre.as_deref().unwrap_or("unknown").to_owned());
    }
    for (day, genres) in &distinct {
        let mut statement = tx.prepare("SELECT key FROM genres WHERE owner_id=?1 AND day=?2")?;
        let existing = statement
            .query_map(params![owner, day], |row| row.get::<_, String>(0))?
            .collect::<Result<std::collections::HashSet<_>, _>>()?;
        let new_count = genres
            .iter()
            .filter(|genre| !existing.contains(*genre))
            .count();
        if existing.len() + new_count > MAX_GENRES {
            return Err(WatchStatisticsError::InvalidInput);
        }
    }
    for item in &batch.items {
        let amount = i64::from(item.ms);
        tx.execute(
            "INSERT INTO daily(owner_id,day,duration_ms) VALUES (?1,?2,?3)
             ON CONFLICT(owner_id,day) DO UPDATE SET duration_ms=duration_ms+excluded.duration_ms",
            params![owner, item.day, amount],
        )?;
        tx.execute(
            "INSERT INTO content_types(owner_id,day,key,duration_ms) VALUES (?1,?2,?3,?4)
             ON CONFLICT(owner_id,day,key) DO UPDATE SET duration_ms=duration_ms+excluded.duration_ms",
            params![owner, item.day, item.kind.key(), amount],
        )?;
        let genre = item.genre.as_deref().unwrap_or("unknown");
        tx.execute(
            "INSERT INTO genres(owner_id,day,key,duration_ms) VALUES (?1,?2,?3,?4)
             ON CONFLICT(owner_id,day,key) DO UPDATE SET duration_ms=duration_ms+excluded.duration_ms",
            params![owner, item.day, genre, amount],
        )?;
    }
    let _ = revision;
    Ok(())
}

fn read_snapshot(
    tx: &Transaction<'_>,
    owner: &str,
    metadata: OwnerMetadata,
) -> Result<WatchStatisticsSnapshot, WatchStatisticsError> {
    let mut days = Vec::new();
    let mut statement =
        tx.prepare("SELECT day,duration_ms FROM daily WHERE owner_id=?1 ORDER BY day DESC")?;
    let rows = statement.query_map([owner], |row| {
        Ok(WatchStatisticsDay {
            day: row.get(0)?,
            duration_ms: u64::try_from(row.get::<_, i64>(1)?).unwrap_or(0),
            content_types: Vec::new(),
            genres: Vec::new(),
        })
    })?;
    for row in rows {
        days.push(row?);
    }
    drop(statement);
    for day in &mut days {
        day.content_types = read_day_buckets(tx, "content_types", owner, &day.day)?;
        day.genres = read_day_buckets(tx, "genres", owner, &day.day)?;
    }
    Ok(WatchStatisticsSnapshot {
        version: VERSION as u32,
        since: metadata.since,
        reset_at_ms: metadata.reset_at_ms,
        revision: metadata.revision,
        days,
    })
}

fn read_day_buckets(
    tx: &Transaction<'_>,
    table: &str,
    owner: &str,
    day: &str,
) -> Result<Vec<WatchStatisticsBucket>, WatchStatisticsError> {
    let sql = format!(
        "SELECT key,duration_ms FROM {table} WHERE owner_id=?1 AND day=?2 ORDER BY duration_ms DESC,key ASC"
    );
    let mut statement = tx.prepare(&sql)?;
    let rows = statement.query_map(params![owner, day], |row| {
        Ok(WatchStatisticsBucket {
            key: row.get(0)?,
            duration_ms: u64::try_from(row.get::<_, i64>(1)?).unwrap_or(0),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn prune(tx: &Transaction<'_>, owner: &str, as_of_day: i64) -> Result<(), WatchStatisticsError> {
    let cutoff = date_from_days(as_of_day - (RETENTION_DAYS - 1));
    for table in ["daily", "content_types", "genres"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE owner_id=?1 AND day<?2"),
            params![owner, cutoff],
        )?;
    }
    let cutoff_ms = now_millis()?.saturating_sub(RETENTION_DAYS * DAY_MS);
    tx.execute(
        "DELETE FROM batches WHERE owner_id=?1 AND committed_at<?2",
        params![owner, cutoff_ms],
    )?;
    tx.execute(
        "UPDATE owners SET since=CASE WHEN since<?2 THEN ?2 ELSE since END WHERE owner_id=?1",
        params![owner, cutoff],
    )?;
    Ok(())
}

fn random_revision() -> Result<String, WatchStatisticsError> {
    let mut bytes = [0_u8; 16];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| WatchStatisticsError::Storage)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn batch_hash(batch: &WatchStatisticsBatch) -> Result<Vec<u8>, WatchStatisticsError> {
    let encoded = serde_json::to_vec(batch).map_err(|_| WatchStatisticsError::InvalidInput)?;
    Ok(digest(&SHA256, &encoded).as_ref().to_vec())
}

fn now_millis() -> Result<i64, WatchStatisticsError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| WatchStatisticsError::Storage)?
        .as_millis();
    i64::try_from(millis).map_err(|_| WatchStatisticsError::Storage)
}

fn today_days() -> Result<i64, WatchStatisticsError> {
    Ok(now_millis()? / DAY_MS)
}

fn validate_date(value: &str) -> Result<(), WatchStatisticsError> {
    let _ = parse_date(value)?;
    Ok(())
}

fn parse_date(value: &str) -> Result<i64, WatchStatisticsError> {
    if value.len() != 10 || value.as_bytes()[4] != b'-' || value.as_bytes()[7] != b'-' {
        return Err(WatchStatisticsError::InvalidInput);
    }
    let year = value[0..4]
        .parse::<i64>()
        .map_err(|_| WatchStatisticsError::InvalidInput)?;
    let month = value[5..7]
        .parse::<i64>()
        .map_err(|_| WatchStatisticsError::InvalidInput)?;
    let day = value[8..10]
        .parse::<i64>()
        .map_err(|_| WatchStatisticsError::InvalidInput)?;
    if !(1970..=9999).contains(&year) || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(WatchStatisticsError::InvalidInput);
    }
    let days = days_from_civil(year, month, day);
    if date_from_days(days) != value {
        return Err(WatchStatisticsError::InvalidInput);
    }
    Ok(days)
}

// Howard Hinnant's public-domain civil-date conversion, using Unix days.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = (if year >= 0 { year } else { year - 399 }) / 400;
    let yoe = year - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn date_from_days(days: i64) -> String {
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

#[cfg(test)]
mod tests;
