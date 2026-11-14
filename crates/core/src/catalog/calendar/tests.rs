use super::*;
use serde_json::json;
const NEW: &[u8] = include_bytes!("../../../../../contracts/fixtures/calendar/new.input.json");
const RELEASED: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/calendar/released.input.json");
const TRANSITION: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/calendar/transition.input.json");
#[test]
fn calendar_queries_preserve_omission_and_validate_real_dates() {
    let query = CalendarQuery::new(CalendarParams::default()).unwrap();
    assert!(!query.params().contains_key("subscribe_offset"));
    assert_eq!(query.params()["gender_type"], "2");
    for day in ["20240229", "20000229", "20261114"] {
        assert!(
            CalendarQuery::new(CalendarParams {
                date: Some(day.into()),
                subscribe_offset: Some(0),
                ..Default::default()
            })
            .is_ok()
        );
    }
    for day in [
        "19000229",
        "20260229",
        "20260431",
        "20260001",
        "00000101",
        "2026111",
        "２０２６１１１４",
    ] {
        assert!(
            CalendarQuery::new(CalendarParams {
                date: Some(day.into()),
                ..Default::default()
            })
            .is_err()
        );
    }
    let zero = CalendarQuery::new(CalendarParams {
        subscribe_offset: Some(0),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(zero.params()["subscribe_offset"], "0");
    assert!(serde_json::from_value::<CalendarParams>(json!({"gender":"2"})).is_err());
    assert!(
        CalendarQuery::new(CalendarParams {
            session_id: Some("bad\n".into()),
            ..Default::default()
        })
        .is_err()
    );
    assert!(
        CalendarQuery::new(CalendarParams {
            offset: 100001,
            ..Default::default()
        })
        .is_err()
    );
}
#[test]
fn calendar_new_series_uses_raw_cursor_and_supported_summaries() {
    let query = NewSeriesQuery::new(NewSeriesParams::default()).unwrap();
    assert_eq!(query.params()["cell_gender"], "2");
    for gender in ["0", "1", "2"] {
        assert!(
            NewSeriesQuery::new(NewSeriesParams {
                gender: Some(gender.into()),
                ..Default::default()
            })
            .is_ok()
        );
    }
    assert!(
        NewSeriesQuery::new(NewSeriesParams {
            gender: Some("3".into()),
            ..Default::default()
        })
        .is_err()
    );
    let page = parse_new_series(NEW, &query).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].series_id, "9007199254740993");
    assert!(page.items[0].episodes.is_none());
    assert_eq!(page.next_offset, 20);
    assert!(
        parse_new_series(
            NEW,
            &NewSeriesQuery::new(NewSeriesParams {
                offset: 20,
                ..Default::default()
            })
            .unwrap()
        )
        .is_err()
    );
}
#[test]
fn calendar_independent_phase_cursors_keep_upcoming_nonplayable() {
    let first = parse_calendar(
        RELEASED,
        &CalendarQuery::new(CalendarParams::default()).unwrap(),
    )
    .unwrap();
    assert_eq!(first.items.len(), 1);
    assert!(matches!(
        first.items[0].entry,
        CalendarEntry::Released { .. }
    ));
    assert!(first.items[0].reservation_id.is_none());
    let query = CalendarQuery::new(CalendarParams {
        offset: 45,
        session_id: Some(first.session_id),
        ..Default::default()
    })
    .unwrap();
    let page = parse_calendar(TRANSITION, &query).unwrap();
    assert!(page.has_more);
    assert_eq!(
        (page.next_offset, page.next_subscribe_offset),
        (24, Some(23))
    );
    assert_eq!(page.session_id, "fixture-calendar");
    assert!(matches!(
        page.items[0].entry,
        CalendarEntry::Upcoming {
            series_id: None,
            ..
        }
    ));
    let encoded = serde_json::to_string(&page).unwrap();
    for private in ["has_subscribed", "reserved", "episodes", "tracking"] {
        assert!(!encoded.contains(private));
    }
    let mut v: Value = serde_json::from_slice(TRANSITION).unwrap();
    v["data"]["subscribe_items"] = json!([]);
    assert!(
        parse_calendar(&serde_json::to_vec(&v).unwrap(), &query)
            .unwrap()
            .items
            .is_empty()
    );
    let stalled = CalendarQuery::new(CalendarParams {
        offset: 24,
        subscribe_offset: Some(23),
        ..Default::default()
    })
    .unwrap();
    assert!(parse_calendar(TRANSITION, &stalled).is_err());
    v["data"]["calendar_loc_info"]["down_has_more"] = json!(false);
    assert!(
        !parse_calendar(&serde_json::to_vec(&v).unwrap(), &stalled)
            .unwrap()
            .has_more
    );
}
#[test]
fn calendar_rejects_malformed_envelopes_bounds_and_schema() {
    let q = CalendarQuery::new(CalendarParams::default()).unwrap();
    for replacement in [json!(null), json!({}), json!({"code":1,"data":{}})] {
        assert!(parse_calendar(&serde_json::to_vec(&replacement).unwrap(), &q).is_err());
    }
    for (key, value) in [
        ("next_offset", json!(100001)),
        ("session_id", json!("bad\n")),
        ("subscribe_items", json!(vec![json!({}); 129])),
        (
            "calendar_schema",
            json!({"date_list":["20260229"],"default_date":"20261114","current_date":"20261114"}),
        ),
    ] {
        let mut v: Value = serde_json::from_slice(RELEASED).unwrap();
        v["data"][key] = value;
        assert!(
            parse_calendar(&serde_json::to_vec(&v).unwrap(), &q).is_err(),
            "{key}"
        );
    }
    assert_eq!(
        parse_calendar(&vec![b' '; BODY_LIMIT + 1], &q),
        Err(CatalogError::TooLarge)
    );
}
