use super::*;
use base64::{Engine, engine::general_purpose};
use serde_json::{Value, json};

const VID: &str = "90071992547409931234";
fn request(quality: &str) -> PlaybackRequest {
    PlaybackRequest::new("90071992547409939999", VID, "1004", quality, "default").unwrap()
}
fn legacy() -> Value {
    serde_json::from_str(include_str!(
        "../../../../contracts/fixtures/playback/legacy-model.json"
    ))
    .unwrap()
}
fn parse(value: &Value, quality: &str) -> Result<PlaybackModel, PlaybackError> {
    parse_model(&serde_json::to_vec(value).unwrap(), &request(quality))
}

#[test]
fn request_vectors_preserve_exact_ids_and_validate_before_any_io() {
    let vectors: Value = serde_json::from_str(include_str!(
        "../../../../contracts/fixtures/playback/requests.json"
    ))
    .unwrap();
    for vector in vectors["valid"].as_array().unwrap() {
        let input = |key: &str| vector[key].as_str().unwrap();
        let query = PlaybackRequest::new(
            input("series_id"),
            input("vid"),
            input("content_type"),
            input("quality"),
            input("codec_mode"),
        )
        .unwrap();
        assert_eq!(query.series_id(), input("series_id"));
        assert_eq!(query.vid(), input("vid"));
        assert_eq!(query.quality(), input("expected_quality"));
        assert_eq!(
            serde_json::to_value(query.codec()).unwrap(),
            vector["expected_codec"]
        );
    }
    for vector in vectors["invalid"].as_array().unwrap() {
        let mut input = json!({"series_id":"1","vid":"2","content_type":"1004","quality":"","codec_mode":"default"});
        input[vector["field"].as_str().unwrap()] = vector["value"].clone();
        assert!(
            PlaybackRequest::new(
                input["series_id"].as_str().unwrap(),
                input["vid"].as_str().unwrap(),
                input["content_type"].as_str().unwrap(),
                input["quality"].as_str().unwrap(),
                input["codec_mode"].as_str().unwrap(),
            )
            .is_err(),
            "{vector}"
        );
    }
    for id in ["", "000", "-1", "+1", " 1", "１", "1\n"] {
        assert!(PlaybackRequest::new(id, VID, "", "", "").is_err());
        assert!(PlaybackRequest::new("1", id, "", "", "").is_err());
    }
}

#[test]
fn three_envelopes_share_selection_and_never_expose_source_secrets() {
    for body in [
        include_bytes!("../../../../contracts/fixtures/playback/legacy-model.json").as_slice(),
        include_bytes!("../../../../contracts/fixtures/playback/tab-model.json").as_slice(),
        include_bytes!("../../../../contracts/fixtures/playback/single-model.json").as_slice(),
    ] {
        let model = parse_model(body, &request("")).unwrap();
        assert_eq!(model.qualities(), ["540P", "1080P"]);
        let automatic = model.select(&request("")).unwrap();
        assert_eq!(automatic.codec(), "h264");
        assert_eq!(automatic.quality(), "540P");
        assert!(!format!("{automatic:?}").contains("signature"));
        assert!(!format!("{automatic:?}").contains("example.invalid"));
        assert_eq!(model.select(&request("1080p")).unwrap().codec(), "hevc");
        assert_eq!(
            model.select(&request("720P")).unwrap_err(),
            PlaybackError::QualityUnavailable
        );
    }
}

#[test]
fn mismatched_key_model_or_numeric_identity_never_substitutes_episode() {
    let mut value = legacy();
    let row = value["data"].as_object_mut().unwrap().remove(VID).unwrap();
    value["data"]["123"] = row;
    assert!(matches!(
        parse(&value, ""),
        Err(PlaybackError::IdentityMismatch)
    ));
    for field in ["video_id", "vid"] {
        let mut value = legacy();
        value["data"][VID]["video_model"][field] = json!(123);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::IdentityMismatch)
        ));
        value["data"][VID]["video_model"][field] = json!(true);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::InvalidModel)
        ));
    }
    let numeric = serde_json::from_str::<Value>(&format!(
        "{{\"code\":0,\"data\":{{\"video_model\":{{\"video_id\":{VID},\"video_list\":[{{\"codec_type\":\"h264\",\"main_url\":\"https://media.example.invalid/v.mp4\"}}]}}}}}}"
    )).unwrap();
    assert!(parse(&numeric, "").is_ok());
    let mut missing = numeric;
    missing["data"]["video_model"]
        .as_object_mut()
        .unwrap()
        .remove("video_id");
    assert!(matches!(
        parse(&missing, ""),
        Err(PlaybackError::IdentityMismatch)
    ));
}

#[test]
fn vendor_codec_and_protected_sources_are_not_ordinary_hevc() {
    for codec in ["bytevc2", "bvc2", "BYTEVC2", "unknown", ""] {
        let mut value = legacy();
        value["data"][VID]["video_model"]["video_list"] = json!([
            {"codec_type": codec, "main_url":"https://media.example.invalid/v.mp4", "vheight":1080}
        ]);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::UnsupportedMedia)
        ));
    }
    for protection in [
        json!({"encrypt":true}),
        json!({"spade_a":"synthetic-key"}),
        json!({"encrypt_info":{"spade_a":"synthetic-key"}}),
    ] {
        let mut value = legacy();
        let mut row =
            json!({"codec_type":"h264", "main_url":"https://media.example.invalid/v.mp4"});
        row.as_object_mut()
            .unwrap()
            .extend(protection.as_object().unwrap().clone());
        value["data"][VID]["video_model"]["video_list"] = json!([row]);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::UnsupportedMedia)
        ));
    }
}

#[test]
fn base64_backups_nested_metadata_and_object_rows_work() {
    let mut value = legacy();
    value["data"][VID]["video_model"]["video_list"] = json!({"v1":{
        "backup_url":general_purpose::STANDARD_NO_PAD.encode("https://media.example.invalid/v.mp4"),
        "video_meta":{"codec_type":"bytevc1","height":"720"}
    }});
    let model = parse(&value, "720p").unwrap();
    let selection = model.select(&request("720p")).unwrap();
    assert_eq!(selection.codec(), "hevc");
    assert_eq!(
        selection.url.as_str(),
        "https://media.example.invalid/v.mp4"
    );
    for url in [
        "http://media.example.invalid/v",
        "file:///tmp/v",
        "https://secret@media.example.invalid/v",
        "https://media.example.invalid:8443/v",
        "https://media.example.invalid/v#secret",
    ] {
        value["data"][VID]["video_model"]["video_list"]["v1"]["backup_url"] = json!(url);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::UnsupportedMedia)
        ));
    }
}

#[test]
fn automatic_quality_matches_the_bounded_reference_choice() {
    let mut value = legacy();
    value["data"][VID]["video_model"]["video_list"] = json!([
        {"codec_type":"h264","vheight":540,"main_url":"https://media.example.invalid/540"},
        {"codec_type":"hevc","vheight":720,"main_url":"https://media.example.invalid/720"},
        {"codec_type":"h264","vheight":1080,"main_url":"https://media.example.invalid/1080"}
    ]);
    let model = parse(&value, "").unwrap();
    assert_eq!(model.select(&request("")).unwrap().quality(), "720P");
    assert_eq!(model.select(&request("1080P")).unwrap().quality(), "1080P");
    value["data"][VID]["video_model"]["video_list"][0]["vheight"] = json!(2160);
    value["data"][VID]["video_model"]["video_list"][1]["vheight"] = json!(1440);
    assert_eq!(
        parse(&value, "")
            .unwrap()
            .select(&request(""))
            .unwrap()
            .quality(),
        "2160P"
    );
}

#[test]
fn encrypted_model_url_matches_independent_synthetic_vector() {
    let vector: Value = serde_json::from_str(include_str!(
        "../../../../contracts/fixtures/playback/url-crypto.json"
    ))
    .unwrap();
    let mut value = legacy();
    value["data"][VID]["video_model"]["key_seed"] = vector["seed"].clone();
    value["data"][VID]["video_model"]["video_list"] =
        json!([{"codec_type":"h264","main_url":vector["encoded"],"vheight":720}]);
    let model = parse(&value, "").unwrap();
    assert_eq!(
        model.select(&request("")).unwrap().url.as_str(),
        vector["plain"].as_str().unwrap()
    );
    value["data"][VID]["video_model"]["key_seed"] = json!("invalid");
    assert!(matches!(
        parse(&value, ""),
        Err(PlaybackError::UnsupportedMedia)
    ));
}

#[test]
fn business_rejection_stops_recovery_and_errors_are_bounded_and_secret_free() {
    let body = include_bytes!("../../../../contracts/fixtures/playback/business-error.json");
    assert!(matches!(
        parse_model(body, &request("")),
        Err(PlaybackError::AccessDenied)
    ));
    assert_eq!(PlaybackError::AccessDenied.code(), "PLAYBACK_ACCESS_DENIED");
    assert!(
        !PlaybackError::AccessDenied
            .to_string()
            .contains("sensitive")
    );
    for body in [
        b"[]".as_slice(),
        b"{",
        b"null",
        b"<html>signed-secret</html>",
    ] {
        assert!(matches!(
            parse_model(body, &request("")),
            Err(PlaybackError::InvalidModel)
        ));
    }
    assert!(matches!(
        parse_model(b" \n", &request("")),
        Err(PlaybackError::EmptySource)
    ));
    assert!(matches!(
        parse_model(&vec![b' '; 4 * 1024 * 1024 + 1], &request("")),
        Err(PlaybackError::InvalidModel)
    ));
}

#[test]
fn keyed_episode_identity_can_bind_a_distinct_internal_cdn_video_id() {
    let mut value = legacy();
    let internal = "v0123456789abcdef0123456789abcde";
    value["data"][VID]["video_model"]["video_id"] = json!(internal);
    assert!(parse(&value, "").is_ok());
    let raw = value["data"][VID]["video_model"].clone();
    assert!(matches!(
        parse(&json!({"data":{"video_model":raw}}), ""),
        Err(PlaybackError::IdentityMismatch)
    ));
    for wrong in [
        "123",
        "a-different-episode",
        "v0123456789abcdef0123456789abcde!",
    ] {
        value["data"][VID]["video_model"]["video_id"] = json!(wrong);
        assert!(matches!(
            parse(&value, ""),
            Err(PlaybackError::IdentityMismatch)
        ));
    }
}
