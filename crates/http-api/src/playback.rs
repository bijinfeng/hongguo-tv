use crate::{ApiError, ApiState, MediaState, failure, unavailable};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use hongguo_core::{
    media::ByteRange,
    playback::{PlayInfo, PlaybackError, PlaybackRequest},
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PlayParams {
    series_id: String,
    vid: String,
    content_type: Option<String>,
    quality: Option<String>,
    codec_mode: Option<String>,
    mode: Option<String>,
}
/// Media prepared by the core; contains no upstream secrets.
#[derive(Serialize, ToSchema)]
pub struct PlayResponse {
    /// Always true.
    pub ok: bool,
    /// Episode-bound local media resource.
    pub data: PlayInfo,
}
/// Release a previously issued local playback path.
#[derive(Default, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
#[non_exhaustive]
pub struct ReleaseRequest {
    /// Exact local path returned by play/info.
    pub path: String,
}
/// Successful idempotent release.
#[derive(Serialize, ToSchema)]
pub struct ReleaseResponse {
    /// Always true.
    pub ok: bool,
    /// Acknowledgment, including already expired resources.
    pub data: ReleaseResult,
}
/// Release acknowledgment.
#[derive(Default, Serialize, ToSchema)]
#[non_exhaustive]
pub struct ReleaseResult {
    /// Always true after accepting a valid local path.
    pub released: bool,
}

#[utoipa::path(get,path="/api/v1/play/info",
params(("series_id"=String,Query,description="Exact drama ID"),("vid"=String,Query,description="Exact episode ID"),("content_type"=Option<String>,Query,description="Ordinary drama: 1004"),("quality"=Option<String>,Query,description="Automatic or exact resolution"),("codec_mode"=Option<String>,Query,description="default, auto or software"),("mode"=Option<String>,Query,description="range; unsupported layouts use bounded file preparation")),
responses((status=200,body=PlayResponse),(status=400,body=ApiError),(status=403,body=ApiError),(status=409,body=ApiError),(status=410,body=ApiError),(status=422,body=ApiError),(status=500,body=ApiError),(status=501,body=ApiError),(status=502,body=ApiError),(status=503,body=ApiError),(status=504,body=ApiError)))]
pub(crate) async fn info(
    State(state): State<ApiState>,
    params: Result<Query<PlayParams>, QueryRejection>,
) -> Response {
    let Some(service) = state.playback else {
        return unavailable().await;
    };
    let result = async {
        let Query(params) = params.map_err(|_| PlaybackError::InvalidInput)?;
        if params
            .mode
            .as_deref()
            .is_some_and(|m| m != "range" && !m.is_empty())
        {
            return Err(PlaybackError::InvalidInput);
        }
        let request = PlaybackRequest::new(
            &params.series_id,
            &params.vid,
            params.content_type.as_deref().unwrap_or(""),
            params.quality.as_deref().unwrap_or(""),
            params.codec_mode.as_deref().unwrap_or(""),
        )?;
        service.resolve(&request).await
    }
    .await;
    let mut response = match result {
        Ok(data) => Json(PlayResponse { ok: true, data }).into_response(),
        Err(error) => error_response(error),
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
#[utoipa::path(post,path="/api/v1/play/release",request_body=ReleaseRequest,
responses((status=200,body=ReleaseResponse),(status=400,body=ApiError),(status=403,body=ApiError),(status=413,body=ApiError),(status=415,body=ApiError),(status=500,body=ApiError),(status=501,body=ApiError)))]
pub(crate) async fn release(
    State(state): State<ApiState>,
    payload: Result<Json<ReleaseRequest>, JsonRejection>,
) -> Response {
    let Some(service) = state.playback else {
        return unavailable().await;
    };
    let result = (|| {
        let Json(payload) = payload.map_err(|_| PlaybackError::InvalidInput)?;
        let token = payload
            .path
            .strip_prefix("/minireel-proxy/media/")
            .filter(|t| valid_token(t))
            .ok_or(PlaybackError::InvalidInput)?;
        service.release(token)
    })();
    match result {
        Ok(()) => Json(ReleaseResponse {
            ok: true,
            data: ReleaseResult { released: true },
        })
        .into_response(),
        Err(error) => error_response(error),
    }
}
fn valid_token(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[utoipa::path(get,path="/minireel-proxy/media/{token}",params(("token"=String,Path,description="Opaque handle"),("Range"=Option<String>,Header,description="One byte range")),responses((status=200,description="video/mp4 bytes"),(status=206,description="Partial video/mp4 bytes"),(status=403,body=ApiError),(status=410,body=ApiError),(status=416,description="Range unavailable"),(status=501,body=ApiError)))]
pub(crate) async fn media(
    State(state): State<MediaState>,
    Path(token): Path<String>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    let Some(service) = state.playback else {
        return unavailable().await;
    };
    let lease = match service.lease(&token) {
        Ok(lease) => lease,
        Err(error) => return error_response(error),
    };
    let length = lease.length();
    let range = if headers.get_all(header::RANGE).iter().count() > 1 {
        None
    } else {
        match headers.get(header::RANGE) {
            None => ByteRange::parse("", length).ok(),
            Some(value) => value
                .to_str()
                .ok()
                .filter(|v| !v.is_empty())
                .and_then(|v| ByteRange::parse(v, length).ok()),
        }
    };
    let Some(range) = range else {
        return Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{length}"))
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, "0")
            .body(Body::empty())
            .unwrap();
    };
    let size = range.end() - range.start() + 1;
    let body = if method == Method::HEAD {
        Body::empty()
    } else {
        let stream = futures_util::stream::try_unfold(
            (lease, range.start(), range.end()),
            |(lease, start, last)| async move {
                if start > last {
                    return Ok::<_, PlaybackError>(None);
                }
                let end = last.min(start + 512 * 1024 - 1);
                let bytes = lease.chunk(start, end).await?;
                Ok(Some((Bytes::from(bytes), (lease, end + 1, last))))
            },
        );
        Body::from_stream(stream)
    };
    let mut response = Response::builder()
        .status(if range.partial() {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CONTENT_LENGTH, size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        .header("x-content-type-options", "nosniff");
    if range.partial() {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{length}", range.start(), range.end()),
        );
    }
    response.body(body).unwrap()
}
#[utoipa::path(head,path="/minireel-proxy/media/{token}",params(("token"=String,Path,description="Opaque handle"),("Range"=Option<String>,Header,description="One byte range")),responses((status=200,description="Same representation headers as GET; no body"),(status=206,description="Same partial headers as GET; no body"),(status=410,description="Expired handle"),(status=416,description="Range unavailable")))]
pub(crate) async fn head_media(
    state: State<MediaState>,
    token: Path<String>,
    headers: HeaderMap,
) -> Response {
    media(state, token, Method::HEAD, headers).await
}

fn error_response(error: PlaybackError) -> Response {
    let status = match error {
        PlaybackError::InvalidInput | PlaybackError::UnsupportedContent => StatusCode::BAD_REQUEST,
        PlaybackError::AccessDenied => StatusCode::FORBIDDEN,
        PlaybackError::IdentityMismatch => StatusCode::CONFLICT,
        PlaybackError::Expired => StatusCode::GONE,
        PlaybackError::QualityUnavailable
        | PlaybackError::UnsupportedMedia
        | PlaybackError::MediaTooLarge => StatusCode::UNPROCESSABLE_ENTITY,
        PlaybackError::Capacity => StatusCode::SERVICE_UNAVAILABLE,
        PlaybackError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        PlaybackError::Configuration | PlaybackError::Storage => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::BAD_GATEWAY,
    };
    failure(status, error.code(), &error.to_string())
}
