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
use hongguo_core::account::{
    Account, AccountCommandRequest, AccountCommandResult, AccountError, FollowMutationRequest,
    FollowMutationResult, FollowQuery, FollowSnapshot,
};
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

/// Complete remote membership for the current authenticated scope.
#[derive(Serialize, ToSchema)]
pub struct FollowResponse {
    /// Always true.
    pub ok: bool,
    /// Complete validated membership.
    pub data: FollowSnapshot,
}

/// Acknowledged online intent; confirmation also requires complete readback.
#[derive(Serialize, ToSchema)]
pub struct FollowMutationResponse {
    /// Always true; inspect data.confirmed for observed membership.
    pub ok: bool,
    /// The exact acknowledged intent and any complete observation.
    pub data: FollowMutationResult,
}

#[utoipa::path(get, path="/api/v1/follow",
    params(("owner_id" = String, Query, description = "Expected authenticated owner"),
        ("owner_epoch" = String, Query, description = "Expected current account generation")),
    responses((status=200,body=FollowResponse),(status=400,body=ApiError),(status=401,body=ApiError),
        (status=403,body=ApiError),(status=409,body=ApiError),(status=500,body=ApiError),
        (status=501,body=ApiError),(status=502,body=ApiError)))]
pub(crate) async fn read_follow(
    State(state): State<ApiState>,
    params: Result<Query<FollowQuery>, QueryRejection>,
) -> Response {
    let Ok(Query(query)) = params else {
        return error(AccountError::InvalidInput);
    };
    match state.account {
        Some(service) => match service.follow_snapshot(query).await {
            Ok(data) => Json(FollowResponse { ok: true, data }).into_response(),
            Err(failure) => error(failure),
        },
        None => super::unavailable().await,
    }
}

#[utoipa::path(post, path="/api/v1/follow", request_body=FollowMutationRequest,
    responses((status=200,body=FollowMutationResponse),(status=400,body=ApiError),(status=401,body=ApiError),
        (status=403,body=ApiError),(status=409,body=ApiError),(status=413,body=ApiError),
        (status=415,body=ApiError),(status=500,body=ApiError),(status=501,body=ApiError),
        (status=502,body=ApiError)))]
pub(crate) async fn set_follow(
    State(state): State<ApiState>,
    params: Result<Query<crate::library::NoParams>, QueryRejection>,
    payload: Result<Json<FollowMutationRequest>, JsonRejection>,
) -> Response {
    if params.is_err() {
        return error(AccountError::InvalidInput);
    }
    let Ok(Json(request)) = payload else {
        return error(AccountError::InvalidInput);
    };
    match state.account {
        Some(service) => match service.set_follow(request).await {
            Ok(data) => Json(FollowMutationResponse { ok: true, data }).into_response(),
            Err(failure) => error(failure),
        },
        None => super::unavailable().await,
    }
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
        | AccountError::LibrarySyncQueueFull
        | AccountError::FollowBusy => StatusCode::CONFLICT,
        AccountError::FollowLoginRequired => StatusCode::UNAUTHORIZED,
        AccountError::Limited => StatusCode::TOO_MANY_REQUESTS,
        AccountError::Storage | AccountError::InvalidSession | AccountError::Library => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
        AccountError::Upstream
        | AccountError::IdentityMismatch
        | AccountError::FollowIncomplete
        | AccountError::FollowRejected
        | AccountError::FollowUnavailable
        | AccountError::FollowUncertain => StatusCode::BAD_GATEWAY,
    };
    failure(status, error.code(), &error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn follow_errors_have_finite_safe_http_categories() {
        for (category, status) in [
            (AccountError::FollowLoginRequired, 401),
            (AccountError::FollowIncomplete, 502),
            (AccountError::FollowRejected, 502),
            (AccountError::FollowUnavailable, 502),
            (AccountError::FollowUncertain, 502),
            (AccountError::FollowBusy, 409),
        ] {
            let response = error(category);
            assert_eq!(response.status().as_u16(), status);
            assert_eq!(
                response.headers()[axum::http::header::CACHE_CONTROL],
                "no-store"
            );
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(
                value,
                serde_json::json!({"ok":false,"code":category.code(),"error":category.to_string()})
            );
        }
    }
}
