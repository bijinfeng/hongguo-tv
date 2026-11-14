use super::*;
use serde_json::json;

const INPUT: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/catalog/suggestions.input.json");

#[test]
fn suggestions_fixture_preserves_exact_kinds_ids_and_nonplayable_terms() {
    let result = parse_suggestions(INPUT).unwrap();
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../../../contracts/fixtures/catalog/suggestions.expected.json"
    ))
    .unwrap();
    assert_eq!(serde_json::to_value(result).unwrap(), expected);
}

#[test]
fn suggestion_input_is_trimmed_bounded_and_independent_of_paged_search() {
    assert_eq!(SuggestionQuery::new(" \n ").unwrap().term(), "");
    assert_eq!(SuggestionQuery::new(" 字 &?=+ ").unwrap().term(), "字 &?=+");
    assert!(SuggestionQuery::new(&"字".repeat(100)).is_ok());
    for term in [
        "字".repeat(101),
        "a\0b".into(),
        "a\nb".into(),
        "a\tb".into(),
    ] {
        assert!(matches!(
            SuggestionQuery::new(&term),
            Err(CatalogError::InvalidInput)
        ));
    }
}

#[test]
fn suggestions_reject_malformed_envelopes_business_failures_and_oversize() {
    for body in [
        "null",
        "{}",
        "{",
        "{\"suggest_list\":{}}",
        "{\"data\":{\"suggest_list\":[]}}",
        "{\"suggest_list\":[]} {}",
        "{\"code\":403,\"suggest_list\":[]}",
        "{\"code\":null,\"suggest_list\":[]}",
        "{\"code\":\"secret\",\"suggest_list\":[]}",
    ] {
        assert_eq!(
            parse_suggestions(body.as_bytes()),
            Err(CatalogError::InvalidData),
            "{body}"
        );
    }
    for code in [json!(0), json!("0")] {
        assert!(
            parse_suggestions(
                &serde_json::to_vec(&json!({"code":code,"suggest_list":[]})).unwrap()
            )
            .unwrap()
            .items
            .is_empty()
        );
    }
    assert_eq!(
        parse_suggestions(&vec![b' '; BODY_LIMIT + 1]),
        Err(CatalogError::TooLarge)
    );
}

#[test]
fn suggestions_bound_scan_output_metadata_and_optional_summaries() {
    let rows: Vec<Value> = (0..20).map(|i| json!({"name":format!("词{i}")})).collect();
    let result =
        parse_suggestions(&serde_json::to_vec(&json!({"suggest_list":rows})).unwrap()).unwrap();
    assert_eq!(result.items.len(), 10);
    assert_eq!(result.items[9].name, "词9");
    let mut rows = vec![Value::Null; 128];
    rows.push(json!({"name":"outside scan"}));
    assert!(
        parse_suggestions(&serde_json::to_vec(&json!({"suggest_list":rows})).unwrap())
            .unwrap()
            .items
            .is_empty()
    );

    let mut row = json!({"word_type":"short_play_name","name":"有效名称","video_data":{"series_id":"1","episode_cnt":0,"episode_total_cnt":3,"category_list":[{"name":"一"},{"name":"二"},{"name":"三"},{"name":"四"}],"hot_score_data":{"text":"x".repeat(81)},"series_title":"x".repeat(101),"content_type":"1004","vid_list":["not-exported"]}});
    let read = |row: &Value| {
        parse_suggestions(&serde_json::to_vec(&json!({"suggest_list":[row]})).unwrap())
            .unwrap()
            .items
            .remove(0)
    };
    let item = read(&row);
    assert_eq!(item.meta.as_deref(), Some("一 · 二 · 三 · 全3集"));
    let drama = item.drama.unwrap();
    assert_eq!(drama.title, "有效名称");
    assert_eq!(drama.episode_count, Some(3));
    assert_eq!(drama.content_type.as_deref(), Some("1004"));
    assert_eq!(drama.episodes, None);
    assert!(drama.intro.is_empty());
    for kind in [json!("1003"), json!("unexpected"), json!({}), json!(false)] {
        row["video_data"]["content_type"] = kind;
        let item = read(&row);
        assert!(item.drama.is_none());
        assert!(item.meta.is_none());
    }
    row["video_data"]["content_type"] = json!("1");
    for cover in [
        "http://p9.fqnovelpic.com/a",
        "https://evil.invalid/a",
        "https://u:p@p9.fqnovelpic.com/a",
        "https://p9.fqnovelpic.com:8443/a",
        "https://fqnovelpic.com.evil.invalid/a",
    ] {
        row["video_data"]["series_cover"] = json!(cover);
        assert!(read(&row).drama.unwrap().cover.is_empty());
    }
    for id in [
        json!("0"),
        json!("-1"),
        json!("1.0"),
        json!("1/2"),
        json!(1.5),
        json!("9".repeat(33)),
    ] {
        row["video_data"]["series_id"] = id;
        assert!(read(&row).drama.is_none());
    }
}

#[test]
fn suggestions_deduplicate_semantic_identity_without_merging_kinds() {
    let rows = json!([
        {"word_type":"short_play_actor","keyword":"11","name":"演员"},
        {"word_type":"short_play_actor","keyword":11,"name":"演员别名"},
        {"word_type":"short_play_actor","keyword":"not-an-id","name":"无身份演员"},
        {"word_type":"common_query","keyword":"opaque-one","name":"同名词"},
        {"word_type":"future","keyword":"opaque-two","name":"同名词","video_data":{"series_id":"11"}},
        {"word_type":"short_play_name","keyword":"11","name":"同名词","video_data":{"series_id":"11"}}
    ]);
    let result =
        parse_suggestions(&serde_json::to_vec(&json!({"suggest_list":rows})).unwrap()).unwrap();
    assert_eq!(result.items.len(), 4);
    assert_eq!(result.items[0].actor_id.as_deref(), Some("11"));
    assert!(result.items[1].actor_id.is_none());
    assert!(result.items[2].drama.is_none());
    assert_eq!(result.items[3].drama.as_ref().unwrap().series_id, "11");
}

#[test]
fn suggestions_bound_numeric_keys_without_rounding_valid_identifiers() {
    let body = format!(
        r#"{{"suggest_list":[{{"name":"超长数字键","keyword":1{}}},{{"name":"合法大整数","word_type":"short_play_actor","keyword":90071992547409931236}}]}}"#,
        "0".repeat(200)
    );
    let result = parse_suggestions(body.as_bytes()).unwrap();
    assert_eq!(result.items[0].key, "超长数字键");
    assert_eq!(result.items[1].key, "90071992547409931236");
    assert_eq!(
        result.items[1].actor_id.as_deref(),
        Some("90071992547409931236")
    );
}
