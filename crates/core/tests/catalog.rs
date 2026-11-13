//! Offline normalization and query validation contracts.
use hongguo_core::catalog::{
    CatalogError, SearchQuery, parse_detail, parse_search, validate_detail,
};
use serde_json::{Value, json};

const SEARCH: &[u8] = include_bytes!("../../../contracts/fixtures/catalog/search.input.json");
const DETAIL: &[u8] = include_bytes!("../../../contracts/fixtures/catalog/detail.input.html");
const ID: &str = "7690163276214176792";

#[test]
fn fixtures_preserve_catalog_contract() {
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../contracts/fixtures/catalog/search.expected.json"
    ))
    .unwrap();
    assert_eq!(
        serde_json::to_value(parse_search(SEARCH, 1).unwrap()).unwrap(),
        expected
    );
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../contracts/fixtures/catalog/detail.expected.json"
    ))
    .unwrap();
    assert_eq!(
        serde_json::to_value(parse_detail(DETAIL, ID).unwrap()).unwrap(),
        expected
    );
}

#[test]
fn validates_queries_before_transport() {
    for term in ["".into(), " \n ".into(), "字".repeat(81)] {
        assert!(matches!(
            SearchQuery::new(&term, 0, None),
            Err(CatalogError::InvalidInput)
        ));
    }
    assert_eq!(
        SearchQuery::new(" 字 ", 100_000, Some("web"))
            .unwrap()
            .page(),
        100_001
    );
    assert_eq!(SearchQuery::new(" 字 ", 0, None).unwrap().term(), "字");
    assert!(SearchQuery::new("字", 100_001, None).is_err());
    assert!(matches!(
        SearchQuery::new("字", 1, Some("app")),
        Err(CatalogError::UnsupportedSource)
    ));
    for id in [
        "",
        "0",
        "000",
        "1/2",
        "-1",
        "１２",
        "123456789012345678901234567890123",
    ] {
        assert_eq!(validate_detail(id, None), Err(CatalogError::InvalidInput));
    }
    assert_eq!(
        validate_detail(ID, Some("1003")),
        Err(CatalogError::UnsupportedContent)
    );
}

#[test]
fn strict_pagination_and_json_failures() {
    for body in [
        b"null".as_slice(),
        b"{}",
        b"{",
        b"<html>verification</html>",
        b"{} {}",
    ] {
        assert_eq!(parse_search(body, 1), Err(CatalogError::InvalidData));
    }
    let mut data: Value = serde_json::from_slice(SEARCH).unwrap();
    data["pageNum"] = json!(2);
    assert!(parse_search(&serde_json::to_vec(&data).unwrap(), 1).is_err());
    data["pageNum"] = json!(1);
    data["totalPages"] = json!(1);
    assert!(
        !parse_search(&serde_json::to_vec(&data).unwrap(), 1)
            .unwrap()
            .has_more
    );
    data["totalPages"] = json!(-1);
    assert!(parse_search(&serde_json::to_vec(&data).unwrap(), 1).is_err());
    let empty = br#"{"searchList":[],"pageNum":2,"totalPages":0,"hasMore":true}"#;
    let result = parse_search(empty, 2).unwrap();
    assert!(result.items.is_empty());
    assert!(!result.has_more);
    assert_eq!(result.next_offset, 2);
}

#[test]
fn detail_identity_access_defaults_and_invalid_router() {
    assert_eq!(parse_detail(DETAIL, "999"), Err(CatalogError::InvalidData));
    for html in [
        "",
        "_ROUTER_DATA = {",
        "_ROUTER_DATA = {}",
        "_ROUTER_DATA = alert(1)",
        "_ROUTER_DATA = null",
    ] {
        assert_eq!(
            parse_detail(html.as_bytes(), ID),
            Err(CatalogError::InvalidData)
        );
    }
    for count in [None, Some(0), Some(99)] {
        let mut data = json!({"series_id": ID, "vid_list": ["1", "2"]});
        if let Some(count) = count {
            data["accessible_episode_cnt"] = json!(count);
        }
        let html = format!("_ROUTER_DATA = {{\"seriesDetail\":{data}}};");
        let result = parse_detail(html.as_bytes(), ID).unwrap();
        assert_eq!(result.episode_count, Some(2));
        assert!(result.episodes.unwrap().iter().all(|e| !e.locked));
    }
}

#[test]
fn numeric_identifiers_and_heic_fallback_are_exact_and_restricted() {
    let body = br#"{"searchList":[{"video_data":{"series_id":99999999999999999999999999999999,"series_cover":"https://p9.fqnovelpic.com/novel-pic/object~signed.heic?token=synthetic"}}],"pageNum":1,"totalPages":1,"hasMore":false}"#;
    let result = parse_search(body, 1).unwrap();
    assert_eq!(
        result.items[0].series_id,
        "99999999999999999999999999999999"
    );
    assert_eq!(
        result.items[0].cover_fallback.as_deref(),
        Some("https://p3-novel.byteimg.com/novel-pic/object~tplv-shrink:640:0.image")
    );
    let body = String::from_utf8(body.to_vec())
        .unwrap()
        .replace("p9.fqnovelpic.com", "evil.invalid");
    assert_eq!(
        parse_search(body.as_bytes(), 1).unwrap().items[0].cover_fallback,
        None
    );
}
