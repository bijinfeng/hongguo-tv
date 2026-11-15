//! Synthetic SQLite boundary regressions, never evidence of real cloud acceptance.
use super::*;
use crate::catalog::Drama;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-sync-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    async fn store(&self) -> LibraryStore {
        LibraryStore::open_for_owner(self.0.join("library.sqlite3"), "01".into())
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
        episode: 2,
        video_id: "9876543210987654321".into(),
        position: 15.5,
        duration: 90.0,
        completed: false,
    }
    .into_entry(stamp)
}
fn remote(entries: Vec<Entry>) -> RemoteLibrary {
    RemoteLibrary {
        owner_id: "01".into(),
        history: entries
            .into_iter()
            .map(|entry| RemoteHistory {
                entry,
                metadata: SyncMetadata::default(),
            })
            .collect(),
        favorites: Vec::new(),
    }
}
async fn seed(store: &LibraryStore, entry: Entry, pending: bool) {
    store
        .run(move |conn| {
            let tx = conn.transaction()?;
            write_entry(&tx, &entry)?;
            if pending {
                enqueue_progress(&tx, &entry)?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
}
async fn fill_queue(store: &LibraryStore, count: i64) {
    store
        .run(move |conn| {
            let tx = conn.transaction()?;
            for id in 1..=count {
                enqueue_favorite(&tx, &id.to_string(), false)?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn exact_ack_preserves_replacement_and_independent_kind_across_restart() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), true).await;
    let first = store.next_pending().await.unwrap().unwrap().sequence;
    seed(&store, entry("81", 101), true).await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            enqueue_favorite(&tx, "81", true)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    store.ack_sync(first).await.unwrap();
    let pending = store.pending_sync().await.unwrap();
    assert_eq!(pending.len(), 2);
    assert!(pending[0].sequence > first);
    assert!(
        matches!(&pending[0].change, PendingChange::Progress(history) if history.entry.last_played_at == Some(101))
    );
    assert!(matches!(pending[1].change, PendingChange::Favorite(true)));
    assert_eq!(
        store.mark_synced(500).await,
        Err(LibraryError::OperationPending)
    );
    drop(store);
    let reopened = fixture.store().await;
    assert_eq!(reopened.pending_sync().await.unwrap().len(), 2);
    assert_eq!(reopened.sync_status().await.unwrap().last_sync, None);
    for operation in pending {
        reopened.ack_sync(operation.sequence).await.unwrap();
    }
    reopened.mark_synced(500).await.unwrap();
    assert_eq!(reopened.sync_status().await.unwrap().last_sync, Some(500));
}

#[tokio::test]
async fn capacity_rejects_new_key_atomically_but_same_kind_replaces() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    fill_queue(&store, OUTBOX_LIMIT).await;
    let before = store.sync_boundary().await.unwrap();
    let denied = store
        .run(|conn| {
            let tx = conn.transaction()?;
            let value = entry("9001", 100);
            write_entry(&tx, &value)?;
            enqueue_progress(&tx, &value)?;
            tx.commit()?;
            Ok(())
        })
        .await;
    assert_eq!(denied, Err(LibraryError::SyncQueueFull));
    assert!(store.snapshot().await.unwrap().entries.is_empty());
    assert_eq!(store.sync_boundary().await.unwrap(), before);
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            enqueue_favorite(&tx, "1", true)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        store.pending_sync().await.unwrap().len(),
        OUTBOX_LIMIT as usize
    );
    assert!(store.sync_boundary().await.unwrap() > before);
    assert!(matches!(
        store.pending_sync().await.unwrap().last().unwrap().change,
        PendingChange::Favorite(true)
    ));
}

#[tokio::test]
async fn remote_newer_retires_only_stale_progress_and_new_local_write_is_fenced() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), true).await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            enqueue_favorite(&tx, "81", true)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    let boundary = store.sync_boundary().await.unwrap();
    let snapshot = store
        .merge_remote(remote(vec![entry("81", 200)]), boundary)
        .await
        .unwrap();
    assert_eq!(snapshot.entries[0].last_played_at, Some(200));
    let pending = store.pending_sync().await.unwrap();
    assert_eq!(pending.len(), 1);
    assert!(matches!(pending[0].change, PendingChange::Favorite(true)));
    let boundary = store.sync_boundary().await.unwrap();
    seed(&store, entry("81", 300), true).await;
    let snapshot = store
        .merge_remote(remote(vec![entry("81", 900)]), boundary)
        .await
        .unwrap();
    assert_eq!(snapshot.entries[0].last_played_at, Some(300));
    assert_eq!(store.pending_sync().await.unwrap().len(), 2);
    for stamp in [299, 300] {
        let boundary = store.sync_boundary().await.unwrap();
        let result = store
            .merge_remote(remote(vec![entry("81", stamp)]), boundary)
            .await
            .unwrap();
        assert_eq!(result.entries[0].last_played_at, Some(300));
    }
}

#[tokio::test]
async fn complete_membership_retains_incomplete_history_and_retryable_card_data() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), false).await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            super::super::favorites::set(&tx, entry("82", 100).drama, true, 100)?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    let mut incoming = entry("81", 200);
    incoming.video_id = None;
    incoming.episode = Some(0);
    incoming.drama.title = "Metadata unavailable".into();
    let mut cloud = remote(vec![incoming]);
    cloud.history[0].metadata = SyncMetadata {
        season_index: 3,
        multi_season: true,
        metadata_pending: true,
    };
    cloud.favorites.push(RemoteFavorite {
        entry: FavoriteEntry {
            drama: entry("81", 1).drama,
            favorite_at: 175,
        },
        metadata: SyncMetadata {
            metadata_pending: true,
            ..Default::default()
        },
    });
    let snapshot = store.merge_remote(cloud, 0).await.unwrap();
    assert_eq!(snapshot.entries[0].episode, Some(0));
    assert_eq!(snapshot.entries[0].video_id, None);
    assert_eq!(snapshot.entries[0].drama.title, "Synthetic 81");
    assert_eq!(snapshot.favorites.len(), 1);
    assert_eq!(snapshot.favorites[0].drama.series_id, "81");
    assert_eq!(snapshot.favorites[0].favorite_at, 175);
    assert!(store.pending_sync().await.unwrap().is_empty());
    drop(store);
    let store = fixture.store().await;
    assert_eq!(store.snapshot().await.unwrap(), snapshot);
    let mut recovered = remote(vec![entry("81", 200)]);
    recovered.history[0].entry.drama.title = "Recovered metadata".into();
    store.merge_remote(recovered, 0).await.unwrap();
    let history = &store.snapshot().await.unwrap().entries[0];
    assert_eq!(history.drama.title, "Recovered metadata");
    assert_eq!(history.video_id, None);
    assert_eq!(history.episode, Some(0));
    assert!(
        !store.local_sync_snapshot().await.unwrap().history[0]
            .metadata
            .metadata_pending
    );
}

#[tokio::test]
async fn hidden_records_survive_restart_without_eviction_and_clear_preserves_pending_intent() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), true).await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            for id in 1..=2001 {
                hide(&tx, LibraryKind::History, &id.to_string(), 200)?;
            }
            hide_all(&tx, LibraryKind::History, 201)?;
            tx.execute("DELETE FROM history", [])?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(store.pending_sync().await.unwrap().len(), 1);
    drop(store);
    let store = fixture.store().await;
    let boundary = store.sync_boundary().await.unwrap();
    assert!(
        store
            .merge_remote(remote(vec![entry("81", 500)]), boundary)
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    let hidden = store
        .run(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM sync_hidden WHERE kind='history'",
                [],
                |r| r.get(0),
            )?;
            Ok(count)
        })
        .await
        .unwrap();
    assert_eq!(hidden, 2001);
    let progress = Progress {
        owner_id: Some("01".into()),
        ..strict_progress(&entry("81", 500)).unwrap()
    };
    let snapshot = store
        .apply(super::super::LibraryChange::Progress(Box::new(progress)))
        .await
        .unwrap();
    assert_eq!(snapshot.entries.len(), 1);
    assert!(
        store
            .run(|conn| hidden_at(conn, LibraryKind::History, "81"))
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn migrated_backfill_keeps_original_times_and_drains_more_than_capacity() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            for id in 1..=2003 {
                let entry = entry(&id.to_string(), 100 + id);
                write_entry(&tx, &entry)?;
                tx.execute(
                    "INSERT INTO sync_backfill(series_id) VALUES(?1)",
                    [id.to_string()],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    store.merge_remote(remote(Vec::new()), 0).await.unwrap();
    assert_eq!(store.pending_sync().await.unwrap().len(), 2000);
    assert_eq!(store.sync_status().await.unwrap().pending, 2003);
    assert_eq!(
        store.mark_synced(9999).await,
        Err(LibraryError::OperationPending)
    );
    let mut acknowledged = 0;
    while let Some(operation) = store.next_pending().await.unwrap() {
        let PendingChange::Progress(history) = &operation.change else {
            panic!("unexpected favorite");
        };
        let id = operation.series_id.parse::<i64>().unwrap();
        assert_eq!(history.entry.last_played_at, Some(100 + id));
        store.ack_sync(operation.sequence).await.unwrap();
        acknowledged += 1;
    }
    assert_eq!(acknowledged, 2003);
    store.mark_synced(9999).await.unwrap();
    assert_eq!(store.sync_status().await.unwrap().pending, 0);
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 2003);
}

#[tokio::test]
async fn malformed_full_snapshot_cannot_partially_merge_or_erase_membership() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), true).await;
    let before = store.snapshot().await.unwrap();
    let sequence = store.sync_boundary().await.unwrap();
    let mut cloud = remote(vec![entry("81", 200), entry("82", 201)]);
    cloud.history[1].entry.video_id = Some("bad".into());
    assert!(matches!(
        store.merge_remote(cloud, sequence).await,
        Err(LibraryError::InvalidInput)
    ));
    assert_eq!(store.snapshot().await.unwrap(), before);
    assert_eq!(store.pending_sync().await.unwrap().len(), 1);
    assert_eq!(store.sync_status().await.unwrap().last_sync, None);
    assert!(matches!(
        store
            .merge_remote(remote(vec![entry("81", 200), entry("81", 201)]), sequence)
            .await,
        Err(LibraryError::InvalidInput)
    ));
    let mut wrong_owner = remote(Vec::new());
    wrong_owner.owner_id = "2".into();
    assert!(matches!(
        store.merge_remote(wrong_owner, sequence).await,
        Err(LibraryError::OwnerChanged)
    ));
}

#[tokio::test]
async fn remote_favorite_time_changes_but_pending_local_desired_state_wins() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    let favorite = |stamp| RemoteFavorite {
        entry: FavoriteEntry {
            drama: entry("81", 1).drama,
            favorite_at: stamp,
        },
        metadata: SyncMetadata::default(),
    };
    let mut cloud = remote(Vec::new());
    cloud.favorites = vec![favorite(100)];
    store.merge_remote(cloud.clone(), 0).await.unwrap();
    cloud.favorites = vec![favorite(200)];
    let result = store.merge_remote(cloud.clone(), 0).await.unwrap();
    assert_eq!(result.favorites[0].favorite_at, 200);
    store
        .run(|conn| {
            let tx = conn.transaction()?;
            enqueue_favorite(&tx, "81", false)?;
            super::super::favorites::remove(&tx, "81")?;
            tx.commit()?;
            Ok(())
        })
        .await
        .unwrap();
    let boundary = store.sync_boundary().await.unwrap();
    assert!(
        store
            .merge_remote(cloud, boundary)
            .await
            .unwrap()
            .favorites
            .is_empty()
    );
}

#[tokio::test]
async fn failed_ack_keeps_original_work_durable_for_partial_upload_retry() {
    let fixture = Fixture::new();
    let store = fixture.store().await;
    seed(&store, entry("81", 100), true).await;
    let operation = store.next_pending().await.unwrap().unwrap();
    store.run(|conn| {
        conn.execute_batch("CREATE TRIGGER reject_sync_ack BEFORE DELETE ON sync_outbox BEGIN SELECT RAISE(ABORT,'synthetic ack failure'); END;")?;
        Ok(())
    }).await.unwrap();
    assert_eq!(
        store.ack_sync(operation.sequence).await,
        Err(LibraryError::Storage)
    );
    assert_eq!(store.sync_status().await.unwrap().last_sync, None);
    drop(store);
    let store = fixture.store().await;
    assert_eq!(
        store.next_pending().await.unwrap().unwrap().sequence,
        operation.sequence
    );
    store
        .run(|conn| {
            conn.execute_batch("DROP TRIGGER reject_sync_ack")?;
            Ok(())
        })
        .await
        .unwrap();
    store.ack_sync(operation.sequence).await.unwrap();
    store.mark_synced(500).await.unwrap();
    assert!(store.next_pending().await.unwrap().is_none());
}
