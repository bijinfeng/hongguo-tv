//! Synthetic persistence/receipt boundaries; real product acceptance is recorded separately.
use hongguo_core::{
    catalog::{Drama, Episode},
    library::{
        LibraryChange, LibraryKind, LibraryOperationIdentity, LibraryOperationOutcome,
        LibraryStore, LibraryWriteSessionRequest, Progress,
    },
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
            "hongguo-favorites-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn db(&self) -> PathBuf {
        self.0.join("library.sqlite3")
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn drama(id: &str) -> Drama {
    Drama {
        series_id: id.into(),
        title: "边界用例".into(),
        ..Drama::default()
    }
}
fn favorite(id: &str, value: bool) -> LibraryChange {
    LibraryChange::Favorite {
        owner_id: None,
        drama: drama(id),
        value,
    }
}
fn progress(id: &str) -> LibraryChange {
    LibraryChange::Progress(Box::new(Progress {
        owner_id: None,
        drama: drama(id),
        episode: 1,
        video_id: "987654321".into(),
        position: 2.0,
        duration: 60.0,
        completed: false,
    }))
}

#[tokio::test]
async fn unwatched_favorite_is_compact_durable_and_repeatable() {
    let temp = Temp::new();
    let store = LibraryStore::open(temp.db()).await.unwrap();
    let mut card = drama("123");
    card.intro = "长".repeat(1100);
    card.episodes = Some(vec![Episode {
        index: 1,
        video_id: "99".into(),
        title: None,
        locked: false,
    }]);
    let first = store
        .apply(LibraryChange::Favorite {
            owner_id: None,
            drama: card,
            value: true,
        })
        .await
        .unwrap();
    assert!(first.entries.is_empty());
    assert_eq!(first.favorites.len(), 1);
    assert!(first.favorites[0].drama.episodes.is_none());
    assert_eq!(first.favorites[0].drama.intro.chars().count(), 1000);
    let stamp = first.favorites[0].favorite_at;
    let repeated = store.apply(favorite("123", true)).await.unwrap();
    assert_eq!(repeated.favorites[0].favorite_at, stamp);
    drop(store);
    let restored = LibraryStore::open(temp.db())
        .await
        .unwrap()
        .snapshot()
        .await
        .unwrap();
    assert_eq!(restored, repeated);
}

#[tokio::test]
async fn history_and_favorite_removal_are_independent() {
    let temp = Temp::new();
    let store = LibraryStore::open(temp.db()).await.unwrap();
    store.apply(progress("123")).await.unwrap();
    store.apply(favorite("123", true)).await.unwrap();
    let cleared = store
        .apply(LibraryChange::Clear {
            owner_id: None,
            kind: LibraryKind::Favorites,
        })
        .await
        .unwrap();
    assert_eq!(cleared.entries.len(), 1);
    assert!(cleared.favorites.is_empty());
    store.apply(favorite("123", true)).await.unwrap();
    let cleared = store
        .apply(LibraryChange::Clear {
            owner_id: None,
            kind: LibraryKind::History,
        })
        .await
        .unwrap();
    assert!(cleared.entries.is_empty());
    assert_eq!(cleared.favorites.len(), 1);
    let removed = store
        .apply(LibraryChange::Remove {
            owner_id: None,
            kind: LibraryKind::Favorites,
            series_id: "123".into(),
        })
        .await
        .unwrap();
    assert!(removed.favorites.is_empty());
}

#[tokio::test]
async fn failed_favorite_transaction_preserves_prior_snapshot() {
    let temp = Temp::new();
    let store = LibraryStore::open(temp.db()).await.unwrap();
    let before = store.apply(favorite("123", true)).await.unwrap();
    Connection::open(temp.db()).unwrap().execute_batch(
        "CREATE TRIGGER fail_favorite BEFORE INSERT ON favorites BEGIN SELECT RAISE(ABORT,'fixture failure'); END;"
    ).unwrap();
    assert!(store.apply(favorite("456", true)).await.is_err());
    assert_eq!(store.snapshot().await.unwrap(), before);
}

#[tokio::test]
async fn lost_receipt_replays_exact_favorite_and_replacement_seals_old_token() {
    let temp = Temp::new();
    let store = LibraryStore::open(temp.db()).await.unwrap();
    let session = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    let identity = LibraryOperationIdentity {
        session_id: session.session_id,
        operation_id: "1".into(),
    };
    let first = store
        .apply_operation(identity.clone(), favorite("123", true))
        .await
        .unwrap();
    let replay = store
        .apply_operation(identity.clone(), favorite("123", true))
        .await
        .unwrap();
    assert_eq!(first.outcome, replay.outcome);
    assert!(matches!(
        replay.outcome,
        LibraryOperationOutcome::Committed { .. }
    ));
    assert!(
        store
            .apply_operation(identity.clone(), favorite("123", false))
            .await
            .is_err()
    );
    store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    assert!(
        store
            .apply_operation(identity, favorite("123", true))
            .await
            .is_err()
    );
    assert_eq!(store.snapshot().await.unwrap().favorites.len(), 1);
}

#[tokio::test]
async fn wrong_owner_cannot_change_account_favorites() {
    let temp = Temp::new();
    let store = LibraryStore::open_for_owner(temp.db(), "12345".into())
        .await
        .unwrap();
    assert!(store.apply(favorite("123", true)).await.is_err());
    let saved = store
        .apply(LibraryChange::Favorite {
            owner_id: Some("12345".into()),
            drama: drama("123"),
            value: true,
        })
        .await
        .unwrap();
    assert_eq!(saved.favorites.len(), 1);
    assert!(saved.entries.is_empty());
    assert!(
        LibraryStore::open_for_owner(temp.db(), "54321".into())
            .await
            .is_err()
    );
    assert!(LibraryStore::open(temp.db()).await.is_err());
}
