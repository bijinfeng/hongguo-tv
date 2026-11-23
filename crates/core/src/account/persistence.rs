use super::{AccountError, AccountProfile, passport::PersistedSession};
use rusqlite::{Connection, OpenFlags, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, DirBuilder, OpenOptions},
    io::ErrorKind,
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};

const APPLICATION_ID: i64 = 0x48474143;
const MAX_SESSION_BYTES: usize = 128 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SavedSession {
    pub profile: AccountProfile,
    pub credential: PersistedSession,
}
impl SavedSession {
    pub fn validate(&self) -> Result<(), AccountError> {
        if self.profile.name.chars().count() > 128
            || self.profile.name.chars().any(char::is_control)
            || self
                .profile
                .avatar
                .as_ref()
                .is_some_and(|avatar| avatar.chars().count() > 2048)
        {
            return Err(AccountError::InvalidSession);
        }
        self.credential
            .validate_for_uid(&self.profile.uid)
            .map_err(|_| AccountError::InvalidSession)
    }
}

/// A single private SQLite transaction atomically replaces or removes credentials.
#[derive(Clone)]
pub(super) struct SessionStore(Arc<Mutex<Connection>>);
impl SessionStore {
    pub async fn open(
        dir: &Path,
    ) -> Result<(Self, Option<SavedSession>, Option<PersistedSession>), AccountError> {
        let dir = dir.to_owned();
        tokio::task::spawn_blocking(move || {
            let mut builder = DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&dir).map_err(|_| AccountError::Storage)?;
            let path = dir.join("account.sqlite3");
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            match options.open(&path) {
                Ok(file) => file.sync_all().map_err(|_| AccountError::Storage)?,
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
                Err(_) => return Err(AccountError::Storage),
            }
            let metadata = fs::symlink_metadata(&path).map_err(|_| AccountError::Storage)?;
            if !metadata.file_type().is_file() {
                return Err(AccountError::InvalidSession);
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                    .map_err(|_| AccountError::Storage)?;
            }
            let mut connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|_| AccountError::InvalidSession)?;
            connection.busy_timeout(Duration::from_secs(2)).map_err(|_| AccountError::Storage)?;
            connection.pragma_update(None, "secure_delete", "ON").map_err(|_| AccountError::Storage)?;
            connection.pragma_update(None, "synchronous", "FULL").map_err(|_| AccountError::Storage)?;
            let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| AccountError::Storage)?;
            let id: i64 = tx.query_row("PRAGMA application_id", [], |r| r.get(0))
                .map_err(|_| AccountError::InvalidSession)?;
            let version: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))
                .map_err(|_| AccountError::InvalidSession)?;
            if id == 0 && version == 0 {
                let tables: i64 = tx.query_row(
                    "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'", [], |r| r.get(0),
                ).map_err(|_| AccountError::InvalidSession)?;
                if tables != 0 { return Err(AccountError::InvalidSession); }
                tx.execute_batch(
                    "CREATE TABLE session(singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT, device TEXT);
                     INSERT INTO session(singleton,payload) VALUES(1,NULL);
                     PRAGMA application_id=1212629315; PRAGMA user_version=1;",
                ).map_err(|_| AccountError::Storage)?;
            } else if id != APPLICATION_ID || version != 1 {
                return Err(AccountError::InvalidSession);
            }
            let integrity: String = tx.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))
                .map_err(|_| AccountError::InvalidSession)?;
            if integrity != "ok" { return Err(AccountError::InvalidSession); }
            let saved = read(&tx)?;
            let device: Option<String> = tx.query_row(
                "SELECT CASE WHEN device IS NULL THEN NULL WHEN length(CAST(device AS BLOB)) <= 131072 THEN device ELSE 'invalid' END FROM session WHERE singleton=1",
                [], |r| r.get(0),
            ).map_err(|_| AccountError::InvalidSession)?;
            let device = device.map(|encoded| {
                let device: PersistedSession = serde_json::from_str(&encoded).map_err(|_| AccountError::InvalidSession)?;
                device.validate().map_err(|_| AccountError::InvalidSession)?;
                if !device.is_registered() || device.has_credentials() { return Err(AccountError::InvalidSession); }
                Ok(device)
            }).transpose()?;
            tx.commit().map_err(|_| AccountError::Storage)?;
            // Rollback journaling avoids retaining historical credentials in a persistent WAL.
            connection.pragma_update(None, "journal_mode", "DELETE").map_err(|_| AccountError::Storage)?;
            Ok((Self(Arc::new(Mutex::new(connection))), saved, device))
        }).await.map_err(|_| AccountError::Storage)?
    }

    pub async fn save_device(&self, device: PersistedSession) -> Result<(), AccountError> {
        device
            .validate()
            .map_err(|_| AccountError::InvalidSession)?;
        if !device.is_registered() || device.has_credentials() {
            return Err(AccountError::InvalidSession);
        }
        let payload = serde_json::to_string(&device).map_err(|_| AccountError::InvalidSession)?;
        if payload.len() > MAX_SESSION_BYTES {
            return Err(AccountError::InvalidSession);
        }
        let connection = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let connection = connection.lock().map_err(|_| AccountError::Storage)?;
            if connection
                .execute("UPDATE session SET device=?1 WHERE singleton=1", [payload])
                .map_err(|_| AccountError::Storage)?
                != 1
            {
                return Err(AccountError::InvalidSession);
            }
            Ok(())
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }

    pub async fn replace(&self, session: Option<SavedSession>) -> Result<(), AccountError> {
        let payload = session
            .map(|saved| {
                saved.validate()?;
                let encoded =
                    serde_json::to_string(&saved).map_err(|_| AccountError::InvalidSession)?;
                if encoded.len() > MAX_SESSION_BYTES {
                    return Err(AccountError::InvalidSession);
                }
                Ok(encoded)
            })
            .transpose()?;
        let connection = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = connection.lock().map_err(|_| AccountError::Storage)?;
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| AccountError::Storage)?;
            let affected = tx
                .execute(
                    "UPDATE session SET payload=?1 WHERE singleton=1",
                    params![payload],
                )
                .map_err(|_| AccountError::Storage)?;
            if affected != 1 {
                return Err(AccountError::InvalidSession);
            }
            tx.commit().map_err(|_| AccountError::Storage)
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }
}

fn read(connection: &Connection) -> Result<Option<SavedSession>, AccountError> {
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM session", [], |r| r.get(0))
        .map_err(|_| AccountError::InvalidSession)?;
    if count != 1 {
        return Err(AccountError::InvalidSession);
    }
    let size: Option<i64> = connection
        .query_row(
            "SELECT length(CAST(payload AS BLOB)) FROM session WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .map_err(|_| AccountError::InvalidSession)?;
    if size.is_some_and(|length| length < 0 || length > MAX_SESSION_BYTES as i64) {
        return Err(AccountError::InvalidSession);
    }
    let payload: Option<String> = connection
        .query_row("SELECT payload FROM session WHERE singleton=1", [], |r| {
            r.get(0)
        })
        .map_err(|_| AccountError::InvalidSession)?;
    payload
        .map(|payload| {
            let session: SavedSession =
                serde_json::from_str(&payload).map_err(|_| AccountError::InvalidSession)?;
            session.validate()?;
            Ok(session)
        })
        .transpose()
}
