//! Catalog routes use a real loopback upstream; no live website or account is required.
use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    response::IntoResponse,
    routing::get,
};
use hongguo_core::catalog::CatalogClient;
use hongguo_http_api::{DevPolicy, router_with_catalog};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tower::ServiceExt;

struct Fixture {
    app: Router,
    calls: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn fixture(status: StatusCode, body: &'static str) -> Fixture {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let captured = calls.clone();
    let upstream = Router::new().fallback(get(move || {
        captured.fetch_add(1, Ordering::SeqCst);
        async move { (status, body).into_response() }
    }));
    let task = tokio::spawn(async {
        axum::serve(listener, upstream).await.unwrap();
    });
    Fixture {
        app: router_with_catalog(DevPolicy::new(8080, None), client),
        calls,
        task,
    }
}
async fn request(
    app: Router,
    uri: &str,
    host: &str,
    origin: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut req = Request::builder().uri(uri).header("host", host);
    if let Some(origin) = origin {
        req = req.header("origin", origin);
    }
    let response = app.oneshot(req.body(Body::empty()).unwrap()).await.unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 32768).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn search_and_detail_emit_compatible_generated_envelopes() {
    let fixtures = [
        (
            "/api/v1/search?q=test",
            include_str!("../../../contracts/fixtures/catalog/search.input.json"),
            include_str!("../../../contracts/fixtures/catalog/search.expected.json"),
        ),
        (
            "/api/v1/series/detail?series_id=7690163276214176792&content_type=",
            include_str!("../../../contracts/fixtures/catalog/detail.input.html"),
            include_str!("../../../contracts/fixtures/catalog/detail.expected.json"),
        ),
    ];
    for (path, input, expected) in fixtures {
        let fixture = fixture(StatusCode::OK, input).await;
        let (status, result) = request(fixture.app.clone(), path, "127.0.0.1:8080", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(result["ok"], true);
        assert_eq!(
            result["data"],
            serde_json::from_str::<serde_json::Value>(expected).unwrap()
        );
        assert_eq!(fixture.calls.load(Ordering::SeqCst), 1);
    }
}

#[tokio::test]
async fn rejects_queries_and_wrong_origins_before_accessing_upstream() {
    let fixture = fixture(StatusCode::OK, "{}").await;
    for path in [
        "/api/v1/search",
        "/api/v1/search?q=%20",
        "/api/v1/search?q=x&offset=-1",
        "/api/v1/search?q=x&offset=oops",
        "/api/v1/search?q=x&offset=100001",
        "/api/v1/search?q=x&offset=4294967296",
        "/api/v1/search?q=x&q=y",
        "/api/v1/search?q=x&source=app",
        "/api/v1/search?q=x&url=http://evil.test",
        "/api/v1/series/detail?series_id=0",
        "/api/v1/series/detail?series_id=../1",
        "/api/v1/series/detail?series_id=1&content_type=1003",
    ] {
        let (status, result) = request(fixture.app.clone(), path, "127.0.0.1:8080", None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{path}: {result}");
        assert_eq!(result["ok"], false);
        assert!(
            result["code"].as_str().unwrap().starts_with("INVALID_")
                || result["code"].as_str().unwrap().starts_with("UNSUPPORTED_")
        );
    }
    for (host, origin) in [
        ("evil.test", None),
        ("127.0.0.1:8080", Some("https://evil.test")),
    ] {
        assert_eq!(
            request(fixture.app.clone(), "/api/v1/search?q=x", host, origin)
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(fixture.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn upstream_failures_stay_structured_and_do_not_leak_payloads() {
    for (upstream, body, code) in [
        (
            StatusCode::FORBIDDEN,
            r#"{"code":"search_verification_required","token":"secret"}"#,
            "SEARCH_VERIFICATION_REQUIRED",
        ),
        (
            StatusCode::OK,
            "secret invalid json",
            "UPSTREAM_INVALID_DATA",
        ),
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "secret",
            "UPSTREAM_HTTP_ERROR",
        ),
    ] {
        let fixture = fixture(upstream, body).await;
        let (status, result) = request(
            fixture.app.clone(),
            "/api/v1/search?q=x",
            "127.0.0.1:8080",
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_GATEWAY);
        assert_eq!(result["code"], code);
        assert!(!result.to_string().contains("secret"));
    }
}

#[test]
fn openapi_has_directory_schemas_parameters_and_error_responses() {
    let schema = serde_json::to_value(hongguo_http_api::openapi()).unwrap();
    for path in ["/api/v1/search", "/api/v1/series/detail"] {
        for status in ["200", "400", "403", "502", "504"] {
            assert!(
                schema["paths"][path]["get"]["responses"]
                    .get(status)
                    .is_some()
            );
        }
    }
    for name in ["Drama", "Episode", "SearchResult"] {
        assert!(schema["components"]["schemas"].get(name).is_some());
    }
}
