use crate::{ApiError, ApiState, failure};
use axum::{
    Json,
    extract::{
        Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use hongguo_core::library::{SearchHistory, SearchHistoryChange, SearchHistoryError};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Committed device-local keyword snapshot.
#[derive(Serialize, ToSchema)]
pub struct SearchHistoryResponse {
    /// Always true.
    pub ok: bool,
    /// Newest keywords first.
    pub data: SearchHistory,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NoParams {}

#[utoipa::path(get, path = "/api/v1/search/history", operation_id = "get_search_history",
    responses((status = 200, body = SearchHistoryResponse), (status = 400, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn get(
    State(state): State<ApiState>,
    params: Result<Query<NoParams>, QueryRejection>,
) -> Response {
    let result = async {
        params.map_err(|_| SearchHistoryError::invalid_input())?;
        match state.library {
            Some(store) => store.search_history().await.map(Some),
            None => Ok(None),
        }
    }
    .await;
    response(result)
}
#[utoipa::path(post, path = "/api/v1/search/history", operation_id = "change_search_history", request_body = SearchHistoryChange,
    responses((status = 200, body = SearchHistoryResponse), (status = 400, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn change(
    State(state): State<ApiState>,
    params: Result<Query<NoParams>, QueryRejection>,
    payload: Result<Json<SearchHistoryChange>, JsonRejection>,
) -> Response {
    let result = async {
        params.map_err(|_| SearchHistoryError::invalid_input())?;
        let Json(change) = payload.map_err(|_| SearchHistoryError::invalid_input())?;
        match state.library {
            Some(store) => store.change_search_history(change).await.map(Some),
            None => Ok(None),
        }
    }
    .await;
    response(result)
}
fn response(result: Result<Option<SearchHistory>, SearchHistoryError>) -> Response {
    let mut response = match result {
        Ok(Some(data)) => Json(SearchHistoryResponse { ok: true, data }).into_response(),
        Ok(None) => failure(
            StatusCode::NOT_IMPLEMENTED,
            "CORE_NOT_IMPLEMENTED",
            "此功能尚未开放",
        ),
        Err(error) => failure(
            if error.is_invalid_input() {
                StatusCode::BAD_REQUEST
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            },
            error.code(),
            &error.to_string(),
        ),
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
