use super::*;
use serde_json::json;
const TAB: &[u8] = include_bytes!("../../../../../contracts/fixtures/feed/tab.input.json");
const CELL: &[u8] = include_bytes!("../../../../../contracts/fixtures/feed/cell.input.json");
fn query(tab: bool) -> FeedQuery {
    FeedQuery::new(if tab {
        FeedParams {
            channel: Some("39".into()),
            ..Default::default()
        }
    } else {
        FeedParams {
            session_id: Some("prior-session".into()),
            ..Default::default()
        }
    })
    .unwrap()
}
#[test]
fn feed_queries_validate_every_phase_before_networking() {
    for input in [
        json!({"channel":"45"}),
        json!({"channel":""}),
        json!({"channel":"37"}),
        json!({"offset":100001}),
        json!({"feed_cell":"1"}),
        json!({"feed_cell":"0","feed_plan":"1"}),
        json!({"feed_cell":"2","feed_plan":"1"}),
        json!({"channel":"39","offset":1}),
        json!({"channel":"36","session_id":"s"}),
        json!({"channel":"36","shown":"1"}),
        json!({"channel":"39","feed_cell":"１","feed_plan":"2"}),
        json!({"channel":"39","feed_cell":"1".repeat(31),"feed_plan":"2"}),
        json!({"session_id":"a\nb"}),
        json!({"session_id":"x".repeat(1025)}),
        json!({"shown":"1,,2"}),
        json!({"shown":"0"}),
        json!({"shown":vec!["1";129].join(",")}),
    ] {
        let params = serde_json::from_value(input.clone()).unwrap();
        assert!(FeedQuery::new(params).is_err(), "{input}");
    }
    assert!(serde_json::from_value::<FeedParams>(json!({"url":"https://evil.invalid"})).is_err());
    let default = query(false);
    assert!(!default.is_tab());
    assert_eq!(default.params()["cell_id"], DEFAULT_CELL);
    let tab = query(true);
    assert!(tab.is_tab());
    assert_eq!(tab.params()["client_req_type"], "1");
}
#[test]
fn exact_channel_phase_context_cursor_and_unique_summaries() {
    let tab = parse_feed(TAB, &query(true)).unwrap();
    assert_eq!(tab.channel, FeedChannel::Real);
    assert!(tab.has_more);
    assert_eq!(tab.next_offset, 0);
    assert_eq!(tab.feed_cell, "7650476176527343678");
    assert_eq!(tab.feed_plan, "7650476689721409598");
    assert_eq!(tab.items.len(), 1);
    assert_eq!(tab.items[0].series_id, "7690163276214176792");
    assert_eq!(
        tab.diagnostics,
        FeedDiagnostics {
            cells_seen: 2,
            records_seen: 4,
            parsed: 1,
            filtered: 3
        }
    );
    let next = FeedQuery::new(FeedParams {
        channel: Some("39".into()),
        feed_cell: Some(tab.feed_cell),
        feed_plan: Some(tab.feed_plan),
        session_id: Some(tab.session_id),
        shown: Some(tab.items[0].series_id.clone()),
        ..Default::default()
    })
    .unwrap();
    let params = next.params();
    assert_eq!(params["offset"], "0");
    assert_eq!(params["session_id"], "tab-session");
    assert_eq!(params["filter_ids"], "7690163276214176792");
    assert_eq!(params["client_req_type"], "2");
    let cell = parse_feed(CELL, &next).unwrap();
    assert_eq!(cell.next_offset, 6);
    assert!(cell.has_more);
    assert_eq!(
        cell.items
            .iter()
            .map(|d| d.series_id.as_str())
            .collect::<Vec<_>>(),
        ["7690163276214176792", "7690163276214176794"]
    );
    assert!(cell.items.iter().all(|d| d.episodes.is_none()));
    assert_eq!(cell.session_id, "tab-session");
    assert_eq!(
        cell.diagnostics,
        FeedDiagnostics {
            cells_seen: 4,
            records_seen: 5,
            parsed: 3,
            filtered: 2
        }
    );
    let empty = json!({"code":0,"data":{"has_more":true,"next_offset":8,"session_id":"new","cell_view":{"cell_data":[{}]}}});
    let page = parse_feed(&serde_json::to_vec(&empty).unwrap(), &next).unwrap();
    assert!(page.items.is_empty());
    assert!(page.has_more);
    assert_eq!(page.next_offset, 8);
    assert_eq!(page.session_id, "new");
}
#[test]
fn malformed_envelopes_and_cursors_fail_without_fabricated_terminal_pages() {
    let base: Value = serde_json::from_slice(CELL).unwrap();
    for patch in [
        json!({"has_more":true,"next_offset":0}),
        json!({"has_more":true,"next_offset":null}),
        json!({"has_more":true,"next_offset":100001}),
        json!({"has_more":"yes"}),
        json!({"session_id":5}),
        json!({"session_id":"s\u{0}"}),
        json!({"error_code":9}),
        json!({"cell_view":{}}),
    ] {
        let mut v = base.clone();
        for (k, val) in patch.as_object().unwrap() {
            v["data"][k] = val.clone();
        }
        assert_eq!(
            parse_feed(&serde_json::to_vec(&v).unwrap(), &query(false)),
            Err(CatalogError::InvalidData),
            "{patch}"
        );
    }
    assert!(
        parse_feed(
            br#"{"code":0,"data":{"has_more":true,"cell_view":{"cell_data":[]}}}"#,
            &query(false)
        )
        .is_err()
    );
    let mut tab: Value = serde_json::from_slice(TAB).unwrap();
    tab["data"]["tab_item"][1]["bookstore_id"] = json!("bad");
    assert_eq!(
        parse_feed(&serde_json::to_vec(&tab).unwrap(), &query(true)),
        Err(CatalogError::InvalidData)
    );
    let mut tab: Value = serde_json::from_slice(TAB).unwrap();
    tab["data"]["tab_item"][1]["cell_data"][0]["cell_id_str"] = json!("0");
    assert!(parse_feed(&serde_json::to_vec(&tab).unwrap(), &query(true)).is_err());
    assert!(parse_feed(br#"{"code":0,"data":{"tab_item":[]}}"#, &query(true)).is_err());
    assert!(parse_feed(br#"{"code":1,"data":{}}"#, &query(false)).is_err());
}
#[test]
fn raw_page_limits_fail_instead_of_truncating_even_nonvideo_records() {
    let query = query(false);
    assert_eq!(
        parse_feed(&vec![b' '; BODY_LIMIT + 1], &query),
        Err(CatalogError::TooLarge)
    );
    let envelope =
        |cells: Value| json!({"code":0,"data":{"has_more":false,"cell_view":{"cell_data":cells}}});
    for cells in [
        json!(vec![json!({}); 129]),
        json!([{"video_data":vec![json!({});129]}]),
        json!(
            (0..9)
                .map(|_| json!({"video_data":vec![json!({});128]}))
                .collect::<Vec<_>>()
        ),
    ] {
        assert_eq!(
            parse_feed(&serde_json::to_vec(&envelope(cells)).unwrap(), &query),
            Err(CatalogError::TooLarge)
        );
    }
    let mut cell = json!({});
    for _ in 0..10 {
        cell = json!({"cell_data":[cell]});
    }
    assert_eq!(
        parse_feed(
            &serde_json::to_vec(&envelope(json!([cell]))).unwrap(),
            &query
        ),
        Err(CatalogError::TooLarge)
    );
}

#[test]
fn malformed_access_flags_and_terminal_context_do_not_grant_playback_or_bad_cursors() {
    let detail = json!({"series_id":"123","series_title":"valid","episode_cnt":3});
    for flag in [
        json!(true),
        json!(1),
        json!("true"),
        json!(2),
        json!({}),
        Value::Null,
    ] {
        let body = json!({"code":0,"data":{"has_more":false,"cell_view":{"cell_data":[{"video_detail":detail,"disable_play":flag}]}}});
        let page = parse_feed(&serde_json::to_vec(&body).unwrap(), &query(false)).unwrap();
        assert!(page.items.is_empty(), "{flag}");
        assert_eq!(page.diagnostics.filtered, 1);
    }
    for (cell, plan) in [
        (Some(json!("12")), None),
        (None, Some(json!("34"))),
        (None, Some(json!({}))),
        (None, Some(Value::Null)),
    ] {
        let mut tab = json!({"tab_type":39,"bottom_unlimited":false,"cell_data":[]});
        if let Some(cell) = cell {
            tab["cell_data"] = json!([{"cell_id_str":cell}]);
        }
        if let Some(plan) = plan {
            tab["bookstore_id"] = plan;
        }
        let body = json!({"code":0,"data":{"tab_item":[tab]}});
        assert_eq!(
            parse_feed(&serde_json::to_vec(&body).unwrap(), &query(true)),
            Err(CatalogError::InvalidData)
        );
    }
    let body=br#"{"code":0,"data":{"tab_item":[{"tab_type":39,"bottom_unlimited":false,"cell_data":[]}]}}"#;
    let page = parse_feed(body, &query(true)).unwrap();
    assert!(!page.has_more);
    assert!(page.feed_cell.is_empty());
    assert!(page.feed_plan.is_empty());
}
