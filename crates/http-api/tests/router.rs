//! Exercise the transport boundary without a real network or account.
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use hongguo_http_api::{DevPolicy, router};
use tower::ServiceExt;

async fn request(
    path: &str,
    method: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> axum::response::Response {
    let mut req = Request::builder()
        .uri(path)
        .method(method)
        .header("host", "127.0.0.1:8080");
    for (key, value) in headers {
        req = req.header(*key, *value);
    }
    router(DevPolicy::new(
        8080,
        Some("http://127.0.0.1:8790".parse().unwrap()),
    ))
    .oneshot(req.body(Body::from(body.to_owned())).unwrap())
    .await
    .unwrap()
}
#[tokio::test]
async fn status_is_honest_about_capabilities() {
    let response = request("/api/v1/status", "GET", &[], "").await;
    assert_eq!(response.status(), StatusCode::OK);
    let value: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 32768).await.unwrap()).unwrap();
    assert_eq!(value["data"]["api_version"], "v1");
    assert_eq!(value["data"]["capabilities"]["playback"], false);
    let response = request("/api/v1/search?q=test", "GET", &[], "").await;
    assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    let value: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 32768).await.unwrap()).unwrap();
    assert_eq!(value["ok"], false);
    assert_eq!(value["code"], "CORE_NOT_IMPLEMENTED");
}
#[tokio::test]
async fn rejects_rebinding_cross_site_and_unbounded_writes() {
    for headers in [
        vec![("host", "evil.test")],
        vec![("origin", "https://evil.test")],
        vec![("origin", "null")],
        vec![("sec-fetch-site", "cross-site")],
    ] {
        assert_eq!(
            request("/api/v1/status", "GET", &headers, "")
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        request("/api/v1/library", "POST", &[], "{}").await.status(),
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    assert_eq!(
        request(
            "/api/v1/library",
            "POST",
            &[("content-type", "application/json")],
            &"x".repeat(32769)
        )
        .await
        .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        request("/private", "GET", &[], "").await.status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request("/healthz", "DELETE", &[], "").await.status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
}
#[tokio::test]
async fn browser_preflight_has_exact_origin_and_native_needs_none() {
    let response = request(
        "/api/v1/library",
        "OPTIONS",
        &[("origin", "http://127.0.0.1:8790")],
        "",
    )
    .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response.headers()["access-control-allow-origin"],
        "http://127.0.0.1:8790"
    );
    assert_eq!(response.headers()["vary"], "Origin");
    assert_eq!(
        request("/healthz", "GET", &[], "").await.status(),
        StatusCode::OK
    );
}
