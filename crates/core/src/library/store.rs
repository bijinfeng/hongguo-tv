use super::{Entry, HistoryChange, Library, LibraryError};
use rusqlite::{Connection, OpenFlags, TransactionBehavior, params};
use std::{
    fs::{DirBuilder, OpenOptions},
    io::ErrorKind,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const APPLICATION_ID: i64 = 0x48475456;

/// One serialized SQLite connection; clones share storage, not a mutable snapshot cache.
#[derive(Clone)]
pub struct LibraryStore(
    pub(super) Arc<Mutex<Connection>>,
    pub(super) Arc<super::operations::WriteSessions>,
    pub(super) String,
);
impl LibraryStore {
    /// Open an explicit guest database; never imports legacy data or adopts an account library.
    pub async fn open(path: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        Self::open_owned(path.into(), String::new()).await
    }
    /// Open a library for an already authenticated owner, never for an owner supplied by a mutation.
    /// Existing guest or other-account databases are rejected without changing their identity.
    pub async fn open_for_owner(
        path: impl Into<PathBuf>,
        owner_id: String,
    ) -> Result<Self, LibraryError> {
        if !super::valid_id(&owner_id) {
            return Err(LibraryError::InvalidInput);
        }
        Self::open_owned(path.into(), owner_id).await
    }
    async fn open_owned(path: PathBuf, owner: String) -> Result<Self, LibraryError> {
        let expected = owner.clone();
        let (connection, canonical) = tokio::task::spawn_blocking(move || {
            let connection = initialize(path.clone(), &expected)?;
            let canonical = std::fs::canonicalize(path).map_err(|_| LibraryError::Storage)?;
            Ok::<_, LibraryError>((connection, canonical))
        })
        .await
        .map_err(|_| LibraryError::Storage)??;
        let sessions = super::operations::shared_sessions(&canonical, &owner)?;
        Ok(Self(Arc::new(Mutex::new(connection)), sessions, owner))
    }
    /// Return committed history without creating or updating an entry.
    pub async fn snapshot(&self) -> Result<Library, LibraryError> {
        self.1.wait_registered().await?;
        let owner = self.2.clone();
        self.run(move |conn| snapshot(conn, &owner)).await
    }
    /// Commit an explicit mutation before returning its snapshot.
    /// Once blocking execution starts, dropping this future does not roll back the write.
    pub async fn apply(&self, change: HistoryChange) -> Result<Library, LibraryError> {
        change.validate(&self.2)?;
        let owner = self.2.clone();
        self.run(move |conn| apply(conn, change, &owner)).await
    }

    pub(super) async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, LibraryError> + Send + 'static,
    ) -> Result<T, LibraryError> {
        let connection = self.0.clone();
        let owner = self.2.clone();
        let admission = self.1.begin_blocking()?;
        tokio::task::spawn_blocking(move || {
            let _admission = admission;
            let mut conn = connection.lock().map_err(|_| LibraryError::Storage)?;
            validate_database_owner(&conn, &owner)?;
            operation(&mut conn)
        })
        .await
        .map_err(|_| LibraryError::Storage)?
    }
}
pub(super) fn apply(
    conn: &mut Connection,
    change: HistoryChange,
    owner: &str,
) -> Result<Library, LibraryError> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    validate_database_owner(&tx, owner)?;
    match change {
        HistoryChange::Progress(progress) => {
            let stamp = next_stamp(&tx)?;
            let entry = progress.into_entry(stamp);
            let json = serde_json::to_string(&entry).map_err(|_| LibraryError::InvalidInput)?;
            tx.execute(
                "INSERT INTO history(series_id, entry_json, last_played_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(series_id) DO UPDATE SET entry_json=excluded.entry_json, last_played_at=excluded.last_played_at",
                params![entry.drama.series_id, json, stamp],
            )?;
            super::sync::clear_hidden(&tx, super::LibraryKind::History, &entry.drama.series_id)?;
            super::sync::cancel_backfill(&tx, &entry.drama.series_id)?;
            tx.execute(
                "UPDATE sync_metadata SET history_remote=0 WHERE series_id=?1",
                [&entry.drama.series_id],
            )?;
            if !owner.is_empty() {
                super::sync::enqueue_progress(&tx, &entry)?;
            }
        }
        HistoryChange::Remove {
            series_id,
            kind: super::LibraryKind::History,
            ..
        } => {
            let stamp = next_stamp(&tx)?;
            super::sync::hide(&tx, super::LibraryKind::History, &series_id, stamp)?;
            super::sync::cancel_backfill(&tx, &series_id)?;
            tx.execute("DELETE FROM history WHERE series_id=?1", [series_id])?;
        }
        HistoryChange::Clear {
            kind: super::LibraryKind::History,
            ..
        } => {
            let stamp = next_stamp(&tx)?;
            super::sync::hide_all(&tx, super::LibraryKind::History, stamp)?;
            tx.execute("DELETE FROM history", [])?;
        }
        HistoryChange::Favorite { drama, value, .. } => {
            let stamp = next_stamp(&tx)?;
            super::sync::clear_hidden(&tx, super::LibraryKind::Favorites, &drama.series_id)?;
            if !owner.is_empty() {
                super::sync::enqueue_favorite(&tx, &drama.series_id, value)?;
            }
            super::favorites::set(&tx, drama, value, stamp)?;
        }
        HistoryChange::Remove {
            series_id,
            kind: super::LibraryKind::Favorites,
            ..
        } => {
            super::sync::clear_hidden(&tx, super::LibraryKind::Favorites, &series_id)?;
            if !owner.is_empty() {
                super::sync::enqueue_favorite(&tx, &series_id, false)?;
            }
            super::favorites::remove(&tx, &series_id)?;
        }
        HistoryChange::Clear {
            kind: super::LibraryKind::Favorites,
            ..
        } => {
            let stamp = next_stamp(&tx)?;
            super::sync::hide_all(&tx, super::LibraryKind::Favorites, stamp)?;
            super::favorites::clear(&tx)?;
        }
    }
    let result = snapshot(&tx, owner)?;
    tx.commit()?;
    Ok(result)
}

pub(super) fn next_stamp(conn: &Connection) -> Result<i64, LibraryError> {
    let previous: i64 = conn.query_row(
        "SELECT MAX(stamp) FROM (
         SELECT COALESCE(MAX(last_played_at),0) AS stamp FROM history
         UNION ALL SELECT COALESCE(MAX(favorite_at),0) FROM favorites
         UNION ALL SELECT COALESCE(MAX(hidden_at),0) FROM sync_hidden)",
        [],
        |row| row.get(0),
    )?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| LibraryError::Storage)?
        .as_millis();
    Ok(i64::try_from(now).map_err(|_| LibraryError::Storage)?.max(
        previous
            .checked_add(1)
            .ok_or(LibraryError::InvalidDatabase)?,
    ))
}

fn initialize(path: PathBuf, owner: &str) -> Result<Connection, LibraryError> {
    if path.file_name().is_none() || path == std::path::Path::new(":memory:") {
        return Err(LibraryError::InvalidInput);
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        let mut builder = DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(parent).map_err(|_| LibraryError::Storage)?;
    }
    let mut file = OpenOptions::new();
    file.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        file.mode(0o600);
    }
    match file.open(&path) {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return Err(LibraryError::Storage),
    }
    let mut conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    conn.busy_timeout(Duration::from_secs(2))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let id: i64 = tx.query_row("PRAGMA application_id", [], |r| r.get(0))?;
    let version: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if id == 0 && version == 0 {
        let tables: i64 = tx.query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )?;
        if tables != 0 {
            return Err(LibraryError::InvalidDatabase);
        }
        tx.execute_batch(
            "CREATE TABLE history(series_id TEXT PRIMARY KEY NOT NULL, entry_json TEXT NOT NULL,
             last_played_at INTEGER NOT NULL CHECK(last_played_at > 0));
             CREATE TABLE recent_searches(rank INTEGER PRIMARY KEY NOT NULL CHECK(rank >= 0 AND rank < 10),
             query TEXT UNIQUE NOT NULL);
             PRAGMA application_id=1212634198;",
        )?;
        super::migration::install(&tx, owner, 0)?;
        snapshot(&tx, owner)?;
        super::search::snapshot(&tx)?;
        check_integrity(&tx)?;
        tx.commit()?;
    } else {
        if id != APPLICATION_ID || !(1..=4).contains(&version) {
            return Err(LibraryError::InvalidDatabase);
        }
        snapshot(&tx, owner)?;
        if version >= 2 {
            super::search::snapshot(&tx)?;
        }
        check_integrity(&tx)?;
        tx.commit()?;
        if version < 4 {
            // VACUUM needs no active transaction; recheck the owner under the migration lock.
            super::migration::backup(&conn, &path)?;
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
            snapshot(&tx, owner)?;
            if current == version {
                if current == 1 {
                    tx.execute_batch(
                        "CREATE TABLE recent_searches(rank INTEGER PRIMARY KEY NOT NULL CHECK(rank >= 0 AND rank < 10),
                         query TEXT UNIQUE NOT NULL);",
                    )?;
                }
                super::migration::install(&tx, owner, current)?;
            } else if current != 4 {
                return Err(LibraryError::InvalidDatabase);
            }
            snapshot(&tx, owner)?;
            super::search::snapshot(&tx)?;
            check_integrity(&tx)?;
            tx.commit()?;
        }
    }
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(conn)
}
fn check_integrity(conn: &Connection) -> Result<(), LibraryError> {
    let integrity: String = conn.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(LibraryError::InvalidDatabase);
    }
    Ok(())
}
pub(super) fn validate_database_owner(
    conn: &Connection,
    expected: &str,
) -> Result<(), LibraryError> {
    let id: i64 = conn.query_row("PRAGMA application_id", [], |r| r.get(0))?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if id != APPLICATION_ID {
        return Err(LibraryError::InvalidDatabase);
    }
    let owner = match version {
        1 | 2 => {
            let identities: i64 = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_schema WHERE name='library_owner'",
                [],
                |r| r.get(0),
            )?;
            if identities != 0 {
                return Err(LibraryError::InvalidDatabase);
            }
            String::new()
        }
        3 | 4 => {
            let mut statement = conn
                .prepare("SELECT singleton, owner_id FROM library_owner")
                .map_err(|_| LibraryError::InvalidDatabase)?;
            let mut rows = statement
                .query([])
                .map_err(|_| LibraryError::InvalidDatabase)?;
            let row = rows
                .next()
                .map_err(|_| LibraryError::InvalidDatabase)?
                .ok_or(LibraryError::InvalidDatabase)?;
            let singleton: i64 = row.get(0).map_err(|_| LibraryError::InvalidDatabase)?;
            let owner: String = row.get(1).map_err(|_| LibraryError::InvalidDatabase)?;
            if singleton != 1
                || !(super::valid_id(&owner) || (version == 4 && owner.is_empty()))
                || rows
                    .next()
                    .map_err(|_| LibraryError::InvalidDatabase)?
                    .is_some()
            {
                return Err(LibraryError::InvalidDatabase);
            }
            owner
        }
        _ => return Err(LibraryError::InvalidDatabase),
    };
    if owner != expected {
        return Err(LibraryError::OwnerChanged);
    }
    Ok(())
}
pub(super) fn snapshot(conn: &Connection, owner: &str) -> Result<Library, LibraryError> {
    validate_database_owner(conn, owner)?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let mut query = conn.prepare("SELECT series_id, entry_json, last_played_at FROM history ORDER BY last_played_at DESC, series_id")?;
    let mut rows = query.query([])?;
    let mut entries = Vec::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let json: String = row.get(1)?;
        let stamp: i64 = row.get(2)?;
        let entry: Entry =
            serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
        let strict = (|| {
            let progress = super::Progress {
                owner_id: None,
                drama: entry.drama.clone(),
                episode: entry.episode.ok_or(LibraryError::InvalidDatabase)?,
                video_id: entry
                    .video_id
                    .clone()
                    .ok_or(LibraryError::InvalidDatabase)?,
                position: entry.position.ok_or(LibraryError::InvalidDatabase)?,
                duration: entry.duration.ok_or(LibraryError::InvalidDatabase)?,
                completed: entry.completed.ok_or(LibraryError::InvalidDatabase)?,
            };
            progress.validate()?;
            if progress.into_entry(stamp) != entry {
                return Err(LibraryError::InvalidDatabase);
            }
            Ok::<_, LibraryError>(())
        })();
        if strict.is_err() {
            let remote = version >= 4 && conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sync_metadata WHERE series_id=?1 AND history_remote=1)",
                [&id], |row| row.get::<_, bool>(0),
            )?;
            if !remote {
                return Err(LibraryError::InvalidDatabase);
            }
            super::sync::validate_remote_entry(&entry)
                .map_err(|_| LibraryError::InvalidDatabase)?;
        }
        if id != entry.drama.series_id || entry.last_played_at != Some(stamp) || stamp <= 0 {
            return Err(LibraryError::InvalidDatabase);
        }
        entries.push(entry);
    }
    Ok(Library {
        entries,
        favorites: if version >= 4 {
            super::favorites::snapshot(conn)?
        } else {
            Vec::new()
        },
        owner_id: Some(owner.to_owned()),
    })
}
