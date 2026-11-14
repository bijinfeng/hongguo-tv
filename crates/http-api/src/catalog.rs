use crate::{ApiError, failure};
use axum::{
    Json,
    body::Bytes,
    extract::{Query, RawQuery, State, rejection::QueryRejection},
    http::StatusCode,
    response::Response,
};
use hongguo_core::catalog::{
    ActorQuery, ActorWorksResult, CatalogClient, CatalogError, CategoryParams, CategoryQuery,
    CategoryResult, Drama, SearchDiscovery, SearchQuery, SearchResult, SearchSuggestions,
    SuggestionQuery,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Successful real anonymous channel page, independent of search and category pagination.
#[derive(Serialize, ToSchema)]
pub struct FeedResponse {
    /// Always true.
    pub ok: bool,
    /// Channel summaries with exact continuation context and aggregate diagnostics.
    pub data: hongguo_core::catalog::FeedResult,
}
#[utoipa::path(get, path = "/api/v1/lists/recommend", params(hongguo_core::catalog::FeedParams),
    responses((status = 200, body = FeedResponse), (status = 400, body = ApiError),
        (status = 405, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn feed(
    State(client): State<CatalogClient>,
    params: Result<Query<hongguo_core::catalog::FeedParams>, QueryRejection>,
    body: Bytes,
) -> Result<Json<FeedResponse>, Response> {
    if !body.is_empty() {
        return Err(catalog_failure(CatalogError::InvalidInput));
    }
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let query = hongguo_core::catalog::FeedQuery::new(params).map_err(catalog_failure)?;
    let data = client.feed(&query).await.map_err(catalog_failure)?;
    Ok(Json(FeedResponse { ok: true, data }))
}

/// Successful anonymous category page with faithful cursor and optional selectors.
#[derive(Serialize, ToSchema)]
pub struct CategoryResponse {
    /// Always true.
    pub ok: bool,
    /// Bounded supported summaries and upstream continuation context.
    pub data: CategoryResult,
}
#[utoipa::path(get, path = "/api/v1/category", params(CategoryParams),
    responses((status = 200, body = CategoryResponse), (status = 400, body = ApiError),
        (status = 405, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn category(
    State(client): State<CatalogClient>,
    params: Result<Query<CategoryParams>, QueryRejection>,
    body: Bytes,
) -> Result<Json<CategoryResponse>, Response> {
    if !body.is_empty() {
        return Err(catalog_failure(CatalogError::InvalidInput));
    }
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let query = CategoryQuery::new(params).map_err(catalog_failure)?;
    let data = client.category(&query).await.map_err(catalog_failure)?;
    Ok(Json(CategoryResponse { ok: true, data }))
}

/// Successful website search page.
#[derive(Serialize, ToSchema)]
pub struct SearchResponse {
    /// Always true.
    pub ok: bool,
    /// Normalized website page.
    pub data: SearchResult,
}
/// Successful ordinary drama detail.
#[derive(Serialize, ToSchema)]
pub struct DetailResponse {
    /// Always true.
    pub ok: bool,
    /// Requested drama and ordered episodes.
    pub data: Drama,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SearchParams {
    q: String,
    #[serde(default)]
    offset: u32,
    source: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DetailParams {
    series_id: String,
    content_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SuggestionParams {
    q: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ActorParams {
    actor_id: String,
}

/// Successful anonymous actor identity and ordered works.
#[derive(Serialize, ToSchema)]
pub struct ActorWorksResponse {
    /// Always true.
    pub ok: bool,
    /// Identity-bound actor summary and complete supported page works.
    pub data: ActorWorksResult,
}
#[utoipa::path(get, path = "/api/v1/actors/works",
    params(("actor_id" = String, Query, description = "Trimmed nonzero ASCII decimal actor ID, 1–32 digits")),
    responses((status = 200, body = ActorWorksResponse), (status = 400, body = ApiError),
        (status = 405, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn actor_works(
    State(client): State<CatalogClient>,
    params: Result<Query<ActorParams>, QueryRejection>,
    body: Bytes,
) -> Result<Json<ActorWorksResponse>, Response> {
    if !body.is_empty() {
        return Err(catalog_failure(CatalogError::InvalidInput));
    }
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let query = ActorQuery::new(&params.actor_id).map_err(catalog_failure)?;
    let data = client.actor_works(&query).await.map_err(catalog_failure)?;
    Ok(Json(ActorWorksResponse { ok: true, data }))
}

/// Successful anonymous current-term suggestions.
#[derive(Serialize, ToSchema)]
pub struct SuggestionsResponse {
    /// Always true.
    pub ok: bool,
    /// Bounded typed suggestions; empty terms do not access the upstream.
    pub data: SearchSuggestions,
}
#[utoipa::path(get, path = "/api/v1/search/suggestions",
    params(("q" = String, Query, description = "Trimmed current term, 0–100 Unicode characters; no controls")),
    responses((status = 200, body = SuggestionsResponse), (status = 400, body = ApiError),
        (status = 405, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn suggestions(
    State(client): State<CatalogClient>,
    params: Result<Query<SuggestionParams>, QueryRejection>,
    body: Bytes,
) -> Result<Json<SuggestionsResponse>, Response> {
    if !body.is_empty() {
        return Err(catalog_failure(CatalogError::InvalidInput));
    }
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let query = SuggestionQuery::new(&params.q).map_err(catalog_failure)?;
    let data = client.suggestions(&query).await.map_err(catalog_failure)?;
    Ok(Json(SuggestionsResponse { ok: true, data }))
}

#[utoipa::path(get, path = "/api/v1/search",
    params(("q" = String, Query, description = "Trimmed term, 1–80 Unicode characters"),
        ("offset" = Option<u32>, Query, description = "Website pages consumed, 0–100000"),
        ("source" = Option<String>, Query, description = "Only web is supported")),
    responses((status = 200, body = SearchResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn search(
    State(client): State<CatalogClient>,
    params: Result<Query<SearchParams>, QueryRejection>,
) -> Result<Json<SearchResponse>, Response> {
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let query = SearchQuery::new(&params.q, params.offset, params.source.as_deref())
        .map_err(catalog_failure)?;
    let data = client.search(&query).await.map_err(catalog_failure)?;
    Ok(Json(SearchResponse { ok: true, data }))
}

#[utoipa::path(get, path = "/api/v1/series/detail",
    params(("series_id" = String, Query, description = "Nonzero decimal ID, 1–32 digits"),
        ("content_type" = Option<String>, Query, description = "Creator albums (1003) are unsupported")),
    responses((status = 200, body = DetailResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn detail(
    State(client): State<CatalogClient>,
    params: Result<Query<DetailParams>, QueryRejection>,
) -> Result<Json<DetailResponse>, Response> {
    let Query(params) = params.map_err(|_| catalog_failure(CatalogError::InvalidInput))?;
    let data = client
        .detail(&params.series_id, params.content_type.as_deref())
        .await
        .map_err(catalog_failure)?;
    Ok(Json(DetailResponse { ok: true, data }))
}
fn catalog_failure(error: CatalogError) -> Response {
    let status = match error {
        CatalogError::InvalidInput
        | CatalogError::UnsupportedSource
        | CatalogError::UnsupportedContent => StatusCode::BAD_REQUEST,
        CatalogError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        _ => StatusCode::BAD_GATEWAY,
    };
    failure(status, error.code(), &error.to_string())
}

/// Successful anonymous public discovery snapshot.
#[derive(Serialize, ToSchema)]
pub struct DiscoveryResponse {
    /// Always true.
    pub ok: bool,
    /// Bounded public suggestions and boards.
    pub data: SearchDiscovery,
}
#[utoipa::path(get, path = "/api/v1/search/discovery",
    responses((status = 200, body = DiscoveryResponse), (status = 400, body = ApiError),
        (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn discovery(
    State(client): State<CatalogClient>,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Result<Json<DiscoveryResponse>, Response> {
    if query.as_ref().is_some_and(|q| !q.is_empty()) || !body.is_empty() {
        return Err(catalog_failure(CatalogError::InvalidInput));
    }
    let data = client.search_discovery().await.map_err(catalog_failure)?;
    Ok(Json(DiscoveryResponse { ok: true, data }))
}
