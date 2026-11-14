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
use hongguo_http_api::router_with_playback;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use tokio::{net::TcpListener, sync::Semaphore, time::timeout};
use tower::ServiceExt;

#[derive(Clone)]
struct Upstream {
    gate: Arc<Semaphore>,
    started: Arc<Semaphore>,
    stalled: bool,
    calls: Arc<AtomicUsize>,
    discovery_status: Arc<AtomicUsize>,
    suggestions_reply: Arc<Mutex<(StatusCode, &'static str)>>,
    actor_reply: Arc<Mutex<(StatusCode, &'static str)>>,
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
            || path == "/incent_resource/suggestion"
            || path.starts_with("/character/"))
    {
        state.started.add_permits(1);
        state.gate.acquire().await.unwrap().forget();
    }
    match path {
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
        "/detail" => {
            include_str!("../../../contracts/fixtures/catalog/detail.input.html").into_response()
        }
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
impl Fixture {
    async fn new(stalled: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let upstream = Upstream {
            gate: Arc::new(Semaphore::new(0)),
            started: Arc::new(Semaphore::new(0)),
            stalled,
            calls: Arc::new(AtomicUsize::new(0)),
            discovery_status: Arc::new(AtomicUsize::new(200)),
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
    for path in ["/api/v1/library", "/api/v1/status", "/healthz"] {
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
            if tokio::net::TcpStream::connect(address).await.is_err() {
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
