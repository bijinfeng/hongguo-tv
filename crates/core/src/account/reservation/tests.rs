//! Disposable boundary regressions, not real-account reservation acceptance.
use super::*;
use crate::account::{
    passport::follow_fixture as wire,
    service::follow::tests::{Temp, attach, switch},
};
use serde_json::{Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tokio::sync::Semaphore;
const ITEM: &str = "7692049770637954110";
const SERIES: &str = "7690163276214176792";
const SET: &str = "/reading/bookapi/search/uncover_subscribe/v";
async fn query(service: &AccountService) -> ReservationQuery {
    let account = service.snapshot().await;
    ReservationQuery {
        owner_id: account.owner_id,
        owner_epoch: account.owner_epoch,
    }
}
fn request(
    query: &ReservationQuery,
    target: ReservationTarget,
    enabled: bool,
) -> ReservationMutationRequest {
    ReservationMutationRequest {
        owner_id: query.owner_id.clone(),
        owner_epoch: query.owner_epoch.clone(),
        target,
        enabled,
    }
}
fn item_target() -> ReservationTarget {
    ReservationTarget::Item { id: ITEM.into() }
}
fn list(r: &wire::Request, rows: Vec<Value>) -> Value {
    json!({"code":0,"data":{"has_more":false,"subscribe_items":if r.query["is_online"]=="true"{vec![]}else{rows}}})
}
#[test]
fn target_contract_is_explicit_and_closed_with_exact_numeric_range() {
    for id in ["1", "9223372036854775807", ITEM] {
        assert!(valid_reservation_id(id));
    }
    for id in ["0", "01", "-1", "+1", " 1", "1.0", "9223372036854775808"] {
        assert!(!valid_reservation_id(id));
    }
    for value in [
        json!({"kind":"calendar","id":ITEM}),
        json!({"kind":"item","id":ITEM,"url":"https://evil.invalid"}),
        json!({"kind":"series","id":1}),
    ] {
        assert!(serde_json::from_value::<ReservationTarget>(value).is_err());
    }
    let item = serde_json::to_value(ReservationItem::default()).unwrap();
    assert!(item.get("reservation_id").is_none());
    assert!(item.get("series_id").is_none());
    assert!(item.get("drama").is_none());
}
#[tokio::test]
async fn guest_wrong_scope_and_invalid_target_never_dispatch() {
    let fixture = wire::Fixture::new(|_| panic!("precondition must reject before network")).await;
    let temp = Temp::new();
    let service = temp.open().await;
    attach(&service, &fixture);
    let guest = query(&service).await;
    assert_eq!(
        service.reservation_snapshot(guest.clone()).await,
        Err(AccountError::ReservationLoginRequired)
    );
    assert_eq!(
        service
            .set_reservation(request(&guest, item_target(), true))
            .await,
        Err(AccountError::ReservationLoginRequired)
    );
    let mut wrong = guest.clone();
    wrong.owner_epoch.push('x');
    assert_eq!(
        service.reservation_snapshot(wrong).await,
        Err(AccountError::OwnerChanged)
    );
    assert_eq!(
        service
            .set_reservation(request(
                &guest,
                ReservationTarget::Item { id: "01".into() },
                true
            ))
            .await,
        Err(AccountError::InvalidInput)
    );
    assert!(fixture.requests.lock().unwrap().is_empty());
}
#[tokio::test]
async fn exact_item_and_series_goals_require_sufficient_positive_or_negative_evidence() {
    for (target, rows, enabled, confirmed) in [
        (item_target(), vec![json!({"item_id":ITEM})], true, true),
        (item_target(), vec![], false, true),
        (
            item_target(),
            vec![json!({"subscribe_data":{"series_id":ITEM}})],
            false,
            false,
        ),
        (
            ReservationTarget::Series { id: SERIES.into() },
            vec![json!({"item_id":SERIES})],
            true,
            false,
        ),
        (
            ReservationTarget::Series { id: SERIES.into() },
            vec![json!({"item_id":ITEM})],
            false,
            false,
        ),
        (
            ReservationTarget::Series { id: SERIES.into() },
            vec![json!({"item_id":ITEM,"subscribe_data":{"series_id":SERIES}})],
            true,
            true,
        ),
        (
            ReservationTarget::Series { id: SERIES.into() },
            vec![json!({"item_id":ITEM,"subscribe_data":{"series_id":"123"}})],
            false,
            true,
        ),
    ] {
        let fixture = wire::Fixture::new(move |r| {
            wire::Response::json(if r.path == SET {
                json!({"code":0})
            } else {
                list(r, rows.clone())
            })
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let scope = query(&service).await;
        let result = service
            .set_reservation(request(&scope, target, enabled))
            .await
            .unwrap();
        assert!(result.acknowledged);
        assert_eq!(result.confirmed, confirmed);
        assert!(result.snapshot.is_some());
        assert!(result.reconciliation_error.is_none());
        let library = service.library_snapshot(Some(wire::UID)).await.unwrap();
        assert!(library.entries.is_empty() && library.favorites.is_empty());
        assert_eq!(service.snapshot().await.sync.pending, 0);
    }
}
#[tokio::test]
async fn confirmed_roundtrip_reopens_remote_membership_and_preserves_ack_refresh_on_read_failure() {
    let present = Arc::new(AtomicBool::new(false));
    let remote = present.clone();
    let fixture = wire::Fixture::new(move |r| {
        if r.path == SET {
            remote.store(r.body["op_type"] == 1, Ordering::Release);
            let mut response = wire::Response::json(json!({"code":0}));
            response.token = Some("synthetic-reservation-refresh");
            response
        } else {
            wire::Response::json(list(
                r,
                if remote.load(Ordering::Acquire) {
                    vec![json!({"item_id":ITEM,"subscribe_data":{"series_id":SERIES}})]
                } else {
                    vec![]
                },
            ))
        }
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let scope = query(&service).await;
    assert!(
        service
            .set_reservation(request(&scope, item_target(), true))
            .await
            .unwrap()
            .confirmed
    );
    drop(service);
    let service = temp.open().await;
    attach(&service, &fixture);
    let scope = query(&service).await;
    assert_eq!(
        service
            .reservation_snapshot(scope.clone())
            .await
            .unwrap()
            .items
            .len(),
        1
    );
    assert!(
        service
            .set_reservation(request(&scope, item_target(), false))
            .await
            .unwrap()
            .confirmed
    );
    drop(service);
    let fixture = wire::Fixture::new(|r| {
        let mut response = wire::Response::json(if r.path == SET {
            json!({"code":0})
        } else {
            json!({"code":0,"data":{}})
        });
        if r.path == SET {
            response.token = Some("newer-reservation-ack");
        }
        response
    })
    .await;
    let service = temp.open().await;
    attach(&service, &fixture);
    let scope = query(&service).await;
    let result = service
        .set_reservation(request(&scope, item_target(), true))
        .await
        .unwrap();
    assert!(result.acknowledged && !result.confirmed);
    assert!(result.snapshot.is_none() && result.reconciliation_error.is_some());
    drop(service);
    let service = temp.open().await;
    let state = service.state.lock().await;
    let credential = serde_json::to_value(&state.saved.as_ref().unwrap().credential).unwrap();
    assert_eq!(credential["token"], "newer-reservation-ack");
}
#[tokio::test]
async fn rejection_and_unknown_ack_never_become_success_or_automatic_reposts() {
    for mode in 0..3 {
        let fixture = wire::Fixture::new(move |r| {
            let mut response = wire::Response::json(if r.path == SET {
                if mode == 0 {
                    json!({"code":7})
                } else if mode == 1 {
                    json!({"code":"bad"})
                } else {
                    json!({"code":0})
                }
            } else {
                list(r, vec![])
            });
            response.close = mode == 2 && r.path == SET;
            response
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, wire::UID).await;
        attach(&service, &fixture);
        let scope = query(&service).await;
        assert_eq!(
            service
                .set_reservation(request(&scope, item_target(), true))
                .await,
            Err(if mode == 0 {
                AccountError::ReservationRejected
            } else {
                AccountError::ReservationUncertain
            })
        );
        service.reservation_snapshot(scope).await.unwrap();
        assert_eq!(
            fixture
                .requests
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r.path == SET)
                .count(),
            1
        );
    }
}
#[tokio::test]
async fn admitted_mutation_survives_caller_loss_and_orders_follow_reads_and_other_writes() {
    let gate = Arc::new(Semaphore::new(0));
    let blocked = gate.clone();
    let fixture = wire::Fixture::new(move |r| {
        let mut response = wire::Response::json(if r.path == SET {
            json!({"code":0})
        } else if r.query.get("tab_type").is_some_and(|v| v == "14") {
            wire::membership(false)
        } else {
            list(r, vec![json!({"item_id":ITEM})])
        });
        if r.path == SET {
            response.gate = Some(blocked.clone());
        }
        response
    })
    .await;
    let temp = Temp::new();
    let service = temp.open().await;
    switch(&service, wire::UID).await;
    attach(&service, &fixture);
    let scope = query(&service).await;
    let writer = {
        let service = service.clone();
        let req = request(&scope, item_target(), true);
        tokio::spawn(async move { service.set_reservation(req).await })
    };
    fixture.next_request().await;
    writer.abort();
    let _ = writer.await;
    assert_eq!(
        service
            .set_reservation(request(&scope, item_target(), false))
            .await,
        Err(AccountError::ReservationBusy)
    );
    assert_eq!(
        service
            .set_follow(crate::account::FollowMutationRequest {
                owner_id: scope.owner_id.clone(),
                owner_epoch: scope.owner_epoch.clone(),
                series_id: SERIES.into(),
                enabled: true
            })
            .await,
        Err(AccountError::FollowBusy)
    );
    let reader = {
        let service = service.clone();
        tokio::spawn(async move {
            service
                .follow_snapshot(crate::account::FollowQuery {
                    owner_id: scope.owner_id,
                    owner_epoch: scope.owner_epoch,
                })
                .await
        })
    };
    tokio::task::yield_now().await;
    assert!(!reader.is_finished());
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    gate.add_permits(1);
    tokio::time::timeout(Duration::from_secs(3), reader)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == SET)
            .count(),
        1
    );
}
#[tokio::test]
async fn transitions_shutdown_and_timeout_discard_reservation_results() {
    for mode in 0..4 {
        let gate = Arc::new(Semaphore::new(0));
        let blocked = gate.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let fixture = wire::Fixture::new(move |r| {
            let mut response = wire::Response::json(if r.path == SET {
                json!({"code":0})
            } else {
                list(r, vec![])
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
        if mode == 3 {
            *service.online.timeout.lock().unwrap() = Duration::from_millis(20);
            assert_eq!(
                service.reservation_snapshot(old).await,
                Err(AccountError::ReservationUnavailable)
            );
        } else {
            let writer = {
                let service = service.clone();
                let req = request(&old, item_target(), true);
                tokio::spawn(async move { service.set_reservation(req).await })
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
                tokio::time::timeout(Duration::from_secs(3), writer)
                    .await
                    .unwrap()
                    .unwrap(),
                Err(AccountError::OwnerChanged)
            );
        }
        gate.add_permits(1);
        service.online.drain().await;
        assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    }
}
