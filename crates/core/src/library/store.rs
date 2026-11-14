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
pub struct LibraryStore(Arc<Mutex<Connection>>);
impl LibraryStore {
    /// Open an explicit database path on a blocking worker; never imports legacy data.
    pub async fn open(path: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        let path = path.into();
        let connection = tokio::task::spawn_blocking(move || initialize(path))
            .await
            .map_err(|_| LibraryError::Storage)??;
        Ok(Self(Arc::new(Mutex::new(connection))))
    }
    /// Return committed history without creating or updating an entry.
    pub async fn snapshot(&self) -> Result<Library, LibraryError> {
        self.run(|conn| snapshot(conn)).await
    }
    /// Commit an explicit mutation before returning its snapshot.
    /// Once blocking execution starts, dropping this future does not roll back the write.
    pub async fn apply(&self, change: HistoryChange) -> Result<Library, LibraryError> {
        change.validate()?;
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            match change {
                HistoryChange::Progress(progress) => {
                    let previous: i64 = tx.query_row(
                        "SELECT COALESCE(MAX(last_played_at), 0) FROM history", [], |r| r.get(0))?;
                    let now = SystemTime::now().duration_since(UNIX_EPOCH)
                        .map_err(|_| LibraryError::Storage)?.as_millis();
                    let stamp = i64::try_from(now).map_err(|_| LibraryError::Storage)?
                        .max(previous.checked_add(1).ok_or(LibraryError::InvalidDatabase)?);
                    let entry = progress.into_entry(stamp);
                    let json = serde_json::to_string(&entry).map_err(|_| LibraryError::InvalidInput)?;
                    tx.execute(
                        "INSERT INTO history(series_id, entry_json, last_played_at) VALUES (?1, ?2, ?3)
                         ON CONFLICT(series_id) DO UPDATE SET entry_json=excluded.entry_json, last_played_at=excluded.last_played_at",
                        params![entry.drama.series_id, json, stamp],
                    )?;
                }
                HistoryChange::Remove { series_id, .. } => {
                    tx.execute("DELETE FROM history WHERE series_id=?1", [series_id])?;
                }
                HistoryChange::Clear { .. } => { tx.execute("DELETE FROM history", [])?; }
            }
            let result = snapshot(&tx)?;
            tx.commit()?;
            Ok(result)
        }).await
    }
    pub(super) async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, LibraryError> + Send + 'static,
    ) -> Result<T, LibraryError> {
        let connection = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = connection.lock().map_err(|_| LibraryError::Storage)?;
            operation(&mut conn)
        })
        .await
        .map_err(|_| LibraryError::Storage)?
    }
}
fn initialize(path: PathBuf) -> Result<Connection, LibraryError> {
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
    let mut conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
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
             PRAGMA application_id=1212634198;
             PRAGMA user_version=1;",
        )?;
    } else if id != APPLICATION_ID || !(1..=2).contains(&version) {
        return Err(LibraryError::InvalidDatabase);
    }
    snapshot(&tx)?;
    if version <= 1 {
        tx.execute_batch(
            "CREATE TABLE recent_searches(rank INTEGER PRIMARY KEY NOT NULL CHECK(rank >= 0 AND rank < 10),
             query TEXT UNIQUE NOT NULL); PRAGMA user_version=2;",
        )?;
    }
    super::search::snapshot(&tx)?;
    let integrity: String = tx.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(LibraryError::InvalidDatabase);
    }
    tx.commit()?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(conn)
}
fn snapshot(conn: &Connection) -> Result<Library, LibraryError> {
    let mut query = conn.prepare("SELECT series_id, entry_json, last_played_at FROM history ORDER BY last_played_at DESC, series_id")?;
    let mut rows = query.query([])?;
    let mut entries = Vec::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let json: String = row.get(1)?;
        let stamp: i64 = row.get(2)?;
        let entry: Entry =
            serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
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
        if progress.validate().is_err()
            || id != entry.drama.series_id
            || entry.last_played_at != Some(stamp)
            || stamp <= 0
            || progress.into_entry(stamp) != entry
        {
            return Err(LibraryError::InvalidDatabase);
        }
        entries.push(entry);
    }
    Ok(Library {
        entries,
        owner_id: Some(String::new()),
    })
}
