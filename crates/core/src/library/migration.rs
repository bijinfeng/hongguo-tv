use super::LibraryError;
use ring::rand::{SecureRandom, SystemRandom};
use rusqlite::{Connection, Transaction};
use std::{
    fs::OpenOptions,
    path::{Path, PathBuf},
};

/// SQLite copies committed WAL contents too; copying the main file alone loses them.
pub(super) fn backup(conn: &Connection, path: &Path) -> Result<PathBuf, LibraryError> {
    let mut nonce = [0_u8; 8];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| LibraryError::Storage)?;
    let mut name = path
        .file_name()
        .ok_or(LibraryError::Storage)?
        .to_os_string();
    let suffix: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    name.push(format!(".before-v4-{suffix}.sqlite3"));
    let destination = path.with_file_name(name);
    let destination_text = destination.to_str().ok_or(LibraryError::Storage)?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(&destination)
        .map_err(|_| LibraryError::Storage)?;
    let result = (|| {
        conn.execute("VACUUM main INTO ?1", [destination_text])?;
        file.sync_all().map_err(|_| LibraryError::Storage)?;
        #[cfg(unix)]
        if let Some(parent) = destination.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::File::open(parent)
                .and_then(|directory| directory.sync_all())
                .map_err(|_| LibraryError::Storage)?;
        }
        Ok::<_, LibraryError>(())
    })();
    if result.is_err() {
        drop(file);
        let _ = std::fs::remove_file(&destination);
    }
    result.map(|()| destination)
}

/// The caller validates the original owner and contents before entering this transaction.
pub(super) fn install(
    tx: &Transaction<'_>,
    owner: &str,
    source_version: i64,
) -> Result<(), LibraryError> {
    if !(0..=3).contains(&source_version) {
        return Err(LibraryError::InvalidDatabase);
    }
    if source_version < 3 {
        tx.execute_batch(
            "CREATE TABLE library_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
             owner_id TEXT NOT NULL);",
        )?;
        tx.execute(
            "INSERT INTO library_owner(singleton,owner_id) VALUES (1,?1)",
            [owner],
        )?;
    }
    tx.execute_batch(
        "CREATE TABLE favorites(series_id TEXT PRIMARY KEY NOT NULL, drama_json TEXT NOT NULL,
         favorite_at INTEGER NOT NULL CHECK(favorite_at>0));
         CREATE TABLE sync_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
         sequence INTEGER NOT NULL CHECK(sequence>=0),last_sync INTEGER CHECK(last_sync>0));
         INSERT INTO sync_state(singleton,sequence) VALUES(1,0);
         CREATE TABLE sync_outbox(sequence INTEGER PRIMARY KEY CHECK(sequence>0),
         kind TEXT NOT NULL CHECK(kind IN ('progress','favorite')),series_id TEXT NOT NULL,
         payload_json TEXT NOT NULL,UNIQUE(kind,series_id));
         CREATE TABLE sync_hidden(kind TEXT NOT NULL CHECK(kind IN ('history','favorites')),
         series_id TEXT NOT NULL,hidden_at INTEGER NOT NULL CHECK(hidden_at>0),PRIMARY KEY(kind,series_id));
         CREATE TABLE guest_import_watermark(series_id TEXT PRIMARY KEY NOT NULL,
         played_at INTEGER NOT NULL CHECK(played_at>0));
         CREATE TABLE sync_backfill(series_id TEXT PRIMARY KEY NOT NULL);
         CREATE TABLE sync_metadata(series_id TEXT PRIMARY KEY NOT NULL,
         season_index INTEGER NOT NULL CHECK(season_index>=0 AND season_index<=10000),
         multi_season INTEGER NOT NULL CHECK(multi_season IN (0,1)),
         metadata_pending INTEGER NOT NULL CHECK(metadata_pending IN (0,1)),
         history_remote INTEGER NOT NULL DEFAULT 0 CHECK(history_remote IN (0,1)));",
    )?;
    if !owner.is_empty() {
        tx.execute(
            "INSERT INTO sync_backfill(series_id) SELECT series_id FROM history",
            [],
        )?;
    }
    tx.pragma_update(None, "user_version", 4)?;
    Ok(())
}
