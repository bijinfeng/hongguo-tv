use super::*;
use axum::{
    Router,
    body::Body,
    extract::{Request as HttpRequest, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
};
use hongguo_core::{
    media::{ByteRange, MediaStore},
    playback::PlaybackClient,
};
use hongguo_http_api::{router_with_playback, router_with_radar};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    time::Duration,
};
use tokio::{net::TcpListener, sync::Semaphore, time::timeout};
use tower::ServiceExt;

#[derive(Clone)]
struct FollowTransportState {
    followed: Arc<AtomicBool>,
    force_unconfirmed: Arc<AtomicBool>,
}

async fn follow_transport_upstream(
    State(state): State<FollowTransportState>,
    request: HttpRequest,
) -> Response {
    let path = request.uri().path();
    match (request.method(), path) {
        (&Method::GET, "/reading/user/subscribe/list/v1/") => {
            let url =
                reqwest::Url::parse(&format!("http://fixture.invalid{}", request.uri())).unwrap();
            assert_eq!(
                url.query_pairs()
                    .find(|(key, _)| key == "tab_type")
                    .unwrap()
                    .1,
                "14"
            );
            assert_eq!(
                url.query_pairs().find(|(key, _)| key == "count").unwrap().1,
                "20"
            );
            let present = state.followed.load(Ordering::Acquire)
                && !state.force_unconfirmed.load(Ordering::Acquire);
            axum::Json(json!({
                "code": 0,
                "data": {
                    "mix_data": if present {
                        vec![json!({"series_id":"7690163276214176792","title":"合成追更剧","series_status":0})]
                    } else {
                        Vec::new()
                    },
                    "has_more": false
                }
            }))
            .into_response()
        }
        (&Method::POST, "/reading/user/subscribe/delete/v") => {
            let body = axum::body::to_bytes(request.into_body(), 32768)
                .await
                .unwrap();
            let value: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(value["book_type"], 2);
            assert_eq!(value["series_id"], "7690163276214176792");
            assert_eq!(value["book_id"], "7690163276214176792");
            assert!(value["op_type"] == 1 || value["op_type"] == 2);
            state
                .followed
                .store(value["op_type"] == 1, Ordering::Release);
            axum::Json(json!({"code": 0, "data": {}})).into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

struct FollowTransport {
    origin: String,
    followed: Arc<AtomicBool>,
    force_unconfirmed: Arc<AtomicBool>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Clone)]
struct ReservationTransportState {
    reserved: Arc<AtomicBool>,
    force_unconfirmed: Arc<AtomicBool>,
}

async fn reservation_transport_upstream(
    State(state): State<ReservationTransportState>,
    request: HttpRequest,
) -> Response {
    const ITEM: &str = "7692049770637954110";
    const SERIES: &str = "7690163276214176792";
    match (request.method(), request.uri().path()) {
        (&Method::GET, "/reading/user/subscribe/list/v1/") => {
            let url =
                reqwest::Url::parse(&format!("http://fixture.invalid{}", request.uri())).unwrap();
            let online = url
                .query_pairs()
                .find(|(key, _)| key == "is_online")
                .map(|(_, value)| value == "true")
                .unwrap_or(false);
            assert_eq!(
                url.query_pairs()
                    .find(|(key, _)| key == "tab_type")
                    .unwrap()
                    .1,
                "13"
            );
            let remote_present = state.reserved.load(Ordering::Acquire)
                && !state.force_unconfirmed.load(Ordering::Acquire);
            let present = online && remote_present;
            let rows = if present {
                vec![json!({
                    "item_id": ITEM,
                    "is_online": true,
                    "subscribe_data": {
                        "series_id": SERIES,
                        "title": "合成预约剧",
                        "episode_cnt": 12
                    }
                })]
            } else {
                Vec::new()
            };
            axum::Json(json!({
                "code": 0,
                "data": {
                    "subscribe_items": rows,
                    "has_more": false,
                    "online_total_count": if remote_present { 1 } else { 0 },
                    "offline_total_count": 0
                }
            }))
            .into_response()
        }
        (&Method::POST, "/reading/bookapi/search/uncover_subscribe/v") => {
            let body = axum::body::to_bytes(request.into_body(), 32768)
                .await
                .unwrap();
            assert!(!body.is_empty());
            state.reserved.store(true, Ordering::Release);
            axum::Json(json!({"code": 0, "data": {}})).into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

struct ReservationTransport {
    origin: String,
    reserved: Arc<AtomicBool>,
    force_unconfirmed: Arc<AtomicBool>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for ReservationTransport {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl ReservationTransport {
    async fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let state = ReservationTransportState {
            reserved: Arc::new(AtomicBool::new(false)),
            force_unconfirmed: Arc::new(AtomicBool::new(false)),
        };
        let reserved = state.reserved.clone();
        let force_unconfirmed = state.force_unconfirmed.clone();
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new()
                    .fallback(reservation_transport_upstream)
                    .with_state(state),
            )
            .await
            .unwrap();
        });
        Self {
            origin,
            reserved,
            force_unconfirmed,
            task,
        }
    }
}

impl Drop for FollowTransport {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl FollowTransport {
    async fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let state = FollowTransportState {
            followed: Arc::new(AtomicBool::new(false)),
            force_unconfirmed: Arc::new(AtomicBool::new(false)),
        };
        let followed = state.followed.clone();
        let force_unconfirmed = state.force_unconfirmed.clone();
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new()
                    .fallback(follow_transport_upstream)
                    .with_state(state),
            )
            .await
            .unwrap();
        });
        Self {
            origin,
            followed,
            force_unconfirmed,
            task,
        }
    }
}

#[tokio::test]
async fn native_library_operations_share_exact_receipts_with_http_and_reject_stale_sessions() {
    let mut fixture = Fixture::new(false).await;
    let searches = fixture
        .call(
            "/api/v1/search/history",
            Some(r#"{"action":"add","query":"重生"}"#),
        )
        .await;
    assert_eq!(searches.status, 200);
    assert_eq!(
        fixture.call("/api/v1/library/session", None).await.status,
        405
    );
    let invalid_session = fixture
        .call("/api/v1/library/session?extra=1", Some("{}"))
        .await;
    assert_eq!(invalid_session.status, 400);
    assert_eq!(invalid_session.body["code"], "LIBRARY_REQUEST_INVALID");
    let services = &fixture.session.services;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        services.catalog.clone(),
        Some(services.library.clone()),
        Some(services.playback.clone()),
    );
    let session = fixture.call("/api/v1/library/session", Some("{}")).await;
    assert_eq!(session.status, 200);
    let session = session.body["data"]["session_id"].as_str().unwrap();
    let path = format!("/api/v1/library/operation?session_id={session}&operation_id=1");
    let progress = r#"{"action":"progress","owner_id":"","drama":{"series_id":"11","title":"Receipt identity","cover":"","intro":""},"episode":1,"video_id":"22","position":12.5,"duration":30}"#;
    // The legacy fallback cannot bypass registered-only categories, even without AccountService.
    for payload in [
        json!({"action":"favorite","owner_id":"","drama":{"series_id":"11","title":"Contract favorite","cover":"","intro":""},"value":true}),
        json!({"action":"clear","kind":"favorites"}),
        json!({"action":"remove","kind":"favorites","series_id":"11"}),
    ] {
        let native = fixture
            .call("/api/v1/library", Some(&payload.to_string()))
            .await;
        let request = axum::http::Request::builder()
            .method("POST")
            .uri("/api/v1/library")
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .body(Body::from(payload.to_string()))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!((native.status, native.body), (400, body.clone()));
        assert_eq!(body["code"], "LIBRARY_REQUEST_INVALID");
        assert!(body.get("data").is_none());
    }
    for invalid in [
        format!("/api/v1/library/operation?session_id={session}"),
        format!("/api/v1/library/operation?session_id={session}&operation_id=01"),
        format!("{path}&extra=1"),
    ] {
        let reply = fixture.call(&invalid, Some(progress)).await;
        assert_eq!(reply.status, 400);
        assert_eq!(reply.body["code"], "LIBRARY_REQUEST_INVALID");
        assert!(reply.body.get("data").is_none());
    }
    let first = fixture.call(&path, Some(progress)).await;
    assert_eq!(first.status, 200);
    assert!(first.media.is_none());
    assert_eq!(first.body["data"]["outcome"]["status"], "committed");
    let request = axum::http::Request::builder()
        .method("POST")
        .uri(&path)
        .header("host", "127.0.0.1:8080")
        .header("content-type", "application/json")
        .body(Body::from(progress))
        .unwrap();
    let replay = app.clone().oneshot(request).await.unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(replay.into_body(), 1024 * 1024)
        .await
        .unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap(), first.body);
    let conflict = fixture
        .call(&path, Some(&progress.replace("12.5", "13.5")))
        .await;
    assert_eq!(conflict.status, 409);
    assert_eq!(conflict.body["code"], "LIBRARY_OPERATION_CONFLICT");
    for (index, (payload, expected_favorites)) in [
        (
            json!({"action":"favorite","owner_id":"","drama":{"series_id":"11","title":"Contract favorite","cover":"","intro":""},"value":true}),
            vec!["11"],
        ),
        (
            json!({"action":"favorite","owner_id":"","drama":{"series_id":"12","title":"Other season","cover":"","intro":""},"value":true}),
            vec!["11", "12"],
        ),
        (
            json!({"action":"remove","kind":"favorites","series_id":"11"}),
            vec!["12"],
        ),
        (
            json!({"action":"favorite","owner_id":"","drama":{"series_id":"11","title":"Contract favorite","cover":"","intro":""},"value":true}),
            vec!["11", "12"],
        ),
        (
            json!({"action":"clear","kind":"favorites"}),
            vec![],
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let operation_id = (index + 2).to_string();
        let favorite_path = format!(
            "/api/v1/library/operation?session_id={session}&operation_id={operation_id}"
        );
        let native = fixture
            .call(&favorite_path, Some(&payload.to_string()))
            .await;
        assert_eq!(native.status, 200);
        assert!(native.media.is_none());
        let receipt = &native.body["data"];
        assert_eq!(receipt["session_id"], session);
        assert_eq!(receipt["operation_id"], operation_id);
        assert_eq!(receipt["outcome"]["status"], "committed");
        let library = &receipt["outcome"]["library"];
        assert_eq!(
            library["entries"],
            first.body["data"]["outcome"]["library"]["entries"]
        );
        let mut favorites: Vec<_> = library["favorites"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["drama"]["series_id"].as_str().unwrap())
            .collect();
        favorites.sort_unstable();
        assert_eq!(favorites, expected_favorites);
        let request = axum::http::Request::builder()
            .method("POST")
            .uri(&favorite_path)
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .body(Body::from(payload.to_string()))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap(), native.body);
    }
    let second_path = format!("/api/v1/library/operation?session_id={session}&operation_id=7");
    let second = progress.replace(r#""series_id":"11""#, r#""series_id":"12""#);
    assert_eq!(fixture.call(&second_path, Some(&second)).await.status, 200);
    let remove_path = format!("/api/v1/library/operation?session_id={session}&operation_id=8");
    let foreign = fixture
        .call(
            &remove_path,
            Some(r#"{"action":"remove","kind":"history","series_id":"11","owner_id":"another"}"#),
        )
        .await;
    assert_eq!(foreign.status, 409);
    assert_eq!(foreign.body["code"], "LIBRARY_OWNER_CHANGED");
    let remove = r#"{"action":"remove","kind":"history","series_id":"11"}"#;
    let removed = fixture.call(&remove_path, Some(remove)).await;
    assert_eq!(removed.status, 200);
    assert!(removed.media.is_none());
    let retained = &removed.body["data"]["outcome"]["library"];
    assert_eq!(retained["entries"].as_array().unwrap().len(), 1);
    assert_eq!(retained["entries"][0]["drama"]["series_id"], "12");
    assert_eq!(
        fixture.call(&remove_path, Some(remove)).await.body,
        removed.body
    );
    assert_eq!(
        fixture.call(&path, Some(progress)).await.body["code"],
        "LIBRARY_OPERATION_SEQUENCE"
    );
    fixture.session.close();
    fixture.session = Session::open(&fixture.dir)
        .await
        .unwrap_or_else(|_| panic!("reopen operation store"));
    assert_eq!(
        fixture.call("/api/v1/library", None).await.body["data"],
        *retained
    );
    assert_eq!(
        fixture.call("/api/v1/search/history", None).await.body,
        searches.body
    );
    let new_session = fixture.call("/api/v1/library/session", Some("{}")).await;
    assert_eq!(
        fixture.call(&remove_path, Some(remove)).await.body["code"],
        "LIBRARY_SESSION_EXPIRED"
    );
    let clear_path = format!(
        "/api/v1/library/operation?session_id={}&operation_id=1",
        new_session.body["data"]["session_id"].as_str().unwrap()
    );
    let foreign = fixture
        .call(
            &clear_path,
            Some(r#"{"action":"clear","kind":"history","owner_id":"another"}"#),
        )
        .await;
    assert_eq!(foreign.status, 409);
    assert_eq!(foreign.body["code"], "LIBRARY_OWNER_CHANGED");
    let cleared = fixture
        .call(&clear_path, Some(r#"{"action":"clear","kind":"history"}"#))
        .await;
    assert_eq!(cleared.status, 200);
    assert!(cleared.media.is_none());
    assert_eq!(
        cleared.body["data"]["outcome"]["library"]["entries"],
        json!([])
    );
    fixture.session.close();
    fixture.session = Session::open(&fixture.dir)
        .await
        .unwrap_or_else(|_| panic!("reopen cleared operation store"));
    assert_eq!(
        fixture.call("/api/v1/library", None).await.body["data"]["entries"],
        json!([])
    );
    assert_eq!(
        fixture.call("/api/v1/search/history", None).await.body,
        searches.body
    );
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[derive(Clone)]
struct Upstream {
    gate: Arc<Semaphore>,
    started: Arc<Semaphore>,
    stalled: bool,
    calls: Arc<AtomicUsize>,
    discovery_status: Arc<AtomicUsize>,
    suggestions_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    actor_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    category_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    feed_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    seasons_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    calendar_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    new_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    radar_status: Arc<AtomicUsize>,
}
async fn upstream(State(state): State<Upstream>, request: HttpRequest) -> Response {
    state.calls.fetch_add(1, Ordering::SeqCst);
    let path = request.uri().path();
    if path.starts_with("/service/") {
        return axum::Json(json!({"device_id_str":"111","install_id_str":"222"})).into_response();
    }
    if state.stalled
        && (path.starts_with("/reading/")
            || path == "/api/search/result"
            || path == "/detail"
            || path == "/incent_resource/suggestion"
            || path == "/ranks_latest.json"
            || path == "/growth_latest.json"
            || path.starts_with("/character/"))
    {
        state.started.add_permits(1);
        state.gate.acquire().await.unwrap().forget();
    }
    match path {
        "/ranks_latest.json" | "/growth_latest.json" => {
            let status =
                StatusCode::from_u16(state.radar_status.load(Ordering::SeqCst) as u16).unwrap();
            if status != StatusCode::OK {
                return (
                    status,
                    "private upstream diagnostics https://secret.invalid",
                )
                    .into_response();
            }
            let bucket = json!({"rank_date":"2026-11-14","prev_rank_date":"2026-11-13",
                "items":[{"id":"1234567890123456789","title":"合成榜单","rank":1,"delta":0}]});
            let value = if path == "/ranks_latest.json" {
                json!({"hot":bucket,"real":bucket,"ai":bucket,"comic":bucket})
            } else {
                json!({"date":"2026-11-14","prev_date":"2026-11-13","gap":1,
                    "items":[{"id":"1234567890123456789","title":"合成增长","type":"real",
                        "hot":i64::MAX,"fav":0,"d_hot":i64::MIN}]})
            };
            axum::Json(value).into_response()
        }
        "/reading/bookapi/plan/v" => {
            let reply = *state.seasons_reply.lock().unwrap();
            reply.into_response()
        }
        "/reading/user/subscribe/list/v1/" => {
            (*state.calendar_reply.lock().unwrap()).into_response()
        }
        "/reading/bookapi/bookmall/cell/change/v1/" => {
            (*state.new_reply.lock().unwrap()).into_response()
        }
        "/reading/bookapi/bookmall/tab/v" | "/reading/bookapi/bookmall/cell/change/v" => {
            let reply = *state.feed_reply.lock().unwrap();
            reply.into_response()
        }
        "/reading/distribution/category/landpage/v/" => {
            let reply = *state.category_reply.lock().unwrap();
            reply.into_response()
        }
        _ if path.starts_with("/character/") => {
            let reply = *state.actor_reply.lock().unwrap();
            reply.into_response()
        }
        "/incent_resource/suggestion" => {
            let reply = *state.suggestions_reply.lock().unwrap();
            reply.into_response()
        }
        "/reading/bookapi/plan/v1/" => (
            StatusCode::from_u16(state.discovery_status.load(Ordering::SeqCst) as u16).unwrap(),
            include_str!("../../../contracts/fixtures/discovery/plan.input.json"),
        )
            .into_response(),
        "/api/search/result" => {
            include_str!("../../../contracts/fixtures/catalog/search.input.json").into_response()
        }
        "/detail" => include_str!("../../../contracts/fixtures/catalog/series-detail.input.html")
            .into_response(),
        "/media" => {
            let bytes = media_bytes();
            let raw = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let range = ByteRange::parse(raw, bytes.len() as u64).unwrap();
            let start = range.start() as usize;
            let end = range.end() as usize;
            let mut response = Response::builder()
                .status(if range.partial() { 206 } else { 200 })
                .header("etag", "\"native-test\"")
                .header("content-length", end - start + 1);
            if range.partial() {
                response = response.header(
                    "content-range",
                    format!("bytes {start}-{end}/{}", bytes.len()),
                );
            }
            response
                .body(Body::from(bytes[start..=end].to_vec()))
                .unwrap()
        }
        _ if path.starts_with("/reading/") => {
            let uri = reqwest::Url::parse(&format!("http://127.0.0.1{}", request.uri())).unwrap();
            let vid = uri
                .query_pairs()
                .find(|(k, _)| k == "video_id")
                .unwrap()
                .1
                .into_owned();
            axum::Json(json!({"data":{"video_model":{"vid":vid,"video_list":[{"codec_type":"hevc","vheight":720,"main_url":"https://media.example.invalid/media"}]}}})).into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}
fn media_bytes() -> Vec<u8> {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/playback/media.json"
    ))
    .unwrap();
    fixture["hex"]
        .as_str()
        .unwrap()
        .as_bytes()
        .chunks_exact(2)
        .map(|b| u8::from_str_radix(std::str::from_utf8(b).unwrap(), 16).unwrap())
        .collect()
}
fn temp_dir() -> PathBuf {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    std::env::temp_dir().join(format!(
        "hongguo-native-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ))
}
struct Fixture {
    session: Arc<Session>,
    dir: PathBuf,
    source: tokio::task::JoinHandle<()>,
    upstream: Upstream,
    origin: String,
}
#[tokio::test]
async fn account_http_native_scope_state_and_structured_history_contract_match() {
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous_session = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("account native session should open")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    async fn http(app: Router, path: &str, body: Option<Value>) -> (u16, Value) {
        let request = axum::http::Request::builder()
            .uri(path)
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .method(if body.is_some() { "POST" } else { "GET" })
            .body(body.map_or(Body::empty(), |value| Body::from(value.to_string())))
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }
    for path in [
        "/api/v1/account",
        "/api/v1/account/state",
        "/api/v1/library",
        "/api/v1/account?uid=123",
        "/api/v1/account/state?token=private",
    ] {
        let native = fixture.call(path, None).await;
        let (status, body) = http(app.clone(), path, None).await;
        assert_eq!((native.status, native.body), (status, body));
    }
    let original = account.snapshot().await;
    for action in ["sync", "import_guest_history"] {
        let command =
            json!({"owner_id":"","owner_epoch":original.owner_epoch,"command":{"action":action}});
        let native = fixture
            .call("/api/v1/account/command", Some(&command.to_string()))
            .await;
        let (status, body) = http(app.clone(), "/api/v1/account/command", Some(command)).await;
        assert_eq!((native.status, native.body), (status, body.clone()));
        assert_eq!(status, 502);
        assert_eq!(body["code"], "ACCOUNT_IDENTITY_MISMATCH");
        assert_eq!(account.snapshot().await, original);
    }
    for body in [
        json!({"owner_id":"", "owner_epoch":"old", "command":{"action":"logout"}}),
        json!({"owner_id":"123", "owner_epoch":original.owner_epoch, "command":{"action":"logout"}}),
        json!({"owner_id":"", "owner_epoch":original.owner_epoch, "command":{"action":"phone_start","country_code":"+86","phone":"invalid","send_code":true}}),
        json!({"owner_id":"", "owner_epoch":original.owner_epoch, "command":{"action":"logout","unexpected":true}}),
    ] {
        let native = fixture
            .call("/api/v1/account/command", Some(&body.to_string()))
            .await;
        let (status, body) = http(app.clone(), "/api/v1/account/command", Some(body)).await;
        assert_eq!((native.status, native.body), (status, body));
        assert!(status >= 400);
    }
    let logout =
        json!({"owner_id":"", "owner_epoch":original.owner_epoch,"command":{"action":"logout"}});
    let native = fixture
        .call("/api/v1/account/command", Some(&logout.to_string()))
        .await;
    assert_eq!(native.status, 200);
    assert_ne!(
        native.body["data"]["account"]["owner_epoch"],
        original.owner_epoch
    );
    let (status, body) = http(app.clone(), "/api/v1/account/state", None).await;
    assert_eq!(status, 200);
    assert_eq!(body, native.body);
    let legacy = json!({"action":"clear","kind":"history","owner_id":""});
    let native = fixture
        .call("/api/v1/library", Some(&legacy.to_string()))
        .await;
    let (status, body) = http(app.clone(), "/api/v1/library", Some(legacy)).await;
    assert_eq!(status, 409);
    assert_eq!(native.body, body);
    let (status, body) = http(app, "/api/v1/account/command", Some(logout)).await;
    assert_eq!(status, 409);
    assert_eq!(body["code"], "ACCOUNT_OWNER_CHANGED");
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn notifications_http_native_guest_scope_and_lifecycle_boundaries_match() {
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("notification native session should open")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    async fn http(app: Router, path: &str, body: Option<Value>) -> (u16, Value) {
        let request = axum::http::Request::builder()
            .uri(path)
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .method(if body.is_some() { "POST" } else { "GET" })
            .body(body.map_or(Body::empty(), |value| Body::from(value.to_string())))
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }
    let original = account.snapshot().await;
    let query = format!(
        "/api/v1/notifications?owner_id=&owner_epoch={}",
        original.owner_epoch
    );
    let mark_all = json!({
        "owner_id":"",
        "owner_epoch":original.owner_epoch,
        "all":true
    });
    let cases = [
        (
            query.clone(),
            None,
            401,
            "ACCOUNT_NOTIFICATION_LOGIN_REQUIRED",
        ),
        (
            format!("{query}&unexpected=1"),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            "/api/v1/notifications".to_owned(),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            "/api/v1/notifications".to_owned(),
            Some(mark_all.clone()),
            400,
            "ACCOUNT_NOTIFICATION_INVALID_READ",
        ),
        (
            "/api/v1/notifications?owner_id=123".to_owned(),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
    ];
    for (path, payload, expected_status, code) in cases {
        let body = payload.as_ref().map(Value::to_string);
        let native = fixture.call(&path, body.as_deref()).await;
        let (status, http_body) = http(app.clone(), &path, payload).await;
        assert_eq!(status, expected_status, "{path}");
        assert_eq!((native.status, native.body), (status, http_body.clone()));
        assert_eq!(http_body["code"], code);
        assert!(http_body.get("data").is_none());
    }
    let pending = fixture.session.start(&query, None);
    pending.cancel();
    let cancelled = pending.inner.result().await;
    assert_eq!(cancelled.status, 499);
    assert_eq!(cancelled.body["code"], "CORE_CANCELLED");
    assert_eq!(account.snapshot().await, original);
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn follow_http_native_authenticated_success_and_unconfirmed_results_match() {
    let transport = FollowTransport::new().await;
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    account.configure_loopback_for_tests(&transport.origin);
    account
        .install_loopback_account_for_tests("7390000000000000003")
        .await
        .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("authenticated follow session")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    let snapshot = account.snapshot().await;
    let query = format!(
        "/api/v1/follow?owner_id={}&owner_epoch={}",
        snapshot.owner_id, snapshot.owner_epoch
    );
    let native_initial = fixture.call(&query, None).await;
    let http_initial = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri(&query)
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let http_initial_body: Value = serde_json::from_slice(
        &axum::body::to_bytes(http_initial.into_body(), 32768)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(native_initial.status, 200);
    assert_eq!(native_initial.body, http_initial_body);
    assert_eq!(native_initial.body["data"]["items"], json!([]));

    // The remote ACK is accepted, but the follow read deliberately hides the
    // member. Both transports must expose acknowledged=true and confirmed=false.
    transport.force_unconfirmed.store(true, Ordering::Release);
    let intent = json!({
        "owner_id": snapshot.owner_id,
        "owner_epoch": snapshot.owner_epoch,
        "series_id": "7690163276214176792",
        "enabled": true
    });
    let native_add = fixture
        .call("/api/v1/follow", Some(&intent.to_string()))
        .await;
    let http_add = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .method(Method::POST)
                .uri("/api/v1/follow")
                .header("host", "127.0.0.1:8080")
                .header("content-type", "application/json")
                .body(Body::from(intent.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let http_add_body: Value = serde_json::from_slice(
        &axum::body::to_bytes(http_add.into_body(), 32768)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(native_add.status, 200);
    assert_eq!(native_add.body, http_add_body);
    assert_eq!(native_add.body["data"]["acknowledged"], true);
    assert_eq!(native_add.body["data"]["confirmed"], false);
    assert_eq!(native_add.body["data"]["snapshot"]["items"], json!([]));

    transport.force_unconfirmed.store(false, Ordering::Release);
    let observed = fixture.call(&query, None).await;
    assert_eq!(observed.status, 200);
    assert_eq!(
        observed.body["data"]["items"][0]["series_id"],
        "7690163276214176792"
    );
    assert!(transport.followed.load(Ordering::Acquire));
}

#[tokio::test]
async fn reservations_http_native_authenticated_success_and_unconfirmed_results_match() {
    let transport = ReservationTransport::new().await;
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    account.configure_loopback_for_tests(&transport.origin);
    account
        .install_loopback_account_for_tests("7390000000000000003")
        .await
        .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("authenticated reservation session")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    async fn http(app: Router, path: &str, body: Option<Value>) -> (u16, Value) {
        let request = axum::http::Request::builder()
            .uri(path)
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .method(if body.is_some() {
                Method::POST
            } else {
                Method::GET
            })
            .body(body.map_or(Body::empty(), |value| Body::from(value.to_string())))
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }
    let snapshot = account.snapshot().await;
    let query = format!(
        "/api/v1/reservations?owner_id={}&owner_epoch={}",
        snapshot.owner_id, snapshot.owner_epoch
    );
    let native_initial = fixture.call(&query, None).await;
    let (http_status, http_initial) = http(app.clone(), &query, None).await;
    assert_eq!(
        (native_initial.status, &native_initial.body),
        (http_status, &http_initial)
    );
    assert_eq!(native_initial.status, 200);
    assert_eq!(native_initial.body["data"]["items"], json!([]));

    let intent = json!({
        "owner_id": snapshot.owner_id,
        "owner_epoch": snapshot.owner_epoch,
        "target": {"kind": "item", "id": "7692049770637954110"},
        "enabled": true
    });
    let native_add = fixture
        .call("/api/v1/reservations", Some(&intent.to_string()))
        .await;
    let (http_status, http_add) =
        http(app.clone(), "/api/v1/reservations", Some(intent.clone())).await;
    assert_eq!(
        (native_add.status, &native_add.body),
        (http_status, &http_add)
    );
    assert_eq!(native_add.status, 200);
    assert_eq!(native_add.body["data"]["acknowledged"], true);
    assert_eq!(native_add.body["data"]["confirmed"], true);
    assert_eq!(
        native_add.body["data"]["snapshot"]["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(transport.reserved.load(Ordering::Acquire));

    // Both transports must expose the same acknowledged-but-unconfirmed result
    // when the remote read temporarily hides the target identity.
    transport.force_unconfirmed.store(true, Ordering::Release);
    let native_unconfirmed = fixture
        .call("/api/v1/reservations", Some(&intent.to_string()))
        .await;
    let (http_status, http_unconfirmed) =
        http(app.clone(), "/api/v1/reservations", Some(intent)).await;
    assert_eq!(
        (native_unconfirmed.status, &native_unconfirmed.body),
        (http_status, &http_unconfirmed)
    );
    assert_eq!(native_unconfirmed.status, 200);
    assert_eq!(native_unconfirmed.body["data"]["acknowledged"], true);
    assert_eq!(native_unconfirmed.body["data"]["confirmed"], false);
    assert_eq!(
        native_unconfirmed.body["data"]["snapshot"]["items"],
        json!([])
    );

    transport.force_unconfirmed.store(false, Ordering::Release);
    let native_observed = fixture.call(&query, None).await;
    let (http_status, http_observed) = http(app, &query, None).await;
    assert_eq!(
        (native_observed.status, &native_observed.body),
        (http_status, &http_observed)
    );
    assert_eq!(native_observed.status, 200);
    assert_eq!(
        native_observed.body["data"]["items"][0]["reservation_id"],
        "7692049770637954110"
    );
}

#[tokio::test]
async fn follow_http_native_guest_scope_and_strict_request_boundaries_match_without_cloud_work() {
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("guest follow session")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    let original = account.snapshot().await;
    let query = format!(
        "/api/v1/follow?owner_id=&owner_epoch={}",
        original.owner_epoch
    );
    let intent = json!({"owner_id":"","owner_epoch":original.owner_epoch,"series_id":"9999999999999999999","enabled":true});
    let mut cases = vec![
        (query.clone(), None, 401, "ACCOUNT_FOLLOW_LOGIN_REQUIRED"),
        (
            format!("{query}&url=https://secret.invalid"),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            format!("{query}&owner_id=123"),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            "/api/v1/follow".into(),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            format!(
                "/api/v1/follow?owner_id=123&owner_epoch={}",
                original.owner_epoch
            ),
            None,
            409,
            "ACCOUNT_OWNER_CHANGED",
        ),
        (
            "/api/v1/follow?owner_id=&owner_epoch=old".into(),
            None,
            409,
            "ACCOUNT_OWNER_CHANGED",
        ),
        (
            "/api/v1/follow".into(),
            Some(intent.clone()),
            401,
            "ACCOUNT_FOLLOW_LOGIN_REQUIRED",
        ),
        (
            query.clone(),
            Some(intent.clone()),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
    ];
    for (key, value, status, code) in [
        ("owner_id", json!("123"), 409, "ACCOUNT_OWNER_CHANGED"),
        ("owner_epoch", json!("old"), 409, "ACCOUNT_OWNER_CHANGED"),
        (
            "series_id",
            json!("not-a-series"),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        ("series_id", json!(123), 400, "ACCOUNT_REQUEST_INVALID"),
        ("enabled", json!("true"), 400, "ACCOUNT_REQUEST_INVALID"),
        (
            "url",
            json!("https://secret.invalid"),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
    ] {
        let mut body = intent.clone();
        body[key] = value;
        cases.push(("/api/v1/follow".into(), Some(body), status, code));
    }
    for (path, payload, expected_status, code) in cases {
        let body = payload.as_ref().map(Value::to_string);
        let native = fixture.call(&path, body.as_deref()).await;
        let request = axum::http::Request::builder()
            .uri(&path)
            .method(if body.is_some() { "POST" } else { "GET" })
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .body(body.map_or(Body::empty(), Body::from))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status().as_u16(), expected_status, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        let http: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            (native.status, native.body),
            (expected_status, http.clone())
        );
        assert_eq!(http["code"], code);
        assert!(http.get("data").is_none());
        assert!(!http.to_string().contains("secret.invalid"));
    }
    let pending = fixture
        .session
        .start("/api/v1/follow", Some(&intent.to_string()));
    pending.cancel();
    let cancelled = pending.inner.result().await;
    assert_eq!(cancelled.status, 499);
    assert_eq!(cancelled.body["code"], "CORE_CANCELLED");
    for (category, status) in [
        (
            hongguo_core::account::AccountError::FollowLoginRequired,
            401,
        ),
        (hongguo_core::account::AccountError::FollowIncomplete, 502),
        (hongguo_core::account::AccountError::FollowRejected, 502),
        (hongguo_core::account::AccountError::FollowUnavailable, 502),
        (hongguo_core::account::AccountError::FollowUncertain, 502),
        (hongguo_core::account::AccountError::FollowBusy, 409),
    ] {
        let reply = account_error(category);
        assert_eq!(reply.status, status);
        assert_eq!(
            reply.body,
            json!({"ok":false,"code":category.code(),"error":category.to_string()})
        );
    }
    assert_eq!(account.snapshot().await, original);
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn reservations_http_native_guest_scope_and_strict_request_boundaries_match_without_cloud_work()
 {
    let mut fixture = Fixture::new(false).await;
    let account = hongguo_core::account::AccountService::open(
        &fixture.dir,
        fixture.session.services.library.clone(),
    )
    .await
    .unwrap();
    let services = Services {
        account: Some(account.clone()),
        ..fixture.session.services.clone()
    };
    let _previous = std::mem::replace(
        &mut fixture.session,
        Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("guest reservations session")),
    );
    let app = hongguo_http_api::router_with_account(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        None,
        None,
        Some(account.clone()),
    );
    let original = account.snapshot().await;
    let query = format!(
        "/api/v1/reservations?owner_id=&owner_epoch={}",
        original.owner_epoch
    );
    let intent = json!({"owner_id":"","owner_epoch":original.owner_epoch,"target":{"kind":"item","id":"9223372036854775807"},"enabled":true});
    let mut cases = vec![
        (
            query.clone(),
            None,
            401,
            "ACCOUNT_RESERVATION_LOGIN_REQUIRED",
        ),
        (
            format!("{query}&url=https://secret.invalid"),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            format!("{query}&owner_id=123"),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            "/api/v1/reservations".into(),
            None,
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            format!(
                "/api/v1/reservations?owner_id=123&owner_epoch={}",
                original.owner_epoch
            ),
            None,
            409,
            "ACCOUNT_OWNER_CHANGED",
        ),
        (
            "/api/v1/reservations?owner_id=&owner_epoch=old".into(),
            None,
            409,
            "ACCOUNT_OWNER_CHANGED",
        ),
        (
            "/api/v1/reservations".into(),
            Some(intent.clone()),
            401,
            "ACCOUNT_RESERVATION_LOGIN_REQUIRED",
        ),
        (
            query.clone(),
            Some(intent.clone()),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
    ];
    for (key, value, status, code) in [
        ("owner_id", json!("123"), 409, "ACCOUNT_OWNER_CHANGED"),
        ("owner_epoch", json!("old"), 409, "ACCOUNT_OWNER_CHANGED"),
        (
            "target",
            json!({"kind":"item","id":"not-an-item"}),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        (
            "target",
            json!({"kind":"item","id":123}),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
        ("enabled", json!("true"), 400, "ACCOUNT_REQUEST_INVALID"),
        (
            "url",
            json!("https://secret.invalid"),
            400,
            "ACCOUNT_REQUEST_INVALID",
        ),
    ] {
        let mut body = intent.clone();
        body[key] = value;
        cases.push(("/api/v1/reservations".into(), Some(body), status, code));
    }
    for (path, payload, expected_status, code) in cases {
        let body = payload.as_ref().map(Value::to_string);
        let native = fixture.call(&path, body.as_deref()).await;
        let request = axum::http::Request::builder()
            .uri(&path)
            .method(if body.is_some() { "POST" } else { "GET" })
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .body(body.map_or(Body::empty(), Body::from))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status().as_u16(), expected_status, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        let http: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            (native.status, native.body),
            (expected_status, http.clone())
        );
        assert_eq!(http["code"], code);
        assert!(http.get("data").is_none());
        assert!(!http.to_string().contains("secret.invalid"));
    }
    let pending = fixture
        .session
        .start("/api/v1/reservations", Some(&intent.to_string()));
    pending.cancel();
    let cancelled = pending.inner.result().await;
    assert_eq!(cancelled.status, 499);
    assert_eq!(cancelled.body["code"], "CORE_CANCELLED");
    for (category, status) in [
        (
            hongguo_core::account::AccountError::ReservationLoginRequired,
            401,
        ),
        (
            hongguo_core::account::AccountError::ReservationIncomplete,
            502,
        ),
        (
            hongguo_core::account::AccountError::ReservationRejected,
            502,
        ),
        (
            hongguo_core::account::AccountError::ReservationUnavailable,
            502,
        ),
        (
            hongguo_core::account::AccountError::ReservationUncertain,
            502,
        ),
        (hongguo_core::account::AccountError::ReservationBusy, 409),
    ] {
        let reply = account_error(category);
        assert_eq!(reply.status, status);
        assert_eq!(
            reply.body,
            json!({"ok":false,"code":category.code(),"error":category.to_string()})
        );
    }
    assert_eq!(account.snapshot().await, original);
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

impl Fixture {
    async fn new(stalled: bool) -> Self {
        Self::with_radar(stalled, false).await
    }
    async fn with_radar(stalled: bool, radar: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let upstream = Upstream {
            gate: Arc::new(Semaphore::new(0)),
            started: Arc::new(Semaphore::new(0)),
            stalled,
            calls: Arc::new(AtomicUsize::new(0)),
            discovery_status: Arc::new(AtomicUsize::new(200)),
            radar_status: Arc::new(AtomicUsize::new(200)),
            seasons_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/seasons/selector.input.json"),
            ))),
            calendar_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/calendar/released.input.json"),
            ))),
            new_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/calendar/new.input.json"),
            ))),
            feed_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/feed/cell.input.json"),
            ))),
            category_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/category/page.input.json"),
            ))),
            actor_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/catalog/actor-works.input.html"),
            ))),
            suggestions_reply: Arc::new(Mutex::new((
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/catalog/suggestions.input.json"),
            ))),
        };
        let app = Router::new()
            .fallback(upstream_handler())
            .with_state(upstream.clone());
        let source = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let dir = temp_dir();
        let services = Services {
            account: None,
            radar: if radar {
                Some(RadarService::for_loopback_tests(&dir, &origin, &origin).unwrap())
            } else {
                None
            },
            catalog: CatalogClient::for_loopback_tests(&origin).unwrap(),
            library: LibraryStore::open(dir.join("guest.sqlite3")).await.unwrap(),
            playback: PlaybackService::with_services(
                PlaybackClient::for_loopback_tests(&origin).unwrap(),
                MediaStore::for_loopback_tests(&dir, &origin).unwrap(),
            ),
        };
        let session = Session::with_services(services)
            .await
            .unwrap_or_else(|_| panic!("native session should open"));
        Self {
            session,
            dir,
            source,
            upstream,
            origin,
        }
    }
    async fn call(&self, path: &str, body: Option<&str>) -> Reply {
        let call = self.session.start(path, body);
        let reply = timeout(Duration::from_secs(5), call.inner.result())
            .await
            .unwrap();
        call.accept();
        reply
    }
    async fn play(&self) -> NativeCall {
        let call = self
            .session
            .start("/api/v1/play/info?series_id=11&vid=22&mode=range", None);
        assert_eq!(
            timeout(Duration::from_secs(5), call.inner.result())
                .await
                .unwrap()
                .status,
            200
        );
        call
    }
}

#[path = "mixed_tests.rs"]
mod mixed;
fn upstream_handler() -> axum::routing::MethodRouter<Upstream> {
    axum::routing::any(upstream)
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.session.close();
        self.source.abort();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
fn client() -> reqwest::Client {
    reqwest::Client::builder().no_proxy().build().unwrap()
}

#[tokio::test]
async fn full_series_detail_matches_http_and_never_persists_extensions_to_guest_history() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let path = "/api/v1/series/detail?series_id=7690163276214176792";
    let native = fixture.call(path, None).await;
    let http = app
        .oneshot(
            axum::http::Request::builder()
                .uri(path)
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(http.status(), StatusCode::OK);
    assert_eq!(http.headers()["cache-control"], "no-store");
    let http: Value =
        serde_json::from_slice(&axum::body::to_bytes(http.into_body(), 32768).await.unwrap())
            .unwrap();
    assert_eq!(native.body, http);
    let data = &native.body["data"];
    assert_eq!(data["actors"].as_array().unwrap().len(), 4);
    assert_eq!(
        data["actors"][0]["actor_id"],
        "99999999999999999999999999999999"
    );
    assert!(data["actors"][1].get("actor_id").is_none());
    assert!(data["related"][0].get("episodes").is_none());
    assert!(data.get("reviews").is_none());
    let mismatch = fixture
        .call("/api/v1/series/detail?series_id=999", None)
        .await;
    assert_eq!(mismatch.status, 502);
    assert_eq!(mismatch.body["code"], "UPSTREAM_INVALID_DATA");
    assert!(!mismatch.body.to_string().contains("合成演员"));
    let library = fixture.call("/api/v1/library", None).await;
    assert_eq!(library.body["data"]["entries"], json!([]));
}

#[tokio::test]
async fn full_series_detail_cancel_and_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture
            .session
            .start("/api/v1/series/detail?series_id=7690163276214176792", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
    }
}

#[tokio::test]
async fn business_calls_share_catalog_contracts_and_durable_guest_history() {
    let fixture = Fixture::new(false).await;
    for (path, expected) in [
        (
            "/api/v1/search?q=test",
            include_str!("../../../contracts/fixtures/catalog/search.expected.json"),
        ),
        (
            "/api/v1/series/detail?series_id=7690163276214176792",
            include_str!("../../../contracts/fixtures/catalog/detail.expected.json"),
        ),
    ] {
        let reply = fixture.call(path, None).await;
        assert_eq!(reply.status, 200);
        let expected: Value = serde_json::from_str(expected).unwrap();
        for (key, value) in expected.as_object().unwrap() {
            assert_eq!(&reply.body["data"][key], value);
        }
    }
    let status = fixture.call("/api/v1/status", None).await;
    assert_eq!(status.body["data"]["capabilities"]["history"], true);
    assert_eq!(status.body["data"]["capabilities"]["playback"], true);
    let saved=fixture.call("/api/v1/library",Some(r#"{"action":"progress","drama":{"series_id":"11","title":"合成短剧","cover":"","intro":"","episodes":[]},"episode":1,"video_id":"22","position":12.5,"duration":30}"#)).await;
    assert_eq!(saved.status, 200);
    assert_eq!(saved.body["data"]["entries"][0]["position"], 12.5);
    assert!(
        saved.body["data"]["entries"][0]["drama"]
            .get("episodes")
            .is_none()
    );
    fixture.session.close();
    let reopened = Session::open(&fixture.dir)
        .await
        .unwrap_or_else(|_| panic!("reopen should succeed"));
    let call = reopened.start("/api/v1/library", None);
    assert_eq!(call.inner.result().await.body, saved.body);
    call.accept();
    reopened.close();
}

#[tokio::test]
async fn native_errors_match_http_without_network_business_dispatch() {
    let fixture = Fixture::new(false).await;
    let services = &fixture.session.services;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        services.catalog.clone(),
        Some(services.library.clone()),
        Some(services.playback.clone()),
    );
    for (path, body) in [
        ("/api/v1/search?q=", None),
        ("/api/v1/search?q=x&source=app", None),
        ("/api/v1/search?q=x&q=y", None),
        ("/api/v1/series/detail?series_id=11&content_type=1003", None),
        ("/api/v1/play/info?series_id=11&vid=22&mode=file", None),
        (
            "/api/v1/play/release",
            Some(r#"{"path":"https://evil.test/secret"}"#),
        ),
        ("/api/v1/library?owner_id=another", None),
        (
            "/api/v1/library",
            Some(r#"{"action":"clear","kind":"history","owner_id":"another"}"#),
        ),
        ("/api/v1/library", Some(r#"{"action":"unknown"}"#)),
        ("/api/v1/account", None),
        ("/api/v1/account/qr/cancel", Some("{}")),
        ("/unknown", None),
    ] {
        let native = fixture.call(path, body).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(if body.is_some() {
                        Method::POST
                    } else {
                        Method::GET
                    })
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.unwrap_or("").to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        let http: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(native.status, status, "{path}");
        assert_eq!(native.body, http, "{path}");
    }
    for path in [
        "https://evil.test/api/v1/library",
        "//evil.test/api/v1/status",
        "/api/v1/status#fragment",
    ] {
        assert_eq!(fixture.call(path, None).await.status, 400);
    }
    assert_eq!(
        fixture
            .call("/api/v1/library", Some(&"x".repeat(32769)))
            .await
            .status,
        413
    );
}

#[tokio::test]
async fn media_listener_exposes_only_authorized_ranges_and_accept_transfers_ownership() {
    let fixture = Fixture::new(false).await;
    let call = fixture.play().await;
    let reply = call.inner.result().await;
    let path = reply.body["data"]["path"].as_str().unwrap();
    let url = format!("{}{path}", fixture.session.origin);
    let http = client();
    let response = http
        .get(&url)
        .header("range", "bytes=0-7")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 206);
    assert_eq!(
        response.bytes().await.unwrap().as_ref(),
        &media_bytes()[..8]
    );
    let response = http
        .head(&url)
        .header("range", "bytes=0-7")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 206);
    assert_eq!(response.headers()["content-length"], "8");
    assert!(response.bytes().await.unwrap().is_empty());
    assert_eq!(
        http.get(&url)
            .header("range", "bytes=999999-")
            .send()
            .await
            .unwrap()
            .status(),
        416
    );
    for (key, value) in [("origin", "https://foreign.test"), ("host", "localhost:80")] {
        assert_eq!(
            http.get(&url)
                .header(key, value)
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
    }
    for path in [
        "/api/v1/library",
        "/api/v1/status",
        "/healthz",
        "/api/v1/lists/recommend",
    ] {
        assert_eq!(
            http.get(format!("{}{path}", fixture.session.origin))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }
    call.accept();
    call.cancel();
    drop(call);
    assert_eq!(http.head(&url).send().await.unwrap().status(), 200);
    let release = json!({"path":path}).to_string();
    assert_eq!(
        fixture
            .call("/api/v1/play/release", Some(&release))
            .await
            .status,
        200
    );
    assert_eq!(
        fixture
            .call("/api/v1/play/release", Some(&release))
            .await
            .status,
        200
    );
    assert_eq!(http.get(&url).send().await.unwrap().status(), 410);
}

#[tokio::test]
async fn cancelled_ready_and_losing_completion_release_their_media() {
    let fixture = Fixture::new(false).await;
    let http = client();
    let call = fixture.play().await;
    let reply = call.inner.result().await;
    let path = reply.body["data"]["path"].as_str().unwrap().to_owned();
    call.cancel();
    call.cancel();
    call.accept();
    assert_eq!(call.inner.result().await.status, 499);
    assert_eq!(
        http.get(format!("{}{path}", fixture.session.origin))
            .send()
            .await
            .unwrap()
            .status(),
        410
    );
    let second = fixture.play().await;
    let mut reply = second.inner.result().await;
    let late_path = reply.media.clone().unwrap();
    // Move a published result to a completion arriving after another call's cancellation.
    second.accept();
    reply.media = Some(late_path.clone());
    call.inner.finish(reply);
    assert_eq!(
        http.get(format!("{}{late_path}", fixture.session.origin))
            .send()
            .await
            .unwrap()
            .status(),
        410
    );
    assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
}

#[tokio::test]
async fn cancellation_capacity_and_close_bound_pending_work_and_stop_the_listener() {
    let fixture = Fixture::new(true).await;
    let mut calls = Vec::new();
    for _ in 0..MAX_CALLS {
        calls.push(fixture.session.start("/api/v1/search?q=slow", None));
    }
    timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    assert_eq!(
        fixture.call("/api/v1/status", None).await.body["code"],
        "NATIVE_CAPACITY"
    );
    calls[0].cancel();
    assert_eq!(
        timeout(Duration::from_secs(1), calls[0].inner.result())
            .await
            .unwrap()
            .status,
        499
    );
    assert_eq!(fixture.call("/api/v1/status", None).await.status, 200);
    let preparing = fixture
        .session
        .start("/api/v1/play/info?series_id=11&vid=22", None);
    preparing.cancel();
    assert_eq!(preparing.inner.result().await.status, 499);
    fixture.session.close();
    fixture.session.close();
    for call in &calls {
        assert_eq!(call.inner.result().await.status, 499);
    }
    assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
    assert_eq!(
        fixture.call("/api/v1/status", None).await.body["code"],
        "CORE_CLOSED"
    );
    let address = fixture.session.origin.trim_start_matches("http://");
    timeout(Duration::from_secs(2), async {
        loop {
            // Probe ownership directly: Windows can spend the whole deadline
            // rejecting a connect even after the listener has been released.
            if TcpListener::bind(address).await.is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn pending_preparation_cancels_after_upstream_starts_and_dropped_task_answers() {
    let fixture = Fixture::new(true).await;
    let call = fixture
        .session
        .start("/api/v1/play/info?series_id=11&vid=22", None);
    timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    call.cancel();
    assert_eq!(
        timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap()
            .status,
        499
    );
    assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
    assert_eq!(
        fixture.call("/api/v1/library", None).await.body["data"]["entries"],
        json!([])
    );
    let (changed, _) = watch::channel(false);
    let waiting = Arc::new(Call {
        session: Weak::new(),
        id: 0,
        state: Mutex::new(CallState::default()),
        changed,
    });
    drop(Completion(Some(waiting.clone())));
    assert_eq!(waiting.result().await.body["code"], "CORE_REQUEST_FAILED");
}

#[tokio::test]
async fn initialization_preserves_corrupt_files_and_native_owner_drop_closes_media() {
    let dir = temp_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("guest.sqlite3");
    std::fs::write(&path, b"original corrupt database").unwrap();
    let reply = Session::open(&dir).await.err().unwrap();
    assert_eq!(reply.body["code"], "LIBRARY_STORAGE_UNAVAILABLE");
    assert_eq!(std::fs::read(&path).unwrap(), b"original corrupt database");
    std::fs::remove_dir_all(dir).unwrap();
    let fixture = Fixture::new(false).await;
    let owner = NativeSession {
        session: fixture.session.clone(),
    };
    let call = fixture.play().await;
    let path = call.inner.result().await.media.unwrap();
    call.accept();
    drop(owner);
    assert!(
        fixture
            .session
            .services
            .playback
            .lease(token(&path).unwrap())
            .is_err()
    );
    assert_eq!(fixture.call("/api/v1/status", None).await.status, 410);
}

#[tokio::test]
async fn native_keywords_match_http_persist_and_do_not_reach_media_listener() {
    let f = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        f.session.services.catalog.clone(),
        Some(f.session.services.library.clone()),
        Some(f.session.services.playback.clone()),
    );
    for (path, body) in [
        ("/api/v1/search/history", None),
        (
            "/api/v1/search/history",
            Some(r#"{"action":"add","query":"  古装   重生 "}"#),
        ),
        ("/api/v1/search/history?bad=1", None),
        (
            "/api/v1/search/history?bad=1",
            Some(r#"{"action":"clear"}"#),
        ),
        (
            "/api/v1/search/history",
            Some(r#"{"action":"add","query":" "}"#),
        ),
        (
            "/api/v1/search/history",
            Some(r#"{"action":"clear","extra":1}"#),
        ),
    ] {
        let native = f.call(path, body).await;
        let request = axum::http::Request::builder()
            .method(if body.is_some() { "POST" } else { "GET" })
            .uri(path)
            .header("host", "127.0.0.1:8080")
            .header("content-type", "application/json")
            .body(Body::from(body.unwrap_or("").to_owned()))
            .unwrap();
        let http = app.clone().oneshot(request).await.unwrap();
        assert_eq!(native.status, http.status().as_u16());
        let bytes = axum::body::to_bytes(http.into_body(), 65536).await.unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    let saved = f.call("/api/v1/search/history", None).await;
    assert_eq!(saved.body["data"]["items"], json!(["古装 重生"]));
    let response = client()
        .get(format!("{}/api/v1/search/history", f.session.origin))
        .send()
        .await
        .unwrap();
    assert_ne!(response.status(), 200);
    f.session.close();
    let reopened = Session::open(&f.dir)
        .await
        .unwrap_or_else(|_| panic!("reopen keyword store"));
    let call = reopened.start("/api/v1/search/history", None);
    assert_eq!(call.inner.result().await.body, saved.body);
    call.accept();
    let clear = reopened.start("/api/v1/search/history", Some(r#"{"action":"clear"}"#));
    assert_eq!(clear.inner.result().await.body["data"]["items"], json!([]));
    clear.accept();
    reopened.close();
}

#[tokio::test]
async fn discovery_rejects_inputs_before_network_and_matches_http_native() {
    for upstream_status in [200, 403, 500] {
        let fixture = Fixture::new(false).await;
        fixture
            .upstream
            .discovery_status
            .store(upstream_status, Ordering::SeqCst);
        let app = router_with_playback(
            DevPolicy::new(8080, None),
            fixture.session.services.catalog.clone(),
            None,
            None,
        );
        for (path, body, method, expected) in [
            ("/api/v1/search/discovery?q=secret", None, Method::GET, 400),
            ("/api/v1/search/discovery?uid=1", None, Method::GET, 400),
            (
                "/api/v1/search/discovery?upstream=https://evil.invalid",
                None,
                Method::GET,
                400,
            ),
            ("/api/v1/search/discovery?&&", None, Method::GET, 400),
            ("/api/v1/search/discovery", Some("{}"), Method::POST, 405),
            ("/api/v1/search/discovery", Some(""), Method::POST, 405),
        ] {
            let native = fixture.call(path, body).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method(method)
                        .uri(path)
                        .header("host", "127.0.0.1:8080")
                        .header("content-type", "application/json")
                        .body(Body::from(body.unwrap_or("").to_owned()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status().as_u16(), expected);
            assert_eq!(native.status, expected);
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
        }
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/search/discovery")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
        let native = fixture.call("/api/v1/search/discovery", None).await;
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/search/discovery")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            native.status,
            if upstream_status == 200 { 200 } else { 502 }
        );
        assert_eq!(response.status().as_u16(), native.status);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 2);
        if upstream_status == 200 {
            assert_eq!(native.body["data"]["guesses"][0]["query"], "合成发现词");
            assert_eq!(
                native.body["data"]["boards"][0]["items"][0]["series_id"],
                "90071992547409931234"
            );
        }
    }
}

#[tokio::test]
async fn suggestions_share_strict_http_native_inputs_results_and_sanitized_failures() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let mut invalid: Vec<String> = [
        "/api/v1/search/suggestions",
        "/api/v1/search/suggestions?q=x&q=y",
        "/api/v1/search/suggestions?q=x&offset=0",
        "/api/v1/search/suggestions?q=x&actor_id=1",
        "/api/v1/search/suggestions?q=x&history=private",
        "/api/v1/search/suggestions?q=x&url=https://evil.invalid",
        "/api/v1/search/suggestions?q=a%00b",
        "/api/v1/search/suggestions?q=a%0Ab",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    invalid.push(format!("/api/v1/search/suggestions?q={}", "x".repeat(101)));
    for (path, body, method, expected) in invalid
        .iter()
        .map(|path| (path.as_str(), None, Method::GET, 400))
        .chain([
            ("/api/v1/search/suggestions?q=", None, Method::GET, 200),
            (
                "/api/v1/search/suggestions?q=%20%0A",
                None,
                Method::GET,
                200,
            ),
            (
                "/api/v1/search/suggestions?q=x",
                Some("{}"),
                Method::POST,
                405,
            ),
            (
                "/api/v1/search/suggestions?q=x",
                Some(""),
                Method::POST,
                405,
            ),
        ])
    {
        let native = fixture.call(path, body).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.unwrap_or("").to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, expected, "{path}");
        assert_eq!(response.status().as_u16(), expected, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for (method, body, status) in [
        (Method::GET, "{}", 400),
        (Method::GET, " ", 400),
        (Method::DELETE, "", 405),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri("/api/v1/search/suggestions?q=x")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (status, body, code, expected_calls) in [
        (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/catalog/suggestions.input.json"),
            None,
            2,
        ),
        (
            StatusCode::OK,
            "secret malformed",
            Some("UPSTREAM_INVALID_DATA"),
            2,
        ),
        (
            StatusCode::FORBIDDEN,
            r#"{"code":"search_verification_required","secret":"hidden"}"#,
            Some("SEARCH_VERIFICATION_REQUIRED"),
            2,
        ),
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "secret",
            Some("UPSTREAM_HTTP_ERROR"),
            4,
        ),
    ] {
        *fixture.upstream.suggestions_reply.lock().unwrap() = (status, body);
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let native = fixture
            .call("/api/v1/search/suggestions?q=typed", None)
            .await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/search/suggestions?q=typed")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
        assert_eq!(response.status().as_u16(), native.status);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        if let Some(code) = code {
            assert_eq!(native.body["code"], code);
            assert!(!native.body.to_string().contains("secret"));
            assert!(!native.body.to_string().contains("hidden"));
        } else {
            let expected: Value = serde_json::from_str(include_str!(
                "../../../contracts/fixtures/catalog/suggestions.expected.json"
            ))
            .unwrap();
            assert_eq!(native.body["data"], expected);
        }
        assert_eq!(
            fixture.upstream.calls.load(Ordering::SeqCst),
            expected_calls
        );
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn suggestion_native_cancellation_and_session_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture
            .session
            .start("/api/v1/search/suggestions?q=typed", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(
                fixture
                    .call("/api/v1/search/suggestions?q=typed", None)
                    .await
                    .status,
                410
            );
        } else {
            assert_eq!(
                fixture
                    .call("/api/v1/search/suggestions?q=", None)
                    .await
                    .status,
                200
            );
        }
    }
}

#[tokio::test]
async fn actor_works_share_strict_http_native_inputs_results_and_sanitized_failures() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let mut invalid: Vec<String> = [
        "/api/v1/actors/works",
        "/api/v1/actors/works?actor_id=",
        "/api/v1/actors/works?actor_id=0",
        "/api/v1/actors/works?actor_id=000",
        "/api/v1/actors/works?actor_id=1%2F2",
        "/api/v1/actors/works?actor_id=%EF%BC%91",
        "/api/v1/actors/works?actor_id=1&actor_id=2",
        "/api/v1/actors/works?actor_id=1&offset=0",
        "/api/v1/actors/works?actor_id=1&q=x",
        "/api/v1/actors/works?actor_id=1&history=private",
        "/api/v1/actors/works?actor_id=1&url=https://evil.invalid",
        "/api/v1/actors/works?actor_id=a%00b",
        "/api/v1/actors/works?actor_id=a%0Ab",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    invalid.push(format!("/api/v1/actors/works?actor_id={}", "1".repeat(33)));
    for (path, body, method, expected) in invalid
        .iter()
        .map(|path| (path.as_str(), None, Method::GET, 400))
        .chain([
            (
                "/api/v1/actors/works?actor_id=99999999999999999999",
                Some("{}"),
                Method::POST,
                405,
            ),
            (
                "/api/v1/actors/works?actor_id=99999999999999999999",
                Some(""),
                Method::POST,
                405,
            ),
        ])
    {
        let native = fixture.call(path, body).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.unwrap_or("").to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, expected, "{path}");
        assert_eq!(response.status().as_u16(), expected, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for (method, body, status) in [
        (Method::GET, "{}", 400),
        (Method::GET, " ", 400),
        (Method::DELETE, "", 405),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri("/api/v1/actors/works?actor_id=99999999999999999999")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (status, body, code, expected_calls) in [
        (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/catalog/actor-works.input.html"),
            None,
            2,
        ),
        (
            StatusCode::OK,
            "secret malformed",
            Some("UPSTREAM_INVALID_DATA"),
            2,
        ),
        (
            StatusCode::FORBIDDEN,
            r#"{"code":"search_verification_required","secret":"hidden"}"#,
            Some("SEARCH_VERIFICATION_REQUIRED"),
            2,
        ),
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "secret",
            Some("UPSTREAM_HTTP_ERROR"),
            4,
        ),
    ] {
        *fixture.upstream.actor_reply.lock().unwrap() = (status, body);
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let native = fixture
            .call("/api/v1/actors/works?actor_id=99999999999999999999", None)
            .await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/actors/works?actor_id=99999999999999999999")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
        assert_eq!(response.status().as_u16(), native.status);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        if let Some(code) = code {
            assert_eq!(native.body["code"], code);
            assert!(!native.body.to_string().contains("secret"));
            assert!(!native.body.to_string().contains("hidden"));
        } else {
            let expected: Value = serde_json::from_str(include_str!(
                "../../../contracts/fixtures/catalog/actor-works.expected.json"
            ))
            .unwrap();
            assert_eq!(native.body["data"], expected);
        }
        assert_eq!(
            fixture.upstream.calls.load(Ordering::SeqCst),
            expected_calls
        );
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn actor_native_cancellation_and_session_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture
            .session
            .start("/api/v1/actors/works?actor_id=99999999999999999999", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(
                fixture
                    .call("/api/v1/actors/works?actor_id=99999999999999999999", None)
                    .await
                    .status,
                410
            );
        } else {
            fixture.upstream.gate.add_permits(1);
            assert_eq!(
                fixture
                    .call("/api/v1/actors/works?actor_id=99999999999999999999", None)
                    .await
                    .status,
                200
            );
        }
    }
}

#[tokio::test]
async fn category_shares_strict_http_native_inputs_results_and_sanitized_failures() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let invalid: Vec<String> = [
        "/api/v1/category?path=/evil",
        "/api/v1/category?path=",
        "/api/v1/category?offset=-1",
        "/api/v1/category?offset=100001",
        "/api/v1/category?offset=4294967296",
        "/api/v1/category?genre=x",
        "/api/v1/category?genre=short_play&genre=",
        "/api/v1/category?gender=2",
        "/api/v1/category?sort=unknown",
        "/api/v1/category?selectors=true",
        "/api/v1/category?selectors=1&selectors=0",
        "/api/v1/category?shown=1,,2",
        "/api/v1/category?shown=0",
        "/api/v1/category?session_id=a%00b",
        "/api/v1/category?category_dim_role=cate_%EF%BC%91",
        "/api/v1/category?online_time=days_1",
        "/api/v1/category?creation_status=x",
        "/api/v1/category?url=https://evil.invalid",
        "/api/v1/category?history=private",
    ]
    .into_iter()
    .map(str::to_owned)
    .chain([
        format!("/api/v1/category?session_id={}", "x".repeat(1025)),
        format!("/api/v1/category?shown={}", vec!["1"; 129].join(",")),
    ])
    .collect();
    for (path, body, method, expected) in invalid
        .iter()
        .map(|path| (path.as_str(), None, Method::GET, 400))
        .chain([
            (
                "/api/v1/category?selectors=1&offset=15",
                Some("{}"),
                Method::POST,
                405,
            ),
            (
                "/api/v1/category?selectors=1&offset=15",
                Some(""),
                Method::POST,
                405,
            ),
        ])
    {
        let native = fixture.call(path, body).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.unwrap_or("").to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, expected, "{path}");
        assert_eq!(response.status().as_u16(), expected, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for (method, body, status) in [
        (Method::GET, "{}", 400),
        (Method::GET, " ", 400),
        (Method::DELETE, "", 405),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri("/api/v1/category?selectors=1&offset=15")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (status, body, code, expected_calls) in [
        (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/category/page.input.json"),
            None,
            2,
        ),
        (
            StatusCode::OK,
            "secret malformed",
            Some("UPSTREAM_INVALID_DATA"),
            2,
        ),
        (
            StatusCode::FORBIDDEN,
            r#"{"code":"search_verification_required","secret":"hidden"}"#,
            Some("SEARCH_VERIFICATION_REQUIRED"),
            2,
        ),
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "secret",
            Some("UPSTREAM_HTTP_ERROR"),
            2,
        ),
    ] {
        *fixture.upstream.category_reply.lock().unwrap() = (status, body);
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let native = fixture
            .call("/api/v1/category?selectors=1&offset=15", None)
            .await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/category?selectors=1&offset=15")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
        assert_eq!(response.status().as_u16(), native.status);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        if let Some(code) = code {
            assert_eq!(native.body["code"], code);
            assert!(!native.body.to_string().contains("secret"));
            assert!(!native.body.to_string().contains("hidden"));
        } else {
            let expected: Value = serde_json::from_str(include_str!(
                "../../../contracts/fixtures/category/page.expected.json"
            ))
            .unwrap();
            assert_eq!(native.body["data"], expected);
        }
        assert_eq!(
            fixture.upstream.calls.load(Ordering::SeqCst),
            expected_calls
        );
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn category_native_cancellation_and_session_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture
            .session
            .start("/api/v1/category?selectors=1&offset=15", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(
                fixture
                    .call("/api/v1/category?selectors=1&offset=15", None)
                    .await
                    .status,
                410
            );
        } else {
            fixture.upstream.gate.add_permits(1);
            assert_eq!(
                fixture
                    .call("/api/v1/category?selectors=1&offset=15", None)
                    .await
                    .status,
                200
            );
        }
    }
}

#[tokio::test]
async fn feed_shares_strict_http_native_inputs_results_and_sanitized_failures() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let invalid: Vec<String> = [
        "/api/v1/lists/recommend?channel=45",
        "/api/v1/lists/recommend?channel=",
        "/api/v1/lists/recommend?channel=16&channel=39",
        "/api/v1/lists/recommend?offset=-1",
        "/api/v1/lists/recommend?offset=100001",
        "/api/v1/lists/recommend?offset=4294967296",
        "/api/v1/lists/recommend?feed_cell=1",
        "/api/v1/lists/recommend?feed_plan=1",
        "/api/v1/lists/recommend?feed_cell=1&feed_plan=2",
        "/api/v1/lists/recommend?channel=39&offset=1",
        "/api/v1/lists/recommend?channel=39&session_id=s",
        "/api/v1/lists/recommend?channel=36&shown=1",
        "/api/v1/lists/recommend?shown=1,,2",
        "/api/v1/lists/recommend?shown=0",
        "/api/v1/lists/recommend?session_id=a%00b",
        "/api/v1/lists/recommend?url=https://evil.invalid",
        "/api/v1/lists/recommend?history=private",
    ]
    .into_iter()
    .map(str::to_owned)
    .chain([
        format!("/api/v1/lists/recommend?session_id={}", "x".repeat(1025)),
        format!("/api/v1/lists/recommend?shown={}", vec!["1"; 129].join(",")),
    ])
    .collect();
    for (path, body, method, expected) in invalid
        .iter()
        .map(|path| (path.as_str(), None, Method::GET, 400))
        .chain([
            (
                "/api/v1/lists/recommend?offset=0&session_id=prior-session",
                Some("{}"),
                Method::POST,
                405,
            ),
            (
                "/api/v1/lists/recommend?offset=0&session_id=prior-session",
                Some(""),
                Method::POST,
                405,
            ),
        ])
    {
        let native = fixture.call(path, body).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.unwrap_or("").to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, expected, "{path}");
        assert_eq!(response.status().as_u16(), expected, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for (method, body, status) in [
        (Method::GET, "{}", 400),
        (Method::GET, " ", 400),
        (Method::DELETE, "", 405),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri("/api/v1/lists/recommend?offset=0&session_id=prior-session")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (status, body, code, expected_calls) in [
        (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/feed/cell.input.json"),
            None,
            2,
        ),
        (
            StatusCode::OK,
            "secret malformed",
            Some("UPSTREAM_INVALID_DATA"),
            2,
        ),
        (
            StatusCode::FORBIDDEN,
            r#"{"code":"search_verification_required","secret":"hidden"}"#,
            Some("SEARCH_VERIFICATION_REQUIRED"),
            2,
        ),
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "secret",
            Some("UPSTREAM_HTTP_ERROR"),
            2,
        ),
    ] {
        *fixture.upstream.feed_reply.lock().unwrap() = (status, body);
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let native = fixture
            .call(
                "/api/v1/lists/recommend?offset=0&session_id=prior-session",
                None,
            )
            .await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/lists/recommend?offset=0&session_id=prior-session")
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
        assert_eq!(response.status().as_u16(), native.status);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        if let Some(code) = code {
            assert_eq!(native.body["code"], code);
            assert!(!native.body.to_string().contains("secret"));
            assert!(!native.body.to_string().contains("hidden"));
        } else {
            let expected = hongguo_core::catalog::parse_feed(
                include_bytes!("../../../contracts/fixtures/feed/cell.input.json"),
                &hongguo_core::catalog::FeedQuery::new(hongguo_core::catalog::FeedParams {
                    session_id: Some("prior-session".into()),
                    ..Default::default()
                })
                .unwrap(),
            )
            .unwrap();
            assert_eq!(native.body["data"], serde_json::to_value(expected).unwrap());
        }
        assert_eq!(
            fixture.upstream.calls.load(Ordering::SeqCst),
            expected_calls
        );
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn feed_native_cancellation_and_session_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture.session.start("/api/v1/lists/recommend", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(
                fixture.call("/api/v1/lists/recommend", None).await.status,
                410
            );
        } else {
            fixture.upstream.gate.add_permits(1);
            assert_eq!(
                fixture.call("/api/v1/lists/recommend", None).await.status,
                200
            );
        }
    }
}

#[tokio::test]
async fn feed_http_native_tab_phase_retains_zero_offset_and_exact_context() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    *fixture.upstream.feed_reply.lock().unwrap() = (
        StatusCode::OK,
        include_str!("../../../contracts/fixtures/feed/tab.input.json"),
    );
    let first = fixture
        .call("/api/v1/lists/recommend?channel=39", None)
        .await;
    assert_eq!(first.status, 200);
    let page = &first.body["data"];
    assert_eq!(page["next_offset"], 0);
    assert_eq!(page["has_more"], true);
    assert_eq!(page["channel"], "39");
    assert_eq!(page["feed_cell"], "7650476176527343678");
    assert_eq!(page["feed_plan"], "7650476689721409598");
    assert_eq!(page["session_id"], "tab-session");
    assert_eq!(page["items"][0]["series_id"], "7690163276214176792");
    let response = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/v1/lists/recommend?channel=39")
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let bytes = axum::body::to_bytes(response.into_body(), 32768)
        .await
        .unwrap();
    assert_eq!(first.body, serde_json::from_slice::<Value>(&bytes).unwrap());
    *fixture.upstream.feed_reply.lock().unwrap() = (
        StatusCode::OK,
        include_str!("../../../contracts/fixtures/feed/cell.input.json"),
    );
    let path = format!(
        "/api/v1/lists/recommend?channel=39&offset={}&feed_cell={}&feed_plan={}&session_id={}",
        page["next_offset"],
        page["feed_cell"].as_str().unwrap(),
        page["feed_plan"].as_str().unwrap(),
        page["session_id"].as_str().unwrap()
    );
    let next = fixture.call(&path, None).await;
    assert_eq!(next.status, 200);
    assert_eq!(next.body["data"]["next_offset"], 6);
    assert_eq!(next.body["data"]["session_id"], "tab-session");
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri(&path)
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), 32768)
        .await
        .unwrap();
    assert_eq!(next.body, serde_json::from_slice::<Value>(&bytes).unwrap());
}

#[tokio::test]
async fn seasons_share_strict_http_native_validation_success_and_sanitized_errors() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        Some(fixture.session.services.library.clone()),
        Some(fixture.session.services.playback.clone()),
    );
    for endpoint in ["seasons", "next-season"] {
        for suffix in [
            "",
            "?series_id=0",
            "?series_id=bad",
            "?series_id=1&series_id=2",
            "?series_id=1&uid=2",
            "?series_id=1&url=https://secret.invalid",
        ] {
            let path = format!("/api/v1/series/{endpoint}{suffix}");
            let native = fixture.call(&path, None).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri(&path)
                        .header("host", "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(native.status, 400, "{path}");
            assert_eq!(response.status().as_u16(), 400, "{path}");
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
        }
        let path = format!("/api/v1/series/{endpoint}?series_id=100");
        assert_eq!(fixture.call(&path, Some("{}")).await.status, 405);
        for (method, body, status) in [
            (Method::GET, "{}", 400),
            (Method::POST, "", 405),
            (Method::DELETE, "", 405),
        ] {
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method(method)
                        .uri(&path)
                        .header("host", "127.0.0.1:8080")
                        .header("content-type", "application/json")
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status().as_u16(), status);
        }
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for endpoint in ["seasons", "next-season"] {
        for (status, body, code) in [
            (
                StatusCode::OK,
                include_str!("../../../contracts/fixtures/seasons/reciprocal.input.json"),
                None,
            ),
            (
                StatusCode::OK,
                "secret malformed",
                Some("UPSTREAM_INVALID_DATA"),
            ),
            (
                StatusCode::FORBIDDEN,
                "secret",
                Some("SEARCH_VERIFICATION_REQUIRED"),
            ),
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "secret",
                Some("UPSTREAM_HTTP_ERROR"),
            ),
        ] {
            *fixture.upstream.seasons_reply.lock().unwrap() = (status, body);
            fixture.upstream.calls.store(0, Ordering::SeqCst);
            let path = format!("/api/v1/series/{endpoint}?series_id=100");
            let native = fixture.call(&path, None).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri(&path)
                        .header("host", "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.headers()["cache-control"], "no-store");
            assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
            assert_eq!(native.status, response.status().as_u16());
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
            if let Some(code) = code {
                assert_eq!(native.body["code"], code);
                assert!(!native.body.to_string().contains("secret"));
            } else if endpoint == "seasons" {
                assert_eq!(native.body["data"]["items"][0]["drama"]["series_id"], "100");
            } else {
                assert_eq!(native.body["data"]["current_season"], 1);
                assert!(native.body["data"]["next"].is_null());
            }
            assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 2);
        }
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}
#[tokio::test]
async fn seasons_native_cancellation_and_session_close_stop_pending_relations_without_history() {
    for endpoint in ["seasons", "next-season"] {
        for close in [false, true] {
            let fixture = Fixture::new(true).await;
            let call = fixture
                .session
                .start(&format!("/api/v1/series/{endpoint}?series_id=100"), None);
            timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
                .await
                .unwrap()
                .unwrap()
                .forget();
            if close {
                fixture.session.close();
            } else {
                call.cancel();
            }
            let reply = timeout(Duration::from_secs(1), call.inner.result())
                .await
                .unwrap();
            assert_eq!(reply.status, 499);
            assert_eq!(reply.body["code"], "CORE_CANCELLED");
            assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
            fixture.upstream.gate.add_permits(1);
            tokio::time::sleep(Duration::from_millis(250)).await;
            assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
            assert!(
                fixture
                    .session
                    .services
                    .library
                    .snapshot()
                    .await
                    .unwrap()
                    .entries
                    .is_empty()
            );
            assert!(
                fixture
                    .session
                    .services
                    .library
                    .search_history()
                    .await
                    .unwrap()
                    .items
                    .is_empty()
            );
        }
    }
}

#[tokio::test]
async fn seasons_encoded_query_length_limits_match_http_native() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    for route in ["/api/v1/series/seasons", "/api/v1/series/next-season"] {
        for (len, status) in [(8192, 400), (8193, 413)] {
            let prefix = format!("{route}?unknown=");
            let remaining = len - prefix.len();
            let path = format!(
                "{prefix}{}{}",
                "%78".repeat(remaining / 3),
                "x".repeat(remaining % 3)
            );
            assert_eq!(path.len(), len);
            let native = fixture.call(&path, None).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri(&path)
                        .header("host", "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(native.status, status);
            assert_eq!(response.status().as_u16(), status);
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
        }
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn calendar_native_cancellation_and_session_close_leave_no_pending_work_or_history() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        let call = fixture.session.start("/api/v1/lists/calendar", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(
                fixture.call("/api/v1/lists/calendar", None).await.status,
                410
            );
        } else {
            fixture.upstream.gate.add_permits(1);
            assert_eq!(
                fixture.call("/api/v1/lists/calendar", None).await.status,
                200
            );
        }
    }
}

#[tokio::test]
async fn calendar_http_native_parity_and_strict_inputs() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    for path in [
        "/api/v1/lists/calendar?date=20260229",
        "/api/v1/lists/calendar?gender=2",
        "/api/v1/lists/calendar?subscribe_offset=-1",
        "/api/v1/lists/calendar?offset=100001",
        "/api/v1/lists/calendar?session_id=a%00b",
        "/api/v1/lists/calendar?date=20261114&date=20261115",
        "/api/v1/lists/new?gender=3",
        "/api/v1/lists/new?url=https://evil.invalid",
    ] {
        let native = fixture.call(path, None).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, 400);
        assert_eq!(response.status().as_u16(), 400);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (path, slot, valid) in [
        (
            "/api/v1/lists/calendar",
            &fixture.upstream.calendar_reply,
            include_str!("../../../contracts/fixtures/calendar/released.input.json"),
        ),
        (
            "/api/v1/lists/new",
            &fixture.upstream.new_reply,
            include_str!("../../../contracts/fixtures/calendar/new.input.json"),
        ),
    ] {
        assert_eq!(fixture.call(path, Some("{}")).await.status, 405);
        for (status, body, expected) in [
            (StatusCode::OK, valid, 200),
            (StatusCode::OK, "secret malformed", 502),
            (StatusCode::FORBIDDEN, "secret", 502),
            (StatusCode::INTERNAL_SERVER_ERROR, "secret", 502),
        ] {
            *slot.lock().unwrap() = (status, body);
            let native = fixture.call(path, None).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri(path)
                        .header("host", "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.headers()["cache-control"], "no-store");
            assert_eq!(native.status, expected);
            assert_eq!(response.status().as_u16(), expected);
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
            assert!(!native.body.to_string().contains("secret"));
        }
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}

#[tokio::test]
async fn calendar_new_query_length_limits_match_native_http() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    for route in ["/api/v1/lists/new", "/api/v1/lists/calendar"] {
        for (len, status) in [(8192, 400), (8193, 413)] {
            let prefix = format!("{route}?unknown=");
            let path = format!("{prefix}{}", "x".repeat(len - prefix.len()));
            let native = fixture.call(&path, None).await;
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri(&path)
                        .header("host", "127.0.0.1:8080")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(native.status, status);
            assert_eq!(response.status().as_u16(), status);
            let bytes = axum::body::to_bytes(response.into_body(), 32768)
                .await
                .unwrap();
            assert_eq!(
                native.body,
                serde_json::from_slice::<Value>(&bytes).unwrap()
            );
        }
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn rankings_strict_http_native_contract_success_and_sanitized_failures() {
    let fixture = Fixture::new(false).await;
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let mut invalid = vec![
        "offset=-1".into(),
        "offset=100001".into(),
        "offset=4294967296".into(),
        "offset=0&offset=1".into(),
        "rank=a&rank=b".into(),
        "rank=x%00y".into(),
        "rank_sub=a%0Ab".into(),
        "rank_panel=a%7Fb".into(),
        "shown=actor-1".into(),
        "shown=0".into(),
        "shown=1,,2".into(),
        "url=https://secret.invalid".into(),
        "uid=1".into(),
        "session_id=a%00b".into(),
    ];
    invalid.extend([
        format!("rank={}", "x".repeat(257)),
        format!("rank_sub={}", "x".repeat(257)),
        format!("rank_panel={}", "x".repeat(257)),
        format!("session_id={}", "x".repeat(1025)),
        format!("shown={}", vec!["1"; 129].join(",")),
    ]);
    for q in invalid {
        let path = format!("/api/v1/lists/rank?{q}");
        let native = fixture.call(&path, None).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(&path)
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, 400, "{path}");
        assert_eq!(response.status().as_u16(), 400, "{path}");
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for body in ["", "{}"] {
        assert_eq!(
            fixture.call("/api/v1/lists/rank", Some(body)).await.status,
            405
        );
    }
    for (method, body, want) in [
        (Method::POST, "{}", 405),
        (Method::DELETE, "", 405),
        (Method::GET, "{}", 400),
        (Method::GET, " ", 400),
    ] {
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri("/api/v1/lists/rank")
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), want);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    for (status, body, code, calls) in [
        (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/rankings/page.input.json"),
            None,
            2,
        ),
        (
            StatusCode::OK,
            "secret malformed",
            Some("UPSTREAM_INVALID_DATA"),
            2,
        ),
        (
            StatusCode::FORBIDDEN,
            "secret",
            Some("SEARCH_VERIFICATION_REQUIRED"),
            2,
        ),
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "secret",
            Some("UPSTREAM_HTTP_ERROR"),
            2,
        ),
        (StatusCode::OK, "", Some("UPSTREAM_INVALID_DATA"), 6),
    ] {
        *fixture.upstream.feed_reply.lock().unwrap() = (status, body);
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let path = "/api/v1/lists/rank?rank=all&rank_sub=ranklist_hot_play_sc&offset=10&session_id=prior&shown=11,12";
        let native = fixture.call(path, None).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(native.status, if code.is_some() { 502 } else { 200 });
        assert_eq!(native.status, response.status().as_u16());
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        if let Some(code) = code {
            assert_eq!(native.body["code"], code);
            assert!(!native.body.to_string().contains("secret"));
        } else {
            let expected: Value = serde_json::from_str(include_str!(
                "../../../contracts/fixtures/rankings/page.expected.json"
            ))
            .unwrap();
            assert_eq!(native.body["data"], expected);
        }
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), calls);
    }
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        fixture
            .session
            .services
            .library
            .search_history()
            .await
            .unwrap()
            .items
            .is_empty()
    );
}
#[tokio::test]
async fn rankings_native_cancellation_and_session_close_have_no_late_write_or_retry() {
    for close in [false, true] {
        let fixture = Fixture::new(true).await;
        *fixture.upstream.feed_reply.lock().unwrap() = (
            StatusCode::OK,
            include_str!("../../../contracts/fixtures/rankings/page.input.json"),
        );
        let call = fixture.session.start("/api/v1/lists/rank", None);
        timeout(Duration::from_secs(2), fixture.upstream.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(1), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert_eq!(reply.body["code"], "CORE_CANCELLED");
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(1);
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 1);
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert!(
            fixture
                .session
                .services
                .library
                .search_history()
                .await
                .unwrap()
                .items
                .is_empty()
        );
        if close {
            assert_eq!(fixture.call("/api/v1/lists/rank", None).await.status, 410);
        } else {
            fixture.upstream.gate.add_permits(1);
            assert_eq!(fixture.call("/api/v1/lists/rank", None).await.status, 200);
        }
    }
}

#[tokio::test]
async fn rankings_encoded_request_budget_is_equal_at_native_and_http_boundaries() {
    let fixture = Fixture::new(false).await;
    *fixture.upstream.feed_reply.lock().unwrap() = (
        StatusCode::OK,
        include_str!("../../../contracts/fixtures/rankings/page.input.json"),
    );
    let app = router_with_playback(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
    );
    let prefix = format!(
        "/api/v1/lists/rank?rank={}&rank_sub={}&rank_panel={}&shown={}&session_id=",
        "%21".repeat(256),
        "%21".repeat(256),
        "%21".repeat(256),
        vec!["1".repeat(32); 128].join(",")
    );
    let padding = 8192 - prefix.len();
    assert!((3..=3072).contains(&padding));
    let session = "%21".repeat(padding / 3 - 1) + &"a".repeat(padding % 3 + 3);
    let valid = prefix + &session;
    assert_eq!(valid.len(), 8192);
    for (path, want, calls) in [(valid.clone() + "a", 413, 0), (valid, 200, 2)] {
        fixture.upstream.calls.store(0, Ordering::SeqCst);
        let native = fixture.call(&path, None).await;
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(&path)
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, want);
        assert_eq!(response.status().as_u16(), want);
        let bytes = axum::body::to_bytes(response.into_body(), 32768)
            .await
            .unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), calls);
    }
}

#[tokio::test]
async fn radar_http_native_strict_inputs_and_snapshot_contract_match() {
    let fixture = Fixture::with_radar(false, true).await;
    let app = router_with_radar(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
        fixture.session.services.radar.clone(),
    );
    let mut paths = vec![
        ("/api/v1/radar?url=http://private.invalid".to_owned(), 400),
        ("/api/v1/radar?x=1&x=2".to_owned(), 400),
        ("/api/v1/radar?refresh=1".to_owned(), 400),
        ("/api/v1/radar/".to_owned(), 404),
        ("/api/v1/%72adar".to_owned(), 404),
    ];
    for (len, status) in [(8192, 400), (8193, 413)] {
        let prefix = "/api/v1/radar?x=";
        paths.push((
            format!("{prefix}{}", "x".repeat(len - prefix.len())),
            status,
        ));
    }
    for (path, status) in paths {
        let native = fixture.call(&path, None).await;
        let http = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(&path)
                    .header("host", "127.0.0.1:8080")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(native.status, status, "{path}");
        assert_eq!(http.status().as_u16(), status, "{path}");
        assert_eq!(http.headers()["cache-control"], "no-store");
        let bytes = axum::body::to_bytes(http.into_body(), 32768).await.unwrap();
        assert_eq!(
            native.body,
            serde_json::from_slice::<Value>(&bytes).unwrap()
        );
    }
    for body in ["", "{}"] {
        assert_eq!(fixture.call("/api/v1/radar", Some(body)).await.status, 405);
    }
    assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), 0);
    let native = fixture.call("/api/v1/radar", None).await;
    assert_eq!(native.status, 200, "{}", native.body);
    let http = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/v1/radar")
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(http.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(http.into_body(), 32768).await.unwrap();
    let mut http: Value = serde_json::from_slice(&bytes).unwrap();
    let mut native_data = native.body.clone();
    for value in [&mut native_data, &mut http] {
        for key in ["ranks_fetched_at", "growth_fetched_at"] {
            let at = value["data"][key].as_str().unwrap();
            assert!(at.contains('T') && at.ends_with('Z'), "{at}");
            value["data"].as_object_mut().unwrap().remove(key);
        }
    }
    assert_eq!(native_data, http);
    let item = &native.body["data"]["growth"]["items"][0];
    assert_eq!(item["hot"], i64::MAX.to_string());
    assert_eq!(item["d_hot"], i64::MIN.to_string());
    assert_eq!(item["fav"], "0");
    assert!(item["d_fav"].is_null());
    assert!(
        fixture
            .session
            .services
            .library
            .snapshot()
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    let response = client()
        .get(format!("{}/api/v1/radar", fixture.session.origin))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 404);
}

#[tokio::test]
async fn radar_failures_are_sanitized_and_absence_is_explicit() {
    let absent = Fixture::new(false).await;
    assert_eq!(
        absent.call("/api/v1/radar", None).await.body["code"],
        "CORE_NOT_IMPLEMENTED"
    );
    let fixture = Fixture::with_radar(false, true).await;
    fixture.upstream.radar_status.store(503, Ordering::SeqCst);
    let native = fixture.call("/api/v1/radar", None).await;
    let app = router_with_radar(
        DevPolicy::new(8080, None),
        fixture.session.services.catalog.clone(),
        None,
        None,
        fixture.session.services.radar.clone(),
    );
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/v1/radar")
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), native.status);
    let bytes = axum::body::to_bytes(response.into_body(), 32768)
        .await
        .unwrap();
    assert_eq!(
        native.body,
        serde_json::from_slice::<Value>(&bytes).unwrap()
    );
    assert_eq!(native.status, 502);
    assert_eq!(native.body["code"], "RADAR_UNAVAILABLE");
    for secret in ["secret.invalid", "private upstream", "127.0.0.1"] {
        assert!(!native.body.to_string().contains(secret));
    }
}

#[tokio::test]
async fn radar_cancel_and_close_stop_pending_network_without_late_cache_or_history() {
    for close in [false, true] {
        let fixture = Fixture::with_radar(true, true).await;
        let call = fixture.session.start("/api/v1/radar", None);
        timeout(
            Duration::from_secs(5),
            fixture.upstream.started.acquire_many(2),
        )
        .await
        .unwrap()
        .unwrap()
        .forget();
        let before = fixture.upstream.calls.load(Ordering::SeqCst);
        if close {
            fixture.session.close();
        } else {
            call.cancel();
        }
        let reply = timeout(Duration::from_secs(5), call.inner.result())
            .await
            .unwrap();
        assert_eq!(reply.status, 499);
        assert!(fixture.session.calls.lock().unwrap().pending.is_empty());
        fixture.upstream.gate.add_permits(8);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(fixture.upstream.calls.load(Ordering::SeqCst), before);
        assert!(!fixture.dir.join("radar-v1.json").exists());
        assert!(
            fixture
                .session
                .services
                .library
                .snapshot()
                .await
                .unwrap()
                .entries
                .is_empty()
        );
        assert_eq!(call.inner.result().await.status, 499);
    }
}

#[tokio::test]
async fn native_corrupt_radar_cache_is_preserved_and_never_opens_a_session() {
    let dir = temp_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("radar-v1.json");
    std::fs::write(&path, b"private corrupt radar cache").unwrap();
    let error = match Session::open(&dir).await {
        Ok(_) => panic!("invalid radar cache must fail startup"),
        Err(error) => error,
    };
    assert_eq!(error.status, 500);
    assert_eq!(error.body["code"], "RADAR_CACHE_INVALID");
    assert!(!error.body.to_string().contains("private corrupt"));
    assert_eq!(std::fs::read(path).unwrap(), b"private corrupt radar cache");
    std::fs::remove_dir_all(dir).unwrap();
}
