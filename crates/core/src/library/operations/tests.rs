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

fn owned_progress(owner: &str, position: f64) -> HistoryChange {
    let HistoryChange::Progress(mut change) = progress(position) else {
        unreachable!()
    };
    change.owner_id = Some(owner.into());
    HistoryChange::Progress(change)
}

fn owner_request(owner: &str) -> LibraryWriteSessionRequest {
    LibraryWriteSessionRequest {
        owner_id: Some(owner.into()),
    }
}

#[tokio::test]
async fn account_sessions_cannot_cross_owners_or_replay_after_switching_back() {
    let tmp = Temp::new();
    let path = tmp.0.join("account-a.sqlite3");
    let account = LibraryStore::open_for_owner(&path, "1".into())
        .await
        .unwrap();
    let other = LibraryStore::open_for_owner(tmp.0.join("account-b.sqlite3"), "2".into())
        .await
        .unwrap();
    for request in [LibraryWriteSessionRequest::default(), owner_request("2")] {
        assert_eq!(
            account.write_session(request).await.err(),
            Some(LibraryError::OwnerChanged)
        );
    }
    let first = account.write_session(owner_request("1")).await.unwrap();
    let second = other.write_session(owner_request("2")).await.unwrap();
    assert_eq!(
        account
            .apply_operation(identity(&first, 1), owned_progress("2", 10.0))
            .await
            .err(),
        Some(LibraryError::OwnerChanged)
    );
    assert_eq!(
        other
            .apply_operation(identity(&first, 1), owned_progress("2", 10.0))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    assert_eq!(
        account
            .apply_operation(identity(&second, 1), owned_progress("1", 10.0))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    let receipt = account
        .apply_operation(identity(&first, 1), owned_progress("1", 10.0))
        .await
        .unwrap();
    assert!(
        matches!(receipt.outcome, LibraryOperationOutcome::Committed { ref library } if library.owner_id.as_deref() == Some("1"))
    );
    let retained = account.clone();
    account.invalidate_write_sessions().await.unwrap();
    drop(account);
    other
        .apply_operation(identity(&second, 1), owned_progress("2", 20.0))
        .await
        .unwrap();
    let reopened = LibraryStore::open_for_owner(&path, "1".into())
        .await
        .unwrap();
    assert_eq!(
        reopened
            .apply_operation(identity(&first, 1), owned_progress("1", 10.0))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    let fresh = reopened.write_session(owner_request("1")).await.unwrap();
    reopened
        .apply_operation(identity(&fresh, 1), owned_progress("1", 30.0))
        .await
        .unwrap();
    assert_eq!(
        reopened.snapshot().await.unwrap().entries[0].position,
        Some(30.0)
    );
    assert_eq!(
        other.snapshot().await.unwrap().entries[0].position,
        Some(20.0)
    );
    assert_eq!(
        retained
            .apply_operation(identity(&first, 1), owned_progress("1", 10.0))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
}

#[tokio::test]
#[allow(
    clippy::await_holding_lock,
    reason = "Gate admitted blocking workers to prove invalidation waits for real execution"
)]
async fn invalidation_drains_cancelled_legacy_and_registered_writes_before_expiring_tokens() {
    let tmp = Temp::new();
    let store = LibraryStore::open_for_owner(tmp.0.join("account.sqlite3"), "1".into())
        .await
        .unwrap();
    let connection = store.0.clone();
    let gate = connection.lock().unwrap();
    let mut legacy = Box::pin(store.apply(owned_progress("1", 10.0)));
    assert!(matches!(
        legacy
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(legacy);
    let mut draining = Box::pin(store.invalidate_write_sessions());
    assert!(matches!(
        draining
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(gate);
    draining.await.unwrap();
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].position,
        Some(10.0)
    );

    let old = store.write_session(owner_request("1")).await.unwrap();
    let gate = connection.lock().unwrap();
    let HistoryChange::Progress(mut second) = owned_progress("1", 20.0) else {
        unreachable!()
    };
    second.drama.series_id = "124".into();
    let mut registered =
        Box::pin(store.apply_operation(identity(&old, 1), HistoryChange::Progress(second)));
    assert!(matches!(
        registered
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    let mut invalidating = Box::pin(store.invalidate_write_sessions());
    assert!(matches!(
        invalidating
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    assert_eq!(
        store
            .register_operation(&identity(&old, 2), owned_progress("1", 30.0))
            .err(),
        Some(LibraryError::SessionExpired)
    );
    drop(invalidating);
    assert_eq!(
        store
            .register_operation(&identity(&old, 1), owned_progress("1", 20.0))
            .err(),
        Some(LibraryError::SessionExpired)
    );
    drop(gate);
    store.invalidate_write_sessions().await.unwrap();
    assert!(matches!(
        registered.await.unwrap().outcome,
        LibraryOperationOutcome::Committed { .. }
    ));
    assert_eq!(store.snapshot().await.unwrap().entries.len(), 2);
    let fresh = store.write_session(owner_request("1")).await.unwrap();
    store
        .apply_operation(identity(&fresh, 1), owned_progress("1", 40.0))
        .await
        .unwrap();
    assert_eq!(
        store.snapshot().await.unwrap().entries[0].position,
        Some(40.0)
    );
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
