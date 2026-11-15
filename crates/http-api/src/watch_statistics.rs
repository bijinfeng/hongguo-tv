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
use hongguo_core::watch_statistics::{
    WatchStatisticsAppendResult, WatchStatisticsBatch, WatchStatisticsError, WatchStatisticsScope,
    WatchStatisticsSnapshot,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct WatchStatisticsParams {
    pub owner_id: String,
    pub owner_epoch: String,
    pub day: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct WatchStatisticsResponse {
    pub ok: bool,
    pub data: WatchStatisticsSnapshot,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct WatchStatisticsAppendResponse {
    pub ok: bool,
    pub data: WatchStatisticsAppendResult,
}

fn statistics_error_response(error: WatchStatisticsError) -> Response {
    let (status, code) = match error {
        WatchStatisticsError::InvalidInput => {
            (StatusCode::BAD_REQUEST, "STATISTICS_REQUEST_INVALID")
        }
        WatchStatisticsError::OwnerChanged => (StatusCode::CONFLICT, "ACCOUNT_OWNER_CHANGED"),
        WatchStatisticsError::RevisionChanged => (StatusCode::CONFLICT, "STATISTICS_RESET"),
        WatchStatisticsError::BatchConflict => (StatusCode::CONFLICT, "STATISTICS_BATCH_CONFLICT"),
        WatchStatisticsError::InvalidDatabase | WatchStatisticsError::Storage => (
            StatusCode::SERVICE_UNAVAILABLE,
            "STATISTICS_STORAGE_UNAVAILABLE",
        ),
        WatchStatisticsError::DailyLimit => (StatusCode::BAD_REQUEST, "STATISTICS_REQUEST_INVALID"),
    };
    failure(status, code, &error.to_string())
}

async fn checked_scope(
    state: &ApiState,
    params: &WatchStatisticsParams,
) -> Result<WatchStatisticsScope, Response> {
    if let Some(account) = &state.account {
        let current = account.snapshot().await;
        if current.owner_id != params.owner_id || current.owner_epoch != params.owner_epoch {
            return Err(failure(
                StatusCode::CONFLICT,
                "ACCOUNT_OWNER_CHANGED",
                "统计所属账号已变化，请重新加载",
            ));
        }
    } else if !params.owner_id.is_empty() {
        return Err(failure(
            StatusCode::CONFLICT,
            "ACCOUNT_OWNER_CHANGED",
            "统计所属账号已变化，请重新加载",
        ));
    }
    Ok(WatchStatisticsScope {
        owner_id: params.owner_id.clone(),
        owner_epoch: params.owner_epoch.clone(),
    })
}

fn params(
    value: Result<Query<WatchStatisticsParams>, QueryRejection>,
) -> Result<WatchStatisticsParams, Box<Response>> {
    let value = value.map(|Query(value)| value).map_err(|_| {
        Box::new(statistics_error_response(
            WatchStatisticsError::InvalidInput,
        ))
    })?;
    let owner_valid = (value.owner_id.is_empty()
        || (value.owner_id.len() <= 32
            && value.owner_id.bytes().all(|byte| byte.is_ascii_digit())
            && value.owner_id.bytes().any(|byte| byte != b'0')))
        && !value.owner_epoch.is_empty()
        && value.owner_epoch.len() <= 128
        && value
            .owner_epoch
            .bytes()
            .all(|byte| byte.is_ascii() && !byte.is_ascii_control());
    if owner_valid {
        Ok(value)
    } else {
        Err(Box::new(statistics_error_response(
            WatchStatisticsError::InvalidInput,
        )))
    }
}

#[utoipa::path(get, path = "/api/v1/watch-statistics", operation_id = "get_watch_statistics",
    params(("owner_id" = String, Query), ("owner_epoch" = String, Query), ("day" = String, Query)),
    responses((status = 200, body = WatchStatisticsResponse),
        (status = 400, body = ApiError), (status = 409, body = ApiError),
        (status = 503, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn get(
    State(state): State<ApiState>,
    query: Result<Query<WatchStatisticsParams>, QueryRejection>,
) -> Response {
    let params = match params(query) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let scope = match checked_scope(&state, &params).await {
        Ok(value) => value,
        Err(response) => return response,
    };
    match state.account {
        Some(account) => match account
            .watch_statistics_snapshot(&scope.owner_id, &scope.owner_epoch, &params.day)
            .await
        {
            Ok(data) => Json(WatchStatisticsResponse { ok: true, data }).into_response(),
            Err(cause) => statistics_error_response(cause),
        },
        None => super::unavailable().await,
    }
}

#[utoipa::path(post, path = "/api/v1/watch-statistics", operation_id = "append_watch_statistics", request_body = WatchStatisticsBatch,
    params(("owner_id" = String, Query), ("owner_epoch" = String, Query), ("day" = String, Query)),
    responses((status = 200, body = WatchStatisticsAppendResponse),
        (status = 400, body = ApiError), (status = 409, body = ApiError),
        (status = 413, body = ApiError), (status = 415, body = ApiError),
        (status = 503, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn append(
    State(state): State<ApiState>,
    query: Result<Query<WatchStatisticsParams>, QueryRejection>,
    payload: Result<Json<WatchStatisticsBatch>, JsonRejection>,
) -> Response {
    let params = match params(query) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let scope = match checked_scope(&state, &params).await {
        Ok(value) => value,
        Err(response) => return response,
    };
    let Json(batch) = match payload {
        Ok(value) => value,
        Err(_) => return statistics_error_response(WatchStatisticsError::InvalidInput),
    };
    if batch.owner_id != scope.owner_id || batch.owner_epoch != scope.owner_epoch {
        return statistics_error_response(WatchStatisticsError::InvalidInput);
    }
    match state.account {
        Some(account) => match account
            .append_watch_statistics(&scope.owner_id, &scope.owner_epoch, &params.day, batch)
            .await
        {
            Ok(data) => Json(WatchStatisticsAppendResponse { ok: true, data }).into_response(),
            Err(cause) => statistics_error_response(cause),
        },
        None => super::unavailable().await,
    }
}

#[utoipa::path(delete, path = "/api/v1/watch-statistics", operation_id = "reset_watch_statistics",
    params(("owner_id" = String, Query), ("owner_epoch" = String, Query), ("day" = String, Query)),
    responses((status = 200, body = WatchStatisticsResponse),
        (status = 400, body = ApiError), (status = 409, body = ApiError),
        (status = 503, body = ApiError), (status = 501, body = ApiError)))]
pub(crate) async fn reset(
    State(state): State<ApiState>,
    query: Result<Query<WatchStatisticsParams>, QueryRejection>,
) -> Response {
    let params = match params(query) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let scope = match checked_scope(&state, &params).await {
        Ok(value) => value,
        Err(response) => return response,
    };
    match state.account {
        Some(account) => match account
            .reset_watch_statistics(&scope.owner_id, &scope.owner_epoch, &params.day)
            .await
        {
            Ok(data) => Json(WatchStatisticsResponse { ok: true, data }).into_response(),
            Err(cause) => statistics_error_response(cause),
        },
        None => super::unavailable().await,
    }
}
