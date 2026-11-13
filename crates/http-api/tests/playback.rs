//! Prepared resources, real Range bytes and disconnect ownership; no external media.
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::Request,
    http::StatusCode,
    response::Response,
};
use hongguo_core::{
    catalog::CatalogClient,
    media::MediaStore,
    playback::{PlaybackClient, PlaybackService},
};
use hongguo_http_api::{DevPolicy, router_with_playback};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Notify,
    time::timeout,
};
use tower::ServiceExt;

#[derive(Clone, Copy)]
enum SourceMode {
    Ready,
    SlowRead,
    SlowPrepare,
}
struct Fixture {
    app: Router,
    service: PlaybackService,
    dir: PathBuf,
    source: tokio::task::JoinHandle<()>,
    count: Arc<AtomicUsize>,
    started: Arc<Notify>,
    stopped: Arc<Notify>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.service.close();
        self.source.abort();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
fn media_bytes() -> Vec<u8> {
    let v: Value = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/playback/media.json"
    ))
    .unwrap();
    v["hex"]
        .as_str()
        .unwrap()
        .as_bytes()
        .chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).unwrap())
        .collect()
}
impl Fixture {
    async fn new(mode: SourceMode) -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "hongguo-play-api-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let count = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(Notify::new());
        let stopped = Arc::new(Notify::new());
        let (c, s, d) = (count.clone(), started.clone(), stopped.clone());
        let source = tokio::spawn(async move {
            let mut tasks = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    socket=listener.accept()=>{let(mut socket,_)=socket.unwrap();let(c,s,d)=(c.clone(),s.clone(),d.clone());tasks.spawn(async move{
                        let mut head=Vec::new();let mut b=[0];while !head.ends_with(b"\r\n\r\n")&&head.len()<32768{if socket.read(&mut b).await.unwrap_or(0)==0{return}head.push(b[0]);}
                        let head=String::from_utf8(head).unwrap();let lower=head.to_ascii_lowercase();let path=head.split_whitespace().nth(1).unwrap();
                        let len=lower.lines().find_map(|l|l.strip_prefix("content-length: ")?.parse::<usize>().ok()).unwrap_or(0);let mut body=vec![0;len];let _=socket.read_exact(&mut body).await;c.fetch_add(1,Ordering::SeqCst);
                        if matches!(mode,SourceMode::SlowPrepare)&& !path.starts_with("/service/") {
                    s.notify_one();let _=socket.read(&mut b).await;d.notify_one();return;
                }
                let(media,body)=if path.starts_with("/service/"){(false,br#"{"device_id_str":"111","install_id_str":"222"}"#.to_vec())}else if path.starts_with("/media") {(true,media_bytes())}else{let vid=path.split('?').nth(1).unwrap().split('&').find_map(|q|q.strip_prefix("video_id=")).unwrap();(false,serde_json::to_vec(&json!({"data":{"video_model":{"vid":vid,"video_list":[{"codec_type":"hevc","vheight":720,"main_url":"https://media.example.invalid/media?signed=secret"}]}}})).unwrap())};
                        let range=lower.lines().find_map(|l|l.strip_prefix("range: bytes="));
                        let(start,end)=range.and_then(|r|r.split_once('-')).map(|(s,e)|(s.parse::<usize>().unwrap(),e.parse::<usize>().unwrap().min(body.len()-1))).unwrap_or((0,body.len()-1));
                        if media&&matches!(mode,SourceMode::SlowRead)&&lower.contains("if-range:") {s.notify_one();let _=socket.read(&mut b).await;d.notify_one();return;}
                        let partial=media&&range.is_some();let bytes=if partial{&body[start..=end]}else{&body};
                        let range=if partial{format!("Content-Range: bytes {start}-{end}/{}\r\nETag: \"v1\"\r\n",body.len())}else{String::new()};
                        let header=format!("HTTP/1.1 {} Test\r\nContent-Length: {}\r\nConnection: close\r\n{range}\r\n",if partial{206}else{200},bytes.len());let _=socket.write_all(header.as_bytes()).await;let _=socket.write_all(bytes).await;
                    });}
                    _=tasks.join_next(),if !tasks.is_empty()=>{}
                }
            }
        });
        let service = PlaybackService::with_services(
            PlaybackClient::for_loopback_tests(&origin).unwrap(),
            MediaStore::for_loopback_tests(&dir, &origin).unwrap(),
        );
        let app = router_with_playback(
            DevPolicy::new(8080, Some("http://127.0.0.1:8790".parse().unwrap())),
            CatalogClient::new().unwrap(),
            None,
            Some(service.clone()),
        );
        Self {
            app,
            service,
            dir,
            source,
            count,
            started,
            stopped,
        }
    }
    async fn call(
        &self,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &str,
    ) -> Response {
        let mut req = Request::builder()
            .method(method)
            .uri(path)
            .header("host", "127.0.0.1:8080");
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        self.app
            .clone()
            .oneshot(req.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap()
    }
    async fn resolve(&self) -> String {
        let response = self
            .call(
                "GET",
                "/api/v1/play/info?series_id=11&vid=22&mode=range",
                &[],
                "",
            )
            .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let value = json_body(response).await;
        assert_eq!(value["data"]["vid"], "22");
        assert_eq!(value["data"]["quality"], "720P");
        assert!(!value.to_string().contains("secret"));
        value["data"]["path"].as_str().unwrap().into()
    }
}
async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 32768).await.unwrap()).unwrap()
}

#[tokio::test]
async fn get_and_head_share_exact_representation_headers_and_range_bytes() {
    let f = Fixture::new(SourceMode::Ready).await;
    let path = f.resolve().await;
    let bytes = media_bytes();
    let length = bytes.len();
    for (range, first, last, status) in [
        (None, 0, length - 1, 200),
        (Some("bytes=3-17"), 3, 17, 206),
        (Some("bytes=20-"), 20, length - 1, 206),
        (Some("bytes=-11"), length - 11, length - 1, 206),
        (Some("bytes=0-99999"), 0, length - 1, 206),
    ] {
        let headers = range.map(|r| vec![("range", r)]).unwrap_or_default();
        let get = f.call("GET", &path, &headers, "").await;
        let head = f.call("HEAD", &path, &headers, "").await;
        assert_eq!(get.status().as_u16(), status);
        assert_eq!(head.status(), get.status());
        for name in [
            "content-length",
            "content-type",
            "content-range",
            "accept-ranges",
            "cache-control",
        ] {
            assert_eq!(get.headers().get(name), head.headers().get(name));
        }
        assert_eq!(
            get.headers()["content-length"],
            (last - first + 1).to_string()
        );
        assert_eq!(get.headers()["content-type"], "video/mp4");
        assert_eq!(get.headers()["accept-ranges"], "bytes");
        assert_eq!(get.headers()["cache-control"], "no-store");
        if status == 206 {
            assert_eq!(
                get.headers()["content-range"],
                format!("bytes {first}-{last}/{length}")
            );
        }
        assert!(to_bytes(head.into_body(), 1024).await.unwrap().is_empty());
        assert_eq!(
            to_bytes(get.into_body(), 512 * 1024).await.unwrap(),
            bytes[first..=last]
        );
    }
}
#[tokio::test]
async fn malformed_ranges_and_expired_tokens_never_read_unrelated_resources() {
    let f = Fixture::new(SourceMode::Ready).await;
    let path = f.resolve().await;
    let before = f.count.load(Ordering::SeqCst);
    for range in [
        "",
        "bytes=1-0",
        "bytes=99999-",
        "bytes=-0",
        "bytes=1-2,4-5",
        "bytes=18446744073709551616-",
    ] {
        for method in ["GET", "HEAD"] {
            let response = f.call(method, &path, &[("range", range)], "").await;
            assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
            assert_eq!(
                response.headers()["content-range"],
                format!("bytes */{}", media_bytes().len())
            );
            assert!(
                to_bytes(response.into_body(), 1024)
                    .await
                    .unwrap()
                    .is_empty()
            );
        }
    }
    let response = f
        .call(
            "GET",
            &path,
            &[("range", "bytes=0-1"), ("range", "bytes=2-3")],
            "",
        )
        .await;
    assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    for token in ["bad", &"0".repeat(64), "..%2Fhistory"] {
        let response = f
            .call("GET", &format!("/minireel-proxy/media/{token}"), &[], "")
            .await;
        assert_eq!(response.status(), StatusCode::GONE);
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    assert_eq!(f.count.load(Ordering::SeqCst), before);
    let payload = json!({"path":path}).to_string();
    for _ in 0..2 {
        let response = f
            .call(
                "POST",
                "/api/v1/play/release",
                &[("content-type", "application/json")],
                &payload,
            )
            .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(json_body(response).await["data"]["released"], true);
    }
    assert_eq!(
        f.call("GET", &path, &[], "").await.status(),
        StatusCode::GONE
    );
}
#[tokio::test]
async fn policy_capabilities_validation_and_contracts_match_actual_assembly() {
    let f = Fixture::new(SourceMode::Ready).await;
    for query in [
        "",
        "?series_id=11&vid=22&owner_id=secret",
        "?series_id=11&vid=22&mode=full",
        "?series_id=11&vid=22&quality=4K",
        "?series_id=11&vid=22&content_type=2",
        "?series_id=11&series_id=12&vid=22",
    ] {
        let response = f
            .call("GET", &format!("/api/v1/play/info{query}"), &[], "")
            .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(
            json_body(response).await["code"]
                .as_str()
                .unwrap()
                .starts_with("INVALID_PLAYBACK")
                || query.contains("content_type")
        );
    }
    assert_eq!(f.count.load(Ordering::SeqCst), 0);
    let status = json_body(f.call("GET", "/api/v1/status", &[], "").await).await;
    assert_eq!(status["data"]["capabilities"]["playback"], true);
    assert_eq!(status["data"]["capabilities"]["account"], false);
    let path = f.resolve().await;
    let before = f.count.load(Ordering::SeqCst);
    let denied = f
        .call("GET", &path, &[("origin", "https://evil.test")], "")
        .await;
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
    assert_eq!(denied.headers()["cache-control"], "no-store");
    assert_eq!(f.count.load(Ordering::SeqCst), before);
    let allowed = f
        .call("HEAD", &path, &[("origin", "http://127.0.0.1:8790")], "")
        .await;
    assert_eq!(
        allowed.headers()["access-control-allow-origin"],
        "http://127.0.0.1:8790"
    );
    assert_eq!(
        allowed.headers()["access-control-expose-headers"],
        "Content-Range, Accept-Ranges, Content-Length"
    );
    assert!(allowed.headers().get("set-cookie").is_none());
    for path in [
        "https://example.invalid/secret",
        "/minireel-proxy/media/../history",
    ] {
        assert_eq!(
            f.call(
                "POST",
                "/api/v1/play/release",
                &[("content-type", "application/json")],
                &json!({"path":path}).to_string()
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
    }
    let doc = serde_json::to_value(hongguo_http_api::openapi()).unwrap();
    assert!(doc["paths"]["/api/v1/play/info"]["get"].is_object());
    assert!(doc["paths"]["/api/v1/play/release"]["post"].is_object());
    assert!(doc["paths"]["/minireel-proxy/media/{token}"]["head"].is_object());
    assert!(doc["components"]["schemas"]["PlayInfo"]["properties"]["quality"].is_object());
}
#[tokio::test]
async fn dropping_an_inflight_body_cancels_upstream_and_releases_its_lease() {
    let f = Fixture::new(SourceMode::SlowRead).await;
    let path = f.resolve().await;
    let length = media_bytes().len();
    let response = f
        .call(
            "GET",
            &path,
            &[("range", &format!("bytes={}-", length - 1))],
            "",
        )
        .await;
    let reader = tokio::spawn(async move { to_bytes(response.into_body(), 512 * 1024).await });
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    f.service.release(path.rsplit('/').next().unwrap()).unwrap();
    reader.abort();
    let _ = reader.await;
    timeout(Duration::from_secs(2), f.stopped.notified())
        .await
        .unwrap();
    assert!(f.service.lease(path.rsplit('/').next().unwrap()).is_err());
}
#[tokio::test]
async fn actual_tcp_disconnect_stops_the_slow_upstream_read() {
    let f = Fixture::new(SourceMode::SlowRead).await;
    let path = f.resolve().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router_with_playback(
        DevPolicy::new(addr.port(), None),
        CatalogClient::new().unwrap(),
        None,
        Some(f.service.clone()),
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let mut client = TcpStream::connect(addr).await.unwrap();
    client.write_all(format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nRange: bytes={}-\r\nConnection: close\r\n\r\n",media_bytes().len()-1).as_bytes()).await.unwrap();
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    drop(client);
    timeout(Duration::from_secs(2), f.stopped.notified())
        .await
        .unwrap();
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn actual_tcp_disconnect_cancels_resolution_before_any_response_is_ready() {
    let f = Fixture::new(SourceMode::SlowPrepare).await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router_with_playback(
        DevPolicy::new(addr.port(), None),
        CatalogClient::new().unwrap(),
        None,
        Some(f.service.clone()),
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let mut client = TcpStream::connect(addr).await.unwrap();
    client.write_all(format!("GET /api/v1/play/info?series_id=11&vid=22 HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    drop(client);
    timeout(Duration::from_secs(2), f.stopped.notified())
        .await
        .unwrap();
    // A service close also wakes a live JSON handler and drops its owned upstream work.
    let app = f.app.clone();
    let request = tokio::spawn(async move {
        app.oneshot(
            Request::builder()
                .uri("/api/v1/play/info?series_id=11&vid=23")
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
    });
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    f.service.close();
    let response = timeout(Duration::from_secs(2), request)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(response.status(), StatusCode::GONE);
    timeout(Duration::from_secs(2), f.stopped.notified())
        .await
        .unwrap();
    server.abort();
    let _ = server.await;
}
