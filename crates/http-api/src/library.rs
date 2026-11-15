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
use hongguo_core::library::{
    Library, LibraryChange, LibraryError, LibraryOperation, LibraryOperationIdentity,
    LibraryWriteSession, LibraryWriteSessionRequest,
};
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
/// A local write session issued after prior registered work has terminated.
#[derive(Serialize, ToSchema)]
pub struct LibraryWriteSessionResponse {
    /// Always true.
    pub ok: bool,
    /// The opaque session identity.
    pub data: LibraryWriteSession,
}
/// Registered terminal result; execution failure remains an explicit outcome in a successful envelope.
#[derive(Serialize, ToSchema)]
pub struct LibraryOperationResponse {
    /// Always true; inspect data.outcome for the operation result.
    pub ok: bool,
    /// Receipt for the exact registered identity.
    pub data: LibraryOperation,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NoParams {}
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
        if let Some(account) = state.account {
            return account
                .library_snapshot(params.owner_id.as_deref())
                .await
                .map(Some);
        }
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
#[utoipa::path(post, path = "/api/v1/library", request_body = LibraryChange,
    responses((status = 200, body = LibraryResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 409, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn change(
    State(state): State<ApiState>,
    payload: Result<Json<LibraryChange>, JsonRejection>,
) -> Response {
    let result = async {
        let Json(change) = payload.map_err(|_| LibraryError::InvalidInput)?;
        if !change.is_history() {
            return Err(LibraryError::InvalidInput);
        }
        if let Some(account) = state.account {
            return account.apply_history(change).await.map(Some);
        }
        match state.library {
            Some(store) => store.apply(change).await.map(Some),
            None => Ok(None),
        }
    }
    .await;
    response(result)
}
#[utoipa::path(post, path = "/api/v1/library/session", request_body = LibraryWriteSessionRequest,
    responses((status = 200, body = LibraryWriteSessionResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 409, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn session(
    State(state): State<ApiState>,
    params: Result<Query<NoParams>, QueryRejection>,
    payload: Result<Json<LibraryWriteSessionRequest>, JsonRejection>,
) -> Response {
    response(
        async {
            params.map_err(|_| LibraryError::InvalidInput)?;
            let Json(request) = payload.map_err(|_| LibraryError::InvalidInput)?;
            if let Some(account) = state.account {
                return account.write_session(request).await.map(Some);
            }
            match state.library {
                Some(store) => store.write_session(request).await.map(Some),
                None => Ok(None),
            }
        }
        .await,
    )
}

#[utoipa::path(post, path = "/api/v1/library/operation", request_body = LibraryChange,
    params(("session_id" = String, Query, description = "Server-issued write session"),
        ("operation_id" = String, Query, description = "Consecutive canonical decimal identity, starting at 1")),
    responses((status = 200, body = LibraryOperationResponse), (status = 400, body = ApiError),
        (status = 403, body = ApiError), (status = 409, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn operation(
    State(state): State<ApiState>,
    params: Result<Query<LibraryOperationIdentity>, QueryRejection>,
    payload: Result<Json<LibraryChange>, JsonRejection>,
) -> Response {
    response(
        async {
            let Query(identity) = params.map_err(|_| LibraryError::InvalidInput)?;
            let Json(change) = payload.map_err(|_| LibraryError::InvalidInput)?;
            if let Some(account) = state.account {
                return account.apply_operation(identity, change).await.map(Some);
            }
            match state.library {
                Some(store) => store.apply_operation(identity, change).await.map(Some),
                None => Ok(None),
            }
        }
        .await,
    )
}

#[derive(Serialize)]
struct Envelope<T> {
    ok: bool,
    data: T,
}

fn response<T: Serialize>(result: Result<Option<T>, LibraryError>) -> Response {
    let mut response = match result {
        Ok(Some(data)) => Json(Envelope { ok: true, data }).into_response(),
        Ok(None) => failure(
            StatusCode::NOT_IMPLEMENTED,
            "CORE_NOT_IMPLEMENTED",
            "此功能尚未开放",
        ),
        Err(error) => {
            let status = match error {
                LibraryError::InvalidInput => StatusCode::BAD_REQUEST,
                LibraryError::NotImplemented => StatusCode::NOT_IMPLEMENTED,
                LibraryError::OwnerChanged
                | LibraryError::SyncQueueFull
                | LibraryError::SessionExpired
                | LibraryError::OperationConflict
                | LibraryError::OperationSequence
                | LibraryError::OperationPending => StatusCode::CONFLICT,
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
