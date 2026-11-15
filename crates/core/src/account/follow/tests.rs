//! Coordinator and disposable SQLite/loopback boundary tests, not real-account acceptance.
use super::*;
use crate::account::{AccountProfile, passport::follow_fixture as wire, persistence::SavedSession};
use crate::library::LibraryStore;
use serde_json::json;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, AtomicUsize},
};
use tokio::sync::Semaphore;

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-follow-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    async fn open(&self) -> AccountService {
        AccountService::open(
            &self.0,
            LibraryStore::open(self.0.join("guest.sqlite3"))
                .await
                .unwrap(),
        )
        .await
        .unwrap()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
async fn switch(service: &AccountService, owner: &str) {
    let verified = crate::account::passport::verified_fixture(owner);
    let saved = SavedSession {
        profile: AccountProfile {
            uid: verified.uid,
            name: verified.name,
        },
        credential: verified.credential,
    };
    let library = LibraryStore::open_for_owner(
        service
            .directory
            .join("accounts")
            .join(format!("{owner}.sqlite3")),
        owner.into(),
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
async fn query(service: &AccountService) -> FollowQuery {
    let account = service.snapshot().await;
    FollowQuery {
        owner_id: account.owner_id,
        owner_epoch: account.owner_epoch,
    }
}
fn mutation(query: &FollowQuery, enabled: bool) -> FollowMutationRequest {
    FollowMutationRequest {
        owner_id: query.owner_id.clone(),
        owner_epoch: query.owner_epoch.clone(),
        series_id: wire::SERIES.into(),
        enabled,
    }
}
fn attach(service: &AccountService, fixture: &wire::Fixture) {
    *service.follow.fixture.lock().unwrap() = Some(fixture.origin.clone());
}

#[tokio::test]
async fn guest_wrong_scope_invalid_id_and_stopped_service_never_dispatch() {
    let fixture = wire::Fixture::new(|_| panic!("precondition must reject before network")).await;
    let temp = Temp::new();
    let service = temp.open().await;
    attach(&service, &fixture);
    let guest = query(&service).await;
    assert_eq!(
        service.follow_snapshot(guest.clone()).await,
        Err(AccountError::FollowLoginRequired)
    );
    assert_eq!(
        service.set_follow(mutation(&guest, true)).await,
        Err(AccountError::FollowLoginRequired)
    );
    let mut wrong = guest.clone();
    wrong.owner_epoch.push('a');
    assert_eq!(
        service.follow_snapshot(wrong).await,
        Err(AccountError::OwnerChanged)
    );
    let mut bad = mutation(&guest, true);
    bad.series_id = "0".into();
    assert_eq!(
        service.set_follow(bad).await,
        Err(AccountError::InvalidInput)
    );
    switch(&service, wire::UID).await;
    let owner = query(&service).await;
    service.stop_sync();
    assert_eq!(
        service.follow_snapshot(owner.clone()).await,
        Err(AccountError::OwnerChanged)
    );
    assert_eq!(
        service.set_follow(mutation(&owner, true)).await,
        Err(AccountError::OwnerChanged)
    );
    assert!(fixture.requests.lock().unwrap().is_empty());
}
#[tokio::test]
async fn confirmed_add_cancel_and_restart_use_only_remote_membership() {
    let present = Arc::new(AtomicBool::new(false));
    let remote = present.clone();
    let fixture = wire::Fixture::new(move |r| {
        if r.path == wire::SET {
            remote.store(r.body["op_type"] == 1, Ordering::Release);
            wire::Response::json(json!({"code":0,"data":{}}))
        } else {
            assert_eq!(r.path, wire::LIST);
            wire::Response::json(wire::membership(remote.load(Ordering::Acquire)))
        }
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let owner = query(&service).await;
    assert!(
        service
            .follow_snapshot(owner.clone())
            .await
            .unwrap()
            .items
            .is_empty()
    );
    let result = service.set_follow(mutation(&owner, true)).await.unwrap();
    assert!(result.acknowledged && result.confirmed);
    assert!(
        result
            .snapshot
            .unwrap()
            .items
            .iter()
            .any(|i| i.series_id == wire::SERIES)
    );
    let library = service.library_snapshot(Some(wire::UID)).await.unwrap();
    assert!(library.entries.is_empty());
    assert!(library.favorites.is_empty());
    assert_eq!(service.snapshot().await.sync.pending, 0);
    drop(service);
    let service = temp.open().await;
    attach(&service, &fixture);
    let owner = query(&service).await;
    assert_eq!(
        service
            .follow_snapshot(owner.clone())
            .await
            .unwrap()
            .items
            .len(),
        1
    );
    let result = service.set_follow(mutation(&owner, false)).await.unwrap();
    assert!(result.acknowledged && result.confirmed);
    assert!(result.snapshot.unwrap().items.is_empty());
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == wire::SET)
            .count(),
        2
    );
}
#[tokio::test]
async fn admitted_write_outlives_lost_caller_and_read_waits_without_resending() {
    let gate = Arc::new(Semaphore::new(0));
    let blocked = gate.clone();
    let fixture = wire::Fixture::new(move |r| {
        if r.path == wire::SET {
            let mut response = wire::Response::json(json!({"code":0}));
            response.gate = Some(blocked.clone());
            response
        } else {
            wire::Response::json(wire::membership(true))
        }
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let owner = query(&service).await;
    let writer = {
        let service = service.clone();
        let request = mutation(&owner, true);
        tokio::spawn(async move { service.set_follow(request).await })
    };
    fixture.next_request().await;
    writer.abort();
    let _ = writer.await;
    assert_eq!(
        service.set_follow(mutation(&owner, false)).await,
        Err(AccountError::FollowBusy)
    );
    let reader = {
        let service = service.clone();
        let owner = owner.clone();
        tokio::spawn(async move { service.follow_snapshot(owner).await })
    };
    tokio::task::yield_now().await;
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    assert!(!reader.is_finished());
    gate.add_permits(1);
    let snapshot = tokio::time::timeout(Duration::from_secs(3), reader)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == wire::SET)
            .count(),
        1
    );
}
#[tokio::test]
async fn missing_ack_is_unknown_and_reconciliation_never_reposts() {
    let fixture = wire::Fixture::new(|r| {
        let mut response = wire::Response::json(if r.path == wire::SET {
            json!({"code":0})
        } else {
            wire::membership(true)
        });
        response.close = r.path == wire::SET;
        response
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let owner = query(&service).await;
    assert_eq!(
        service.set_follow(mutation(&owner, true)).await,
        Err(AccountError::FollowUncertain)
    );
    assert_eq!(service.follow_snapshot(owner).await.unwrap().items.len(), 1);
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == wire::SET)
            .count(),
        1
    );
}
#[tokio::test]
async fn malformed_ack_is_unknown_without_readback_or_retry() {
    for payload in [json!({"code":"invalid"}), json!({"data":{}})] {
        let fixture = wire::Fixture::new(move |_| wire::Response::json(payload.clone())).await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let owner = query(&service).await;
        assert_eq!(
            service.set_follow(mutation(&owner, true)).await,
            Err(AccountError::FollowUncertain)
        );
        let requests = fixture.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].path, wire::SET);
    }
}

#[tokio::test]
async fn follow_refresh_is_persisted_and_storage_failure_never_publishes_success() {
    for failure in [false, true] {
        let fixture = wire::Fixture::new(|_| {
            let mut response = wire::Response::json(wire::membership(true));
            response.token = Some("synthetic-follow-refresh");
            response
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        if failure {
            rusqlite::Connection::open(temp.0.join("account.sqlite3")).unwrap()
                .execute_batch("CREATE TRIGGER fail_follow BEFORE UPDATE ON session BEGIN SELECT RAISE(ABORT,'fixture'); END;")
                .unwrap();
        }
        let owner = query(&service).await;
        let result = service.follow_snapshot(owner).await;
        if failure {
            assert_eq!(result, Err(AccountError::Storage));
        } else {
            assert_eq!(result.unwrap().items.len(), 1);
        }
        drop(service);
        let reopened = temp.open().await;
        let state = reopened.state.lock().await;
        let credential = serde_json::to_value(&state.saved.as_ref().unwrap().credential).unwrap();
        assert_eq!(credential["token"] == "synthetic-follow-refresh", !failure);
    }
}
#[tokio::test]
async fn acknowledged_refresh_survives_failed_readback_and_later_refresh_uses_new_baseline() {
    for readback_fails in [false, true] {
        let reads = Arc::new(AtomicUsize::new(0));
        let seen = reads.clone();
        let fixture = wire::Fixture::new(move |request| {
            if request.path == wire::SET {
                let mut response = wire::Response::json(json!({"code":0}));
                response.token = Some("synthetic-ack-refresh");
                return response;
            }
            let first = seen.fetch_add(1, Ordering::SeqCst) == 0;
            let expected = if first || readback_fails {
                "synthetic-ack-refresh"
            } else {
                "synthetic-readback-refresh"
            };
            assert_eq!(request.token.as_deref(), Some(expected));
            let mut response = wire::Response::json(if first && readback_fails {
                json!({"code":0,"data":{}})
            } else {
                wire::membership(true)
            });
            if first && !readback_fails {
                response.token = Some("synthetic-readback-refresh");
            }
            response
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let owner = query(&service).await;
        let result = service.set_follow(mutation(&owner, true)).await.unwrap();
        assert!(result.acknowledged);
        assert_eq!(result.confirmed, !readback_fails);
        assert_eq!(result.reconciliation_error.is_some(), readback_fails);
        drop(service);
        let reopened = temp.open().await;
        attach(&reopened, &fixture);
        let owner = query(&reopened).await;
        assert_eq!(
            reopened.follow_snapshot(owner).await.unwrap().items.len(),
            1
        );
        assert_eq!(
            fixture
                .requests
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r.path == wire::SET)
                .count(),
            1
        );
    }
}

#[tokio::test]
async fn acknowledgement_does_not_invent_confirmation_and_rejection_stays_rejected() {
    for mode in 0..3 {
        let fixture = wire::Fixture::new(move |r| {
            wire::Response::json(if r.path == wire::SET {
                if mode == 2 {
                    json!({"code":7,"message":"private-body"})
                } else {
                    json!({"code":0})
                }
            } else if mode == 0 {
                wire::membership(false)
            } else {
                json!({"code":0,"data":{}})
            })
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let owner = query(&service).await;
        let result = service.set_follow(mutation(&owner, true)).await;
        if mode == 2 {
            assert_eq!(result, Err(AccountError::FollowRejected));
            assert_eq!(fixture.requests.lock().unwrap().len(), 1);
        } else {
            let result = result.unwrap();
            assert!(result.acknowledged);
            assert!(!result.confirmed);
            assert_eq!(result.snapshot.is_some(), mode == 0);
            assert_eq!(result.reconciliation_error.is_some(), mode == 1);
            assert!(
                !serde_json::to_string(&result)
                    .unwrap()
                    .contains("private-body")
            );
        }
    }
}
#[tokio::test]
async fn owner_transitions_and_shutdown_cancel_old_follow_work() {
    for mode in 0..3 {
        let gate = Arc::new(Semaphore::new(0));
        let blocked = gate.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let fixture = wire::Fixture::new(move |r| {
            let mut response = wire::Response::json(if r.path == wire::SET {
                json!({"code":0})
            } else {
                wire::membership(false)
            });
            if seen.fetch_add(1, Ordering::SeqCst) == 0 {
                response.gate = Some(blocked.clone());
            }
            response
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let old = query(&service).await;
        let work = {
            let service = service.clone();
            let old = old.clone();
            tokio::spawn(async move { service.set_follow(mutation(&old, true)).await })
        };
        fixture.next_request().await;
        if mode == 0 {
            switch(&service, "7390000000000000004").await;
            switch(&service, wire::UID).await;
        } else if mode == 1 {
            let guest = service.state.lock().await.guest.clone();
            service
                .commit(service.state.clone().lock_owned().await, None, guest)
                .await
                .unwrap();
        } else {
            service.stop_sync();
        }
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(3), work)
                .await
                .unwrap()
                .unwrap(),
            Err(AccountError::OwnerChanged)
        );
        gate.add_permits(1);
        service.follow.drain().await;
        assert_eq!(fixture.requests.lock().unwrap().len(), 1);
        if mode == 0 {
            let current = query(&service).await;
            assert_ne!(current.owner_epoch, old.owner_epoch);
            assert!(
                service
                    .follow_snapshot(current)
                    .await
                    .unwrap()
                    .items
                    .is_empty()
            );
        }
    }
}
#[tokio::test]
async fn follow_timeout_has_no_false_snapshot_or_automatic_write_retry() {
    let gate = Arc::new(Semaphore::new(0));
    let blocked = gate.clone();
    let fixture = wire::Fixture::new(move |_| {
        let mut response = wire::Response::json(wire::membership(true));
        response.gate = Some(blocked.clone());
        response
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    *service.follow.timeout.lock().unwrap() = Duration::from_millis(20);
    let owner = query(&service).await;
    assert_eq!(
        service.follow_snapshot(owner).await,
        Err(AccountError::FollowUnavailable)
    );
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    gate.add_permits(1);
}
#[tokio::test]
async fn same_epoch_newer_credentials_are_not_overwritten_by_old_follow_response() {
    let gate = Arc::new(Semaphore::new(0));
    let blocked = gate.clone();
    let fixture = wire::Fixture::new(move |_| {
        let mut response = wire::Response::json(wire::membership(false));
        response.gate = Some(blocked.clone());
        response.token = Some("old-follow-refresh");
        response
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let owner = query(&service).await;
    let work = {
        let service = service.clone();
        tokio::spawn(async move { service.follow_snapshot(owner).await })
    };
    fixture.next_request().await;
    {
        let mut state = service.state.lock().await;
        let saved = state.saved.as_mut().unwrap();
        let mut value = serde_json::to_value(&saved.credential).unwrap();
        value["token"] = json!("newer-sync-refresh");
        saved.credential = serde_json::from_value(value).unwrap();
    }
    gate.add_permits(1);
    work.await.unwrap().unwrap();
    let value = serde_json::to_value(
        &service
            .state
            .lock()
            .await
            .saved
            .as_ref()
            .unwrap()
            .credential,
    )
    .unwrap();
    assert_eq!(value["token"], "newer-sync-refresh");
}

#[test]
fn public_follow_inputs_are_closed_and_optionals_remain_optional() {
    assert!(
        serde_json::from_value::<FollowQuery>(
            json!({"owner_id":wire::UID,"owner_epoch":"e","url":"https://evil.invalid"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<FollowMutationRequest>(
            json!({"owner_id":wire::UID,"owner_epoch":"e","series_id":wire::SERIES})
        )
        .is_err()
    );
    let item = serde_json::to_value(FollowItem {
        series_id: wire::SERIES.into(),
        ..FollowItem::default()
    })
    .unwrap();
    assert_eq!(item, json!({"series_id":wire::SERIES}));
}
