//! Guest persistence tests use isolated, disposable databases and no legacy/live data.
use hongguo_core::{
    catalog::{Drama, Episode},
    library::{HistoryChange, LibraryError, LibraryStore, Progress},
};
use rusqlite::Connection;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-library-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn db(&self) -> PathBuf {
        self.0.join("guest.sqlite3")
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn progress(id: &str) -> Progress {
    Progress {
        owner_id: Some(String::new()),
        drama: Drama {
            series_id: id.into(),
            title: "离线短剧".into(),
            ..Drama::default()
        },
        episode: 2,
        video_id: "9999999999999999999".into(),
        position: 12.5,
        duration: 60.0,
        completed: false,
    }
}
fn mutation(value: serde_json::Value) -> HistoryChange {
    serde_json::from_value(value).unwrap()
}

#[tokio::test]
async fn restores_latest_compact_progress_and_orders_exact_ids() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    assert!(store.snapshot().await.unwrap().entries.is_empty());
    store
        .apply(HistoryChange::Progress(Box::new(progress("123"))))
        .await
        .unwrap();
    let mut change = progress("9999999999999999999");
    change.drama.intro = "剧🍊".repeat(1000);
    change.drama.tags = Some(vec!["分类".repeat(100); 10]);
    change.drama.episodes = Some(vec![
        Episode {
            index: 1,
            video_id: "2".into(),
            locked: false,
            title: None
        };
        1000
    ]);
    let result = store
        .apply(HistoryChange::Progress(Box::new(change.clone())))
        .await
        .unwrap();
    assert_eq!(result.entries.len(), 2);
    let first = &result.entries[0];
    assert_eq!(first.drama.series_id, change.drama.series_id);
    assert_eq!(first.drama.episodes, None);
    assert_eq!(first.drama.intro.chars().count(), 1000);
    assert_eq!(first.drama.tags.as_ref().unwrap().len(), 8);
    assert_eq!(first.drama.tags.as_ref().unwrap()[0].chars().count(), 80);
    change.completed = true;
    change.position = 60.0;
    let saved = store
        .apply(HistoryChange::Progress(Box::new(change)))
        .await
        .unwrap();
    assert_eq!(saved.entries.len(), 2);
    drop(store);
    let restored = LibraryStore::open(tmp.db())
        .await
        .unwrap()
        .snapshot()
        .await
        .unwrap();
    assert_eq!(restored, saved);
    assert_eq!(restored.entries[0].completed, Some(true));
    assert_eq!(
        restored.entries[0].video_id.as_deref(),
        Some("9999999999999999999")
    );
    assert!(restored.entries[0].last_played_at > restored.entries[1].last_played_at);
}

#[tokio::test]
async fn rejects_invalid_progress_owner_and_json_without_writing() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    let baseline = store
        .apply(HistoryChange::Progress(Box::new(progress("1"))))
        .await
        .unwrap();
    let good = progress("2");
    let wire = serde_json::to_string(&HistoryChange::Progress(Box::new(good.clone()))).unwrap();
    assert!(serde_json::from_str::<HistoryChange>(&wire).is_ok());
    let mut cases = Vec::new();
    for value in [f64::NAN, f64::INFINITY, -1.0, 86401.0] {
        let mut p = good.clone();
        p.position = value;
        cases.push(p);
        let mut p = good.clone();
        p.duration = value;
        cases.push(p);
    }
    for id in ["", "0", "00", "x", "123456789012345678901234567890123"] {
        let mut p = good.clone();
        p.drama.series_id = id.into();
        cases.push(p);
        let mut p = good.clone();
        p.video_id = id.into();
        cases.push(p);
    }
    for episode in [0, 10001] {
        let mut p = good.clone();
        p.episode = episode;
        cases.push(p);
    }
    for p in cases {
        assert_eq!(
            store.apply(HistoryChange::Progress(Box::new(p))).await,
            Err(LibraryError::InvalidInput)
        );
    }
    let mut other = good.clone();
    other.owner_id = Some("another-account".into());
    assert_eq!(
        store.apply(HistoryChange::Progress(Box::new(other))).await,
        Err(LibraryError::OwnerChanged)
    );
    for raw in [
        r#"{"action":"clear","kind":"history","unknown":"secret"}"#,
        r#"{"action":"clear","kind":"likes"}"#,
        r#"{"action":"favorite"}"#,
        r#"{"action":"remove","kind":"history","series_id":123}"#,
    ] {
        assert!(serde_json::from_str::<HistoryChange>(raw).is_err());
    }
    let mut value = serde_json::to_value(HistoryChange::Progress(Box::new(good))).unwrap();
    value["unknown"] = "secret".into();
    assert!(serde_json::from_value::<HistoryChange>(value).is_err());
    assert_eq!(store.snapshot().await.unwrap(), baseline);
}

#[tokio::test]
async fn independent_connections_do_not_lose_concurrent_entries() {
    let tmp = Temp::new();
    let first = LibraryStore::open(tmp.db()).await.unwrap();
    let second = LibraryStore::open(tmp.db()).await.unwrap();
    let mut jobs = Vec::new();
    for index in 1..=20 {
        let store = if index % 2 == 0 {
            first.clone()
        } else {
            second.clone()
        };
        jobs.push(tokio::spawn(async move {
            store
                .apply(HistoryChange::Progress(Box::new(progress(
                    &index.to_string(),
                ))))
                .await
                .unwrap();
        }));
    }
    for job in jobs {
        job.await.unwrap();
    }
    assert_eq!(first.snapshot().await.unwrap().entries.len(), 20);
    assert_eq!(
        second.snapshot().await.unwrap(),
        first.snapshot().await.unwrap()
    );
}

#[tokio::test]
async fn failed_transactions_preserve_committed_state() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    let saved = store
        .apply(HistoryChange::Progress(Box::new(progress("1"))))
        .await
        .unwrap();
    let connection = Connection::open(tmp.db()).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_write BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'private disk error'); END;").unwrap();
    let error = store
        .apply(HistoryChange::Progress(Box::new(progress("2"))))
        .await
        .unwrap_err();
    assert_eq!(error, LibraryError::Storage);
    assert!(!error.to_string().contains("private"));
    assert_eq!(store.snapshot().await.unwrap(), saved);
    connection.execute_batch("DROP TRIGGER fail_write; CREATE TRIGGER fail_delete BEFORE DELETE ON history BEGIN SELECT RAISE(ABORT, 'private'); END;").unwrap();
    assert_eq!(
        store
            .apply(mutation(
                serde_json::json!({"action":"clear","kind":"history"})
            ))
            .await,
        Err(LibraryError::Storage)
    );
    assert_eq!(store.snapshot().await.unwrap(), saved);
    connection
        .execute_batch("DROP TRIGGER fail_delete")
        .unwrap();
    drop(connection);
    drop(store);
    assert_eq!(
        LibraryStore::open(tmp.db())
            .await
            .unwrap()
            .snapshot()
            .await
            .unwrap(),
        saved
    );
}

#[tokio::test]
async fn remove_and_clear_are_idempotent_and_guest_scoped() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    for id in ["1", "2"] {
        store
            .apply(HistoryChange::Progress(Box::new(progress(id))))
            .await
            .unwrap();
    }
    let wrong = mutation(serde_json::json!({"action":"clear","kind":"history","owner_id":"123"}));
    assert_eq!(store.apply(wrong).await, Err(LibraryError::OwnerChanged));
    let remove = mutation(serde_json::json!({"action":"remove","kind":"history","series_id":"1"}));
    assert_eq!(store.apply(remove.clone()).await.unwrap().entries.len(), 1);
    assert_eq!(
        store.apply(remove).await.unwrap().entries[0]
            .drama
            .series_id,
        "2"
    );
    let clear = mutation(serde_json::json!({"action":"clear","kind":"history"}));
    assert!(store.apply(clear.clone()).await.unwrap().entries.is_empty());
    assert!(store.apply(clear).await.unwrap().entries.is_empty());
}

#[tokio::test]
async fn incompatible_databases_are_preserved_instead_of_reset() {
    for sql in [
        "PRAGMA application_id=1212634198; PRAGMA user_version=99;",
        "PRAGMA application_id=99; PRAGMA user_version=1;",
        "CREATE TABLE foreign_data(secret TEXT); INSERT INTO foreign_data VALUES ('keep');",
    ] {
        let tmp = Temp::new();
        let conn = Connection::open(tmp.db()).unwrap();
        conn.execute_batch(sql).unwrap();
        drop(conn);
        let before = std::fs::read(tmp.db()).unwrap();
        assert!(matches!(
            LibraryStore::open(tmp.db()).await,
            Err(LibraryError::InvalidDatabase)
        ));
        assert_eq!(std::fs::read(tmp.db()).unwrap(), before);
    }
    let tmp = Temp::new();
    std::fs::write(tmp.db(), b"private corrupt database").unwrap();
    assert!(LibraryStore::open(tmp.db()).await.is_err());
    assert_eq!(
        std::fs::read(tmp.db()).unwrap(),
        b"private corrupt database"
    );
}

#[tokio::test]
async fn invalid_stored_records_abort_mutations_and_initialization() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    store
        .apply(HistoryChange::Progress(Box::new(progress("1"))))
        .await
        .unwrap();
    let conn = Connection::open(tmp.db()).unwrap();
    conn.execute("UPDATE history SET entry_json='{}'", [])
        .unwrap();
    assert_eq!(store.snapshot().await, Err(LibraryError::InvalidDatabase));
    assert_eq!(
        store
            .apply(HistoryChange::Progress(Box::new(progress("2"))))
            .await,
        Err(LibraryError::InvalidDatabase)
    );
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    drop(conn);
    drop(store);
    assert!(matches!(
        LibraryStore::open(tmp.db()).await,
        Err(LibraryError::InvalidDatabase)
    ));
}
