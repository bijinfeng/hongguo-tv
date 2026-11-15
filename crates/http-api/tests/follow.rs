//! Local follow boundary only: no real account or authenticated upstream requests.
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use hongguo_http_api::{DevPolicy, router};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn call(path: &str, method: &str, headers: &[(&str, &str)], body: &str) -> (u16, Value) {
    let mut request = Request::builder()
        .uri(path)
        .method(method)
        .header("host", "127.0.0.1:8080");
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    let response = router(DevPolicy::new(8080, None))
        .unwrap()
        .oneshot(request.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status().as_u16();
    let bytes = to_bytes(response.into_body(), 32768).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn follow_uses_existing_origin_body_and_method_boundaries() {
    let query = "/api/v1/follow?owner_id=123&owner_epoch=current";
    let body = r#"{"owner_id":"123","owner_epoch":"current","series_id":"9999999999999999999","enabled":true}"#;
    for (method, path, payload) in [("GET", query, ""), ("POST", "/api/v1/follow", body)] {
        for header in [
            ("host", "secret.invalid"),
            ("origin", "https://secret.invalid"),
            ("origin", "null"),
            ("sec-fetch-site", "cross-site"),
        ] {
            let (status, value) = call(
                path,
                method,
                &[header, ("content-type", "application/json")],
                payload,
            )
            .await;
            assert_eq!(status, 403);
            assert_eq!(value["code"], "FORBIDDEN_ORIGIN");
            assert!(!value.to_string().contains("secret.invalid"));
        }
    }
    assert_eq!(call("/api/v1/follow", "POST", &[], body).await.0, 415);
    assert_eq!(
        call(
            "/api/v1/follow",
            "POST",
            &[("content-type", "application/json")],
            &"x".repeat(32769),
        )
        .await
        .0,
        413
    );
    assert_eq!(call(query, "DELETE", &[], "").await.0, 405);
    // Recognized route with absent account services remains explicitly unavailable.
    for (method, path, payload) in [("GET", query, ""), ("POST", "/api/v1/follow", body)] {
        let (status, value) = call(
            path,
            method,
            &[("content-type", "application/json")],
            payload,
        )
        .await;
        assert_eq!(status, 501);
        assert_eq!(value["code"], "CORE_NOT_IMPLEMENTED");
    }
}

#[tokio::test]
async fn follow_rejects_unknown_scope_and_mutation_fields_before_services() {
    for path in [
        "/api/v1/follow",
        "/api/v1/follow?owner_id=123",
        "/api/v1/follow?owner_id=123&owner_epoch=current&url=https://secret.invalid",
        "/api/v1/follow?owner_id=123&owner_id=456&owner_epoch=current",
    ] {
        let (status, value) = call(path, "GET", &[], "").await;
        assert_eq!(status, 400);
        assert_eq!(value["code"], "ACCOUNT_REQUEST_INVALID");
        assert!(!value.to_string().contains("secret.invalid"));
    }
    for (path, body) in [
        (
            "/api/v1/follow",
            json!({"owner_id":"123","owner_epoch":"current","series_id":"11"}),
        ),
        (
            "/api/v1/follow",
            json!({"owner_id":"123","owner_epoch":"current","series_id":11,"enabled":true}),
        ),
        (
            "/api/v1/follow",
            json!({"owner_id":"123","owner_epoch":"current","series_id":"11","enabled":"true"}),
        ),
        (
            "/api/v1/follow",
            json!({"owner_id":"123","owner_epoch":"current","series_id":"11","enabled":true,"url":"https://secret.invalid"}),
        ),
        (
            "/api/v1/follow?owner_id=123",
            json!({"owner_id":"123","owner_epoch":"current","series_id":"11","enabled":true}),
        ),
    ] {
        let (status, value) = call(
            path,
            "POST",
            &[("content-type", "application/json")],
            &body.to_string(),
        )
        .await;
        assert_eq!(status, 400);
        assert_eq!(value["code"], "ACCOUNT_REQUEST_INVALID");
        assert!(!value.to_string().contains("secret.invalid"));
    }
}

#[test]
fn follow_schema_has_shared_required_scope_and_no_endpoint_options() {
    let schema = serde_json::to_value(hongguo_http_api::openapi()).unwrap();
    for name in [
        "FollowQuery",
        "FollowItem",
        "FollowSnapshot",
        "FollowMutationRequest",
        "FollowMutationResult",
        "SeriesStatus",
    ] {
        assert!(schema["components"]["schemas"][name].is_object(), "{name}");
    }
    for name in ["FollowQuery", "FollowMutationRequest"] {
        assert_eq!(
            schema["components"]["schemas"][name]["additionalProperties"],
            false
        );
    }
    for method in ["get", "post"] {
        for status in ["200", "400", "401", "403", "409", "501", "502"] {
            assert!(schema["paths"]["/api/v1/follow"][method]["responses"][status].is_object());
        }
    }
    let params = schema["paths"]["/api/v1/follow"]["get"]["parameters"]
        .as_array()
        .unwrap();
    assert_eq!(params.len(), 2);
    assert!(params.iter().all(|p| p["required"] == true));
}
