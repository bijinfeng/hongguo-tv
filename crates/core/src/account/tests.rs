//! Synthetic identity and real disposable SQLite boundary regressions, not live-login acceptance.
use super::*;
use crate::{
    catalog::Drama,
    library::{HistoryKind, LibraryOperationOutcome, Progress},
    watch_statistics::{
        WatchStatisticsBatch, WatchStatisticsContentType, WatchStatisticsError,
        WatchStatisticsSegment,
    },
};
use rusqlite::Connection;
use std::{
    future::Future,
    sync::atomic::AtomicU64,
    task::{Context, Poll, Waker},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-account-lifetime-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }

    async fn open(&self) -> AccountService {
        let guest = LibraryStore::open(self.0.join("guest.sqlite3"))
            .await
            .unwrap();
        AccountService::open(&self.0, guest).await.unwrap()
    }

    fn session_db(&self) -> Connection {
        Connection::open(self.0.join("account.sqlite3")).unwrap()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn saved(uid: &str) -> SavedSession {
    let verified = super::super::passport::verified_fixture(uid);
    SavedSession {
        profile: AccountProfile {
            uid: verified.uid,
            name: verified.name,
        },
        credential: verified.credential,
    }
}

async fn target(service: &AccountService, uid: &str) -> LibraryStore {
    LibraryStore::open_for_owner(
        service
            .directory
            .join("accounts")
            .join(format!("{uid}.sqlite3")),
        uid.into(),
    )
    .await
    .unwrap()
}

// Bypass only the upstream protocol: exercise the same durable publication used after verification.
async fn switch_to(service: &AccountService, uid: &str) -> Result<(), AccountError> {
    let library = target(service, uid).await;
    let state = service.state.clone().lock_owned().await;
    service.commit(state, Some(saved(uid)), library).await
}

fn progress(owner: &str, series: &str) -> HistoryChange {
    HistoryChange::Progress(Box::new(Progress {
        owner_id: Some(owner.into()),
        drama: Drama {
            series_id: series.into(),
            title: "Synthetic boundary record".into(),
            ..Drama::default()
        },
        episode: 1,
        video_id: "999".into(),
        position: 12.0,
        duration: 60.0,
        completed: false,
    }))
}

fn clear(owner: &str) -> HistoryChange {
    HistoryChange::Clear {
        owner_id: Some(owner.into()),
        kind: HistoryKind::History,
    }
}

fn identity(session: &LibraryWriteSession, sequence: u64) -> LibraryOperationIdentity {
    LibraryOperationIdentity {
        session_id: session.session_id.clone(),
        operation_id: sequence.to_string(),
    }
}

fn current_day() -> String {
    let days = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        / 86_400;
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

async fn session(service: &AccountService, owner: &str) -> LibraryWriteSession {
    service
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(owner.into()),
        })
        .await
        .unwrap()
}

async fn write(service: &AccountService, owner: &str, series: &str) -> LibraryWriteSession {
    let token = session(service, owner).await;
    let result = service
        .apply_operation(identity(&token, 1), progress(owner, series))
        .await
        .unwrap();
    assert!(matches!(
        result.outcome,
        LibraryOperationOutcome::Committed { .. }
    ));
    token
}

fn persisted_payload(connection: &Connection) -> Option<String> {
    connection
        .query_row("SELECT payload FROM session WHERE singleton=1", [], |row| {
            row.get(0)
        })
        .unwrap()
}

fn pending_attempt(id: &str, method: LoginMethod, phase: LoginState) -> Attempt {
    let phone =
        (method == LoginMethod::Phone).then(|| PhoneNumber::parse("+86", "13900000000").unwrap());
    Attempt {
        view: AccountLogin {
            id: id.into(),
            method,
            state: phase,
            expires_at: now_millis().unwrap() + 60_000,
            image: None,
            phone: phone.as_ref().map(PhoneNumber::masked),
            retry_after: None,
            sms_number: None,
            sms_content: None,
            sms_image: None,
            error: None,
        },
        alive: Arc::new(AtomicBool::new(true)),
        deadline: Instant::now() + Duration::from_secs(60),
        next_poll: Instant::now(),
        cooldown_key: None,
        work: Arc::new(Mutex::new(AttemptWork {
            client: PassportClient::anonymous().unwrap(),
            qr: None,
            phone,
            mfa: None,
            code: Some("123456".into()),
        })),
    }
}

#[tokio::test]
async fn cancelled_and_expired_qr_attempts_cannot_advance_or_change_the_owner() {
    for terminal in [LoginState::Cancelled, LoginState::Expired] {
        let tmp = Temp::new();
        let service = tmp.open().await;
        switch_to(&service, "1").await.unwrap();
        write(&service, "1", "201").await;
        let scope = service.snapshot().await;
        let mut attempt = pending_attempt("terminal-qr", LoginMethod::Qr, LoginState::Pending);
        attempt.view.image = Some("synthetic presentation only".into());
        if terminal == LoginState::Cancelled {
            attempt.alive.store(false, Ordering::Release);
        } else {
            attempt.deadline = Instant::now() - Duration::from_secs(1);
        }
        service.state.lock().await.attempt = Some(attempt);

        assert_eq!(
            service
                .command(AccountCommandRequest {
                    owner_id: scope.owner_id.clone(),
                    owner_epoch: scope.owner_epoch.clone(),
                    command: AccountCommand::QrPoll {
                        id: "terminal-qr".into()
                    },
                })
                .await
                .err(),
            Some(AccountError::AttemptExpired)
        );
        let current = service.state().await.unwrap();
        assert_eq!(current.account.owner_id, scope.owner_id);
        assert_eq!(current.account.owner_epoch, scope.owner_epoch);
        assert_eq!(current.library.entries[0].drama.series_id, "201");
        let login = current.account.login.unwrap();
        assert_eq!(login.state, terminal);
        assert!(login.image.is_none());
        // In particular, a second snapshot must not turn Expired into Cancelled.
        assert_eq!(service.snapshot().await.login.unwrap().state, terminal);
        assert!(
            !service
                .state
                .lock()
                .await
                .attempt
                .as_ref()
                .unwrap()
                .alive
                .load(Ordering::Acquire)
        );
    }
}

#[tokio::test]
async fn invalid_phone_verify_and_old_cancel_preserve_the_current_editable_attempt() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    let scope = service.snapshot().await;
    let attempt = pending_attempt("current-phone", LoginMethod::Phone, LoginState::CodeSent);
    let expected_view = attempt.view.clone();
    let expected_poll = attempt.next_poll;
    service.state.lock().await.attempt = Some(attempt);

    for (command, expected_error) in [
        (
            AccountCommand::PhoneVerify {
                id: "current-phone".into(),
            },
            AccountError::InvalidInput,
        ),
        (
            AccountCommand::Cancel {
                id: "superseded-phone".into(),
            },
            AccountError::AttemptExpired,
        ),
    ] {
        assert_eq!(
            service
                .command(AccountCommandRequest {
                    owner_id: scope.owner_id.clone(),
                    owner_epoch: scope.owner_epoch.clone(),
                    command,
                })
                .await
                .err(),
            Some(expected_error)
        );
        let state = service.state.lock().await;
        let current = state.attempt.as_ref().unwrap();
        assert_eq!(current.view, expected_view);
        assert_eq!(current.next_poll, expected_poll);
        assert!(current.alive.load(Ordering::Acquire));
        assert_eq!(state.owner(), scope.owner_id);
        assert_eq!(state.epoch, scope.owner_epoch);
    }

    let cancelled = service
        .command(AccountCommandRequest {
            owner_id: scope.owner_id,
            owner_epoch: scope.owner_epoch,
            command: AccountCommand::Cancel {
                id: "current-phone".into(),
            },
        })
        .await
        .unwrap();
    assert_eq!(
        cancelled.account.login.unwrap().state,
        LoginState::Cancelled
    );
}

#[tokio::test]
async fn stale_scope_cannot_start_login_cancel_a_replacement_or_logout() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    let previous = service.snapshot().await;
    let state = service.state.clone().lock_owned().await;
    let guest = state.guest.clone();
    service.commit(state, None, guest).await.unwrap();
    service.state.lock().await.attempt = Some(pending_attempt(
        "replacement",
        LoginMethod::Qr,
        LoginState::Pending,
    ));
    let before = service.state().await.unwrap();
    assert_eq!(before.account.owner_id, previous.owner_id);
    assert_ne!(before.account.owner_epoch, previous.owner_epoch);

    for command in [
        AccountCommand::QrStart {},
        AccountCommand::PhoneStart {
            country_code: "+86".into(),
            phone: "13900000000".into(),
            send_code: false,
        },
        AccountCommand::Cancel {
            id: "replacement".into(),
        },
        AccountCommand::Logout {},
    ] {
        assert_eq!(
            service
                .command(AccountCommandRequest {
                    owner_id: previous.owner_id.clone(),
                    owner_epoch: previous.owner_epoch.clone(),
                    command,
                })
                .await
                .err(),
            Some(AccountError::OwnerChanged)
        );
        assert_eq!(service.state().await.unwrap(), before);
        assert!(
            service
                .state
                .lock()
                .await
                .attempt
                .as_ref()
                .unwrap()
                .alive
                .load(Ordering::Acquire)
        );
    }
    // Exercise start's own locked scope check, separately from command's initial check.
    assert_eq!(
        service
            .start(&previous.owner_id, &previous.owner_epoch, None, false)
            .await,
        Err(AccountError::OwnerChanged)
    );
    assert_eq!(service.state().await.unwrap(), before);
}

#[tokio::test]
async fn owner_switches_preserve_separate_libraries_and_expire_prior_generations() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    service.apply_history(progress("", "101")).await.unwrap();
    let guest_token = session(&service, "").await;

    switch_to(&service, "1").await.unwrap();
    assert!(service.state().await.unwrap().library.entries.is_empty());
    let a_token = write(&service, "1", "201").await;
    // Retain the original registry so expiry is proved by invalidation, not by all clones dropping.
    let retained_a = service.state.lock().await.library.clone();
    assert_eq!(
        service.apply_history(clear("1")).await.err(),
        Some(LibraryError::SessionExpired)
    );

    switch_to(&service, "2").await.unwrap();
    let b_token = write(&service, "2", "301").await;
    assert_eq!(
        service
            .apply_operation(identity(&a_token, 2), clear("1"))
            .await
            .err(),
        Some(LibraryError::OwnerChanged)
    );

    switch_to(&service, "1").await.unwrap();
    assert_eq!(
        service
            .apply_operation(identity(&a_token, 2), clear("1"))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    assert_eq!(
        service.apply_history(clear("1")).await.err(),
        Some(LibraryError::SessionExpired)
    );
    let a_again = service.state().await.unwrap();
    assert_eq!(a_again.account.owner_id, "1");
    assert_eq!(a_again.library.owner_id.as_deref(), Some("1"));
    assert_eq!(a_again.library.entries[0].drama.series_id, "201");
    write(&service, "1", "202").await;
    drop(service);

    let reopened = tmp.open().await;
    let restored = reopened.state().await.unwrap();
    assert_eq!(restored.account.owner_id, "1");
    assert_eq!(restored.library.entries.len(), 2);
    let logged_out = reopened
        .command(AccountCommandRequest {
            owner_id: "1".into(),
            owner_epoch: reopened.snapshot().await.owner_epoch,
            command: AccountCommand::Logout {},
        })
        .await
        .unwrap();
    assert!(!logged_out.account.logged_in);
    assert_eq!(logged_out.library.entries.len(), 1);
    assert_eq!(logged_out.library.entries[0].drama.series_id, "101");
    assert_eq!(
        reopened
            .apply_operation(identity(&guest_token, 1), clear(""))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    assert_eq!(
        reopened.apply_history(clear("")).await.err(),
        Some(LibraryError::SessionExpired)
    );
    drop(reopened);

    let guest_again = tmp.open().await;
    assert!(!guest_again.snapshot().await.logged_in);
    assert_eq!(
        guest_again
            .library_snapshot(Some(""))
            .await
            .unwrap()
            .entries[0]
            .drama
            .series_id,
        "101"
    );
    let b = target(&guest_again, "2").await;
    assert_eq!(
        b.snapshot().await.unwrap().entries[0].drama.series_id,
        "301"
    );
    assert_eq!(
        b.apply_operation(identity(&b_token, 2), clear("2"))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    assert_eq!(retained_a.snapshot().await.unwrap().entries.len(), 2);
    assert!(persisted_payload(&tmp.session_db()).is_none());
}

#[tokio::test]
async fn reopening_the_same_directory_restores_login_without_a_new_attempt() {
    let tmp = Temp::new();
    let service = tmp.open().await;

    switch_to(&service, "7390000000000000003")
        .await
        .expect("verified session should be committed");
    let first = service.state().await.unwrap();
    assert!(first.account.logged_in);
    assert!(first.account.login.is_none());
    assert_eq!(first.account.owner_id, "7390000000000000003");
    drop(service);

    let reopened = tmp.open().await;
    let restored = reopened.state().await.unwrap();
    assert!(restored.account.logged_in);
    assert!(restored.account.login.is_none());
    assert_eq!(restored.account.owner_id, "7390000000000000003");

    let logged_out = reopened
        .command(AccountCommandRequest {
            owner_id: restored.account.owner_id,
            owner_epoch: restored.account.owner_epoch,
            command: AccountCommand::Logout {},
        })
        .await
        .unwrap();
    assert!(!logged_out.account.logged_in);
    assert!(persisted_payload(&tmp.session_db()).is_none());
}

#[tokio::test]
async fn watch_statistics_rejects_an_old_epoch_after_returning_to_the_same_account() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let old = service.snapshot().await;
    let day = current_day();

    let initial = service
        .watch_statistics_snapshot(&old.owner_id, &old.owner_epoch, &day)
        .await
        .unwrap();
    let batch = WatchStatisticsBatch {
        owner_id: old.owner_id.clone(),
        owner_epoch: old.owner_epoch.clone(),
        id: "account-001".into(),
        revision: initial.revision,
        items: vec![WatchStatisticsSegment {
            day: day.clone(),
            ms: 1_000,
            kind: WatchStatisticsContentType::Real,
            genre: Some("都市".into()),
        }],
    };
    service
        .append_watch_statistics(&old.owner_id, &old.owner_epoch, &day, batch)
        .await
        .unwrap();

    switch_to(&service, "2").await.unwrap();
    switch_to(&service, "1").await.unwrap();
    let current = service.snapshot().await;
    assert_eq!(current.owner_id, old.owner_id);
    assert_ne!(current.owner_epoch, old.owner_epoch);
    assert_eq!(
        service
            .watch_statistics_snapshot(&old.owner_id, &old.owner_epoch, &day)
            .await
            .unwrap_err(),
        WatchStatisticsError::OwnerChanged
    );
    let current_stats = service
        .watch_statistics_snapshot(&current.owner_id, &current.owner_epoch, &day)
        .await
        .unwrap();
    assert_eq!(current_stats.days[0].duration_ms, 1_000);
}

#[tokio::test]
async fn failed_session_publication_keeps_the_previous_owner_credentials_and_history() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let old_token = write(&service, "1", "201").await;
    let connection = tmp.session_db();
    let before = persisted_payload(&connection).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_session BEFORE UPDATE OF payload ON session BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END;").unwrap();

    assert_eq!(switch_to(&service, "2").await, Err(AccountError::Storage));
    let unchanged = service.state().await.unwrap();
    assert_eq!(unchanged.account.owner_id, "1");
    assert_eq!(unchanged.library.owner_id.as_deref(), Some("1"));
    assert_eq!(unchanged.library.entries[0].drama.series_id, "201");
    assert_eq!(
        persisted_payload(&connection).as_deref(),
        Some(before.as_str())
    );
    assert_eq!(
        service
            .apply_operation(identity(&old_token, 2), clear("1"))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
    write(&service, "1", "202").await;

    let logout = service
        .command(AccountCommandRequest {
            owner_id: "1".into(),
            owner_epoch: service.snapshot().await.owner_epoch,
            command: AccountCommand::Logout {},
        })
        .await;
    assert_eq!(logout.err(), Some(AccountError::Storage));
    assert_eq!(service.snapshot().await.owner_id, "1");
    assert_eq!(
        persisted_payload(&connection).as_deref(),
        Some(before.as_str())
    );

    connection
        .execute_batch("DROP TRIGGER reject_session")
        .unwrap();
    drop(service);
    let restored = tmp.open().await;
    assert_eq!(restored.snapshot().await.owner_id, "1");
    assert_eq!(
        restored
            .library_snapshot(Some("1"))
            .await
            .unwrap()
            .entries
            .len(),
        2
    );
    assert_eq!(
        persisted_payload(&connection).as_deref(),
        Some(before.as_str())
    );
}

#[tokio::test]
async fn delayed_logout_cannot_match_a_later_generation_of_the_same_owner() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    write(&service, "1", "201").await;
    let previous = service.snapshot().await;
    let delayed_logout = AccountCommandRequest {
        owner_id: previous.owner_id,
        owner_epoch: previous.owner_epoch.clone(),
        command: AccountCommand::Logout {},
    };

    switch_to(&service, "2").await.unwrap();
    switch_to(&service, "1").await.unwrap();
    let current = service.state().await.unwrap();
    assert_eq!(current.account.owner_id, "1");
    assert_ne!(current.account.owner_epoch, previous.owner_epoch);
    let connection = tmp.session_db();
    let credential_before = persisted_payload(&connection);

    assert_eq!(
        service.command(delayed_logout).await.err(),
        Some(AccountError::OwnerChanged)
    );
    assert_eq!(service.state().await.unwrap(), current);
    assert_eq!(persisted_payload(&connection), credential_before);

    let logged_out = service
        .command(AccountCommandRequest {
            owner_id: current.account.owner_id,
            owner_epoch: service.snapshot().await.owner_epoch,
            command: AccountCommand::Logout {},
        })
        .await
        .unwrap();
    assert!(!logged_out.account.logged_in);
    assert!(persisted_payload(&connection).is_none());
}

#[tokio::test]
async fn cancelling_a_caller_does_not_abandon_an_admitted_session_commit() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let library = target(&service, "2").await;
    let gate = tmp.session_db();
    let before = persisted_payload(&gate);
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();

    let state = service.state.clone().lock_owned().await;
    let mut committing = Box::pin(service.commit(state, Some(saved("2")), library));
    assert!(matches!(
        committing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(committing);
    // A blocked credential write must keep ownership publication inaccessible after caller drop.
    assert!(
        tokio::time::timeout(Duration::from_millis(25), service.state())
            .await
            .is_err()
    );
    assert_eq!(persisted_payload(&gate), before);
    gate.execute_batch("COMMIT").unwrap();

    let published = tokio::time::timeout(Duration::from_secs(5), service.state())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(published.account.owner_id, "2");
    assert_eq!(published.library.owner_id.as_deref(), Some("2"));
    drop(service);
    assert_eq!(tmp.open().await.snapshot().await.owner_id, "2");
}

#[tokio::test]
async fn switching_waits_for_a_cancelled_history_call_to_really_finish() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let token = session(&service, "1").await;
    let old_library = service.state.lock().await.library.clone();
    let gate = Connection::open(tmp.0.join("accounts/1.sqlite3")).unwrap();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();

    let mut writing = Box::pin(service.apply_operation(identity(&token, 1), progress("1", "201")));
    assert!(matches!(
        writing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(writing);
    let target = target(&service, "2").await;
    let state = service.state.clone().lock_owned().await;
    let mut committing = Box::pin(service.commit(state, Some(saved("2")), target));
    assert!(matches!(
        committing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(committing);
    assert!(
        tokio::time::timeout(Duration::from_millis(25), service.state())
            .await
            .is_err()
    );
    assert_eq!(
        serde_json::from_str::<SavedSession>(&persisted_payload(&tmp.session_db()).unwrap())
            .unwrap()
            .profile
            .uid,
        "1"
    );
    gate.execute_batch("COMMIT").unwrap();

    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), service.snapshot())
            .await
            .unwrap()
            .owner_id,
        "2"
    );
    assert_eq!(
        old_library.snapshot().await.unwrap().entries[0]
            .drama
            .series_id,
        "201"
    );
    switch_to(&service, "1").await.unwrap();
    assert_eq!(
        service
            .apply_operation(identity(&token, 1), progress("1", "201"))
            .await
            .err(),
        Some(LibraryError::SessionExpired)
    );
}

#[tokio::test]
async fn corrupt_session_files_fail_closed_without_replacing_the_original_bytes() {
    let tmp = Temp::new();
    let path = tmp.0.join("account.sqlite3");
    let original = b"synthetic invalid session file; preserve for diagnosis";
    std::fs::write(&path, original).unwrap();
    let guest = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    assert!(AccountService::open(&tmp.0, guest).await.is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
}

#[tokio::test]
async fn mismatched_persisted_identity_is_rejected_without_overwriting_the_payload() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let connection = tmp.session_db();
    let mut invalid: serde_json::Value =
        serde_json::from_str(&persisted_payload(&connection).unwrap()).unwrap();
    invalid["profile"]["uid"] = "2".into();
    let encoded = serde_json::to_string(&invalid).unwrap();
    connection
        .execute(
            "UPDATE session SET payload=?1 WHERE singleton=1",
            [&encoded],
        )
        .unwrap();
    drop(service);

    let guest = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    assert_eq!(
        AccountService::open(&tmp.0, guest).await.err(),
        Some(AccountError::InvalidSession)
    );
    assert_eq!(
        persisted_payload(&connection).as_deref(),
        Some(encoded.as_str())
    );
}

#[tokio::test]
async fn account_library_cannot_be_injected_as_the_guest_library() {
    let tmp = Temp::new();
    let wrong_guest = LibraryStore::open_for_owner(tmp.0.join("wrong-guest.sqlite3"), "1".into())
        .await
        .unwrap();
    wrong_guest.apply(progress("1", "201")).await.unwrap();
    assert!(
        AccountService::open(&tmp.0, wrong_guest.clone())
            .await
            .is_err()
    );
    let preserved = wrong_guest.snapshot().await.unwrap();
    assert_eq!(preserved.owner_id.as_deref(), Some("1"));
    assert_eq!(preserved.entries[0].drama.series_id, "201");
}

fn registered_device() -> PersistedSession {
    saved("1").credential.without_credentials()
}
fn persisted_device(connection: &Connection) -> Option<String> {
    connection
        .query_row("SELECT device FROM session WHERE singleton=1", [], |row| {
            row.get(0)
        })
        .unwrap()
}

#[tokio::test]
async fn cancelled_registered_device_save_keeps_the_coordinator_until_sqlite_settles() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    let attempt = pending_attempt("device-save", LoginMethod::Phone, LoginState::Processing);
    let cancellation = CancelOnDrop(attempt.alive.clone(), true);
    service.state.lock().await.attempt = Some(attempt);
    let scope = service.snapshot().await;
    let device = registered_device();
    let encoded = serde_json::to_string(&device).unwrap();
    let gate = tmp.session_db();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut saving = Box::pin(service.save_registered_device(
        &scope.owner_id,
        &scope.owner_epoch,
        "device-save",
        device,
    ));
    assert!(matches!(
        saving
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(saving);
    drop(cancellation);
    service.stop_sync();
    assert!(
        tokio::time::timeout(Duration::from_millis(25), service.state())
            .await
            .is_err()
    );
    assert!(persisted_device(&gate).is_none());
    gate.execute_batch("COMMIT").unwrap();
    let state = tokio::time::timeout(Duration::from_secs(3), service.state())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(state.account.login.unwrap().state, LoginState::Cancelled);
    assert_eq!(persisted_device(&gate).as_deref(), Some(encoded.as_str()));
    assert!(service.state.lock().await.device.is_none());
    let reopened = tmp.open().await;
    assert_eq!(
        serde_json::to_string(reopened.state.lock().await.device.as_ref().unwrap()).unwrap(),
        encoded
    );
    assert!(!reopened.snapshot().await.logged_in);
}

#[tokio::test]
async fn registered_device_save_checks_exact_scope_and_attempt_before_persistence() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let old = service.snapshot().await;
    switch_to(&service, "2").await.unwrap();
    switch_to(&service, "1").await.unwrap();
    let scope = service.snapshot().await;
    service.state.lock().await.attempt = Some(pending_attempt(
        "current-phone",
        LoginMethod::Phone,
        LoginState::Processing,
    ));
    assert_eq!(
        service
            .save_registered_device(
                &old.owner_id,
                &old.owner_epoch,
                "current-phone",
                registered_device()
            )
            .await,
        Err(AccountError::OwnerChanged)
    );
    assert_eq!(
        service
            .save_registered_device(
                &scope.owner_id,
                "stale-epoch",
                "current-phone",
                registered_device()
            )
            .await,
        Err(AccountError::OwnerChanged)
    );
    assert_eq!(
        service
            .save_registered_device(
                &scope.owner_id,
                &scope.owner_epoch,
                "replaced-phone",
                registered_device()
            )
            .await,
        Err(AccountError::AttemptExpired)
    );
    assert!(persisted_device(&tmp.session_db()).is_none());
    assert!(service.state.lock().await.device.is_none());
    service
        .save_registered_device(
            &scope.owner_id,
            &scope.owner_epoch,
            "current-phone",
            registered_device(),
        )
        .await
        .unwrap();
    assert!(service.state.lock().await.device.is_some());
    assert!(persisted_device(&tmp.session_db()).is_some());
}

#[tokio::test]
async fn failed_registered_device_save_preserves_the_previous_device_and_payload() {
    let tmp = Temp::new();
    let service = tmp.open().await;
    switch_to(&service, "1").await.unwrap();
    let scope = service.snapshot().await;
    service.state.lock().await.attempt = Some(pending_attempt(
        "phone-storage",
        LoginMethod::Phone,
        LoginState::Processing,
    ));
    service
        .save_registered_device(
            &scope.owner_id,
            &scope.owner_epoch,
            "phone-storage",
            registered_device(),
        )
        .await
        .unwrap();
    let gate = tmp.session_db();
    let before = persisted_payload(&gate);
    let previous_device = persisted_device(&gate);
    gate.execute_batch("CREATE TRIGGER reject_device BEFORE UPDATE OF device ON session BEGIN SELECT RAISE(ABORT,'fixture'); END;").unwrap();
    assert_eq!(
        service
            .save_registered_device(
                &scope.owner_id,
                &scope.owner_epoch,
                "phone-storage",
                registered_device()
            )
            .await,
        Err(AccountError::Storage)
    );
    assert_eq!(persisted_payload(&gate), before);
    assert_eq!(persisted_device(&gate), previous_device);
    assert_eq!(
        service
            .state
            .lock()
            .await
            .device
            .as_ref()
            .map(|device| serde_json::to_string(device).unwrap()),
        previous_device
    );
    gate.execute_batch("DROP TRIGGER reject_device").unwrap();
    service
        .save_registered_device(
            &scope.owner_id,
            &scope.owner_epoch,
            "phone-storage",
            registered_device(),
        )
        .await
        .unwrap();
    assert_eq!(persisted_payload(&gate), before);
    assert!(persisted_device(&gate).is_some());
}
