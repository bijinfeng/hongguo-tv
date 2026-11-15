use super::*;
use crate::catalog::Drama;
use crate::library::Progress;
use std::{
    future::Future,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    task::{Context, Poll, Waker},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-operation-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn progress(position: f64) -> HistoryChange {
    HistoryChange::Progress(Box::new(Progress {
        owner_id: Some(String::new()),
        drama: Drama {
            series_id: "123".into(),
            title: "Controlled history".into(),
            ..Drama::default()
        },
        episode: 1,
        video_id: "456".into(),
        position,
        duration: 100.0,
        completed: false,
    }))
}
fn remove() -> HistoryChange {
    serde_json::from_value(
        serde_json::json!({"action":"remove","kind":"history","series_id":"123"}),
    )
    .unwrap()
}
fn identity(session: &LibraryWriteSession, sequence: u64) -> LibraryOperationIdentity {
    LibraryOperationIdentity {
        session_id: session.session_id.clone(),
        operation_id: sequence.to_string(),
    }
}

#[tokio::test]
async fn cancelled_waiter_replays_one_original_write_and_stale_ids_never_write_again() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let session = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    let first = identity(&session, 1);
    {
        let _gate = store.0.lock().unwrap();
        let mut waiter = Box::pin(store.apply_operation(first.clone(), progress(20.0)));
        assert!(matches!(
            waiter
                .as_mut()
                .poll(&mut Context::from_waker(Waker::noop())),
            Poll::Pending
        ));
        assert_eq!(
            store.register_operation(&first, progress(40.0)).err(),
            Some(LibraryError::OperationConflict)
        );
        assert_eq!(
            store
                .register_operation(&identity(&session, 2), remove())
                .err(),
            Some(LibraryError::OperationPending)
        );
        drop(waiter);
    }
    let committed = store
        .apply_operation(first.clone(), progress(20.0))
        .await
        .unwrap();
    assert!(
        matches!(&committed.outcome, LibraryOperationOutcome::Committed { library } if library.entries[0].position == Some(20.0))
    );
    assert_eq!(
        store
            .apply_operation(first.clone(), progress(20.0))
            .await
            .unwrap()
            .outcome,
        committed.outcome
    );
    store
        .apply_operation(identity(&session, 2), remove())
        .await
        .unwrap();
    assert_eq!(
        store
            .apply_operation(first, progress(20.0))
            .await
            .unwrap_err(),
        LibraryError::OperationSequence
    );
    store
        .apply_operation(identity(&session, 3), progress(40.0))
        .await
        .unwrap();
    assert_eq!(
        store
            .apply_operation(identity(&session, 2), remove())
            .await
            .unwrap_err(),
        LibraryError::OperationSequence
    );
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].position,
        Some(40.0)
    );
}

#[tokio::test]
async fn handoff_seals_old_session_and_waits_for_cancelled_removal_before_new_viewing() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let old = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    store
        .apply_operation(identity(&old, 1), progress(20.0))
        .await
        .unwrap();
    {
        let _gate = store.0.lock().unwrap();
        let mut removing = Box::pin(store.apply_operation(identity(&old, 2), remove()));
        assert!(matches!(
            removing
                .as_mut()
                .poll(&mut Context::from_waker(Waker::noop())),
            Poll::Pending
        ));
        drop(removing);
        let mut handoff = Box::pin(store.write_session(LibraryWriteSessionRequest::default()));
        assert!(matches!(
            handoff
                .as_mut()
                .poll(&mut Context::from_waker(Waker::noop())),
            Poll::Pending
        ));
        assert_eq!(
            store
                .register_operation(&identity(&old, 3), progress(30.0))
                .err(),
            Some(LibraryError::SessionExpired)
        );
        // Cancelling the handoff itself must not reopen the old session.
        drop(handoff);
        assert_eq!(
            store.register_operation(&identity(&old, 2), remove()).err(),
            Some(LibraryError::SessionExpired)
        );
    }
    let new = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    assert_ne!(old.session_id, new.session_id);
    assert!(store.snapshot().await.unwrap().entries.is_empty());
    store
        .apply_operation(identity(&new, 1), progress(50.0))
        .await
        .unwrap();
    assert_eq!(
        store
            .apply_operation(identity(&old, 2), remove())
            .await
            .unwrap_err(),
        LibraryError::SessionExpired
    );
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].position,
        Some(50.0)
    );
}

#[tokio::test]
#[allow(
    clippy::await_holding_lock,
    reason = "Hold only the old connection to prove a separately opened connection waits for its original worker"
)]
async fn reopening_the_same_database_waits_for_the_dropped_stores_original_worker() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let old = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    store
        .apply_operation(identity(&old, 1), progress(20.0))
        .await
        .unwrap();
    let connection = store.0.clone();
    let gate = connection.lock().unwrap();
    let mut removing = Box::pin(store.apply_operation(identity(&old, 2), remove()));
    assert!(matches!(
        removing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(removing);
    drop(store);

    // A different spelling must discover the still-running worker by canonical database path.
    let reopened = LibraryStore::open(tmp.0.join(".").join("guest.sqlite3"))
        .await
        .unwrap();
    let mut reading = Box::pin(reopened.snapshot());
    assert!(matches!(
        reading
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    let mut handoff = Box::pin(reopened.write_session(LibraryWriteSessionRequest::default()));
    assert!(matches!(
        handoff
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    assert_eq!(
        reopened
            .register_operation(&identity(&old, 3), progress(30.0))
            .err(),
        Some(LibraryError::SessionExpired)
    );
    drop(gate);
    assert!(reading.await.unwrap().entries.is_empty());
    let new = handoff.await.unwrap();
    assert!(reopened.snapshot().await.unwrap().entries.is_empty());
    reopened
        .apply_operation(identity(&new, 1), progress(50.0))
        .await
        .unwrap();
    assert_eq!(
        reopened
            .apply_operation(identity(&old, 2), remove())
            .await
            .unwrap_err(),
        LibraryError::SessionExpired
    );
    assert_eq!(
        reopened.snapshot().await.unwrap().entries[0].position,
        Some(50.0)
    );
}

#[tokio::test]
async fn terminal_failure_is_cached_and_a_business_retry_requires_a_new_identity() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let session = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    store.0.lock().unwrap().execute_batch("CREATE TRIGGER reject_progress BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'private database path'); END;").unwrap();
    let first = identity(&session, 1);
    let failed = store
        .apply_operation(first.clone(), progress(20.0))
        .await
        .unwrap();
    assert!(
        matches!(&failed.outcome, LibraryOperationOutcome::Failed { code, error } if code == "LIBRARY_STORAGE_UNAVAILABLE" && !error.contains("private"))
    );
    store
        .0
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER reject_progress;")
        .unwrap();
    assert_eq!(
        store
            .apply_operation(first, progress(20.0))
            .await
            .unwrap()
            .outcome,
        failed.outcome
    );
    assert!(store.snapshot().await.unwrap().entries.is_empty());
    store
        .apply_operation(identity(&session, 2), progress(20.0))
        .await
        .unwrap();
    let mut invalid = progress(30.0);
    if let HistoryChange::Progress(ref mut change) = invalid {
        change.owner_id = Some("another".into());
    }
    assert_eq!(
        store
            .apply_operation(identity(&session, 3), invalid)
            .await
            .unwrap_err(),
        LibraryError::OwnerChanged
    );
    // Pre-registration validation rejects without consuming the next operation identity.
    store
        .apply_operation(identity(&session, 3), remove())
        .await
        .unwrap();
    assert!(store.snapshot().await.unwrap().entries.is_empty());
}
