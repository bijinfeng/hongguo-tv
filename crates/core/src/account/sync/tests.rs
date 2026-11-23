//! Real coordinator, loopback transport and disposable SQLite regressions; no live account.
use super::super::{AccountCommand, AccountCommandRequest, AccountProfile};
use super::*;
use crate::account::persistence::SavedSession;
use crate::{
    catalog::Drama,
    library::{
        HistoryChange, LibraryOperationIdentity, LibraryOperationOutcome, LibraryStore,
        LibraryWriteSessionRequest, Progress,
    },
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicU64, AtomicUsize},
    },
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Semaphore,
    task::JoinHandle,
};

trait CredentialFixture {
    fn fixture_token(&self) -> String;
}
impl CredentialFixture for PersistedSession {
    fn fixture_token(&self) -> String {
        serde_json::to_value(self).unwrap()["token"]
            .as_str()
            .unwrap()
            .into()
    }
}

const UID: &str = "7390000000000000003";
const OTHER: &str = "7390000000000000004";
const SERIES: &str = "7690163276214176792";
const HISTORY: &str = "/reading/bookapi/read_history/list/v";
const FAVORITES: &str = "/reading/bookapi/bookshelf/video/list/v";
const UPLOAD: &str = "/reading/bookapi/read_history/update/v";
const PROGRESS: &str = "/reading/bookapi/read_progress/upload/v";

#[derive(Clone)]
struct Request {
    path: String,
    body: Value,
}
struct Response {
    body: Value,
    gate: Option<Arc<Semaphore>>,
    token: &'static str,
}
impl Response {
    fn normal(request: &Request) -> Self {
        let body = match request.path.as_str() {
            HISTORY => json!({"code":0,"data":{"data_list":[],"has_more":false}}),
            FAVORITES => json!({"code":0,"data":{"video_shelf_info":[]}}),
            "/reading/bookapi/read_progress/get/v" => json!({"code":0,"video_data":[]}),
            "/novel/player/multi_video_detail/preload/v1" => json!({"code":0,"data":{}}),
            _ => json!({"code":0}),
        };
        Self {
            body,
            gate: None,
            token: "refreshed-synthetic-token",
        }
    }
}
struct Fixture {
    origin: String,
    requests: Arc<Mutex<Vec<Request>>>,
    task: JoinHandle<()>,
}
impl Fixture {
    async fn new(handler: impl Fn(&Request) -> Response + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = requests.clone();
        let handler = Arc::new(handler);
        let task = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                let recorded = recorded.clone();
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut bytes = Vec::new();
                    let mut buffer = [0; 4096];
                    let end = loop {
                        let Ok(n) = stream.read(&mut buffer).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                        assert!(bytes.len() < 512 * 1024);
                        if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                            break end + 4;
                        }
                    };
                    let head = String::from_utf8(bytes[..end].to_vec()).unwrap();
                    let target = head
                        .lines()
                        .next()
                        .unwrap()
                        .split_ascii_whitespace()
                        .nth(1)
                        .unwrap();
                    let path = target.split('?').next().unwrap().into();
                    let length = head
                        .lines()
                        .filter_map(|v| v.split_once(':'))
                        .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
                        .map_or(0, |(_, v)| v.trim().parse::<usize>().unwrap());
                    while bytes.len() < end + length {
                        let Ok(n) = stream.read(&mut buffer).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                    }
                    let request = Request {
                        path,
                        body: serde_json::from_slice(&bytes[end..end + length])
                            .unwrap_or(Value::Null),
                    };
                    let response = handler(&request);
                    recorded.lock().unwrap().push(request);
                    if let Some(gate) = response.gate {
                        let Ok(permit) = gate.acquire().await else {
                            return;
                        };
                        permit.forget();
                    }
                    let body = response.body.to_string();
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\nx-tt-token: {}\r\n\r\n",
                        body.len(),
                        response.token
                    );
                    if stream.write_all(header.as_bytes()).await.is_ok() {
                        let _ = stream.write_all(body.as_bytes()).await;
                    }
                });
            }
        });
        Self {
            origin,
            requests,
            task,
        }
    }
    fn count(&self, path: &str) -> usize {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == path)
            .count()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
struct Temp(PathBuf);
impl Temp {
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
    async fn open(&self) -> AccountService {
        let guest = LibraryStore::open(self.0.join("guest.sqlite3"))
            .await
            .unwrap();
        AccountService::open(&self.0, guest).await.unwrap()
    }
    fn account_db(&self) -> Connection {
        Connection::open(self.0.join("account.sqlite3")).unwrap()
    }
    fn library_db(&self) -> Connection {
        Connection::open(self.0.join("accounts").join(format!("{UID}.sqlite3"))).unwrap()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
async fn switch(service: &AccountService, uid: &str) {
    let verified = crate::account::passport::verified_fixture(uid);
    let saved = SavedSession {
        profile: AccountProfile {
            uid: verified.uid,
            name: verified.name,
            avatar: verified.avatar,
        },
        credential: verified.credential,
    };
    let library = LibraryStore::open_for_owner(
        service
            .directory
            .join("accounts")
            .join(format!("{uid}.sqlite3")),
        uid.into(),
    )
    .await
    .unwrap();
    service
        .commit(
            service.state.clone().lock_owned().await,
            Some(saved),
            library,
        )
        .await
        .unwrap();
}
fn change(owner: &str, series: &str, position: f64) -> HistoryChange {
    HistoryChange::Progress(Box::new(Progress {
        owner_id: Some(owner.into()),
        drama: Drama {
            series_id: series.into(),
            title: "Synthetic coordinator record".into(),
            ..Default::default()
        },
        episode: 1,
        video_id: "7690163276214176793".into(),
        position,
        duration: 120.0,
        completed: false,
    }))
}
async fn write(service: &AccountService, series: &str, position: f64) {
    let owner = service.snapshot().await.owner_id;
    let session = service
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(owner.clone()),
        })
        .await
        .unwrap();
    let receipt = service
        .apply_operation(
            LibraryOperationIdentity {
                session_id: session.session_id,
                operation_id: "1".into(),
            },
            change(&owner, series, position),
        )
        .await
        .unwrap();
    assert!(matches!(
        receipt.outcome,
        LibraryOperationOutcome::Committed { .. }
    ));
}
fn configure(service: &AccountService, fixture: &Fixture, interval: Duration, round: Duration) {
    *service.sync.fixture.lock().unwrap() = Some(fixture.origin.clone());
    *service.sync.timing.lock().unwrap() = Timing {
        coalesce: Duration::from_millis(3),
        interval,
        round,
    };
}
async fn start(
    service: &AccountService,
    fixture: &Fixture,
) -> (watch::Sender<bool>, JoinHandle<Result<(), AccountError>>) {
    configure(
        service,
        fixture,
        Duration::from_secs(60),
        Duration::from_secs(3),
    );
    let (sender, receiver) = watch::channel(false);
    let worker_service = service.clone();
    let task = tokio::spawn(async move { worker_service.run_sync(receiver).await });
    wait(|| service.sync.is_running()).await;
    (sender, task)
}
/// Wait for a fixture condition. The budget is generous because a loaded CI runner can starve
/// this loop for seconds; the condition itself is what the test asserts, not the deadline.
async fn wait(mut ready: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(30), async {
        while !ready() {
            tokio::time::sleep(Duration::from_millis(1)).await
        }
    })
    .await
    .expect("fixture condition");
}
async fn settled(service: &AccountService) -> crate::account::Account {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let account = service.snapshot().await;
            if account.sync.state == AccountSyncState::Error || account.sync.last_sync.is_some() {
                return account;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .expect("sync settlement")
}
async fn stop(
    service: &AccountService,
    sender: watch::Sender<bool>,
    task: JoinHandle<Result<(), AccountError>>,
) {
    service.stop_sync();
    sender.send(true).unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
async fn command(
    service: &AccountService,
    command: AccountCommand,
) -> Result<AccountCommandResult, AccountError> {
    let account = service.snapshot().await;
    service
        .command(AccountCommandRequest {
            owner_id: account.owner_id,
            owner_epoch: account.owner_epoch,
            command,
        })
        .await
}

#[tokio::test]
async fn round_pulls_before_double_upload_and_persists_exact_ack_credentials_and_timestamp() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    write(&service, SERIES, 10.0).await;
    let fixture = Fixture::new(Response::normal).await;
    let (sender, task) = start(&service, &fixture).await;
    let account = settled(&service).await;
    assert_eq!(account.sync.state, AccountSyncState::Idle);
    assert_eq!(account.sync.pending, 0);
    let paths: Vec<_> = fixture
        .requests
        .lock()
        .unwrap()
        .iter()
        .map(|r| r.path.clone())
        .collect();
    assert_eq!(paths, vec![HISTORY, FAVORITES, UPLOAD, PROGRESS]);
    assert!(
        service
            .state
            .lock()
            .await
            .library
            .pending_sync()
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        "refreshed-synthetic-token"
    );
    stop(&service, sender, task).await;
    drop(service);
    let reopened = temp.open().await;
    let recovered = reopened.snapshot().await;
    assert_eq!(recovered.sync.last_sync, account.sync.last_sync);
    assert_eq!(recovered.sync.pending, 0);
    assert_eq!(
        reopened
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        "refreshed-synthetic-token"
    );
}

#[tokio::test]
async fn sync_refresh_does_not_overwrite_newer_same_epoch_online_credentials() {
    let gate = Arc::new(Semaphore::new(0));
    let blocked = gate.clone();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == HISTORY {
            response.gate = Some(blocked.clone());
        }
        response
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let (sender, task) = start(&service, &fixture).await;
    wait(|| fixture.count(HISTORY) == 1).await;
    {
        let mut state = service.state.lock().await;
        let mut saved = state.saved.as_ref().unwrap().clone();
        let mut value = serde_json::to_value(&saved.credential).unwrap();
        value["token"] = json!("newer-online-refresh");
        saved.credential = serde_json::from_value(value).unwrap();
        service.storage.replace(Some(saved.clone())).await.unwrap();
        state.saved = Some(saved);
    }
    gate.add_permits(1);
    assert_eq!(settled(&service).await.sync.state, AccountSyncState::Idle);
    assert_eq!(
        service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        "newer-online-refresh"
    );
    stop(&service, sender, task).await;
    drop(service);
    let reopened = temp.open().await;
    assert_eq!(
        reopened
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        "newer-online-refresh"
    );
}

#[tokio::test]
async fn either_double_write_failure_keeps_pending_and_never_marks_success() {
    for failed in [UPLOAD, PROGRESS] {
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, UID).await;
        write(&service, SERIES, 10.0).await;
        let original = service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token()
            .clone();
        let fixture = Fixture::new(move |request| {
            let mut response = Response::normal(request);
            if request.path == failed {
                response.body = json!({"code":9});
            }
            response
        })
        .await;
        let (sender, task) = start(&service, &fixture).await;
        let account = settled(&service).await;
        assert_eq!(account.sync.state, AccountSyncState::Error);
        assert_eq!(account.sync.pending, 1);
        assert_eq!(account.sync.last_sync, None);
        assert_eq!(fixture.count(PROGRESS), usize::from(failed == PROGRESS));
        assert_eq!(
            service
                .state
                .lock()
                .await
                .saved
                .as_ref()
                .unwrap()
                .credential
                .fixture_token(),
            original
        );
        stop(&service, sender, task).await;
    }
}

#[tokio::test]
async fn ack_save_and_mark_failures_do_not_publish_false_success() {
    for failure in ["ack", "save", "mark"] {
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, UID).await;
        write(&service, SERIES, 10.0).await;
        let db = if failure == "save" {
            temp.account_db()
        } else {
            temp.library_db()
        };
        db.execute_batch(match failure {
            "ack"=>"CREATE TRIGGER fail BEFORE DELETE ON sync_outbox BEGIN SELECT RAISE(ABORT,'fixture'); END;",
            "save"=>"CREATE TRIGGER fail BEFORE UPDATE ON session BEGIN SELECT RAISE(ABORT,'fixture'); END;",
            _=>"CREATE TRIGGER fail BEFORE UPDATE OF last_sync ON sync_state BEGIN SELECT RAISE(ABORT,'fixture'); END;",
        }).unwrap();
        let fixture = Fixture::new(Response::normal).await;
        let (sender, task) = start(&service, &fixture).await;
        let account = settled(&service).await;
        assert_eq!(account.sync.state, AccountSyncState::Error, "{failure}");
        assert_eq!(account.sync.last_sync, None);
        assert_eq!(account.sync.pending, u32::from(failure == "ack"));
        stop(&service, sender, task).await;
    }
}

#[tokio::test]
async fn local_write_during_pull_survives_merge_and_stale_upload_ack_keeps_replacement() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let pull = Arc::new(Semaphore::new(0));
    let upload = Arc::new(Semaphore::new(0));
    let (pull_gate, upload_gate) = (pull.clone(), upload.clone());
    let uploads = AtomicUsize::new(0);
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == HISTORY {
            response.gate = Some(pull_gate.clone());
        }
        if request.path == UPLOAD && uploads.fetch_add(1, Ordering::AcqRel) == 0 {
            response.gate = Some(upload_gate.clone());
        }
        response
    })
    .await;
    let (sender, task) = start(&service, &fixture).await;
    wait(|| fixture.count(HISTORY) == 1).await;
    write(&service, SERIES, 10.0).await;
    pull.add_permits(1);
    wait(|| fixture.count(UPLOAD) == 1).await;
    write(&service, SERIES, 20.0).await;
    upload.add_permits(1);
    let account = settled(&service).await;
    assert_eq!(account.sync.state, AccountSyncState::Idle);
    assert_eq!(account.sync.pending, 0);
    assert_eq!(fixture.count(UPLOAD), 2);
    assert_eq!(fixture.count(PROGRESS), 2);
    let snapshot = service.state().await.unwrap();
    assert_eq!(snapshot.library.entries[0].position, Some(20.0));
    {
        let requests = fixture.requests.lock().unwrap();
        let uploads: Vec<_> = requests.iter().filter(|r| r.path == UPLOAD).collect();
        assert_ne!(uploads[0].body, uploads[1].body);
    }
    stop(&service, sender, task).await;
}

#[tokio::test]
async fn owner_switches_logout_and_a_b_a_cancel_blocked_pull_without_late_publication() {
    for mode in ["logout", "switch", "aba"] {
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, UID).await;
        let old = service.snapshot().await;
        let gate = Arc::new(Semaphore::new(0));
        let block = gate.clone();
        let fixture = Fixture::new(move |request| {
            let mut response = Response::normal(request);
            if request.path == HISTORY {
                response.gate = Some(block.clone());
                response.token = "stale-synthetic-token";
            }
            response
        })
        .await;
        let (sender, task) = start(&service, &fixture).await;
        wait(|| fixture.count(HISTORY) == 1).await;
        match mode {
            "logout" => {
                command(&service, AccountCommand::Logout {}).await.unwrap();
            }
            "switch" => switch(&service, OTHER).await,
            _ => {
                switch(&service, OTHER).await;
                switch(&service, UID).await;
            }
        }
        service.stop_sync();
        gate.add_permits(10);
        stop(&service, sender, task).await;
        let result = service.state().await.unwrap();
        assert_ne!(result.account.owner_epoch, old.owner_epoch);
        assert_eq!(result.account.sync.last_sync, None);
        assert!(result.library.entries.is_empty());
        assert_eq!(fixture.count(UPLOAD), 0);
        if let Some(saved) = &service.state.lock().await.saved {
            assert_ne!(saved.credential.fixture_token(), "stale-synthetic-token");
        }
        assert!(matches!(
            service
                .command(AccountCommandRequest {
                    owner_id: old.owner_id,
                    owner_epoch: old.owner_epoch,
                    command: AccountCommand::Sync {}
                })
                .await,
            Err(AccountError::OwnerChanged)
        ));
    }
}

#[tokio::test]
async fn logout_during_upload_preserves_account_pending_and_original_guest() {
    let temp = Temp::new();
    let service = temp.open().await;
    write(&service, "1", 1.0).await;
    switch(&service, UID).await;
    write(&service, SERIES, 10.0).await;
    let gate = Arc::new(Semaphore::new(0));
    let block = gate.clone();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == UPLOAD {
            response.gate = Some(block.clone());
        }
        response
    })
    .await;
    let (sender, task) = start(&service, &fixture).await;
    wait(|| fixture.count(UPLOAD) == 1).await;
    let result = command(&service, AccountCommand::Logout {}).await.unwrap();
    assert_eq!(result.library.entries[0].drama.series_id, "1");
    assert!(result.account.guest_history.is_none());
    service.stop_sync();
    gate.add_permits(1);
    stop(&service, sender, task).await;
    assert_eq!(fixture.count(PROGRESS), 0);
    switch(&service, UID).await;
    assert_eq!(service.snapshot().await.sync.pending, 1);
}

#[tokio::test]
async fn timeout_stop_shutdown_and_drop_cancel_rounds_and_reject_restart() {
    for mode in ["timeout", "stop", "shutdown", "drop"] {
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, UID).await;
        write(&service, SERIES, 10.0).await;
        let original = service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token()
            .clone();
        let gate = Arc::new(Semaphore::new(0));
        let block = gate.clone();
        let fixture = Fixture::new(move |request| {
            let mut response = Response::normal(request);
            if request.path == HISTORY {
                response.gate = Some(block.clone());
            }
            response
        })
        .await;
        configure(
            &service,
            &fixture,
            Duration::from_secs(60),
            Duration::from_millis(30),
        );
        let (sender, receiver) = watch::channel(false);
        let worker = service.clone();
        let task = tokio::spawn(async move { worker.run_sync(receiver).await });
        wait(|| fixture.count(HISTORY) == 1).await;
        match mode {
            "timeout" => {
                let account = settled(&service).await;
                assert_eq!(account.sync.state, AccountSyncState::Error);
                assert!(account.sync.error.unwrap().contains("超时"));
                stop(&service, sender, task).await;
            }
            "stop" => {
                service.stop_sync();
                tokio::time::timeout(Duration::from_secs(1), task)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
            }
            "shutdown" => {
                sender.send(true).unwrap();
                task.await.unwrap().unwrap();
            }
            _ => {
                task.abort();
                assert!(task.await.unwrap_err().is_cancelled());
            }
        }
        gate.add_permits(1);
        assert!(!service.sync.is_running());
        let account = service.snapshot().await;
        assert_ne!(account.sync.state, AccountSyncState::Syncing);
        assert_eq!(account.sync.last_sync, None);
        assert_eq!(account.sync.pending, 1);
        assert_eq!(
            service
                .state
                .lock()
                .await
                .saved
                .as_ref()
                .unwrap()
                .credential
                .fixture_token(),
            original
        );
        assert_eq!(fixture.count(UPLOAD), 0);
        assert!(matches!(
            service.run_sync(watch::channel(false).1).await,
            Err(AccountError::NotImplemented)
        ));
    }
}

#[tokio::test]
async fn explicit_sync_requires_worker_and_valid_account_scope_and_never_claims_success() {
    let temp = Temp::new();
    let service = temp.open().await;
    assert!(matches!(
        command(&service, AccountCommand::Sync {}).await,
        Err(AccountError::IdentityMismatch)
    ));
    switch(&service, UID).await;
    assert!(matches!(
        command(&service, AccountCommand::Sync {}).await,
        Err(AccountError::NotImplemented)
    ));
    let gate = Arc::new(Semaphore::new(0));
    let block = gate.clone();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == HISTORY {
            response.gate = Some(block.clone());
        }
        response
    })
    .await;
    let (sender, task) = start(&service, &fixture).await;
    assert!(matches!(
        service.run_sync(watch::channel(false).1).await,
        Err(AccountError::Busy)
    ));
    let result = command(&service, AccountCommand::Sync {}).await.unwrap();
    assert_eq!(result.account.sync.last_sync, None);
    wait(|| fixture.count(HISTORY) == 1).await;
    stop(&service, sender, task).await;
    gate.add_permits(1);
}

#[tokio::test]
async fn wakeups_coalesce_and_periodic_rounds_do_not_overlap() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let gate = Arc::new(Semaphore::new(0));
    let block = gate.clone();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == HISTORY {
            response.gate = Some(block.clone());
        }
        response
    })
    .await;
    configure(
        &service,
        &fixture,
        Duration::from_millis(20),
        Duration::from_secs(3),
    );
    let (sender, receiver) = watch::channel(false);
    let worker = service.clone();
    let task = tokio::spawn(async move { worker.run_sync(receiver).await });
    wait(|| fixture.count(HISTORY) == 1).await;
    for _ in 0..20 {
        service.sync.wake();
    }
    tokio::time::sleep(Duration::from_millis(45)).await;
    assert_eq!(fixture.count(HISTORY), 1);
    gate.add_permits(1);
    wait(|| fixture.count(HISTORY) == 2).await;
    assert_eq!(fixture.count(FAVORITES), 1);
    stop(&service, sender, task).await;
    gate.add_permits(1);
}

#[tokio::test]
async fn import_is_explicit_idempotent_scope_bound_and_logout_restores_guest() {
    let temp = Temp::new();
    let service = temp.open().await;
    write(&service, SERIES, 10.0).await;
    assert!(matches!(
        command(&service, AccountCommand::ImportGuestHistory {}).await,
        Err(AccountError::IdentityMismatch)
    ));
    switch(&service, UID).await;
    let before = service.state().await.unwrap();
    assert!(before.library.entries.is_empty());
    assert_eq!(before.account.guest_history.unwrap().available, 1);
    let imported = command(&service, AccountCommand::ImportGuestHistory {})
        .await
        .unwrap();
    assert_eq!(imported.import_history.as_ref().unwrap().imported, 1);
    assert_eq!(imported.account.sync.pending, 1);
    assert_eq!(imported.account.guest_history.unwrap().available, 0);
    assert_eq!(imported.library.entries[0].position, Some(10.0));
    let repeated = command(&service, AccountCommand::ImportGuestHistory {})
        .await
        .unwrap();
    assert_eq!(repeated.import_history.unwrap().imported, 0);
    assert_eq!(service.state().await.unwrap().library.entries.len(), 1);
    let out = command(&service, AccountCommand::Logout {}).await.unwrap();
    assert_eq!(out.library.entries, imported.library.entries);
    assert_eq!(out.account.sync.state, AccountSyncState::Local);
    assert!(matches!(
        service
            .command(AccountCommandRequest {
                owner_id: before.account.owner_id,
                owner_epoch: before.account.owner_epoch,
                command: AccountCommand::ImportGuestHistory {}
            })
            .await,
        Err(AccountError::OwnerChanged)
    ));
}

#[tokio::test]
async fn unavailable_guest_counts_are_cleared_instead_of_reusing_previous_success() {
    let temp = Temp::new();
    let service = temp.open().await;
    write(&service, SERIES, 10.0).await;
    switch(&service, UID).await;
    assert_eq!(service.snapshot().await.guest_history.unwrap().available, 1);
    let guest = Connection::open(temp.0.join("guest.sqlite3")).unwrap();
    guest
        .execute_batch("ALTER TABLE history RENAME TO unavailable_history")
        .unwrap();
    let account = service.snapshot().await;
    assert!(account.guest_history.is_none());
    assert_eq!(account.sync.state, AccountSyncState::Error);
    assert!(matches!(service.state().await, Err(AccountError::Library)));
}

#[tokio::test]
async fn complete_remote_snapshot_merges_real_protocol_rows_without_uploading_remote_only_progress()
{
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let wire: Value =
        serde_json::from_str(include_str!("../passport/cloud/fixtures/library.json")).unwrap();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        let key = match request.path.as_str() {
            HISTORY => "history",
            FAVORITES => "favorites",
            "/reading/bookapi/read_progress/get/v" => "progress",
            "/novel/player/multi_video_detail/preload/v1" => "metadata",
            _ => return response,
        };
        response.body = wire[key].clone();
        response
    })
    .await;
    let (sender, task) = start(&service, &fixture).await;
    assert_eq!(settled(&service).await.sync.state, AccountSyncState::Idle);
    let state = service.state().await.unwrap();
    assert_eq!(state.library.entries.len(), 1);
    assert_eq!(state.library.favorites.len(), 2);
    assert_eq!(state.library.entries[0].drama.series_id, SERIES);
    assert_eq!(state.library.entries[0].position, Some(12.5));
    assert_eq!(fixture.count(UPLOAD), 0);
    stop(&service, sender, task).await;
}

#[tokio::test]
async fn partial_import_remaining_is_authoritative_after_response_loss_and_retry() {
    let temp = Temp::new();
    let service = temp.open().await;
    for id in ["8001", "8002", "8003"] {
        write(&service, id, 10.0).await;
    }
    let original = service.state().await.unwrap().library;
    switch(&service, UID).await;
    let mut db = temp.library_db();
    let tx = db.transaction().unwrap();
    for sequence in 1..=1999 {
        tx.execute("INSERT INTO sync_outbox(sequence,kind,series_id,payload_json) VALUES(?1,'favorite',?2,?3)", rusqlite::params![sequence, sequence.to_string(), r#"{"favorite":{"value":false}}"#]).unwrap();
    }
    tx.execute("UPDATE sync_state SET sequence=1999", [])
        .unwrap();
    tx.commit().unwrap();
    // Discard the successful response exactly as a transport can; state and watermarks survive.
    let result = command(&service, AccountCommand::ImportGuestHistory {})
        .await
        .unwrap();
    assert_eq!(
        result.import_history.unwrap(),
        GuestHistoryImportResult {
            imported: 1,
            remaining: 2
        }
    );
    assert_eq!(
        service
            .state()
            .await
            .unwrap()
            .account
            .guest_history
            .unwrap()
            .available,
        2
    );
    assert!(matches!(
        command(&service, AccountCommand::ImportGuestHistory {}).await,
        Err(AccountError::LibrarySyncQueueFull)
    ));
    db.execute("DELETE FROM sync_outbox WHERE sequence<=1999", [])
        .unwrap();
    let retry = command(&service, AccountCommand::ImportGuestHistory {})
        .await
        .unwrap();
    assert_eq!(
        retry.import_history.unwrap(),
        GuestHistoryImportResult {
            imported: 2,
            remaining: 0
        }
    );
    assert_eq!(retry.library.entries.len(), 3);
    assert_eq!(retry.account.sync.pending, 3);
    assert_eq!(
        command(&service, AccountCommand::Logout {})
            .await
            .unwrap()
            .library,
        original
    );
}

#[tokio::test]
async fn cancelled_import_waiter_drains_admitted_transaction_and_retry_does_not_duplicate() {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
    };
    let temp = Temp::new();
    let service = temp.open().await;
    write(&service, SERIES, 10.0).await;
    switch(&service, UID).await;
    let account = service.snapshot().await;
    let gate = temp.library_db();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut importing = Box::pin(service.command(AccountCommandRequest {
        owner_id: account.owner_id,
        owner_epoch: account.owner_epoch,
        command: AccountCommand::ImportGuestHistory {},
    }));
    assert!(matches!(
        importing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(importing);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), service.state())
            .await
            .is_err()
    );
    gate.execute_batch("COMMIT").unwrap();
    let reconciled = service.state().await.unwrap();
    assert_eq!(reconciled.library.entries.len(), 1);
    assert_eq!(reconciled.account.sync.pending, 1);
    assert_eq!(
        command(&service, AccountCommand::ImportGuestHistory {})
            .await
            .unwrap()
            .import_history
            .unwrap()
            .imported,
        0
    );
}

#[tokio::test]
async fn import_waits_for_the_admitted_guest_checkpoint_before_taking_its_snapshot() {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
    };
    let temp = Temp::new();
    let service = temp.open().await;
    write(&service, SERIES, 10.0).await;
    switch(&service, UID).await;
    let account = service.snapshot().await;
    let guest = service.state.lock().await.guest.clone();
    let session = guest
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(String::new()),
        })
        .await
        .unwrap();
    let gate = Connection::open(temp.0.join("guest.sqlite3")).unwrap();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut checkpoint = Box::pin(guest.apply_operation(
        LibraryOperationIdentity {
            session_id: session.session_id,
            operation_id: "1".into(),
        },
        change("", SERIES, 99.0),
    ));
    assert!(matches!(
        checkpoint
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(checkpoint);
    let importing_service = service.clone();
    let importing = tokio::spawn(async move {
        importing_service
            .command(AccountCommandRequest {
                owner_id: account.owner_id,
                owner_epoch: account.owner_epoch,
                command: AccountCommand::ImportGuestHistory {},
            })
            .await
    });
    // Reserved SQLite writers leave reads available, so only the write registry can provide this barrier.
    tokio::time::sleep(Duration::from_millis(20)).await;
    assert!(!importing.is_finished());
    gate.execute_batch("COMMIT").unwrap();
    let result = importing.await.unwrap().unwrap();
    assert_eq!(result.library.entries[0].position, Some(99.0));
}

#[tokio::test]
async fn dropped_committed_write_response_wakes_worker_but_failed_receipt_does_not() {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
    };
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let fixture = Fixture::new(Response::normal).await;
    let (sender, task) = start(&service, &fixture).await;
    settled(&service).await;
    let session = service
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(UID.into()),
        })
        .await
        .unwrap();
    let gate = temp.library_db();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut writing = Box::pin(service.apply_operation(
        LibraryOperationIdentity {
            session_id: session.session_id,
            operation_id: "1".into(),
        },
        change(UID, SERIES, 10.0),
    ));
    assert!(matches!(
        writing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        Poll::Pending
    ));
    drop(writing);
    gate.execute_batch("COMMIT").unwrap();
    wait(|| fixture.count(PROGRESS) == 1).await;
    wait(|| fixture.count(HISTORY) == 2).await;
    // Drain round completion before introducing the independent failure.
    let _ = service.state().await.unwrap();
    gate.execute_batch("CREATE TRIGGER reject_history BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT,'fixture'); END;").unwrap();
    let session = service
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(UID.into()),
        })
        .await
        .unwrap();
    let failed = service
        .apply_operation(
            LibraryOperationIdentity {
                session_id: session.session_id,
                operation_id: "1".into(),
            },
            change(UID, "2", 20.0),
        )
        .await
        .unwrap();
    assert!(matches!(
        failed.outcome,
        LibraryOperationOutcome::Failed { .. }
    ));
    tokio::time::sleep(Duration::from_millis(15)).await;
    assert_eq!(fixture.count(HISTORY), 2);
    stop(&service, sender, task).await;
}

#[tokio::test]
async fn timeout_fences_the_continuation_of_an_admitted_credential_save() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let original = service
        .state
        .lock()
        .await
        .saved
        .as_ref()
        .unwrap()
        .credential
        .fixture_token();
    let gate = temp.account_db();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let fixture = Fixture::new(Response::normal).await;
    configure(
        &service,
        &fixture,
        Duration::from_secs(60),
        Duration::from_millis(200),
    );
    let (sender, receiver) = watch::channel(false);
    let worker = service.clone();
    let task = tokio::spawn(async move { worker.run_sync(receiver).await });
    tokio::time::timeout(Duration::from_secs(1), service.sync.save_started.notified())
        .await
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(230), service.state())
            .await
            .is_err()
    );
    // The admitted write can finish; it cannot then publish memory or start mark_synced.
    gate.execute_batch("COMMIT").unwrap();
    let account = settled(&service).await;
    assert_eq!(account.sync.state, AccountSyncState::Error);
    assert_eq!(account.sync.last_sync, None);
    assert_eq!(
        service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        original
    );
    stop(&service, sender, task).await;
}

#[tokio::test]
async fn graceful_shutdown_waits_for_admitted_storage_and_fences_later_publication() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let original = service
        .state
        .lock()
        .await
        .saved
        .as_ref()
        .unwrap()
        .credential
        .fixture_token();
    let gate = temp.account_db();
    gate.execute_batch("BEGIN IMMEDIATE").unwrap();
    let fixture = Fixture::new(Response::normal).await;
    let (sender, task) = start(&service, &fixture).await;
    tokio::time::timeout(Duration::from_secs(1), service.sync.save_started.notified())
        .await
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(20), service.state())
            .await
            .is_err()
    );
    service.stop_sync();
    sender.send(true).unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert!(!task.is_finished());
    gate.execute_batch("COMMIT").unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(service.snapshot().await.sync.last_sync, None);
    assert_eq!(
        service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential
            .fixture_token(),
        original
    );
}

#[tokio::test]
async fn favorite_only_rejection_keeps_pending_and_explicit_retry_acks_without_history() {
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, UID).await;
    let session = service
        .write_session(LibraryWriteSessionRequest {
            owner_id: Some(UID.into()),
        })
        .await
        .unwrap();
    let receipt = service
        .apply_operation(
            LibraryOperationIdentity {
                session_id: session.session_id,
                operation_id: "1".into(),
            },
            HistoryChange::Favorite {
                owner_id: Some(UID.into()),
                drama: Drama {
                    series_id: SERIES.into(),
                    title: "Synthetic favorite".into(),
                    ..Default::default()
                },
                value: true,
            },
        )
        .await
        .unwrap();
    assert!(matches!(
        receipt.outcome,
        LibraryOperationOutcome::Committed { .. }
    ));
    let rejected = Arc::new(AtomicBool::new(true));
    let rejection = rejected.clone();
    let fixture = Fixture::new(move |request| {
        let mut response = Response::normal(request);
        if request.path == "/reading/bookapi/bookshelf/video/update/v"
            && rejection.load(Ordering::Acquire)
        {
            response.body = json!({"code":9});
        }
        response
    })
    .await;
    let (sender, task) = start(&service, &fixture).await;
    let failed = settled(&service).await;
    assert_eq!(failed.sync.state, AccountSyncState::Error);
    assert_eq!(failed.sync.pending, 1);
    rejected.store(false, Ordering::Release);
    command(&service, AccountCommand::Sync {}).await.unwrap();
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            if service.snapshot().await.sync.last_sync.is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    let result = service.state().await.unwrap();
    assert_eq!(result.account.sync.pending, 0);
    assert_eq!(result.library.favorites.len(), 1);
    assert!(result.library.entries.is_empty());
    assert_eq!(fixture.count(UPLOAD), 0);
    assert_eq!(fixture.count(PROGRESS), 0);
    assert_eq!(
        fixture.count("/reading/bookapi/bookshelf/video/update/v"),
        2
    );
    stop(&service, sender, task).await;
}
