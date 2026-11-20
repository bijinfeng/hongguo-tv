//! Native lifecycle barriers use disposable SQLite; no saved account or cloud networking.
use super::*;
use hongguo_core::library::{
    HistoryChange, LibraryOperationIdentity, LibraryOperationOutcome, LibraryWriteSessionRequest,
};
use rusqlite::Connection;
use std::{
    future::Future,
    sync::atomic::{AtomicU64, Ordering},
    task::{Context, Poll, Waker},
    time::Duration,
};
use tokio::time::timeout;

struct Temp(std::path::PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-native-lifetime-{}-{}",
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
async fn open(temp: &Temp) -> Arc<Session> {
    Session::open(&temp.0)
        .await
        .unwrap_or_else(|_| panic!("synthetic guest session should open"))
}
fn checkpoint() -> HistoryChange {
    serde_json::from_str(r#"{"action":"progress","owner_id":"","drama":{"series_id":"11","title":"Synthetic shutdown checkpoint","cover":"","intro":""},"episode":1,"video_id":"22","position":42,"duration":90}"#).unwrap()
}

#[tokio::test]
async fn close_then_same_directory_reopen_waits_for_an_admitted_sqlite_checkpoint() {
    let temp = Temp::new();
    let session = open(&temp).await;
    let account = session.services.account.as_ref().unwrap().clone();
    let token = account
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(String::new()),
        })
        .await
        .unwrap();
    let gate = Connection::open(temp.0.join("guest.sqlite3")).unwrap();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    // Same admission ordering as the alias test: `apply_operation` awaits the account state
    // lock first, so a bare poll never registers the write and a following drop leaves the
    // drain nothing to wait on. Taking the same lock here makes the registration deterministic.
    let writer = account.clone();
    let writing = tokio::spawn(async move {
        writer
            .apply_operation(
                LibraryOperationIdentity {
                    session_id: token.session_id,
                    operation_id: "1".into(),
                },
                checkpoint(),
            )
            .await
    });
    let _ = account.state().await;
    tokio::task::yield_now().await;
    drop(writing);
    session.close();
    session.close();
    let reopened_dir = temp.0.clone();
    let mut reopening = Box::pin(Session::open(&reopened_dir));
    assert!(matches!(
        reopening
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    assert!(session.calls.lock().unwrap().closed);
    gate.execute_batch("COMMIT").unwrap();
    let reopened = timeout(Duration::from_secs(3), reopening)
        .await
        .expect("reopen should follow the checkpoint")
        .unwrap_or_else(|_| panic!("reopen should follow the checkpoint"));
    let snapshot = reopened
        .services
        .account
        .as_ref()
        .unwrap()
        .state()
        .await
        .unwrap();
    assert_eq!(snapshot.library.entries.len(), 1);
    assert_eq!(snapshot.library.entries[0].position, Some(42.0));
    reopened.close();
    // Acquiring the same gate also observes completion of the repeated close path.
    drop(
        timeout(Duration::from_secs(1), directory_lease(&temp.0))
            .await
            .unwrap()
            .unwrap_or_else(|_| panic!("drained directory")),
    );
}

#[tokio::test]
async fn a_dropped_open_waiter_keeps_initialization_lease_until_its_sqlite_work_finishes() {
    let temp = Temp::new();
    let library = LibraryStore::open(temp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    drop(library);
    let gate = Connection::open(temp.0.join("guest.sqlite3")).unwrap();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut opening = Box::pin(Session::open(&temp.0));
    assert!(matches!(
        opening
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(opening);
    // The admitted initializer must retain the lease after the caller disappears.
    assert!(
        timeout(Duration::from_millis(30), directory_lease(&temp.0))
            .await
            .is_err()
    );
    let reopened_dir = temp.0.clone();
    let mut reopening = tokio::spawn(async move { Session::open(&reopened_dir).await });
    assert!(
        timeout(Duration::from_millis(20), &mut reopening)
            .await
            .is_err()
    );
    gate.execute_batch("COMMIT").unwrap();
    let reopened = timeout(Duration::from_secs(3), reopening)
        .await
        .unwrap()
        .unwrap()
        .unwrap_or_else(|_| panic!("unclaimed initializer should close and drain"));
    assert!(
        !reopened
            .services
            .account
            .as_ref()
            .unwrap()
            .snapshot()
            .await
            .logged_in
    );
    reopened.close();
    drop(
        timeout(Duration::from_secs(1), directory_lease(&temp.0))
            .await
            .unwrap()
            .unwrap_or_else(|_| panic!("drained directory")),
    );
}

#[tokio::test]
async fn failed_checkpoint_is_drained_before_reopen_and_does_not_resurrect_a_write() {
    let temp = Temp::new();
    let session = open(&temp).await;
    let account = session.services.account.as_ref().unwrap().clone();
    let token = account
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(String::new()),
        })
        .await
        .unwrap();
    let gate = Connection::open(temp.0.join("guest.sqlite3")).unwrap();
    gate.execute_batch("CREATE TRIGGER fail BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT,'fixture'); END; BEGIN IMMEDIATE").unwrap();
    let mut writing = Box::pin(account.apply_operation(
        LibraryOperationIdentity {
            session_id: token.session_id,
            operation_id: "1".into(),
        },
        checkpoint(),
    ));
    assert!(matches!(
        writing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    session.close();
    gate.execute_batch("COMMIT").unwrap();
    assert!(matches!(
        writing.await.unwrap().outcome,
        LibraryOperationOutcome::Failed { .. }
    ));
    let reopened = timeout(Duration::from_secs(3), Session::open(&temp.0))
        .await
        .unwrap()
        .unwrap_or_else(|_| panic!("failed writes must also release the lease"));
    assert!(
        reopened
            .services
            .account
            .as_ref()
            .unwrap()
            .state()
            .await
            .unwrap()
            .library
            .entries
            .is_empty()
    );
    reopened.close();
    drop(
        timeout(Duration::from_secs(1), directory_lease(&temp.0))
            .await
            .unwrap()
            .unwrap_or_else(|_| panic!("drained directory")),
    );
}

#[cfg(unix)]
#[tokio::test]
async fn a_directory_alias_reopen_waits_for_the_original_session_to_drain() {
    let temp = Temp::new();
    let real = temp.0.join("real");
    let alias = temp.0.join("alias");
    std::fs::create_dir(&real).unwrap();
    std::os::unix::fs::symlink(&real, &alias).unwrap();
    let session = Session::open(&real)
        .await
        .unwrap_or_else(|_| panic!("synthetic session"));
    let account = session.services.account.as_ref().unwrap().clone();
    let token = account
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(String::new()),
        })
        .await
        .unwrap();
    let gate = Connection::open(real.join("guest.sqlite3")).unwrap();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    // Drive the write until it is admitted. `apply_operation` first awaits the account state
    // lock, so a bare poll only reaches that lock and a following drop leaves the drain nothing
    // to wait on. Starting it as a task and then taking the same lock ourselves makes the
    // ordering deterministic: once our `state()` returns, the write has either registered or is
    // queued behind us, so the gate — not the scheduler — is what keeps it pending.
    let writer = account.clone();
    let writing = tokio::spawn(async move {
        writer
            .apply_operation(
                LibraryOperationIdentity {
                    session_id: token.session_id,
                    operation_id: "1".into(),
                },
                checkpoint(),
            )
            .await
    });
    let _ = account.state().await;
    tokio::task::yield_now().await;
    drop(writing);
    session.close();
    let reopening_alias = alias.clone();
    let mut reopening = Box::pin(Session::open(&reopening_alias));
    // One poll with a noop waker is the deterministic form of "still blocked": the lease the
    // close path holds is only released after its drain, which is waiting on the write below.
    // A timer here races the store's 2s busy timeout whenever the runtime is starved by the
    // rest of the suite.
    assert!(matches!(
        reopening
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    gate.execute_batch("COMMIT").unwrap();
    let reopened = timeout(Duration::from_secs(3), reopening)
        .await
        .expect("alias should wait for the same checkpoint")
        .unwrap_or_else(|_| panic!("alias reopened after the drain"));
    let state = reopened
        .services
        .account
        .as_ref()
        .unwrap()
        .state()
        .await
        .unwrap();
    // The dropped caller cannot abort its admitted write, so the drain must have landed it
    // before the alias was admitted. Reading it back is the proof; an empty library here means
    // the write was dropped rather than drained.
    assert_eq!(state.library.entries.len(), 1);
    assert_eq!(state.library.entries[0].position, Some(42.0));
    reopened.close();
    drop(
        timeout(Duration::from_secs(1), directory_lease(&alias))
            .await
            .unwrap()
            .unwrap_or_else(|_| panic!("drained alias")),
    );
}

#[tokio::test]
async fn a_missing_directory_keeps_the_same_lifecycle_identity_after_creation() {
    let temp = Temp::new();
    let directory = temp.0.join("not-created").join("session");
    let identity = directory_identity(&directory).unwrap();
    let lease = directory_lease(&directory)
        .await
        .unwrap_or_else(|_| panic!("missing directory lease"));
    assert!(!directory.exists());
    std::fs::create_dir_all(&directory).unwrap();
    assert_eq!(directory_identity(&directory).unwrap(), identity);
    assert!(
        timeout(Duration::from_millis(20), directory_lease(&directory))
            .await
            .is_err()
    );
    drop(lease);
    drop(
        timeout(Duration::from_secs(1), directory_lease(&directory))
            .await
            .unwrap()
            .unwrap_or_else(|_| panic!("created directory shares its lease")),
    );
}
