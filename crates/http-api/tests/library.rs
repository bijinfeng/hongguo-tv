//! Library transport behavior with disposable storage and no external requests.
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use hongguo_core::{catalog::CatalogClient, library::LibraryStore};
use hongguo_http_api::{DevPolicy, router_with_services};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
use tower::ServiceExt;

struct Fixture {
    dir: PathBuf,
    app: Router,
}
impl Fixture {
    async fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "hongguo-library-api-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let store = LibraryStore::open(dir.join("guest.sqlite3")).await.unwrap();
        let app = router_with_services(
            DevPolicy::new(8080, Some("http://127.0.0.1:8790".parse().unwrap())),
            CatalogClient::new().unwrap(),
            Some(store),
        );
        Self { dir, app }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        drop(std::mem::replace(&mut self.app, Router::new()));
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
async fn call(
    app: &Router,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1:8080");
    for (k, v) in headers {
        request = request.header(*k, *v);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    if status == StatusCode::OK
        && (path.starts_with("/api/v1/library") || path.starts_with("/api/v1/search/history"))
    {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}
fn progress() -> Value {
    json!({"action":"progress", "owner_id":"", "drama":{"series_id":"9999999999999999999","title":"离线短剧","cover":"","intro":""}, "episode":2,"video_id":"123", "position":12.5,"duration":60,"completed":true})
}
const JSON: &[(&str, &str)] = &[("content-type", "application/json")];

#[tokio::test]
async fn library_operation_receipts_replay_once_and_preserve_legacy_payloads() {
    let mut f = Fixture::new().await;
    let (status, searches) = call(
        &f.app,
        "POST",
        "/api/v1/search/history",
        JSON,
        r#"{"action":"add","query":"重生"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, session) = call(&f.app, "POST", "/api/v1/library/session", JSON, "{}").await;
    assert_eq!(status, StatusCode::OK);
    let session = session["data"]["session_id"].as_str().unwrap();
    assert_eq!(session.len(), 32);
    let path = format!("/api/v1/library/operation?session_id={session}&operation_id=1");
    let body = progress().to_string();
    let (status, receipt) = call(&f.app, "POST", &path, JSON, &body).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(receipt["data"]["session_id"], session);
    assert_eq!(receipt["data"]["operation_id"], "1");
    assert_eq!(receipt["data"]["outcome"]["status"], "committed");
    assert_eq!(call(&f.app, "POST", &path, JSON, &body).await.1, receipt);
    let mut changed = progress();
    changed["position"] = json!(30);
    let (status, rejected) = call(&f.app, "POST", &path, JSON, &changed.to_string()).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(rejected["code"], "LIBRARY_OPERATION_CONFLICT");
    assert!(rejected.get("data").is_none());
    let second_path = format!("/api/v1/library/operation?session_id={session}&operation_id=2");
    let mut second = progress();
    second["drama"]["series_id"] = json!("8888888888888888888");
    assert_eq!(
        call(&f.app, "POST", &second_path, JSON, &second.to_string())
            .await
            .0,
        StatusCode::OK
    );
    let next = format!("/api/v1/library/operation?session_id={session}&operation_id=3");
    let remove = json!({"action":"remove","kind":"history","series_id":"9999999999999999999"});
    let mut foreign = remove.clone();
    foreign["owner_id"] = json!("another");
    let (status, refused) = call(&f.app, "POST", &next, JSON, &foreign.to_string()).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(refused["code"], "LIBRARY_OWNER_CHANGED");
    let (status, removed) = call(&f.app, "POST", &next, JSON, &remove.to_string()).await;
    assert_eq!(status, StatusCode::OK);
    let retained = &removed["data"]["outcome"]["library"];
    assert_eq!(retained["entries"].as_array().unwrap().len(), 1);
    assert_eq!(
        retained["entries"][0]["drama"]["series_id"],
        "8888888888888888888"
    );
    assert_eq!(
        call(&f.app, "POST", &next, JSON, &remove.to_string())
            .await
            .1,
        removed
    );
    let (status, stale) = call(&f.app, "POST", &path, JSON, &body).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(stale["code"], "LIBRARY_OPERATION_SEQUENCE");
    // Recreate the HTTP owner and SQLite connection; do not infer persistence from a receipt cache.
    f.app = Router::new();
    f.app = router_with_services(
        DevPolicy::new(8080, None),
        CatalogClient::new().unwrap(),
        Some(
            LibraryStore::open(f.dir.join("guest.sqlite3"))
                .await
                .unwrap(),
        ),
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1["data"],
        *retained
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/search/history", &[], "")
            .await
            .1,
        searches
    );
    let (_, new_session) = call(&f.app, "POST", "/api/v1/library/session", JSON, "{}").await;
    let (status, expired) = call(&f.app, "POST", &next, JSON, &remove.to_string()).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(expired["code"], "LIBRARY_SESSION_EXPIRED");
    let mut clear_path = format!(
        "/api/v1/library/operation?session_id={}&operation_id=1",
        new_session["data"]["session_id"].as_str().unwrap()
    );
    let (status, refused) = call(
        &f.app,
        "POST",
        &clear_path,
        JSON,
        r#"{"action":"clear","kind":"history","owner_id":"another"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(refused["code"], "LIBRARY_OWNER_CHANGED");
    let connection = rusqlite::Connection::open(f.dir.join("guest.sqlite3")).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_clear BEFORE DELETE ON history BEGIN SELECT RAISE(ABORT, 'private deletion failure'); END;").unwrap();
    let clear = r#"{"action":"clear","kind":"history"}"#;
    let (status, failed) = call(&f.app, "POST", &clear_path, JSON, clear).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(failed["data"]["outcome"]["status"], "failed");
    assert_eq!(
        failed["data"]["outcome"]["code"],
        "LIBRARY_STORAGE_UNAVAILABLE"
    );
    assert!(!failed.to_string().contains("private deletion"));
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1["data"],
        *retained
    );
    connection
        .execute_batch("DROP TRIGGER reject_clear;")
        .unwrap();
    assert_eq!(
        call(&f.app, "POST", &clear_path, JSON, clear).await.1,
        failed
    );
    clear_path = clear_path.replace("operation_id=1", "operation_id=2");
    let (status, cleared) = call(&f.app, "POST", &clear_path, JSON, clear).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cleared["data"]["outcome"]["library"]["entries"], json!([]));
    f.app = Router::new();
    f.app = router_with_services(
        DevPolicy::new(8080, None),
        CatalogClient::new().unwrap(),
        Some(
            LibraryStore::open(f.dir.join("guest.sqlite3"))
                .await
                .unwrap(),
        ),
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1["data"]["entries"],
        json!([])
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/search/history", &[], "")
            .await
            .1,
        searches
    );
    let status = call(&f.app, "GET", "/api/v1/status", &[], "").await.1;
    assert_eq!(status["data"]["capabilities"]["account"], false);
    assert_eq!(status["data"]["capabilities"]["playback"], false);
}

#[tokio::test]
async fn library_operation_rejections_do_not_register_or_consume_identity() {
    let f = Fixture::new().await;
    let (_, session) = call(&f.app, "POST", "/api/v1/library/session", JSON, "{}").await;
    let session = session["data"]["session_id"].as_str().unwrap();
    for path in [
        format!("/api/v1/library/operation?session_id={session}"),
        "/api/v1/library/operation?operation_id=1".into(),
        format!("/api/v1/library/operation?session_id={session}&operation_id=01"),
        format!("/api/v1/library/operation?session_id={session}&operation_id=1&extra=1"),
    ] {
        assert_eq!(
            call(&f.app, "POST", &path, JSON, &progress().to_string())
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    let path = format!("/api/v1/library/operation?session_id={session}&operation_id=1");
    let mut foreign = progress();
    foreign["owner_id"] = json!("another");
    let (status, refused) = call(&f.app, "POST", &path, JSON, &foreign.to_string()).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(refused["code"], "LIBRARY_OWNER_CHANGED");
    assert!(refused.get("data").is_none());
    assert_eq!(
        call(&f.app, "POST", &path, JSON, &progress().to_string())
            .await
            .0,
        StatusCode::OK
    );
    let (status, refused) = call(
        &f.app,
        "POST",
        "/api/v1/library/session",
        JSON,
        r#"{"owner_id":"another"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(refused["code"], "LIBRARY_OWNER_CHANGED");
    // A rejected session request cannot seal the valid session or re-execute its last operation.
    assert_eq!(
        call(&f.app, "POST", &path, JSON, &progress().to_string())
            .await
            .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn registered_storage_failure_is_a_terminal_receipt_not_an_ambiguous_transport_error() {
    let f = Fixture::new().await;
    let connection = rusqlite::Connection::open(f.dir.join("guest.sqlite3")).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_progress BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'private SQL diagnostic'); END;").unwrap();
    let (_, session) = call(&f.app, "POST", "/api/v1/library/session", JSON, "{}").await;
    let session = session["data"]["session_id"].as_str().unwrap();
    let path = format!("/api/v1/library/operation?session_id={session}&operation_id=1");
    let (status, failed) = call(&f.app, "POST", &path, JSON, &progress().to_string()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(failed["ok"], true);
    assert_eq!(failed["data"]["outcome"]["status"], "failed");
    assert_eq!(
        failed["data"]["outcome"]["code"],
        "LIBRARY_STORAGE_UNAVAILABLE"
    );
    assert!(!failed.to_string().contains("private SQL"));
    connection
        .execute_batch("DROP TRIGGER reject_progress;")
        .unwrap();
    assert_eq!(
        call(&f.app, "POST", &path, JSON, &progress().to_string())
            .await
            .1,
        failed
    );
    let next = format!("/api/v1/library/operation?session_id={session}&operation_id=2");
    assert_eq!(
        call(&f.app, "POST", &next, JSON, &progress().to_string())
            .await
            .1["data"]["outcome"]["status"],
        "committed"
    );
}

#[tokio::test]
async fn guest_routes_save_restore_remove_and_clear_without_accounts() {
    let f = Fixture::new().await;
    let (status, empty) = call(&f.app, "GET", "/api/v1/library", &[], "").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(empty["data"]["entries"], json!([]));
    let (status, saved) = call(
        &f.app,
        "POST",
        "/api/v1/library",
        JSON,
        &progress().to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["data"]["entries"][0]["completed"], true);
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1,
        saved
    );
    let capabilities = call(&f.app, "GET", "/api/v1/status", &[], "").await.1;
    assert_eq!(capabilities["data"]["capabilities"]["history"], true);
    assert_eq!(capabilities["data"]["capabilities"]["account"], false);
    assert_eq!(capabilities["data"]["capabilities"]["playback"], false);
    for payload in [
        json!({"action":"remove","kind":"history","series_id":"9999999999999999999"}),
        json!({"action":"clear","kind":"history"}),
    ] {
        let (status, value) = call(
            &f.app,
            "POST",
            "/api/v1/library",
            JSON,
            &payload.to_string(),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(value["data"]["entries"], json!([]));
    }
}

#[tokio::test]
async fn invalid_payloads_and_origins_preserve_records_and_sanitize_errors() {
    let f = Fixture::new().await;
    let saved = call(
        &f.app,
        "POST",
        "/api/v1/library",
        JSON,
        &progress().to_string(),
    )
    .await
    .1;
    for raw in [
        "{}".into(),
        "null".into(),
        format!("{} {{}}", progress()),
        r#"{"action":"clear","kind":"history","secret":"PRIVATE_VALUE"}"#.into(),
        r#"{"action":"clear","kind":"favorites"}"#.into(),
        {
            let mut p = progress();
            p["position"] = json!(-1);
            p.to_string()
        },
        {
            let mut p = progress();
            p["episode"] = json!("PRIVATE_VALUE");
            p.to_string()
        },
    ] {
        let (status, error) = call(&f.app, "POST", "/api/v1/library", JSON, &raw).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{error}");
        assert_eq!(error["code"], "LIBRARY_REQUEST_INVALID");
        assert!(!error.to_string().contains("PRIVATE_VALUE"));
    }
    let mut owner = progress();
    owner["owner_id"] = json!("other");
    assert_eq!(
        call(&f.app, "POST", "/api/v1/library", JSON, &owner.to_string())
            .await
            .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library?owner_id=other", &[], "")
            .await
            .0,
        StatusCode::CONFLICT
    );
    for headers in [
        vec![
            ("content-type", "application/json"),
            ("origin", "https://evil.test"),
        ],
        vec![("content-type", "application/json"), ("host", "evil.test")],
    ] {
        assert_eq!(
            call(
                &f.app,
                "POST",
                "/api/v1/library",
                &headers,
                &progress().to_string()
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        call(&f.app, "POST", "/api/v1/library", &[], "{}").await.0,
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    assert_eq!(
        call(&f.app, "POST", "/api/v1/library", JSON, &"x".repeat(32769))
            .await
            .0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1,
        saved
    );
}

#[tokio::test]
async fn disk_failure_returns_stable_error_and_previous_snapshot() {
    let f = Fixture::new().await;
    let saved = call(
        &f.app,
        "POST",
        "/api/v1/library",
        JSON,
        &progress().to_string(),
    )
    .await
    .1;
    let conn = rusqlite::Connection::open(f.dir.join("guest.sqlite3")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_write BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT,'private SQL detail'); END;").unwrap();
    let (status, error) = call(
        &f.app,
        "POST",
        "/api/v1/library",
        JSON,
        &progress().to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(error["code"], "LIBRARY_STORAGE_UNAVAILABLE");
    assert!(!error.to_string().contains("private"));
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1,
        saved
    );
}

#[test]
fn schema_contains_generated_history_and_strict_mutations() {
    let schema = serde_json::to_value(hongguo_http_api::openapi()).unwrap();
    for name in [
        "Entry",
        "FavoriteEntry",
        "Library",
        "LibraryChange",
        "LibraryResponse",
    ] {
        assert!(schema["components"]["schemas"][name].is_object());
    }
    assert_eq!(
        schema["components"]["schemas"]["HistoryChange"]["$ref"],
        "#/components/schemas/LibraryChange"
    );
    assert_eq!(
        schema["components"]["schemas"]["HistoryKind"]["$ref"],
        "#/components/schemas/LibraryKind"
    );
    let variant = &schema["components"]["schemas"]["LibraryChange"]["oneOf"][0];
    let payload = progress();
    // Every key of a valid wire payload must be allowed by the closed object schema.
    assert_eq!(variant["type"], "object");
    assert_eq!(variant["additionalProperties"], false);
    for key in payload.as_object().unwrap().keys() {
        assert!(variant["properties"].get(key).is_some(), "{key}");
    }
    for key in variant["required"].as_array().unwrap() {
        assert!(payload.get(key.as_str().unwrap()).is_some());
    }
    assert_eq!(variant["properties"]["action"]["enum"], json!(["progress"]));
    let canonical = &schema["components"]["schemas"]["LibraryChange"];
    assert_eq!(canonical["oneOf"].as_array().unwrap().len(), 4);
    let favorite = canonical["oneOf"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["properties"]["action"]["enum"] == json!(["favorite"]))
        .unwrap();
    assert_eq!(favorite["additionalProperties"], false);
    assert_eq!(favorite["properties"]["value"]["type"], "boolean");
    assert_eq!(
        schema["components"]["schemas"]["LibraryKind"]["enum"],
        json!(["history", "favorites"])
    );
    assert!(
        schema["components"]["schemas"]["Library"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("favorites"))
    );
    assert!(
        schema["components"]["schemas"]["Account"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("sync"))
    );
    for method in ["get", "post"] {
        assert_eq!(
            schema["paths"]["/api/v1/library"][method]["responses"]["200"]["content"]["application/json"]
                ["schema"]["$ref"],
            "#/components/schemas/LibraryResponse"
        );
    }
}

#[tokio::test]
async fn keyword_routes_are_local_strict_and_preserve_viewing_history() {
    let f = Fixture::new().await;
    let (_, viewing) = call(
        &f.app,
        "POST",
        "/api/v1/library",
        JSON,
        &progress().to_string(),
    )
    .await;
    let (status, empty) = call(&f.app, "GET", "/api/v1/search/history", &[], "").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(empty["data"]["items"], json!([]));
    let (status, saved) = call(
        &f.app,
        "POST",
        "/api/v1/search/history",
        JSON,
        r#"{"action":"add","query":"  古装  重生  "}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["data"]["items"], json!(["古装 重生"]));
    for (method, path, body) in [
        ("GET", "/api/v1/search/history?owner_id=x", ""),
        (
            "POST",
            "/api/v1/search/history?q=x",
            r#"{"action":"clear"}"#,
        ),
        (
            "POST",
            "/api/v1/search/history",
            r#"{"action":"add","query":" "}"#,
        ),
        (
            "POST",
            "/api/v1/search/history",
            r#"{"action":"clear","query":"not allowed"}"#,
        ),
        (
            "POST",
            "/api/v1/search/history",
            r#"{"action":"add","query":"x","extra":true}"#,
        ),
    ] {
        let (status, error) = call(&f.app, method, path, JSON, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{path} {body}");
        assert_eq!(error["code"], "SEARCH_HISTORY_REQUEST_INVALID");
    }
    assert_eq!(
        call(&f.app, "GET", "/api/v1/search/history", &[], "")
            .await
            .1,
        saved
    );
    assert_eq!(
        call(
            &f.app,
            "POST",
            "/api/v1/search/history",
            &[],
            r#"{"action":"clear"}"#
        )
        .await
        .0,
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    let (status, _) = call(
        &f.app,
        "POST",
        "/api/v1/search/history",
        &[
            ("content-type", "application/json"),
            ("origin", "https://foreign.invalid"),
        ],
        r#"{"action":"clear"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        call(
            &f.app,
            "POST",
            "/api/v1/search/history",
            JSON,
            r#"{"action":"clear"}"#
        )
        .await
        .1,
        empty
    );
    assert_eq!(
        call(&f.app, "GET", "/api/v1/library", &[], "").await.1,
        viewing
    );
}
