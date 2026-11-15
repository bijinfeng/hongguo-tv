use crate::{ApiError, ApiState, failure};
use axum::{
    Json,
    body::Bytes,
    extract::{RawQuery, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use hongguo_core::radar::{RadarError, RadarSnapshot};
use serde::Serialize;
use utoipa::ToSchema;

/// Independent third-party ranking and growth snapshots with their actual cache state.
#[derive(Serialize, ToSchema)]
pub struct RadarResponse {
    /// Always true.
    pub ok: bool,
    /// Available snapshots; missing metrics remain absent.
    pub data: RadarSnapshot,
}

#[utoipa::path(get, path = "/api/v1/radar", operation_id = "get_radar",
    responses((status = 200, body = RadarResponse), (status = 400, body = ApiError),
        (status = 405, body = ApiError), (status = 413, body = ApiError),
        (status = 500, body = ApiError), (status = 501, body = ApiError),
        (status = 502, body = ApiError), (status = 504, body = ApiError)))]
pub(crate) async fn get(
    State(state): State<ApiState>,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Response {
    if query
        .as_ref()
        .is_some_and(|q| "/api/v1/radar?".len() + q.len() > 8192)
    {
        return failure(
            StatusCode::PAYLOAD_TOO_LARGE,
            "BODY_TOO_LARGE",
            "Request exceeds limit",
        );
    }
    if query.as_ref().is_some_and(|q| !q.is_empty()) || !body.is_empty() {
        return failure(
            StatusCode::BAD_REQUEST,
            "RADAR_INVALID_INPUT",
            "榜单请求无效",
        );
    }
    let Some(radar) = state.radar else {
        return failure(
            StatusCode::NOT_IMPLEMENTED,
            "CORE_NOT_IMPLEMENTED",
            "此功能尚未开放",
        );
    };
    match radar.snapshot().await {
        Ok(data) => Json(RadarResponse { ok: true, data }).into_response(),
        Err(error) => radar_failure(error),
    }
}

fn radar_failure(error: RadarError) -> Response {
    failure(
        StatusCode::from_u16(error.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        error.code(),
        error.message(),
    )
}
