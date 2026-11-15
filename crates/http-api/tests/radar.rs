//! Radar transport remains read-only, private and independent of the official catalog.
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use hongguo_core::{catalog::CatalogClient, radar::RadarService};
use hongguo_http_api::{DevPolicy, router_with_radar};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::{
    net::TcpListener,
    sync::Semaphore,
    time::{Duration, timeout},
};
use tower::ServiceExt;

#[derive(Clone)]
struct Source {
    calls: Arc<AtomicUsize>,
    started: Arc<Semaphore>,
    gate: Arc<Semaphore>,
    stalled: bool,
}
async fn upstream(State(source): State<Source>, request: Request) -> Response {
    source.calls.fetch_add(1, Ordering::SeqCst);
    if source.stalled {
        source.started.add_permits(1);
        source.gate.acquire().await.unwrap().forget();
    }
    let value = if request.uri().path() == "/ranks_latest.json" {
        let bucket = json!({"rank_date":"2026-11-14","prev_rank_date":"2026-11-13",
            "items":[{"id":"1234567890123456789","title":"合成榜单","rank":1,"delta":0}]});
        json!({"hot":bucket,"real":bucket,"ai":bucket,"comic":bucket})
    } else {
        json!({"date":"2026-11-14","prev_date":"2026-11-13","gap":1,
            "items":[{"id":"1234567890123456789","title":"合成增长","type":"real",
                "hot":i64::MAX,"fav":0,"d_hot":i64::MIN}]})
    };
    axum::Json(value).into_response()
}
struct Fixture {
    dir: PathBuf,
    source: tokio::task::JoinHandle<()>,
    calls: Arc<AtomicUsize>,
    started: Arc<Semaphore>,
    gate: Arc<Semaphore>,
    app: Router,
}
impl Fixture {
    async fn new() -> Self {
        Self::with_stall(false).await
    }
    async fn with_stall(stalled: bool) -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "hongguo-radar-http-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let calls = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(Semaphore::new(0));
        let gate = Arc::new(Semaphore::new(0));
        let source_app = Router::new().fallback(upstream).with_state(Source {
            calls: calls.clone(),
            started: started.clone(),
            gate: gate.clone(),
            stalled,
        });
        let source = tokio::spawn(async move {
            axum::serve(listener, source_app).await.unwrap();
        });
        let radar = RadarService::for_loopback_tests(&dir, &origin, &origin).unwrap();
        let app = router_with_radar(
            DevPolicy::new(8080, None),
            CatalogClient::for_loopback_tests(&origin).unwrap(),
            None,
            None,
            Some(radar),
        );
        Self {
            dir,
            source,
            calls,
            started,
            gate,
            app,
        }
    }
    async fn request(&self, path: &str, method: &str, body: &str) -> (StatusCode, Value) {
        let response = self
            .app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method(method)
                    .uri(path)
                    .header("host", "127.0.0.1:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.headers()["cache-control"], "no-store");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 32768).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.source.abort();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[tokio::test]
async fn radar_rejects_inputs_before_any_network_and_preserves_integer_strings() {
    let fixture = Fixture::new().await;
    for (path, method, body, status, code) in [
        (
            "/api/v1/radar?url=http://private.invalid",
            "GET",
            "",
            400,
            "RADAR_INVALID_INPUT",
        ),
        (
            "/api/v1/radar?refresh=1",
            "GET",
            "",
            400,
            "RADAR_INVALID_INPUT",
        ),
        (
            "/api/v1/radar?x=1&x=2",
            "GET",
            "",
            400,
            "RADAR_INVALID_INPUT",
        ),
        ("/api/v1/radar", "GET", "{}", 400, "RADAR_INVALID_INPUT"),
        ("/api/v1/radar", "GET", " ", 400, "RADAR_INVALID_INPUT"),
        ("/api/v1/radar", "POST", "{}", 405, "METHOD_NOT_ALLOWED"),
        ("/api/v1/radar", "DELETE", "", 405, "METHOD_NOT_ALLOWED"),
        ("/api/v1/radar/", "GET", "", 404, "NOT_FOUND"),
    ] {
        let (got, value) = fixture.request(path, method, body).await;
        assert_eq!(got.as_u16(), status, "{path}");
        assert_eq!(value["code"], code, "{path}");
    }
    for (len, expected) in [(8192, 400), (8193, 413)] {
        let prefix = "/api/v1/radar?x=";
        let path = format!("{prefix}{}", "x".repeat(len - prefix.len()));
        assert_eq!(fixture.request(&path, "GET", "").await.0.as_u16(), expected);
    }
    assert_eq!(fixture.calls.load(Ordering::SeqCst), 0);
    let (status, value) = fixture.request("/api/v1/radar", "GET", "").await;
    assert_eq!(status, StatusCode::OK, "{value}");
    assert_eq!(
        value["data"]["growth"]["items"][0]["hot"],
        i64::MAX.to_string()
    );
    assert_eq!(
        value["data"]["growth"]["items"][0]["d_hot"],
        i64::MIN.to_string()
    );
    assert_eq!(value["data"]["growth"]["items"][0]["fav"], "0");
    assert!(value["data"]["growth"]["items"][0]["d_fav"].is_null());
    assert_eq!(value["data"]["ranks"]["hot"]["items"][0]["delta"], 0);
}

#[tokio::test]
async fn absent_radar_remains_explicit_and_private_origin_policy_is_unchanged() {
    let app = hongguo_http_api::router(DevPolicy::new(8080, None)).unwrap();
    for (host, origin, expected) in [
        ("127.0.0.1:8080", None, 501),
        ("private.invalid", None, 403),
        ("127.0.0.1:8080", Some("https://private.invalid"), 403),
    ] {
        let mut request = axum::http::Request::builder()
            .uri("/api/v1/radar")
            .header("host", host);
        if let Some(origin) = origin {
            request = request.header("origin", origin);
        }
        let response = app
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), expected);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let value: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 32768).await.unwrap()).unwrap();
        assert_eq!(
            value["code"],
            if expected == 501 {
                "CORE_NOT_IMPLEMENTED"
            } else {
                "FORBIDDEN_ORIGIN"
            }
        );
    }
}

#[tokio::test]
async fn dropped_http_radar_future_stops_pending_refresh_without_late_cache() {
    let fixture = Fixture::with_stall(true).await;
    let app = fixture.app.clone();
    let pending = tokio::spawn(async move {
        app.oneshot(
            axum::http::Request::builder()
                .uri("/api/v1/radar")
                .header("host", "127.0.0.1:8080")
                .body(Body::empty())
                .unwrap(),
        )
        .await
    });
    timeout(Duration::from_secs(5), fixture.started.acquire_many(2))
        .await
        .unwrap()
        .unwrap()
        .forget();
    let before = fixture.calls.load(Ordering::SeqCst);
    pending.abort();
    assert!(pending.await.unwrap_err().is_cancelled());
    fixture.gate.add_permits(8);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(fixture.calls.load(Ordering::SeqCst), before);
    assert!(!fixture.dir.join("radar-v1.json").exists());
}
