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
    // Keep two independent writers in flight. A burst of queued writes can exceed the
    // documented busy timeout on slow durable storage without losing a commit.
    for pair in 0..10 {
        let (left, right) = tokio::join!(
            first.apply(HistoryChange::Progress(Box::new(progress(
                &(pair * 2 + 1).to_string(),
            )))),
            second.apply(HistoryChange::Progress(Box::new(progress(
                &(pair * 2 + 2).to_string(),
            )))),
        );
        left.unwrap();
        right.unwrap();
    }
    assert_eq!(first.snapshot().await.unwrap().entries.len(), 20);
    assert_eq!(
        second.snapshot().await.unwrap(),
        first.snapshot().await.unwrap()
    );
}

#[tokio::test]
async fn writer_contention_fails_without_losing_history_and_can_retry() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    let baseline = store
        .apply(HistoryChange::Progress(Box::new(progress("1"))))
        .await
        .unwrap();
    let mut competing = Connection::open(tmp.db()).unwrap();
    let writer = competing
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .unwrap();
    assert_eq!(
        store
            .apply(HistoryChange::Progress(Box::new(progress("2"))))
            .await,
        Err(LibraryError::Storage),
    );
    assert_eq!(store.snapshot().await.unwrap(), baseline);
    writer.rollback().unwrap();
    let saved = store
        .apply(HistoryChange::Progress(Box::new(progress("2"))))
        .await
        .unwrap();
    assert_eq!(saved.entries.len(), 2);
    assert!(saved.entries.contains(&baseline.entries[0]));
    assert_eq!(store.snapshot().await.unwrap(), saved);
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

#[tokio::test]
async fn recent_keywords_normalize_deduplicate_bound_and_survive_restart() {
    use hongguo_core::library::{SearchHistoryChange, normalize_keyword};
    assert_eq!(
        normalize_keyword("  古装\u{3000} 重生  ").unwrap(),
        "古装 重生"
    );
    for invalid in [
        String::new(),
        " ".into(),
        "a\nb".into(),
        "a\0b".into(),
        "字".repeat(81),
        "🍊".repeat(51),
    ] {
        assert!(
            normalize_keyword(&invalid).is_err(),
            "accepted invalid keyword"
        );
    }
    assert!(normalize_keyword(&"🍊".repeat(50)).is_ok());
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    store
        .apply(HistoryChange::Progress(Box::new(progress("123"))))
        .await
        .unwrap();
    let viewing = store.snapshot().await.unwrap();
    for i in 0..12 {
        store
            .change_search_history(SearchHistoryChange::Add {
                query: format!("故事{i}"),
            })
            .await
            .unwrap();
    }
    let saved = store
        .change_search_history(SearchHistoryChange::Add {
            query: " 故事5 ".into(),
        })
        .await
        .unwrap();
    assert_eq!(
        saved.items,
        [
            "故事5", "故事11", "故事10", "故事9", "故事8", "故事7", "故事6", "故事4", "故事3",
            "故事2"
        ]
    );
    assert!(
        store
            .change_search_history(SearchHistoryChange::Add { query: "  ".into() })
            .await
            .is_err()
    );
    assert_eq!(store.search_history().await.unwrap(), saved);
    drop(store);
    let reopened = LibraryStore::open(tmp.db()).await.unwrap();
    assert_eq!(reopened.search_history().await.unwrap(), saved);
    assert!(
        reopened
            .change_search_history(SearchHistoryChange::Clear {})
            .await
            .unwrap()
            .items
            .is_empty()
    );
    assert_eq!(reopened.snapshot().await.unwrap(), viewing);
    assert!(
        LibraryStore::open(tmp.db())
            .await
            .unwrap()
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn keyword_migration_preserves_v1_history_and_rolls_back_failed_upgrade() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.db()).await.unwrap();
    store
        .apply(HistoryChange::Progress(Box::new(progress("123"))))
        .await
        .unwrap();
    let viewing = store.snapshot().await.unwrap();
    drop(store);
    let conn = Connection::open(tmp.db()).unwrap();
    conn.execute_batch("DROP TABLE recent_searches; PRAGMA user_version=1;")
        .unwrap();
    drop(conn);
    let migrated = LibraryStore::open(tmp.db()).await.unwrap();
    assert_eq!(migrated.snapshot().await.unwrap(), viewing);
    assert!(migrated.search_history().await.unwrap().items.is_empty());
    drop(migrated);
    let conn = Connection::open(tmp.db()).unwrap();
    conn.execute_batch("PRAGMA user_version=1;").unwrap();
    // A conflicting table fails the migration without publishing version2 or touching history.
    assert!(LibraryStore::open(tmp.db()).await.is_err());
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version, 1);
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    conn.execute_batch("DROP TABLE recent_searches; CREATE TABLE corrupt_constraint(value INTEGER CHECK(value>0)); PRAGMA ignore_check_constraints=ON; INSERT INTO corrupt_constraint VALUES(0);").unwrap();
    assert!(matches!(
        LibraryStore::open(tmp.db()).await,
        Err(LibraryError::InvalidDatabase)
    ));
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name='recent_searches'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn keyword_writes_are_atomic_across_connections_and_failure() {
    use hongguo_core::library::SearchHistoryChange;
    let tmp = Temp::new();
    let a = LibraryStore::open(tmp.db()).await.unwrap();
    let b = LibraryStore::open(tmp.db()).await.unwrap();
    let (first, second) = tokio::join!(
        a.change_search_history(SearchHistoryChange::Add {
            query: "古装".into()
        }),
        b.change_search_history(SearchHistoryChange::Add {
            query: "重生".into()
        })
    );
    first.unwrap();
    second.unwrap();
    let saved = a.search_history().await.unwrap();
    assert_eq!(saved.items.len(), 2);
    assert!(saved.items.contains(&"古装".into()) && saved.items.contains(&"重生".into()));
    let conn = Connection::open(tmp.db()).unwrap();
    conn.execute_batch("CREATE TRIGGER reject_keyword BEFORE INSERT ON recent_searches BEGIN SELECT RAISE(ABORT, 'fixture'); END;").unwrap();
    assert!(
        a.change_search_history(SearchHistoryChange::Add {
            query: "失败".into()
        })
        .await
        .is_err()
    );
    assert_eq!(b.search_history().await.unwrap(), saved);
    conn.execute_batch(
        "DROP TRIGGER reject_keyword; UPDATE recent_searches SET query=' ' WHERE rank=0;",
    )
    .unwrap();
    assert_eq!(
        a.search_history().await.unwrap_err().code(),
        "SEARCH_HISTORY_DATABASE_INVALID"
    );
}
