use super::*;
const PAGE: &[u8] = include_bytes!("../../../../../contracts/fixtures/rankings/page.input.json");
fn query() -> RankQuery {
    RankQuery::new(RankParams::default()).unwrap()
}
fn parse(v: &Value) -> Result<RankResult, CatalogError> {
    parse_rankings(&serde_json::to_vec(v).unwrap(), &query())
}
#[test]
fn rankings_query_bounds_exact_selectors_and_phase() {
    for v in [
        json!({"offset":100001}),
        json!({"rank":"x".repeat(257)}),
        json!({"rank_sub":"x\ny"}),
        json!({"rank_panel":"x\0"}),
        json!({"session_id":"x".repeat(1025)}),
        json!({"shown":"actor-1"}),
        json!({"shown":"1,,2"}),
        json!({"shown":"0"}),
        json!({"shown":vec!["1";129].join(",")}),
    ] {
        assert!(
            RankQuery::new(serde_json::from_value(v.clone()).unwrap()).is_err(),
            "{v}"
        );
    }
    for v in [
        json!({"url":"https://secret.invalid"}),
        json!({"uid":"1"}),
        json!({"offset":-1}),
        json!({"rank":3}),
    ] {
        assert!(serde_json::from_value::<RankParams>(v).is_err());
    }
    let first = query();
    assert_eq!(first.params()["tab_type"], "26");
    let next = RankQuery::new(RankParams {
        rank: Some("新榜/a&b".into()),
        rank_sub: Some("ranklist_hot_play_sc".into()),
        rank_panel: Some("any".into()),
        offset: 20,
        session_id: Some("exact+session".into()),
        shown: Some("123,456".into()),
    })
    .unwrap();
    assert_eq!(next.params()["tab_type"], "18");
    assert_eq!(next.params()["selected_items"], "新榜/a&b");
    assert_eq!(next.params()["sub_selected_items"], "ranklist_hot_play_sc");
    assert_eq!(next.params()["panel_selected_items"], "any");
    assert_eq!(next.params()["filter_ids"], "123,456");
    assert_eq!(next.params()["session_id"], "exact+session");
    assert_eq!(next.params()["cell_id"], "7470092475068071998");
}
#[test]
fn rankings_fixture_preserves_types_order_selectors_and_public_labels() {
    let actual = parse_rankings(PAGE, &query()).unwrap();
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../../../contracts/fixtures/rankings/page.expected.json"
    ))
    .unwrap();
    let out = serde_json::to_value(actual).unwrap();
    assert_eq!(out, expected);
    let text = out.to_string();
    for marker in [
        "secret",
        "token",
        "episodes",
        "\"series_id\":\"actor-",
        "sslocal",
        "rec_icon_url",
    ] {
        assert!(!text.contains(marker));
    }
}
#[test]
fn rankings_cursor_uses_exact_source_accepts_empty_advancement_and_keeps_session() {
    let v: Value = serde_json::from_slice(PAGE).unwrap();
    let mut empty = v.clone();
    empty["data"]["cell_view"]["cell_data"] = json!([]);
    let page = parse(&empty).unwrap();
    assert!(page.items.is_empty());
    assert!(page.has_more);
    assert_eq!(page.next_offset, 20);
    let mut fallback = empty.clone();
    fallback["data"]
        .as_object_mut()
        .unwrap()
        .remove("next_offset");
    fallback["data"]["has_more"] = json!(false);
    fallback["data"]["session_id"] = json!("wrong-source");
    fallback["data"]["cell_view"]["has_more"] = json!(true);
    fallback["data"]["cell_view"]["next_offset"] = json!("40");
    fallback["data"]["cell_view"]["session_id"] = json!("cell-session");
    let page = parse(&fallback).unwrap();
    assert!(page.has_more);
    assert_eq!(page.next_offset, 40);
    assert_eq!(page.session_id, "cell-session");
    empty["data"].as_object_mut().unwrap().remove("session_id");
    let q = RankQuery::new(RankParams {
        session_id: Some("prior".into()),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(
        parse_rankings(&serde_json::to_vec(&empty).unwrap(), &q)
            .unwrap()
            .session_id,
        "prior"
    );
    for patch in [
        json!({"has_more":true,"next_offset":0}),
        json!({"has_more":true,"next_offset":100001}),
        json!({"has_more":"yes"}),
        json!({"session_id":3}),
        json!({"session_id":"s\nx"}),
        json!({"next_offset":null}),
    ] {
        let mut bad = v.clone();
        for (k, val) in patch.as_object().unwrap() {
            bad["data"][k] = val.clone();
        }
        assert_eq!(parse(&bad), Err(CatalogError::InvalidData));
    }
    empty["data"]["has_more"] = json!(false);
    empty["data"]["next_offset"] = json!(0);
    assert!(!parse(&empty).unwrap().has_more);
}
#[test]
fn rankings_reject_malformed_envelopes_raw_budgets_and_deep_selectors() {
    for v in [
        json!({}),
        json!({"code":1,"message":"secret"}),
        json!({"code":0,"error_code":1,"data":{}}),
        json!({"code":0,"data":{"has_more":false,"next_offset":0,"cell_view":{"cell_data":{}}}}),
    ] {
        assert_eq!(parse(&v), Err(CatalogError::InvalidData));
    }
    let base: Value = serde_json::from_slice(PAGE).unwrap();
    let mut bad = base.clone();
    bad["data"]["cell_view"]["cell_data"] = json!(vec![json!({}); 129]);
    assert_eq!(parse(&bad), Err(CatalogError::TooLarge));
    let mut bad = base.clone();
    bad["data"]["cell_view"]["cell_data"] = json!([{"video_data":vec![json!({});129]}]);
    assert_eq!(parse(&bad), Err(CatalogError::TooLarge));
    let mut bad = base.clone();
    bad["data"]["cell_view"]["cell_data"] =
        json!(vec![json!({"video_data":vec![json!({});128]}); 8]);
    assert_eq!(parse(&bad), Err(CatalogError::TooLarge));
    let mut deep = json!({});
    for _ in 0..10 {
        deep = json!({"outer_row":{"items":[{"selector_item_id":"x","show_name":"x","sub_cell_selector":deep}]}});
    }
    let mut bad = base.clone();
    bad["data"]["cell_view"]["cell_selector"] = deep;
    assert_eq!(parse(&bad), Err(CatalogError::TooLarge));
    let mut bad = base.clone();
    bad["data"]["cell_view"]["cell_selector"]["outer_row"]["items"] = json!([{"selector_item_id":"x","show_name":"x","panel_selector":{"inner_rows":vec![json!({"type":"p","row_name":"p","items":vec![json!({});128]});16]}}]);
    assert_eq!(parse(&bad), Err(CatalogError::TooLarge));
    assert_eq!(
        parse_rankings(&vec![b' '; BODY_LIMIT + 1], &query()),
        Err(CatalogError::TooLarge)
    );
}

#[test]
fn rankings_complete_realistic_selector_tree_is_not_silently_truncated() {
    let mut v: Value = serde_json::from_slice(PAGE).unwrap();
    let choices = (0..128)
        .map(|i| json!({"selector_item_id":i.to_string(),"show_name":format!("合成选项{i}")}))
        .collect::<Vec<_>>();
    v["data"]["cell_view"]["cell_selector"] = json!({"outer_row":{"items":[{"selector_item_id":"all","show_name":"总榜","panel_selector":{"inner_rows":(0..6).map(|i|json!({"type":format!("panel{i}"),"row_name":"维度","items":choices})).collect::<Vec<_>>()}}]}});
    let page = parse(&v).unwrap();
    assert_eq!(page.ranks[0].panels.len(), 6);
    assert_eq!(
        page.ranks[0]
            .panels
            .iter()
            .map(|p| p.options.len())
            .sum::<usize>(),
        768
    );
}
