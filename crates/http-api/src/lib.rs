//! Loopback development transport. Public deployment requires session isolation first.
mod catalog;

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use hongguo_core::{
    CoreStatus,
    catalog::{CatalogClient, CatalogError},
};
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};

/// Exact listener authority and allowed browser origin. No wildcard CORS.
#[derive(Clone)]
pub struct DevPolicy {
    authority: String,
    origin: Option<HeaderValue>,
}
impl DevPolicy {
    /// Construct a policy for the bound loopback port.
    pub fn new(port: u16, origin: Option<HeaderValue>) -> Self {
        Self {
            authority: format!("127.0.0.1:{port}"),
            origin,
        }
    }
}

/// Successful status result using the shared response envelope.
#[derive(Serialize, ToSchema)]
#[non_exhaustive]
pub struct StatusResponse {
    /// Successful request.
    pub ok: bool,
    /// Core state.
    pub data: CoreStatus,
}
impl Default for StatusResponse {
    fn default() -> Self {
        Self {
            ok: true,
            data: CoreStatus::default(),
        }
    }
}

/// Machine-readable errors keep human copy independent of client branching.
#[derive(Default, Serialize, ToSchema)]
#[non_exhaustive]
pub struct ApiError {
    /// Always false.
    pub ok: bool,
    /// Stable error code.
    pub code: String,
    /// Human-readable description.
    pub error: String,
}
fn failure(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(ApiError {
            ok: false,
            code: code.into(),
            error: message.into(),
        }),
    )
        .into_response()
}

#[utoipa::path(get, path = "/api/v1/status", responses((status = 200, body = StatusResponse), (status = 403, body = ApiError)))]
async fn status() -> Json<StatusResponse> {
    Json(StatusResponse::default())
}
#[utoipa::path(get, path = "/healthz", responses((status = 200, description = "Process is ready")))]
async fn health() -> StatusCode {
    StatusCode::OK
}
async fn unavailable() -> Response {
    failure(
        StatusCode::NOT_IMPLEMENTED,
        "CORE_NOT_IMPLEMENTED",
        "此功能尚未开放",
    )
}
async fn not_found() -> Response {
    failure(StatusCode::NOT_FOUND, "NOT_FOUND", "Unknown route")
}

async fn boundary(State(policy): State<DevPolicy>, req: Request, next: Next) -> Response {
    let headers = req.headers();
    let origin = headers.get(header::ORIGIN);
    let allowed = headers.get(header::HOST).and_then(|h| h.to_str().ok())
        == Some(&policy.authority)
        && headers.get_all(header::HOST).iter().count() == 1
        && headers.get_all(header::ORIGIN).iter().count() <= 1
        && origin.is_none_or(|h| policy.origin.as_ref() == Some(h))
        && headers
            .get("sec-fetch-site")
            .is_none_or(|h| h != "cross-site");
    if !allowed {
        return failure(
            StatusCode::FORBIDDEN,
            "FORBIDDEN_ORIGIN",
            "Request origin is not allowed",
        );
    }
    if req.method() == Method::POST
        && headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| v.split(';').next().unwrap_or("").trim() != "application/json")
    {
        return failure(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "JSON_REQUIRED",
            "Expected application/json",
        );
    }
    let cors = origin.cloned();
    let (parts, body) = req.into_parts();
    let bytes = match axum::body::to_bytes(body, 32 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return failure(
                StatusCode::PAYLOAD_TOO_LARGE,
                "BODY_TOO_LARGE",
                "Request exceeds 32 KiB",
            );
        }
    };
    let req = Request::from_parts(parts, axum::body::Body::from(bytes));
    let mut response = if req.method() == Method::OPTIONS && cors.is_some() {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(req).await
    };
    if let Some(origin) = cors {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        response
            .headers_mut()
            .insert(header::VARY, HeaderValue::from_static("Origin"));
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type, Range"),
        );
    }
    response
}

/// Build the API with bounded JSON and explicit content migration failures.
pub fn router(policy: DevPolicy) -> Result<Router, CatalogError> {
    Ok(router_with_catalog(policy, CatalogClient::new()?))
}

/// Build with an explicitly initialized catalog; fixture tests can inject a loopback client.
pub fn router_with_catalog(policy: DevPolicy, catalog: CatalogClient) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/api/v1/status", get(status))
        .route("/api/v1/search", get(catalog::search))
        .route("/api/v1/series/detail", get(catalog::detail))
        .route("/api/v1/play/info", get(unavailable))
        .route("/api/v1/library", get(unavailable).post(unavailable))
        .route("/api/v1/account", get(unavailable))
        .route(
            "/api/v1/account/qr/{action}",
            get(unavailable).post(unavailable),
        )
        .fallback(not_found)
        .method_not_allowed_fallback(|| async {
            failure(
                StatusCode::METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "Method not allowed",
            )
        })
        .with_state(catalog)
        .layer(middleware::from_fn_with_state(policy, boundary))
}

#[derive(OpenApi)]
#[openapi(
    paths(status, health, catalog::search, catalog::detail),
    components(schemas(
        StatusResponse,
        CoreStatus,
        hongguo_core::Capabilities,
        ApiError,
        catalog::SearchResponse,
        catalog::DetailResponse,
        hongguo_core::catalog::Drama,
        hongguo_core::catalog::Episode,
        hongguo_core::catalog::SearchResult
    ))
)]
struct ApiDoc;

/// Export implemented endpoints only. Unmigrated account/playback DTOs remain separate.
pub fn openapi() -> utoipa::openapi::OpenApi {
    ApiDoc::openapi()
}
