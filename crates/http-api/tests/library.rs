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
    if status == StatusCode::OK && path.starts_with("/api/v1/library") {
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
    for name in ["Entry", "Library", "HistoryChange", "LibraryResponse"] {
        assert!(schema["components"]["schemas"][name].is_object());
    }
    let variant = &schema["components"]["schemas"]["HistoryChange"]["oneOf"][0];
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
    for method in ["get", "post"] {
        assert_eq!(
            schema["paths"]["/api/v1/library"][method]["responses"]["200"]["content"]["application/json"]
                ["schema"]["$ref"],
            "#/components/schemas/LibraryResponse"
        );
    }
}
