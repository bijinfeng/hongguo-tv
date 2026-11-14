//! Loopback development transport. Public deployment requires session isolation first.
mod catalog;
mod library;
mod playback;
mod search_history;

use axum::{
    Json, Router,
    extract::{FromRef, Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use hongguo_core::{
    CoreStatus,
    catalog::{CatalogClient, CatalogError},
    library::LibraryStore,
    playback::PlaybackService,
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
    let mut response = (
        status,
        Json(ApiError {
            ok: false,
            code: code.into(),
            error: message.into(),
        }),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

#[utoipa::path(get, path = "/api/v1/status", responses((status = 200, body = StatusResponse), (status = 403, body = ApiError)))]
async fn status(State(state): State<ApiState>) -> Json<StatusResponse> {
    let mut result = StatusResponse::default();
    result.data.capabilities.history = state.library.is_some();
    result.data.capabilities.playback = state.playback.is_some();
    Json(result)
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
    if let Some(origin) = cors.clone() {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        response
            .headers_mut()
            .insert(header::VARY, HeaderValue::from_static("Origin"));
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, HEAD, POST, OPTIONS"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type, Range"),
        );
    }
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if cors.is_some() {
        response.headers_mut().insert(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static("Content-Range, Accept-Ranges, Content-Length"),
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
    router_with_services(policy, catalog, None)
}

#[derive(Clone)]
pub(crate) struct ApiState {
    catalog: CatalogClient,
    library: Option<LibraryStore>,
    playback: Option<PlaybackService>,
}
impl FromRef<ApiState> for CatalogClient {
    fn from_ref(state: &ApiState) -> Self {
        state.catalog.clone()
    }
}

#[derive(Clone)]
pub(crate) struct MediaState {
    playback: Option<PlaybackService>,
}
impl FromRef<ApiState> for MediaState {
    fn from_ref(state: &ApiState) -> Self {
        Self {
            playback: state.playback.clone(),
        }
    }
}

/// Native loopback listener: opaque media only, with no business or health routes.
pub fn media_router(policy: DevPolicy, playback: PlaybackService) -> Router {
    Router::new()
        .route(
            "/minireel-proxy/media/{token}",
            get(playback::media).head(playback::head_media),
        )
        .fallback(not_found)
        .with_state(MediaState {
            playback: Some(playback),
        })
        .layer(middleware::from_fn_with_state(policy, boundary))
}

/// Attach explicitly initialized services; absence of storage keeps library unavailable.
pub fn router_with_services(
    policy: DevPolicy,
    catalog: CatalogClient,
    library: Option<LibraryStore>,
) -> Router {
    router_with_playback(policy, catalog, library, None)
}

/// Attach an initialized playback service; omitted services remain explicitly unavailable.
pub fn router_with_playback(
    policy: DevPolicy,
    catalog: CatalogClient,
    library: Option<LibraryStore>,
    playback: Option<PlaybackService>,
) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/api/v1/status", get(status))
        .route("/api/v1/search", get(catalog::search))
        .route("/api/v1/search/discovery", get(catalog::discovery))
        .route("/api/v1/search/suggestions", get(catalog::suggestions))
        .route("/api/v1/actors/works", get(catalog::actor_works))
        .route("/api/v1/category", get(catalog::category))
        .route(
            "/api/v1/search/history",
            get(search_history::get).post(search_history::change),
        )
        .route("/api/v1/series/detail", get(catalog::detail))
        .route("/api/v1/play/info", get(playback::info))
        .route(
            "/api/v1/play/release",
            axum::routing::post(playback::release),
        )
        .route(
            "/minireel-proxy/media/{token}",
            get(playback::media).head(playback::head_media),
        )
        .route("/api/v1/library", get(library::get).post(library::change))
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
        .with_state(ApiState {
            catalog,
            library,
            playback,
        })
        .layer(middleware::from_fn_with_state(policy, boundary))
}

#[derive(OpenApi)]
#[openapi(
    paths(
        status,
        health,
        catalog::search,
        catalog::discovery,
        catalog::suggestions,
        catalog::actor_works,
        catalog::category,
        catalog::detail,
        library::get,
        library::change,
        search_history::get,
        search_history::change,
        playback::info,
        playback::release,
        playback::media,
        playback::head_media
    ),
    components(schemas(
        StatusResponse,
        CoreStatus,
        hongguo_core::Capabilities,
        ApiError,
        catalog::SearchResponse,
        catalog::DiscoveryResponse,
        catalog::SuggestionsResponse,
        catalog::ActorWorksResponse,
        catalog::CategoryResponse,
        hongguo_core::catalog::CategoryResult,
        hongguo_core::catalog::CategoryFilterRow,
        hongguo_core::catalog::CategoryFilterOption,
        hongguo_core::catalog::ActorSummary,
        hongguo_core::catalog::ActorWorksResult,
        hongguo_core::catalog::SearchSuggestions,
        hongguo_core::catalog::SearchSuggestion,
        hongguo_core::catalog::SuggestionKind,
        hongguo_core::catalog::SearchDiscovery,
        hongguo_core::catalog::DiscoveryItem,
        hongguo_core::catalog::DiscoveryBoard,
        hongguo_core::catalog::DiscoveryBoardKind,
        catalog::DetailResponse,
        hongguo_core::catalog::Drama,
        hongguo_core::catalog::Episode,
        hongguo_core::catalog::SearchResult,
        library::LibraryResponse,
        search_history::SearchHistoryResponse,
        hongguo_core::library::SearchHistory,
        hongguo_core::library::SearchHistoryChange,
        playback::PlayResponse,
        playback::ReleaseRequest,
        playback::ReleaseResponse,
        playback::ReleaseResult,
        hongguo_core::playback::PlayInfo,
        hongguo_core::library::Entry,
        hongguo_core::library::Library,
        hongguo_core::library::HistoryChange,
        hongguo_core::library::HistoryKind,
        hongguo_core::library::Progress
    ))
)]
struct ApiDoc;

/// Export implemented endpoints only. Account compatibility DTOs remain separate.
pub fn openapi() -> utoipa::openapi::OpenApi {
    use utoipa::openapi::{RefOr, schema::Schema};
    let mut doc = ApiDoc::openapi();
    if let Some(components) = &mut doc.components {
        let progress = components.schemas.get("Progress").cloned();
        if let (
            Some(RefOr::T(Schema::Object(mut progress))),
            Some(RefOr::T(Schema::OneOf(change))),
        ) = (progress, components.schemas.get_mut("HistoryChange"))
        {
            // Utoipa 6 adds the tag via allOf, conflicting with the closed Progress object.
            if let Some(RefOr::T(Schema::AllOf(variant))) = change.items.first()
                && let Some(RefOr::T(Schema::Object(tag))) = variant.items.last()
            {
                progress.properties.extend(tag.properties.clone());
                progress.required.extend(tag.required.clone());
                change.items[0] = Schema::Object(progress).into();
            }
        }
    }
    doc
}
