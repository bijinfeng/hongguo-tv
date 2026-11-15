//! Migration uses disposable SQLite fixtures, never existing user data or live services.
use hongguo_core::{
    catalog::Drama,
    library::{Entry, LibraryError, LibraryStore},
};
use rusqlite::{Connection, params};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-v4-migration-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn db(&self) -> PathBuf {
        self.0.join("library.sqlite3")
    }
    fn backups(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.0)
            .unwrap()
            .map(|item| item.unwrap().path())
            .filter(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .contains(".before-v4-")
            })
            .collect()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn fixture(temp: &Temp, version: i64, owner: &str, count: usize) -> Connection {
    let mut conn = Connection::open(temp.db()).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA application_id=1212634198;
         CREATE TABLE history(series_id TEXT PRIMARY KEY NOT NULL, entry_json TEXT NOT NULL,
         last_played_at INTEGER NOT NULL CHECK(last_played_at>0));",
    )
    .unwrap();
    if version >= 2 {
        conn.execute_batch(
            "CREATE TABLE recent_searches(rank INTEGER PRIMARY KEY,query TEXT UNIQUE NOT NULL);
            INSERT INTO recent_searches VALUES(0,'重生'),(1,'短剧');",
        )
        .unwrap();
    }
    if version == 3 {
        conn.execute_batch(
            "CREATE TABLE library_owner(singleton INTEGER PRIMARY KEY,owner_id TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute("INSERT INTO library_owner VALUES(1,?1)", [owner])
            .unwrap();
    }
    conn.pragma_update(None, "user_version", version).unwrap();
    let tx = conn.transaction().unwrap();
    for i in 0..count {
        let id = (i + 100).to_string();
        let stamp = 1_700_000_000_000 + i as i64;
        let entry = Entry {
            drama: Drama {
                series_id: id.clone(),
                title: "迁移前观看".into(),
                ..Drama::default()
            },
            episode: Some(1),
            video_id: Some("9001".into()),
            position: Some(12.5),
            duration: Some(60.0),
            completed: Some(false),
            last_played_at: Some(stamp),
        };
        tx.execute(
            "INSERT INTO history VALUES(?1,?2,?3)",
            params![id, serde_json::to_string(&entry).unwrap(), stamp],
        )
        .unwrap();
    }
    tx.commit().unwrap();
    conn
}
fn version(conn: &Connection) -> i64 {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

#[tokio::test]
async fn v2_guest_preserves_wal_records_searches_and_private_consistent_backup() {
    let temp = Temp::new();
    let source = fixture(&temp, 2, "", 3);
    let store = LibraryStore::open(temp.db()).await.unwrap();
    let before = store.snapshot().await.unwrap();
    assert_eq!(before.entries.len(), 3);
    assert_eq!(before.owner_id.as_deref(), Some(""));
    assert!(before.favorites.is_empty());
    assert_eq!(
        store.search_history().await.unwrap().items,
        ["重生", "短剧"]
    );
    assert_eq!(version(&source), 4);
    let backups = temp.backups();
    assert_eq!(backups.len(), 1);
    let backup = Connection::open(&backups[0]).unwrap();
    assert_eq!(version(&backup), 2);
    let count: i64 = backup
        .query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 3);
    assert_eq!(
        backup
            .query_row("SELECT query FROM recent_searches WHERE rank=0", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
        "重生"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&backups[0]).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    drop(store);
    let reopened = LibraryStore::open(temp.db()).await.unwrap();
    assert_eq!(reopened.snapshot().await.unwrap(), before);
    assert_eq!(temp.backups().len(), 1);
    assert!(matches!(
        LibraryStore::open_for_owner(temp.db(), "123".to_owned()).await,
        Err(LibraryError::OwnerChanged)
    ));
}

#[tokio::test]
async fn v3_account_preserves_more_than_queue_capacity_as_backfill_without_retimestamping() {
    let temp = Temp::new();
    let source = fixture(&temp, 3, "123", 2001);
    let store = LibraryStore::open_for_owner(temp.db(), "123".to_owned())
        .await
        .unwrap();
    let saved = store.snapshot().await.unwrap();
    assert_eq!(saved.entries.len(), 2001);
    assert_eq!(saved.entries[0].last_played_at, Some(1_700_000_002_000));
    assert_eq!(
        source
            .query_row("SELECT COUNT(*) FROM sync_backfill", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        2001
    );
    assert_eq!(
        source
            .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    drop(store);
    assert_eq!(
        LibraryStore::open_for_owner(temp.db(), "123".to_owned())
            .await
            .unwrap()
            .snapshot()
            .await
            .unwrap(),
        saved
    );
    assert!(matches!(
        LibraryStore::open_for_owner(temp.db(), "456".to_owned()).await,
        Err(LibraryError::OwnerChanged)
    ));
    assert!(matches!(
        LibraryStore::open(temp.db()).await,
        Err(LibraryError::OwnerChanged)
    ));
    assert_eq!(temp.backups().len(), 1);
}

#[tokio::test]
async fn v1_upgrades_and_new_libraries_commit_directly_as_v4() {
    let temp = Temp::new();
    let source = fixture(&temp, 1, "", 1);
    let store = LibraryStore::open(temp.db()).await.unwrap();
    assert_eq!(version(&source), 4);
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 1);
    assert!(store.search_history().await.unwrap().items.is_empty());
    for owner in ["", "123"] {
        let fresh = Temp::new();
        let store = if owner.is_empty() {
            LibraryStore::open(fresh.db()).await
        } else {
            LibraryStore::open_for_owner(fresh.db(), owner.to_owned()).await
        }
        .unwrap();
        assert!(store.snapshot().await.unwrap().entries.is_empty());
        assert_eq!(version(&Connection::open(fresh.db()).unwrap()), 4);
        assert!(fresh.backups().is_empty());
    }
}

#[tokio::test]
async fn wrong_owner_bad_json_and_future_versions_fail_without_backup_or_rewrite() {
    for case in ["owner", "json", "version"] {
        let temp = Temp::new();
        let conn = fixture(&temp, 3, "123", 1);
        let error = match case {
            "json" => {
                conn.execute("UPDATE history SET entry_json='broken'", [])
                    .unwrap();
                LibraryError::InvalidDatabase
            }
            "version" => {
                conn.pragma_update(None, "user_version", 99).unwrap();
                LibraryError::InvalidDatabase
            }
            _ => LibraryError::OwnerChanged,
        };
        let original = version(&conn);
        let owner = if case == "owner" { "456" } else { "123" };
        assert!(
            matches!(LibraryStore::open_for_owner(temp.db(),owner.to_owned()).await,Err(actual) if actual==error)
        );
        assert_eq!(version(&conn), original);
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(temp.backups().is_empty());
    }
}

#[tokio::test]
async fn failing_schema_upgrade_rolls_back_and_keeps_original_records_and_backup() {
    let temp = Temp::new();
    let conn = fixture(&temp, 2, "", 1);
    conn.execute("CREATE TABLE favorites(unrelated TEXT)", [])
        .unwrap();
    assert!(LibraryStore::open(temp.db()).await.is_err());
    assert_eq!(version(&conn), 2);
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    let owner_table: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name='library_owner'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(owner_table, 0);
    assert_eq!(temp.backups().len(), 1);
    conn.execute("DROP TABLE favorites", []).unwrap();
    assert_eq!(
        LibraryStore::open(temp.db())
            .await
            .unwrap()
            .snapshot()
            .await
            .unwrap()
            .entries
            .len(),
        1
    );
}
