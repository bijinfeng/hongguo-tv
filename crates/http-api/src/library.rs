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
use hongguo_core::library::{HistoryChange, Library, LibraryError};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Committed guest history using the shared envelope.
#[derive(Serialize, ToSchema)]
pub struct LibraryResponse {
    /// Always true.
    pub ok: bool,
    /// Persisted snapshot.
    pub data: Library,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LibraryParams {
    owner_id: Option<String>,
}

#[utoipa::path(get, path = "/api/v1/library",
    params(("owner_id" = Option<String>, Query, description = "Absent or empty for guests")),
    responses((status = 200, body = LibraryResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 409, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn get(
    State(state): State<ApiState>,
    params: Result<Query<LibraryParams>, QueryRejection>,
) -> Response {
    let result = async {
        let Query(params) = params.map_err(|_| LibraryError::InvalidInput)?;
        if params.owner_id.as_ref().is_some_and(|id| !id.is_empty()) {
            return Err(LibraryError::OwnerChanged);
        }
        match state.library {
            Some(store) => store.snapshot().await.map(Some),
            None => Ok(None),
        }
    }
    .await;
    response(result)
}
#[utoipa::path(post, path = "/api/v1/library", request_body = HistoryChange,
    responses((status = 200, body = LibraryResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 409, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn change(
    State(state): State<ApiState>,
    payload: Result<Json<HistoryChange>, JsonRejection>,
) -> Response {
    let result = async {
        let Json(change) = payload.map_err(|_| LibraryError::InvalidInput)?;
        match state.library {
            Some(store) => store.apply(change).await.map(Some),
            None => Ok(None),
        }
    }
    .await;
    response(result)
}
fn response(result: Result<Option<Library>, LibraryError>) -> Response {
    let mut response = match result {
        Ok(Some(data)) => Json(LibraryResponse { ok: true, data }).into_response(),
        Ok(None) => failure(
            StatusCode::NOT_IMPLEMENTED,
            "CORE_NOT_IMPLEMENTED",
            "此功能尚未开放",
        ),
        Err(error) => {
            let status = match error {
                LibraryError::InvalidInput => StatusCode::BAD_REQUEST,
                LibraryError::OwnerChanged => StatusCode::CONFLICT,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            failure(status, error.code(), &error.to_string())
        }
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
