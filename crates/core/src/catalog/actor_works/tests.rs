use super::*;
use serde_json::json;

const ID: &str = "99999999999999999999";
const INPUT: &[u8] =
    include_bytes!("../../../../../contracts/fixtures/catalog/actor-works.input.html");
fn parse(page: Value) -> Result<ActorWorksResult, CatalogError> {
    let body = format!(
        "window._ROUTER_DATA = {}; ignored()",
        json!({"loaderData":{"character_(id)/page":page}})
    );
    parse_actor_works(body.as_bytes(), &ActorQuery::new(ID).unwrap())
}
fn page() -> Value {
    json!({"userInfo":{"actor_id":ID},"videoList":[]})
}
#[test]
fn exact_fixture_identity_and_order_are_stable() {
    let actual = parse_actor_works(INPUT, &ActorQuery::new(ID).unwrap()).unwrap();
    let expected: Value = serde_json::from_slice(include_bytes!(
        "../../../../../contracts/fixtures/catalog/actor-works.expected.json"
    ))
    .unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
    assert_eq!(parse(page()).unwrap().actor.name, "未知演员");
    assert!(parse(page()).unwrap().items.is_empty());
}
#[test]
fn query_is_exact_bounded_decimal_and_trims_only_edges() {
    for id in [
        "",
        "0",
        "000",
        "-1",
        "１２",
        "1/2",
        "1?x",
        "1\n2",
        "123456789012345678901234567890123",
    ] {
        assert!(
            matches!(ActorQuery::new(id), Err(CatalogError::InvalidInput)),
            "{id}"
        );
    }
    assert_eq!(ActorQuery::new(" \n001 ").unwrap().id(), "001");
    assert!(ActorQuery::new(&"9".repeat(32)).is_ok());
}
#[test]
fn exact_loader_and_all_present_identity_aliases_are_required() {
    for value in [
        Value::Null,
        json!({}),
        json!({"actor_id":"1"}),
        json!({"actor_id":ID,"actor_id_str":"1"}),
        json!({"actor_id":ID,"person_id":null}),
        json!({"actor_id":1.5}),
    ] {
        let mut p = page();
        p["userInfo"] = value;
        assert_eq!(parse(p), Err(CatalogError::InvalidData));
    }
    for key in ["actor_id", "actor_id_str", "person_id"] {
        let mut p = page();
        p["userInfo"] = json!({key:ID});
        assert!(parse(p).is_ok());
    }
    for body in [
        "",
        "_ROUTER_DATA = alert(1)",
        "_ROUTER_DATA = {",
        "_ROUTER_DATA = null",
        "_ROUTER_DATA = []",
        "_ROUTER_DATA = {\"loaderData\":{\"character_layout\":{\"userInfo\":{\"actor_id\":\"99999999999999999999\"},\"videoList\":[]}}}",
    ] {
        assert_eq!(
            parse_actor_works(body.as_bytes(), &ActorQuery::new(ID).unwrap()),
            Err(CatalogError::InvalidData)
        );
    }
    for value in [Value::Null, json!({}), json!("not rows")] {
        let mut p = page();
        p["videoList"] = value;
        assert_eq!(parse(p), Err(CatalogError::InvalidData));
    }
    let mut p = page();
    p.as_object_mut().unwrap().remove("videoList");
    assert!(parse(p).is_err());
}
#[test]
fn text_images_content_families_and_episode_summaries_are_bounded() {
    let mut p = page();
    p["userInfo"]["user_name"] = json!("x".repeat(101));
    p["userInfo"]["name"] = json!("后备名");
    p["userInfo"]["description"] = json!("x".repeat(1025));
    p["userInfo"]["user_avatar"] = json!("https://evil.invalid/avatar");
    p["videoList"] = json!([
        {"id":"1","title":"bad\nname","cover":"https://evil.invalid/x","series_intro":"x".repeat(1025),"vid_list":["11",null,"invalid","12"],"tags":["a".repeat(25),"正常","二","三","四"]},
        {"id":"2","content_type":"7"},{"id":"3","content_type":1004},
        {"id":"4","content_type":true},{"id":"5","content_type":{}},
        {"id":"6","content_type":"1003"},{"id":"7","content_type":"9"},
        {"id":"8","video_data":null}, {"id":"0"},{"id":"-1"}, {"id":"9".repeat(101)}
    ]);
    let actual = parse(p).unwrap();
    assert_eq!(actual.items.len(), 3);
    assert_eq!(actual.actor.name, "后备名");
    assert!(actual.actor.avatar.is_none());
    assert!(actual.actor.description.is_none());
    let first = &actual.items[0];
    assert_eq!(first.title, "未命名短剧");
    assert_eq!(first.intro, "");
    assert_eq!(first.cover, "");
    assert_eq!(first.episode_count, Some(2));
    assert_eq!(first.tags.as_ref().unwrap(), &["正常", "二", "三"]);
    assert!(first.episodes.is_none());
    for image in [
        "http://p3.byteimg.com/x",
        "https://u:p@p3.byteimg.com/x",
        "https://p3.byteimg.com:444/x",
        "https://p3.byteimg.com.evil.invalid/x",
    ] {
        let mut p = page();
        p["userInfo"]["avatar"] = json!(image);
        assert!(parse(p).unwrap().actor.avatar.is_none());
    }
}
#[test]
fn limits_fail_whole_page_and_never_silently_crop() {
    let mut p = page();
    p["videoList"] = json!(vec![json!({"id":"1"}); WORKS_LIMIT]);
    assert_eq!(parse(p.clone()).unwrap().items.len(), 1);
    p["videoList"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"2"}));
    assert_eq!(parse(p), Err(CatalogError::TooLarge));
    let mut body = INPUT.to_vec();
    body.resize(BODY_LIMIT, b' ');
    assert!(parse_actor_works(&body, &ActorQuery::new(ID).unwrap()).is_ok());
    body.push(b' ');
    assert_eq!(
        parse_actor_works(&body, &ActorQuery::new(ID).unwrap()),
        Err(CatalogError::TooLarge)
    );
}
