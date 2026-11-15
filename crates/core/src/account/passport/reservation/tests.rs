//! Synthetic protocol and disposable loopback regressions; never real-account acceptance.
use super::*;
use crate::account::passport::follow_fixture::{Fixture, LIST, Response};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
const ITEM: &str = "7692049770637954110";
const SERIES: &str = "7690163276214176792";
const SET: &str = "/reading/bookapi/search/uncover_subscribe/v";
fn client(fixture: &Fixture) -> PassportClient {
    PassportClient::for_loopback_tests(
        crate::account::passport::verified_fixture("7390000000000000003").credential,
        &fixture.origin,
    )
    .unwrap()
}
#[test]
fn members_keep_exact_distinct_identities_without_inventing_playable_upcoming_cards() {
    let nested = member(&json!({"item_id":ITEM,"subscribe_data":{"video_data":{
        "series_id":"1","title":"Outer","video_data":{"series_id":"2","title":"Inner","episode_cnt":1}
    }}}),true).unwrap();
    assert_eq!(nested.series_id.as_deref(), Some("1"));
    assert!(nested.drama.is_none());
    let row=member(&json!({"item_id":ITEM,"is_online":false,"name":"合成待上线", "subscribe_data":{"series_id":SERIES,"title":"合成剧","episode_cnt":1,"vid":"123"},"schedule_publish_time":1791364920,"has_subscribed":false}),false).unwrap();
    assert_eq!(row.reservation_id.as_deref(), Some(ITEM));
    assert_eq!(row.series_id.as_deref(), Some(SERIES));
    assert!(row.drama.is_none());
    assert_eq!(row.publish_time, Some(1791364920));
    let row = member(&json!({"item_id":ITEM}), false).unwrap();
    assert!(row.title.is_none() && row.drama.is_none());
    let row=member(&json!({"item_id":"0","subscribe_data":{"series_id":SERIES,"title":"合成已上线","episode_cnt":12}}),true).unwrap();
    assert!(row.reservation_id.is_none());
    assert!(row.drama.is_some());
    for row in [
        json!({}),
        json!({"item_id":"01"}),
        json!({"item_id":"9223372036854775808"}),
        json!({"item_id":ITEM,"subscribe_data":{"series_id":SERIES,"book_id":"123"}}),
        json!({"item_id":ITEM,"is_online":true}),
    ] {
        assert!(member(&row, false).is_err());
    }
}
#[tokio::test]
async fn lists_carry_real_session_allow_empty_advancing_page_and_use_fixed_step_fallback() {
    let fixture=Fixture::new(|r|{
        assert_eq!(r.path,LIST);assert_eq!(r.method,"GET");
        for (key,value) in [("tab_type","13"),("subscribe_order_type","0"),("swipe_type","0"),("need_calendar_schema","false"),("subscribe_offset","0"),("limit","20")]{assert_eq!(r.query[key],value);}
        let online=r.query["is_online"]=="true";
        let offset=r.query["offset"].as_str();
        let body=match (online,offset){
            (true,"0")=>{assert!(!r.query.contains_key("session_id"));json!({"has_more":true,"next_offset":20,"session_id":"online-snapshot","subscribe_items":[]})},
            (true,"20")=>{assert_eq!(r.query["session_id"],"online-snapshot");json!({"has_more":true,"session_id":"online-snapshot","subscribe_items":[{"item_id":ITEM,"subscribe_data":{"series_id":SERIES,"title":"合成已上线","episode_cnt":12}}]})},
            (true,"40")=>json!({"has_more":false,"subscribe_items":[]}),
            (false,"0")=>{assert!(!r.query.contains_key("session_id"));json!({"has_more":false,"subscribe_items":[{"item_id":"123","subscribe_data":{"series_id":SERIES}}],"online_total_count":1,"offline_total_count":1})},
            _=>panic!("unexpected pagination")
        };
        Response::json(json!({"code":0,"data":body}))
    }).await;
    let (items, online, upcoming) = client(&fixture).pull_reservations(|| true).await.unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].series_id, items[1].series_id);
    assert_ne!(items[0].reservation_id, items[1].reservation_id);
    assert_eq!((online, upcoming), (Some(1), Some(1)));
    assert_eq!(fixture.requests.lock().unwrap().len(), 4);
}
#[tokio::test]
async fn later_group_failure_stalls_bad_identity_and_aggregate_budgets_never_return_partial() {
    for mode in 0..5 {
        let fixture = Fixture::new(move |r| {
            let online = r.query["is_online"] == "true";
            let data = if online {
                json!({"has_more":false,"subscribe_items":[{"item_id":ITEM}]})
            } else {
                match mode {
                    0 => json!({"has_more":true,"subscribe_items":[]}),
                    1 => json!({"has_more":false,"subscribe_items":[{"item_id":"bad"}]}),
                    2 => json!({"has_more":false,"subscribe_items":[],"ignored":"x".repeat(300)}),
                    _ => json!({"has_more":false,"subscribe_items":[]}),
                }
            };
            Response::json(json!({"code":0,"data":data}))
        })
        .await;
        let result = client(&fixture)
            .pull_reservations_bounded(
                || true,
                if mode == 3 { 1 } else { 100 },
                if mode == 4 { 0 } else { 2000 },
                if mode == 2 { 350 } else { MAX_BYTES },
            )
            .await;
        assert_eq!(result, Err(CloudError::IncompleteReservation));
    }
    let fixture = Fixture::new(|_| panic!("cancelled before dispatch")).await;
    assert!(client(&fixture).pull_reservations(|| false).await.is_err());
    assert!(fixture.requests.lock().unwrap().is_empty());
}
#[tokio::test]
async fn reservation_write_is_numeric_gzip_fixed_metadata_and_rejection_is_not_ack() {
    let fixture=Fixture::new(|r|{
        assert_eq!(r.path,SET);assert_eq!(r.method,"POST");assert_eq!(r.headers["content-encoding"],"gzip");assert_eq!(r.headers["lc"],"101");assert_eq!(r.headers["x-ss-dp"],"8662");
        let (stamp,nonce)=r.headers["x-reading-request"].split_once('-').unwrap();stamp.parse::<u64>().unwrap();nonce.parse::<u32>().unwrap();
        assert!(r.wire_body.starts_with(&[0x1f,0x8b]));assert_eq!(r.body["item_id"].as_i64(),Some(7692049770637954110));assert_eq!(r.body["item_type"],1);assert_eq!(r.body["wish_list_all_del"],0);assert_eq!(r.body["shark_param"],json!({"enter_from":"BulletActivity","previous_page":"MainFragmentActivity","page_list":"MainFragmentActivity,BulletActivity"}));
        Response::json(json!({"code":0}))
    }).await;
    let mut client = client(&fixture);
    client.set_reservation_update(ITEM, true).await.unwrap();
    client.set_reservation_update(ITEM, false).await.unwrap();
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .map(|r| r.body["op_type"].as_u64().unwrap())
            .collect::<Vec<_>>(),
        [1, 2]
    );
    for id in ["0", "01", "+1", "9223372036854775808"] {
        assert!(client.set_reservation_update(id, true).await.is_err());
    }
    assert_eq!(fixture.requests.lock().unwrap().len(), 2);
    let fixture = Fixture::new(|_| Response::json(json!({"code":7,"message":"private"}))).await;
    assert_eq!(
        self::client(&fixture)
            .set_reservation_update(ITEM, true)
            .await,
        Err(CloudError::Rejected)
    );
}
#[tokio::test]
async fn repeated_nonempty_pages_are_bounded_and_cross_group_conflicts_fail() {
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    let fixture = Fixture::new(move |_| {
        seen.fetch_add(1, Ordering::SeqCst);
        Response::json(
            json!({"code":0,"data":{"has_more":true,"subscribe_items":[{"item_id":ITEM}]}}),
        )
    })
    .await;
    assert_eq!(
        client(&fixture)
            .pull_reservations_bounded(|| true, 3, MAX_ITEMS, MAX_BYTES)
            .await,
        Err(CloudError::IncompleteReservation)
    );
    assert_eq!(calls.load(Ordering::SeqCst), 3);
    let fixture = Fixture::new(|_| {
        Response::json(
            json!({"code":0,"data":{"has_more":false,"subscribe_items":[{"item_id":ITEM}]}}),
        )
    })
    .await;
    assert_eq!(
        client(&fixture).pull_reservations(|| true).await,
        Err(CloudError::IncompleteReservation)
    );
}
