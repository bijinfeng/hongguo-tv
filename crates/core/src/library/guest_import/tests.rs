//! Synthetic import regressions; no real-account or network acceptance.
use super::*;
use crate::{
    catalog::Drama,
    library::{FavoriteEntry, LibraryChange, Progress},
};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-guest-import-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    async fn store(&self) -> LibraryStore {
        LibraryStore::open_for_owner(self.0.join("account.sqlite3"), "01".into())
            .await
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn entry(id: &str, stamp: i64) -> Entry {
    Progress {
        owner_id: None,
        drama: Drama {
            series_id: id.into(),
            title: format!("Synthetic {id}"),
            ..Default::default()
        },
        episode: 3,
        video_id: "8888888888888888888".into(),
        position: 20.0,
        duration: 120.0,
        completed: false,
    }
    .into_entry(stamp)
}
fn guest(entries: Vec<Entry>) -> Library {
    Library {
        entries,
        favorites: Vec::new(),
        owner_id: Some(String::new()),
    }
}
async fn local(store: &LibraryStore, entry: Entry) {
    store
        .run(move |conn| {
            let tx = conn.transaction()?;
            sync::write_entry(&tx, &entry)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn import_deduplicates_valid_newer_progress_without_favorites_or_restamping() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    local(&store, entry("1", 100)).await;
    local(&store, entry("2", 200)).await;
    local(&store, entry("3", 300)).await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            super::super::favorites::set(&tx, entry("4", 1).drama, true, 500)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    let mut invalid = entry("5", 500);
    invalid.video_id = None;
    let mut source = guest(vec![
        entry("1", 101),
        entry("1", 102),
        entry("2", 200),
        entry("3", 299),
        entry("4", 400),
        invalid,
    ]);
    source.favorites.push(FavoriteEntry {
        drama: entry("6", 1).drama,
        favorite_at: 10,
    });
    let original = source.clone();
    assert_eq!(
        store.guest_history_status(&source).await.unwrap(),
        GuestHistoryStatus {
            total: 6,
            available: 2
        }
    );
    assert_eq!(
        store.import_guest_history(source.clone()).await.unwrap(),
        GuestHistoryImportResult {
            imported: 2,
            remaining: 0
        }
    );
    assert_eq!(source, original);
    let saved = store.snapshot().await.unwrap();
    assert_eq!(
        saved
            .entries
            .iter()
            .find(|row| row.drama.series_id == "1")
            .unwrap()
            .last_played_at,
        Some(102)
    );
    assert_eq!(
        saved
            .entries
            .iter()
            .find(|row| row.drama.series_id == "4")
            .unwrap()
            .last_played_at,
        Some(400)
    );
    assert_eq!(saved.favorites.len(), 1);
    assert_eq!(saved.favorites[0].drama.series_id, "4");
    assert_eq!(saved.favorites[0].favorite_at, 500);
    assert_eq!(store.pending_sync().await.unwrap().len(), 2);
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        0
    );
}

#[tokio::test]
async fn watermark_and_hidden_survive_reopen_and_only_new_guest_events_return() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    let source = guest(vec![entry("81", 100)]);
    store.import_guest_history(source.clone()).await.unwrap();
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM history", [])?;
            sync::hide(&tx, LibraryKind::History, "81", 200)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    drop(store);
    let store = fixture.store().await;
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        0
    );
    for stamp in [100, 150, 200] {
        assert_eq!(
            store
                .import_guest_history(guest(vec![entry("81", stamp)]))
                .await
                .unwrap()
                .imported,
            0
        );
    }
    assert_eq!(
        store
            .import_guest_history(guest(vec![entry("81", 201)]))
            .await
            .unwrap()
            .imported,
        1
    );
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].last_played_at,
        Some(201)
    );
    assert!(
        store
            .run(|conn| sync::hidden_at(conn, LibraryKind::History, "81"))
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(store.pending_sync().await.unwrap().len(), 1);
}

#[tokio::test]
async fn partial_capacity_keeps_remaining_candidates_and_allows_replaceable_work() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            for id in 1..=1999 {
                sync::enqueue_favorite(&tx, &id.to_string(), false)?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    let source = guest(vec![
        entry("8001", 100),
        entry("8002", 101),
        entry("8003", 102),
    ]);
    let result = store.import_guest_history(source.clone()).await.unwrap();
    assert_eq!(
        result,
        GuestHistoryImportResult {
            imported: 1,
            remaining: 2
        }
    );
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        2
    );
    assert_eq!(store.pending_sync().await.unwrap().len(), 2000);
    assert_eq!(
        store.import_guest_history(source.clone()).await,
        Err(LibraryError::SyncQueueFull)
    );
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 1);
    // 8002 cannot fit, but a newer event for the already-pending 8001 can still replace it.
    let replacement = guest(vec![entry("8002", 103), entry("8001", 104)]);
    assert_eq!(
        store.import_guest_history(replacement).await.unwrap(),
        GuestHistoryImportResult {
            imported: 1,
            remaining: 1
        }
    );
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].last_played_at,
        Some(104)
    );
    let ack = store.pending_sync().await.unwrap()[0].sequence;
    store.ack_sync(ack).await.unwrap();
    let result = store.import_guest_history(source.clone()).await.unwrap();
    assert_eq!(
        result,
        GuestHistoryImportResult {
            imported: 1,
            remaining: 1
        }
    );
    drop(store);
    let store = fixture.store().await;
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        1
    );
    assert_eq!(store.pending_sync().await.unwrap().len(), 2000);
}

#[tokio::test]
async fn watermark_write_failure_rolls_back_record_queue_sequence_and_result() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    store.run(|conn| {
        conn.execute_batch("CREATE TRIGGER reject_guest_watermark BEFORE INSERT ON guest_import_watermark BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END;")?;
        Ok(())
    }).await.unwrap();
    let source = guest(vec![entry("81", 100)]);
    assert_eq!(
        store.import_guest_history(source.clone()).await,
        Err(LibraryError::Storage)
    );
    assert!(store.snapshot().await.unwrap().entries.is_empty());
    assert!(store.pending_sync().await.unwrap().is_empty());
    assert_eq!(store.sync_boundary().await.unwrap(), 0);
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        1
    );
    store
        .run(|conn| {
            conn.execute_batch("DROP TRIGGER reject_guest_watermark")?;
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        store.import_guest_history(source).await.unwrap().imported,
        1
    );
}

#[tokio::test]
async fn simultaneous_checkpoint_keeps_newer_account_event_and_invalid_owner_is_rejected() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    let source = guest(vec![entry("81", 100)]);
    let progress = Progress {
        owner_id: Some("01".into()),
        ..sync::strict_progress(&entry("81", 100)).unwrap()
    };
    let (checkpoint, import) = tokio::join!(
        store.apply(LibraryChange::Progress(Box::new(progress))),
        store.import_guest_history(source.clone())
    );
    checkpoint.unwrap();
    import.unwrap();
    assert!(
        store.snapshot().await.unwrap().entries[0]
            .last_played_at
            .unwrap()
            > 100
    );
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        0
    );
    let mut foreign = source;
    foreign.owner_id = Some("2".into());
    assert_eq!(
        store.import_guest_history(foreign.clone()).await,
        Err(LibraryError::OwnerChanged)
    );
    assert_eq!(
        store.guest_history_status(&foreign).await,
        Err(LibraryError::OwnerChanged)
    );
    let guest_store = LibraryStore::open(fixture.0.join("guest.sqlite3"))
        .await
        .unwrap();
    assert_eq!(
        guest_store.import_guest_history(guest(vec![])).await,
        Err(LibraryError::OwnerChanged)
    );
}

#[tokio::test]
async fn more_than_two_thousand_guest_events_remain_retryable_after_partial_commit() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    let source = guest(
        (1..=2002)
            .map(|id| entry(&id.to_string(), 100 + id))
            .collect(),
    );
    let first = store.import_guest_history(source.clone()).await.unwrap();
    assert_eq!(
        first,
        GuestHistoryImportResult {
            imported: 2000,
            remaining: 2
        }
    );
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 2000);
    drop(store);
    let store = fixture.store().await;
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        2
    );
    for _ in 0..2 {
        let operation = store.next_pending().await.unwrap().unwrap();
        store.ack_sync(operation.sequence).await.unwrap();
    }
    assert_eq!(
        store.import_guest_history(source.clone()).await.unwrap(),
        GuestHistoryImportResult {
            imported: 2,
            remaining: 0
        }
    );
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 2002);
    assert_eq!(
        store.guest_history_status(&source).await.unwrap().available,
        0
    );
}
