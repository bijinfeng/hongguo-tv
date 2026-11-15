use super::*;
use serde_json::json;

const ID: &str = "7690163276214176792";
const INPUT: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/catalog/series-detail.input.html");
fn page(page: Value) -> Vec<u8> {
    format!(
        "<script>_ROUTER_DATA = {}; </script>",
        json!({"loaderData":{"detail_page":page}})
    )
    .into_bytes()
}
fn drama() -> Value {
    json!({"series_id":ID,"vid_list":["11","22"]})
}
fn deferred_page(value: Value, loader: &str, name: &str) -> String {
    let args = json!([loader,[{"key":"recommendations","routerDataFnName":"p","routerDataFnArgs":[value.to_string()]}]]);
    format!(
        "<script data-fn-name='{name}' data-fn-args='{}'></script>",
        args.to_string()
            .replace('&', "&amp;")
            .replace('\'', "&#39;")
            .replace('"', "&quot;")
    )
}

#[test]
fn full_detail_flattens_exact_cast_and_related_without_extending_summary_or_history() {
    let detail = parse_series_detail(INPUT, ID).unwrap();
    assert_eq!(detail.actors.len(), 4);
    assert_eq!(
        detail.actors[0].actor_id.as_deref(),
        Some("99999999999999999999999999999999")
    );
    assert_eq!(detail.actors[0].name, "合成演员");
    assert!(
        detail.actors[0]
            .avatar
            .starts_with("https://p3.fqnovelpic.com/")
    );
    assert!(
        detail.actors[1..]
            .iter()
            .all(|actor| actor.actor_id.is_none())
    );
    assert_eq!(detail.related.len(), 1);
    assert_eq!(detail.related[0].series_id, "2234567890123456789");
    assert!(detail.related[0].episodes.is_none());
    assert_eq!(detail.drama.episodes.as_ref().unwrap().len(), 5);
    let value = serde_json::to_value(&detail).unwrap();
    assert_eq!(value["series_id"], ID);
    assert!(value.get("drama").is_none());
    assert!(value.get("reviews").is_none());
    assert!(value["actors"][1].get("actor_id").is_none());
    let base = serde_json::to_value(super::super::parse_detail(INPUT, ID).unwrap()).unwrap();
    assert!(base.get("actors").is_none() && base.get("related").is_none());
}

#[test]
fn missing_extensions_and_exact_detail_loader_do_not_use_unrelated_data() {
    let detail = parse_series_detail(&page(json!({"seriesDetail":drama()})), ID).unwrap();
    assert!(detail.actors.is_empty() && detail.related.is_empty());
    let unrelated = format!(
        "_ROUTER_DATA = {};",
        json!({"loaderData":{"other":{"seriesDetail":drama()}}})
    );
    assert_eq!(
        parse_series_detail(unrelated.as_bytes(), ID),
        Err(CatalogError::InvalidData)
    );
    let conflict =
        page(json!({"seriesDetail":{"series_id":ID,"series_id_str":"123","vid_list":[]}}));
    assert_eq!(
        parse_series_detail(&conflict, ID),
        Err(CatalogError::InvalidData)
    );
    assert_eq!(
        parse_series_detail(INPUT, "123"),
        Err(CatalogError::InvalidData)
    );
}

#[test]
fn cast_aliases_fallback_preserve_order_and_restrict_names_avatars_and_ids() {
    for key in ["celebrities", "celebrity_list", "actors", "actor_list"] {
        let mut value = json!({"seriesDetail":drama()});
        value[key] = json!([
            {"celebrity_id":"101","celebrity_name":"第一位","avatar":"http://p3.fqnovelpic.com/a"},
            {"person_id":102,"actor_name":"第二位","user_avatar":"https://p3.fqnovelpic.com/a\n","avatar_url":"https://evil.invalid/a"},
            {"name":"无编号"},{"name":"无编号"},{"name":"字".repeat(101)},
            {"name":"control\u{0001}"},{"actor_id":103}
        ]);
        let detail = parse_series_detail(&page(value), ID).unwrap();
        assert_eq!(
            detail
                .actors
                .iter()
                .map(|actor| actor.name.as_str())
                .collect::<Vec<_>>(),
            ["第一位", "第二位", "无编号"]
        );
        assert!(detail.actors.iter().all(|actor| actor.avatar.is_empty()));
        assert_eq!(detail.actors[1].actor_id.as_deref(), Some("102"));
    }
}

#[test]
fn related_aliases_models_exact_dedup_and_conflicts_keep_source_order() {
    let value = page(json!({"seriesDetail":drama(),
        "related_list":[{"model":{"series_id":"102"}},{"series_id":ID},{"series_id":"103","series_id_str":"104"}],
        "recommendations":{"videoList":[{"series_id":"101"},{"series_id":"102"}]},
        "related":[{"series_id":"105"}],"detail_page_more_related":[{"series_id":"106"}],
        "related_video":[{"series_id":"107"}],"rawRelatedVideo":[{"series_id":"108"}]}));
    let detail = parse_series_detail(&value, ID).unwrap();
    assert_eq!(
        detail
            .related
            .iter()
            .map(|drama| drama.series_id.as_str())
            .collect::<Vec<_>>(),
        ["102", "101", "105", "106", "107", "108"]
    );
}

#[test]
fn deferred_attributes_decode_entities_quotes_and_never_execute_scripts_or_decoys() {
    let related = json!({"videoList":[{"series_id":9999999999999999999u64,"series_name":"引号 ' 与 > & 字符"}]});
    let decoy = deferred_page(
        json!({"videoList":[{"series_id":"999"}]}),
        "other_page",
        "mergeLoaderData",
    );
    let valid = deferred_page(related, "detail_page", "mergeLoaderData");
    let mut html = page(json!({"seriesDetail":drama(),"recommendations":{}}));
    html.extend_from_slice(format!("<!--{valid}--><script>const decoy = `{valid}`; throw new Error('not executable');</script>{decoy}{valid}").as_bytes());
    let detail = parse_series_detail(&html, ID).unwrap();
    assert_eq!(detail.related.len(), 1);
    assert_eq!(detail.related[0].series_id, "9999999999999999999");
    assert_eq!(detail.related[0].title, "引号 ' 与 > & 字符");
    assert_eq!(
        entities("&#x22;&#34;&apos;&amp;&lt;&gt;").as_deref(),
        Some("\"\"'&<>")
    );
}

#[test]
fn inline_recommendations_win_and_bad_deferred_payloads_do_not_invent_rows() {
    let mut html = page(json!({"seriesDetail":drama(),"related":[{"series_id":"101"}]}));
    html.extend_from_slice(
        deferred_page(
            json!({"videoList":[{"series_id":"102"}]}),
            "detail_page",
            "mergeLoaderData",
        )
        .as_bytes(),
    );
    assert_eq!(
        parse_series_detail(&html, ID).unwrap().related[0].series_id,
        "101"
    );
    for suffix in [
        "<script data-fn-name='mergeLoaderData' data-fn-args='not json'></script>",
        "<script data-fn-name='mergeLoaderData' data-fn-args='[\"detail_page\",[]]' data-fn-args='[]'></script>",
        "<script data-fn-name='mergeLoaderData' data-fn-args='unterminated",
    ] {
        let mut html = page(json!({"seriesDetail":drama()}));
        html.extend_from_slice(suffix.as_bytes());
        assert!(parse_series_detail(&html, ID).unwrap().related.is_empty());
    }
}

#[test]
fn full_detail_rejects_raw_array_text_episode_and_body_bounds_before_cleaning() {
    for value in [
        json!({"seriesDetail":drama(),"actors":vec![Value::Null;ROW_LIMIT+1]}),
        json!({"seriesDetail":drama(),"related":vec![Value::Null;ROW_LIMIT+1]}),
        json!({"seriesDetail":{"series_id":ID,"vid_list":vec!["11";10001]}}),
        json!({"seriesDetail":{"series_id":ID,"series_name":"字".repeat(101)}}),
        json!({"seriesDetail":{"series_id":ID,"tags":vec!["tag";17]}}),
        json!({"seriesDetail":drama(),"related":[{"series_id":"101","episode_cnt":10001}]}),
    ] {
        assert_eq!(
            parse_series_detail(&page(value), ID),
            Err(CatalogError::TooLarge)
        );
    }
    for vids in [json!(["11", "11"]), json!(["11", "0"]), json!(["11", true])] {
        assert_eq!(
            parse_series_detail(
                &page(json!({"seriesDetail":{"series_id":ID,"vid_list":vids}})),
                ID
            ),
            Err(CatalogError::InvalidData)
        );
    }
    assert_eq!(
        parse_series_detail(&vec![b' '; BODY_LIMIT + 1], ID),
        Err(CatalogError::TooLarge)
    );
    let mut html = page(json!({"seriesDetail":drama()}));
    html.extend_from_slice(
        deferred_page(
            json!({"videoList":vec![Value::Null;ROW_LIMIT+1]}),
            "detail_page",
            "mergeLoaderData",
        )
        .as_bytes(),
    );
    assert_eq!(parse_series_detail(&html, ID), Err(CatalogError::TooLarge));
}

#[test]
fn deferred_script_attribute_and_nested_tree_limits_fail_without_truncating() {
    let mut html = page(json!({"seriesDetail":drama()}));
    html.extend_from_slice("<script></script>".repeat(ROW_LIMIT + 1).as_bytes());
    assert_eq!(parse_series_detail(&html, ID), Err(CatalogError::TooLarge));
    let attrs = (0..65)
        .map(|n| format!(" attr-{n}='x'"))
        .collect::<String>();
    assert_eq!(attributes(&attrs), Err(CatalogError::TooLarge));
    assert_eq!(
        attributes(&format!(" data-fn-args='{}'", "x".repeat(JSON_LIMIT + 1))),
        Err(CatalogError::TooLarge)
    );
    let mut nested = json!({"videoList":[{"series_id":"101"}]});
    for _ in 0..34 {
        nested = json!({"nested":nested});
    }
    assert_eq!(
        parse_series_detail(
            &page(json!({"seriesDetail":drama(),"recommendations":nested})),
            ID
        ),
        Err(CatalogError::TooLarge)
    );
}
