use super::*;
const INPUT: &[u8] = include_bytes!("../../../../../contracts/fixtures/category/page.input.json");
fn query() -> CategoryQuery {
    CategoryQuery::new(CategoryParams {
        selectors: Some("1".into()),
        offset: 15,
        ..Default::default()
    })
    .unwrap()
}
fn parse(data: Value) -> Result<CategoryResult, CatalogError> {
    parse_category(
        &serde_json::to_vec(&json!({"code":0,"data":data})).unwrap(),
        &query(),
    )
}
#[test]
fn exact_fixture_and_reference_filters() {
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../../../contracts/fixtures/category/page.expected.json"
    ))
    .unwrap();
    let result = parse_category(INPUT, &query()).unwrap();
    assert_eq!(serde_json::to_value(result).unwrap(), expected);
    let result = parse(json!({"video_data":[],"has_more":false})).unwrap();
    assert_eq!(result.filters.unwrap()[0].options.len(), 2);
    let no_selectors = CategoryQuery::new(CategoryParams::default()).unwrap();
    assert!(
        parse_category(INPUT, &no_selectors)
            .unwrap()
            .filters
            .is_none()
    );
    let f = filters(Some(
        &json!([{"type":"online_time","items":[{"selector_item_id":"days_7","show_name":"一周"}]}]),
    ))
    .unwrap();
    assert_eq!(f[0].r#type, "creation_status");
    assert_eq!(f[1].r#type, "online_time");
    let f = filters(Some(&json!([{"type":"genre","items":[
        {"selector_item_id":"short_play","show_name":""},
        {"selector_item_id":"short_play","show_name":"真人剧"}
    ]}])))
    .unwrap();
    assert_eq!(f[0].options[0].label, "真人剧");
    let f = filters(Some(&json!([{"type":"gender","items":[
        {"selector_item_id":0,"show_name":"女频"},
        {"selector_item_id":"0","show_name":"重复"},
        {"selector_item_id":1,"show_name":"男频"}
    ]}])))
    .unwrap();
    assert_eq!(
        f[0].options
            .iter()
            .map(|option| option.id.as_str())
            .collect::<Vec<_>>(),
        ["0", "1"]
    );
}
#[test]
fn defaults_explicit_all_and_closed_allowlists() {
    for (path, scene, genre) in [
        ("/category/real-drama", "default", "short_play"),
        ("/category/comic-drama", "comic_series", "comic_series"),
        ("/category/ai-drama", "ai_series", "ai_series"),
        ("/category/comic", "comic", "comic"),
    ] {
        let q = CategoryQuery::new(CategoryParams {
            path: Some(path.into()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(q.payload()["req_scene"], scene);
        assert_eq!(q.payload()["select_items"]["genre"], json!([genre]));
        assert_eq!(q.payload()["select_items"]["sort"], json!(["hot_score"]));
    }
    let q = CategoryQuery::new(CategoryParams {
        genre: Some("".into()),
        sort: Some("".into()),
        selectors: Some("1".into()),
        offset: 15,
        shown: Some("11,99999999999999999999".into()),
        session_id: Some(" opaque ".into()),
        category_dim_theme: Some("cate_165".into()),
        gender: Some("0".into()),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(q.payload()["select_items"]["genre"], json!([]));
    assert_eq!(q.payload()["select_items"]["sort"], json!([]));
    assert_eq!(
        q.payload()["select_items"]["category_dim_theme"],
        json!(["cate_165"])
    );
    assert_eq!(q.payload()["session_id"], " opaque ");
    assert_eq!(q.payload()["filter_ids"], "11,99999999999999999999");
    assert_eq!(q.payload()["req_type"], "default");
    for (kind, _) in FILTERS {
        assert!(valid_filter(kind, ""));
        assert!(!valid_filter(kind, "fake"));
    }
    for (kind, values) in [
        ("genre", vec!["short_play", "comic_series", "ai_series"]),
        ("sort", vec!["hot_score", "online_time", "hot_collect"]),
        ("gender", vec!["0", "1"]),
        (
            "online_time",
            vec!["days_7", "days_14", "days_30", "days_90"],
        ),
        (
            "creation_status",
            vec!["creation_status_0", "creation_status_1"],
        ),
        ("category_dim_theme", vec!["cate_1", "cate_12345678"]),
    ] {
        for value in values {
            assert!(valid_filter(kind, value));
        }
    }
    for value in ["cate_", "cate_123456789", "cate_１２", "cate_1,cate_2"] {
        assert!(!valid_filter("category_dim_role", value));
    }
    for raw in [
        json!({"path":"/evil"}),
        json!({"path":""}),
        json!({"offset":100001}),
        json!({"selectors":"true"}),
        json!({"shown":"1,,2"}),
        json!({"shown":"0"}),
        json!({"shown":"１２"}),
        json!({"shown":vec!["1";129].join(",")}),
        json!({"session_id":"a\nb"}),
        json!({"session_id":"x".repeat(1025)}),
        json!({"genre":"comic"}),
        json!({"gender":"2"}),
        json!({"sort":"fake"}),
        json!({"unknown":"x"}),
    ] {
        assert!(
            serde_json::from_value::<CategoryParams>(raw.clone())
                .map_err(|_| CatalogError::InvalidInput)
                .and_then(CategoryQuery::new)
                .is_err(),
            "{raw}"
        );
    }
}
#[test]
fn strict_envelope_and_cursor_progress() {
    for body in [
        "null",
        "{}",
        r#"{"code":1,"data":{}}"#,
        r#"{"code":0,"data":{"error_code":5}}"#,
        r#"{"code":0,"data":{"video_data":[],"has_more":false}} trailing"#,
    ] {
        assert!(parse_category(body.as_bytes(), &query()).is_err());
    }
    for data in [
        json!({}),
        json!({"video_data":null,"has_more":false}),
        json!({"video_data":[],"has_more":2}),
        json!({"video_data":[],"has_more":true}),
        json!({"video_data":[],"has_more":true,"next_offset":15}),
        json!({"video_data":[],"has_more":true,"next_offset":100001}),
        json!({"video_data":[],"has_more":false,"next_offset":-1}),
        json!({"video_data":[],"has_more":false,"session_id":12}),
        json!({"video_data":[],"has_more":false,"selector_rows":{}}),
        json!({"video_data":[],"has_more":false,"error_code":"secret"}),
    ] {
        assert!(parse(data.clone()).is_err(), "{data}");
    }
    assert_eq!(
        parse(json!({"video_data":[{"series_id":"3"}],"has_more":1}))
            .unwrap()
            .next_offset,
        16
    );
    assert_eq!(
        parse(json!({"video_data":[],"has_more":"1","next_offset":"99"}))
            .unwrap()
            .next_offset,
        99
    );
    assert!(parse(json!({"video_data":[{"series_id":"0"}],"has_more":true})).is_err());
}
#[test]
fn no_silent_truncation_or_unbounded_selectors() {
    assert_eq!(
        parse(json!({"video_data":vec![json!({});129],"has_more":false})),
        Err(CatalogError::TooLarge)
    );
    assert_eq!(
        parse(json!({"video_data":[],"has_more":false,"selector_rows":vec![json!({});33]})),
        Err(CatalogError::TooLarge)
    );
    assert_eq!(
        filters(Some(&json!([{"type":"genre","items":vec![json!({});129]}]))),
        Err(CatalogError::TooLarge)
    );
    let mut body = INPUT.to_vec();
    body.resize(BODY_LIMIT, b' ');
    assert!(parse_category(&body, &query()).is_ok());
    body.push(b' ');
    assert_eq!(parse_category(&body, &query()), Err(CatalogError::TooLarge));
}
