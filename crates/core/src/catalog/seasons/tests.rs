use super::*;
use serde_json::json;
const SELECTOR: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/seasons/selector.input.json");
const RELATIONS: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/seasons/relation.input.json");
const RECIPROCAL: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/seasons/reciprocal.input.json");
fn relation(v: &Value) -> Result<SeriesSeasonsResult, CatalogError> {
    parse_season_relations(&serde_json::to_vec(v).unwrap())
}
#[test]
fn seasons_strict_identity_and_exact_official_scenes() {
    for id in ["", "0", "000", "bad", "123 ", "１", "1&book_id=2"] {
        assert!(SeriesQuery::new(id).is_err());
    }
    assert!(SeriesQuery::new(&"1".repeat(33)).is_err());
    for v in [
        json!({"series_id":"1","url":"https://secret"}),
        json!({"series_id":1}),
        json!({}),
    ] {
        assert!(serde_json::from_value::<SeriesParams>(v).is_err());
    }
    let q = SeriesQuery::new("7690163276214176792").unwrap();
    for relation in [false, true] {
        let p = q.params(relation);
        assert_eq!(p.len(), 12);
        assert_eq!(p["book_id"], q.id());
        assert_eq!(p["filter_ids"], q.id());
        assert_eq!(p["scene"], "10");
        assert_eq!(p["limit"], "0");
        assert_eq!(
            p["from"],
            if relation {
                "series_short_play_info"
            } else {
                "single_col_same_ip_series"
            }
        );
    }
}
#[test]
fn seasons_selector_preserves_order_and_never_plays_upcoming_trailers() {
    let r = parse_series_seasons(SELECTOR).unwrap();
    assert_eq!(r.items.len(), 4);
    assert_eq!(
        r.items
            .iter()
            .map(|s| s.drama.series_id.as_str())
            .collect::<Vec<_>>(),
        ["7690163276214176792", "7691518344146455576", "123", "456"]
    );
    let s = &r.items[0];
    assert_eq!(s.season_index, Some(13));
    assert!(s.playable);
    assert!(!s.upcoming);
    assert_eq!(s.first_video_id.as_deref(), Some("7690223053078268953"));
    assert_eq!(s.subtitle.as_deref(), Some("合成热度"));
    let s = &r.items[1];
    assert!(s.upcoming);
    assert!(!s.playable);
    assert!(s.first_video_id.is_none());
    assert_eq!(s.reservation_id.as_deref(), Some("7691518344146455576"));
    assert_eq!(s.subtitle.as_deref(), Some("预告 · 即将上线"));
    assert!(!r.items[2].upcoming);
    assert!(!r.items[2].playable);
    assert!(r.items[2].first_video_id.is_none());
    assert!(r.items[3].upcoming);
    assert!(r.items[3].reservation_id.is_none());
    let out = serde_json::to_string(&r).unwrap();
    for secret in [
        "secret",
        "episodes",
        "is_subscribed",
        "7691518344146455577",
        "7691520694017854526",
    ] {
        assert!(!out.contains(secret));
    }
}
#[test]
fn seasons_eligibility_requires_valid_nested_item_and_no_title_inference() {
    for sub in [json!({}), json!({"item_id":0}), json!({"item_id":"bad"})] {
        let row = json!({"code":0,"data":[{"video_data":[{"series_id":"123","title":"第99季","vid":"456","episode_cnt":1,"subscribe_item":sub}]}]});
        let r = parse_series_seasons(&serde_json::to_vec(&row).unwrap()).unwrap();
        let s = &r.items[0];
        assert!(s.upcoming);
        assert!(!s.playable);
        assert!(s.reservation_id.is_none());
        assert!(s.season_index.is_none());
    }
}
#[test]
fn seasons_next_requires_reciprocal_identity_and_selects_nearest_released() {
    let q = SeriesQuery::new("100").unwrap();
    let rows = parse_season_relations(RELATIONS).unwrap().items;
    assert_eq!(reciprocal_series(&q, &rows), Some("200"));
    assert_eq!(
        select_next_season(&q, rows.clone(), None),
        Err(CatalogError::InvalidData)
    );
    let reciprocal = parse_season_relations(RECIPROCAL).unwrap().items;
    let next = select_next_season(&q, rows.clone(), Some(reciprocal.clone())).unwrap();
    assert_eq!(next.current_season, 1);
    assert_eq!(next.next.unwrap().drama.series_id, "200");
    let mut unknown = reciprocal.clone();
    unknown[0].drama.series_id = "999".into();
    assert_eq!(
        select_next_season(&q, rows.clone(), Some(unknown)),
        Err(CatalogError::InvalidData)
    );
    let mut ambiguous = rows.clone();
    let mut duplicate = ambiguous[1].clone();
    duplicate.drama.series_id = "201".into();
    ambiguous.push(duplicate);
    assert_eq!(
        select_next_season(&q, ambiguous, Some(reciprocal.clone())),
        Err(CatalogError::InvalidData)
    );
    let mut known = rows;
    known.extend(reciprocal.clone());
    assert_eq!(reciprocal_series(&q, &known), None);
    let mut conflict = reciprocal;
    conflict[0].season_index = Some(9);
    assert_eq!(
        select_next_season(&q, known, Some(conflict)),
        Err(CatalogError::InvalidData)
    );
    let empty = select_next_season(&q, vec![], None).unwrap();
    assert_eq!(empty.current_season, 0);
    assert!(empty.next.is_none());
}
#[test]
fn seasons_reciprocal_rejects_conflicting_shared_sibling_numbers() {
    let q = SeriesQuery::new("100").unwrap();
    let rows = parse_season_relations(RELATIONS).unwrap().items;
    for id in ["200", "300"] {
        let sibling = rows.iter().find(|r| r.drama.series_id == id).unwrap();
        let mut reciprocal = parse_season_relations(RECIPROCAL).unwrap().items;
        reciprocal.push(sibling.clone());
        assert!(select_next_season(&q, rows.clone(), Some(reciprocal.clone())).is_ok());
        reciprocal.last_mut().unwrap().season_index = Some(99);
        assert_eq!(
            select_next_season(&q, rows.clone(), Some(reciprocal)),
            Err(CatalogError::InvalidData)
        );
    }
}
#[test]
fn seasons_malformed_and_raw_bounds_fail_instead_of_fabricated_empty_results() {
    for v in [
        json!({}),
        json!({"code":1,"data":[]}),
        json!({"code":0,"error_code":1,"data":[]}),
        json!({"code":0,"data":{}}),
        json!({"code":0,"data":[false]}),
        json!({"code":0,"data":[{"video_data":{}}]}),
        json!({"code":0,"data":[{"video_data":[false]}]}),
        json!({"code":0,"data":[{"video_data":[{"series_id":"1","season_index":1,"disable_play":"unknown"}]}]}),
        json!({"code":0,"data":[{"video_data":[{"series_id":"1","season_index":1,"subscribe_item":false}]}]}),
    ] {
        assert_eq!(relation(&v), Err(CatalogError::InvalidData));
    }
    let duplicate = json!({"code":0,"data":[{"video_data":[{"series_id":"1","season_index":1},{"series_id":"1","season_index":2}]}]});
    assert_eq!(relation(&duplicate), Err(CatalogError::InvalidData));
    for v in [
        json!({"code":0,"data":vec![json!({});129]}),
        json!({"code":0,"data":[{"video_data":vec![json!({});129]}]}),
        json!({"code":0,"data":vec![json!({"video_data":vec![json!({});128]});9]}),
    ] {
        assert_eq!(relation(&v), Err(CatalogError::TooLarge));
    }
    assert_eq!(
        parse_series_seasons(&vec![b' '; BODY_LIMIT + 1]),
        Err(CatalogError::TooLarge)
    );
    assert!(
        parse_series_seasons(br#"{"code":0,"data":[]}"#)
            .unwrap()
            .items
            .is_empty()
    );
}
