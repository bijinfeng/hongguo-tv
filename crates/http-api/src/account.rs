use crate::{ApiError, ApiState, failure};
use axum::{
    Json,
    extract::{
        Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use hongguo_core::account::{Account, AccountCommandRequest, AccountCommandResult, AccountError};
use serde::Serialize;
use utoipa::ToSchema;

/// Local account state without credentials.
#[derive(Serialize, ToSchema)]
pub struct AccountResponse {
    /// Always true.
    pub ok: bool,
    /// Authoritative account.
    pub data: Account,
}
/// Coherent account and active local library.
#[derive(Serialize, ToSchema)]
pub struct AccountStateResponse {
    /// Always true.
    pub ok: bool,
    /// Atomic account and library state.
    pub data: AccountCommandResult,
}

#[utoipa::path(get, path="/api/v1/account", responses((status=200,body=AccountResponse),(status=400,body=ApiError),(status=501,body=ApiError)))]
pub(crate) async fn read_account(
    State(state): State<ApiState>,
    params: Result<Query<crate::library::NoParams>, QueryRejection>,
) -> Response {
    if params.is_err() {
        return error(AccountError::InvalidInput);
    }
    match state.account {
        Some(service) => Json(AccountResponse {
            ok: true,
            data: service.snapshot().await,
        })
        .into_response(),
        None => super::unavailable().await,
    }
}

#[utoipa::path(get, path="/api/v1/account/state", responses((status=200,body=AccountStateResponse),(status=400,body=ApiError),(status=500,body=ApiError),(status=501,body=ApiError)))]
pub(crate) async fn state(
    State(state): State<ApiState>,
    params: Result<Query<crate::library::NoParams>, QueryRejection>,
) -> Response {
    if params.is_err() {
        return error(AccountError::InvalidInput);
    }
    match state.account {
        Some(service) => response(service.state().await),
        None => super::unavailable().await,
    }
}

#[utoipa::path(post, path="/api/v1/account/command", request_body=AccountCommandRequest,
    responses((status=200,body=AccountStateResponse),(status=400,body=ApiError),(status=409,body=ApiError),
    (status=429,body=ApiError),(status=500,body=ApiError),(status=501,body=ApiError),(status=502,body=ApiError)))]
pub(crate) async fn command(
    State(state): State<ApiState>,
    params: Result<Query<crate::library::NoParams>, QueryRejection>,
    payload: Result<Json<AccountCommandRequest>, JsonRejection>,
) -> Response {
    if params.is_err() {
        return error(AccountError::InvalidInput);
    }
    let Ok(Json(request)) = payload else {
        return error(AccountError::InvalidInput);
    };
    match state.account {
        Some(service) => response(service.command(request).await),
        None => super::unavailable().await,
    }
}
fn response(result: Result<AccountCommandResult, AccountError>) -> Response {
    match result {
        Ok(data) => Json(AccountStateResponse { ok: true, data }).into_response(),
        Err(failure) => error(failure),
    }
}
fn error(error: AccountError) -> Response {
    let status = match error {
        AccountError::InvalidInput => StatusCode::BAD_REQUEST,
        AccountError::NotImplemented => StatusCode::NOT_IMPLEMENTED,
        AccountError::AttemptExpired
        | AccountError::Busy
        | AccountError::OwnerChanged
        | AccountError::LibrarySyncQueueFull => StatusCode::CONFLICT,
        AccountError::Limited => StatusCode::TOO_MANY_REQUESTS,
        AccountError::Storage | AccountError::InvalidSession | AccountError::Library => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
        AccountError::Upstream | AccountError::IdentityMismatch => StatusCode::BAD_GATEWAY,
    };
    failure(status, error.code(), &error.to_string())
}
