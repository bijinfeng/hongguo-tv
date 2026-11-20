use super::*;
use serde_json::{Value, json};
use std::{
    fs,
    sync::atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(std::path::PathBuf);
impl Directory {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "hongguo-radar-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn ranks() -> Value {
    let bucket = json!({"rank_date":"2026-11-14","prev_rank_date":"2026-11-13","items":[{"id":"101","title":"Fixture","rank":1}]});
    json!({"hot":bucket,"real":bucket,"ai":bucket,"comic":bucket})
}
fn growth() -> Value {
    json!({"date":"2026-11-14","prev_date":"2026-11-13","gap":1,"items":[{"id":"105","title":"Growth","type":"real","hot":9223372036854775807_i64,"d_hot":-9223372036854775808_i64,"fav":0}]})
}
fn parse_growth(v: &Value) -> Result<RadarGrowth, RadarError> {
    parse::growth(&serde_json::to_vec(v).unwrap())
}

#[test]
fn parser_preserves_i64_and_missing_values_without_social_fields() {
    let mut v = growth();
    v["items"][0]["score"] = json!(5);
    v["items"][0]["watch"] = json!(true);
    v["items"][0]["like"] = json!(42);
    let result = parse_growth(&v).unwrap();
    assert_eq!(result.items[0].hot.as_deref(), Some("9223372036854775807"));
    assert_eq!(
        result.items[0].d_hot.as_deref(),
        Some("-9223372036854775808")
    );
    assert_eq!(result.items[0].fav.as_deref(), Some("0"));
    assert_eq!(result.items[0].d_fav, None);
    let wire = serde_json::to_value(result).unwrap();
    for field in ["score", "watch", "like", "d_like"] {
        assert!(wire["items"][0].get(field).is_none());
    }
}
#[test]
fn parser_rejects_numeric_overflow_floats_and_invalid_dates() {
    for bad in [json!(9223372036854775808_u64), json!(1.5), json!("12")] {
        let mut v = growth();
        v["items"][0]["hot"] = bad;
        assert!(parse_growth(&v).is_err());
    }
    for date in ["2026-02-29", "0000-01-01", "2026-13-01", "2026-1-01"] {
        let mut v = growth();
        v["date"] = json!(date);
        assert!(parse_growth(&v).is_err());
    }
    let mut v = growth();
    v["prev_date"] = json!("2026-11-15");
    assert!(parse_growth(&v).is_err());
    let mut v = growth();
    v["items"][0]["gap"] = json!(2147483648_i64);
    assert!(parse_growth(&v).is_err());
    assert!(
        parse::growth(br#"{"date":"2026-11-14","items":[{"id":"1","title":"x","r_hot":1e999}]}"#)
            .is_err()
    );
}
#[test]
fn parser_cleans_bounds_deduplicates_and_never_invents_rank() {
    let mut v = ranks();
    v["hot"]["items"] = json!([
        {"id":"0","title":"Invalid"},{"id":"2","title":"  First  ","rank":0,"best_rank":-1,"streak":-1,"status_tags":[" A ","",1,"B","C","D","E","F","G","H","I"]},
        {"id":"2","title":"Duplicate","rank":4},{"id":"3","title":"x".repeat(401)}, {"id":"4","title":"Fourth"}
    ]);
    let parsed = parse::ranks(&serde_json::to_vec(&v).unwrap()).unwrap();
    assert_eq!(parsed.hot.items.len(), 2);
    assert_eq!(parsed.hot.items[0].title, "First");
    assert_eq!(parsed.hot.items[0].rank, None);
    assert_eq!(parsed.hot.items[0].best_rank, None);
    assert_eq!(parsed.hot.items[0].streak, None);
    assert_eq!(parsed.hot.items[0].status_tags.len(), 8);
    assert_eq!(parsed.hot.items[1].rank, None);
    v.as_object_mut().unwrap().remove("comic");
    assert!(parse::ranks(&serde_json::to_vec(&v).unwrap()).is_err());
}
#[test]
fn stable_growth_order_keeps_unknown_and_missing_last() {
    let v = json!({"date":"2024-02-29","items":[
        {"id":"1","title":"Missing","type":"unknown"}, {"id":"2","title":"Negative","type":"real","d_hot":-1},
        {"id":"3","title":"Zero","type":"ai","d_hot":0}, {"id":"4","title":"Tie","type":"comic","d_hot":0}, {"id":"2","title":"Duplicate","type":"real","d_hot":99}
    ]});
    let result = parse_growth(&v).unwrap();
    assert_eq!(
        result
            .items
            .iter()
            .map(|i| i.id.as_str())
            .collect::<Vec<_>>(),
        vec!["3", "4", "2", "1"]
    );
    assert_eq!(result.items[3].r#type, RadarKind::Unknown);
}
#[test]
fn parser_rejects_whitespace_identity_unknown_types_and_raw_row_overflow() {
    for id in [
        " 105 ",
        "105 ",
        "+105",
        "０１０５",
        "000",
        "1".repeat(33).as_str(),
    ] {
        let mut v = growth();
        v["items"][0]["id"] = json!(id);
        assert!(parse_growth(&v).is_err(), "{id}");
    }
    for kind in [json!("future"), Value::Null, json!(5)] {
        let mut v = growth();
        v["items"][0]["type"] = kind;
        assert!(parse_growth(&v).is_err());
    }
    let mut v = growth();
    v["items"][0].as_object_mut().unwrap().remove("type");
    assert!(parse_growth(&v).is_err());
    let mut v = growth();
    v["items"] = json!(vec![json!({}); 10_001]);
    assert!(parse_growth(&v).is_err());
    let mut v = ranks();
    v["hot"]["items"] = json!(vec![json!({}); 10_001]);
    assert!(parse::ranks(&serde_json::to_vec(&v).unwrap()).is_err());
    for gap in [0, -1] {
        let mut v = growth();
        v["gap"] = json!(gap);
        assert!(parse_growth(&v).is_err());
    }
}
#[test]
fn timestamps_cover_epoch_leap_rollover_and_reject_bad_forms() {
    assert_eq!(time::format(0).unwrap(), "1970-01-01T00:00:00Z");
    assert_eq!(time::format(951782399).unwrap(), "2000-02-28T23:59:59Z");
    assert_eq!(time::format(951782400).unwrap(), "2000-02-29T00:00:00Z");
    assert_eq!(time::format(951868800).unwrap(), "2000-03-01T00:00:00Z");
    for s in [
        "2026-01-01T24:00:00Z",
        "2026-01-01T00:60:00Z",
        "2026-01-01T00:00:00+00:00",
        "1900-02-29T00:00:00Z",
    ] {
        assert!(!time::valid_timestamp(s));
    }
}
#[test]
fn loopback_constructor_rejects_nonliteral_or_decorated_origins() {
    let dir = Directory::new();
    for origin in [
        "https://127.0.0.1",
        "http://localhost",
        "http://example.com",
        "http://127.0.0.1/path",
        "http://127.0.0.1?x=1",
        "http://u@127.0.0.1",
        "http://127.0.0.1:0",
    ] {
        assert!(
            RadarService::for_loopback_tests(&dir.0, origin, "http://127.0.0.1").is_err(),
            "{origin}"
        );
    }
    assert!(
        RadarService::for_loopback_tests(&dir.0, "http://[::1]:1234", "http://127.0.0.1").is_ok()
    );
}

struct Server {
    origin: String,
    requests: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(
    response: impl Fn(&str, usize) -> (u16, String, Duration) + Send + Sync + 'static,
) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let requests = Arc::new(AtomicUsize::new(0));
    let seen = requests.clone();
    let response = Arc::new(response);
    let task = tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let response = response.clone();
            let seen = seen.clone();
            tokio::spawn(async move {
                let mut bytes = vec![0; 8192];
                let n = stream.read(&mut bytes).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&bytes[..n]);
                let path = req.split_whitespace().nth(1).unwrap_or("");
                let count = seen.fetch_add(1, Ordering::SeqCst);
                let (status, body, delay) = response(path, count);
                tokio::time::sleep(delay).await;
                let header = format!(
                    "HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(header.as_bytes()).await;
                let _ = stream.write_all(body.as_bytes()).await;
            });
        }
    });
    Server {
        origin,
        requests,
        task,
    }
}
fn valid_body(path: &str) -> String {
    if path.contains("ranks") {
        ranks()
    } else {
        growth()
    }
    .to_string()
}
fn service(dir: &Directory, primary: &Server, raw: &Server) -> RadarService {
    RadarService::for_loopback_tests(&dir.0, &primary.origin, &raw.origin).unwrap()
}

#[tokio::test]
async fn fallback_on_parse_failure_persists_and_restart_is_stale() {
    let dir = Directory::new();
    let bad = server(|_, _| (200, "{}".into(), Duration::ZERO)).await;
    let raw = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    let svc = service(&dir, &bad, &raw);
    let fresh = svc.snapshot().await.unwrap();
    assert!(!fresh.ranks_stale && !fresh.growth_stale && !fresh.cache_write_failed);
    assert_eq!(bad.requests.load(Ordering::SeqCst), 2);
    assert_eq!(raw.requests.load(Ordering::SeqCst), 2);
    assert!(time::valid_timestamp(
        fresh.ranks_fetched_at.as_ref().unwrap()
    ));
    let offline = server(|_, _| (503, String::new(), Duration::ZERO)).await;
    let reopened = service(&dir, &offline, &offline).snapshot().await.unwrap();
    assert!(reopened.ranks_stale && reopened.growth_stale);
    assert_eq!(reopened.ranks, fresh.ranks);
    assert_eq!(reopened.growth_fetched_at, fresh.growth_fetched_at);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&dir.0).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(dir.0.join("radar-v1.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
#[tokio::test]
async fn partial_refresh_preserves_other_branch_and_its_timestamp() {
    let dir = Directory::new();
    let good = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    let initial = service(&dir, &good, &good).snapshot().await.unwrap();
    let half = server(|p, _| {
        if p.contains("ranks") {
            (206, valid_body(p), Duration::ZERO)
        } else {
            (200, valid_body(p), Duration::ZERO)
        }
    })
    .await;
    let next = service(&dir, &half, &half).snapshot().await.unwrap();
    assert!(next.ranks_stale && !next.growth_stale);
    assert_eq!(next.ranks_fetched_at, initial.ranks_fetched_at);
}
#[tokio::test]
async fn fresh_partial_works_but_both_missing_fail() {
    let dir = Directory::new();
    let half = server(|p, _| {
        if p.contains("ranks") {
            (502, String::new(), Duration::ZERO)
        } else {
            (200, valid_body(p), Duration::ZERO)
        }
    })
    .await;
    let result = service(&dir, &half, &half).snapshot().await.unwrap();
    assert!(result.ranks.is_none() && result.ranks_stale && !result.growth_stale);
    let empty = Directory::new();
    let bad = server(|_, _| (500, String::new(), Duration::ZERO)).await;
    assert_eq!(
        service(&empty, &bad, &bad).snapshot().await.unwrap_err(),
        RadarError::Unavailable
    );
}
#[tokio::test]
async fn body_limit_and_redirects_fall_back_without_following() {
    let dir = Directory::new();
    let big = server(|_, _| (200, " ".repeat(BODY_LIMIT + 1), Duration::ZERO)).await;
    let raw = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    assert!(service(&dir, &big, &raw).snapshot().await.is_ok());
    let redirect = server(|_, _| (302, "{}".into(), Duration::ZERO)).await;
    assert!(service(&dir, &redirect, &raw).snapshot().await.is_ok());
    assert_eq!(raw.requests.load(Ordering::SeqCst), 4);
}
#[tokio::test]
async fn deadline_preserves_completed_branch_and_counts_lock_wait() {
    let dir = Directory::new();
    let slow = server(|p, _| {
        (
            200,
            valid_body(p),
            if p.contains("growth") {
                Duration::from_secs(1)
            } else {
                Duration::ZERO
            },
        )
    })
    .await;
    let mut svc = service(&dir, &slow, &slow);
    svc.total_timeout = Duration::from_millis(80);
    let result = svc.snapshot().await.unwrap();
    assert!(!result.ranks_stale && result.growth_stale && result.growth.is_none());
    let guard = svc.state.lock().await;
    let start = Instant::now();
    assert_eq!(svc.snapshot().await.unwrap_err(), RadarError::Timeout);
    assert!(start.elapsed() < Duration::from_millis(500));
    drop(guard);
}
#[tokio::test]
async fn per_attempt_timeout_falls_back_to_raw() {
    let dir = Directory::new();
    let slow = server(|p, _| (200, valid_body(p), Duration::from_secs(1))).await;
    let raw = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    let mut svc = service(&dir, &slow, &raw);
    svc.attempt_timeout = Duration::from_millis(25);
    let response = svc.snapshot().await.unwrap();
    assert!(!response.ranks_stale && !response.growth_stale);
    assert_eq!(raw.requests.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn cancellation_before_commit_leaves_no_cache_and_releases_lock() {
    let dir = Directory::new();
    let slow = server(|p, _| (200, valid_body(p), Duration::from_secs(1))).await;
    let svc = service(&dir, &slow, &slow);
    let task = tokio::spawn({
        let svc = svc.clone();
        async move { svc.snapshot().await }
    });
    while slow.requests.load(Ordering::SeqCst) < 2 {
        tokio::task::yield_now().await;
    }
    task.abort();
    let _ = task.await;
    assert!(!dir.0.join("radar-v1.json").exists());
    assert!(svc.state.try_lock().is_ok());
}
#[test]
fn cancellation_after_commit_queue_keeps_lock_until_atomic_write_finishes() {
    // Saturate the blocking pool so cancellation happens deterministically after commit submission.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .max_blocking_threads(1)
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let blocker = tokio::task::spawn_blocking(move || {
            started_tx.send(()).unwrap();
            release_rx.recv().unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let dir = Directory::new();
        let good = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
        let svc = service(&dir, &good, &good);
        let clone = svc.clone();
        let task = tokio::spawn(async move { clone.snapshot().await });
        timeout(Duration::from_secs(1), async {
            // One path in each service clone, plus the path owned by the queued commit.
            while Arc::strong_count(&svc.path) < 3 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        task.abort();
        let _ = task.await;
        assert!(!dir.0.join("radar-v1.json").exists());
        assert!(svc.state.try_lock().is_err());
        release_tx.send(()).unwrap();
        blocker.await.unwrap();
        let state = timeout(Duration::from_secs(1), svc.state.lock())
            .await
            .unwrap();
        assert!(state.ranks.is_some() && state.growth.is_some());
        assert!(dir.0.join("radar-v1.json").is_file());
    });
}
#[tokio::test]
async fn concurrent_clones_serialize_refresh_and_last_commit_wins() {
    let dir = Directory::new();
    let endpoint = server(|p, n| {
        let mut v = if p.contains("ranks") {
            ranks()
        } else {
            growth()
        };
        if p.contains("growth") {
            v["items"][0]["title"] = json!(format!("batch{}", n / 2));
        }
        (200, v.to_string(), Duration::from_millis(10))
    })
    .await;
    let svc = service(&dir, &endpoint, &endpoint);
    let clone = svc.clone();
    let (a, b) = tokio::join!(svc.snapshot(), clone.snapshot());
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.growth, b.growth);
    let (_, disk) = cache::open(&dir.0).unwrap();
    assert_eq!(disk.growth, b.growth);
    assert_eq!(endpoint.requests.load(Ordering::SeqCst), 4);
}
#[tokio::test]
async fn write_failure_returns_fresh_data_without_claiming_persistence() {
    let dir = Directory::new();
    let good = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    let svc = service(&dir, &good, &good);
    fs::create_dir(dir.0.join("radar-v1.json")).unwrap();
    let response = svc.snapshot().await.unwrap();
    assert!(response.cache_write_failed && response.growth.is_some());
    assert!(svc.state.lock().await.growth.is_none());
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
}
#[test]
fn malformed_unsupported_and_oversized_cache_are_preserved_and_legacy_ignored() {
    let dir = Directory::new();
    fs::create_dir_all(&dir.0).unwrap();
    fs::write(dir.0.join("radar-cache.json"), "legacy secret").unwrap();
    assert!(RadarService::open(&dir.0).is_ok());
    for bad in ["broken".to_owned(),json!({"version":2,"ranks":null,"growth":null,"ranks_fetched_at":null,"growth_fetched_at":null}).to_string()," ".repeat((20<<20)+1)] {
        let path = dir.0.join("radar-v1.json"); fs::write(&path,&bad).unwrap();
        assert!(matches!(RadarService::open(&dir.0),Err(RadarError::InvalidCache)));
        assert_eq!(fs::read_to_string(path).unwrap(),bad);
    }
}
#[tokio::test]
async fn cache_revalidates_identity_dates_metric_encoding_and_unknown_fields() {
    let dir = Directory::new();
    let endpoint = server(|p, _| (200, valid_body(p), Duration::ZERO)).await;
    service(&dir, &endpoint, &endpoint)
        .snapshot()
        .await
        .unwrap();
    let path = dir.0.join("radar-v1.json");
    let original: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let mutations = [
        ("/growth/items/0/hot", json!("01")),
        ("/growth/items/0/hot", json!(1)),
        ("/growth/items/0/id", json!(" 105 ")),
        ("/growth/date", json!("2026-02-29")),
        ("/growth_fetched_at", json!("2026-11-14T25:00:00Z")),
        ("/version", json!(2)),
    ];
    for (pointer, bad) in mutations {
        let mut value = original.clone();
        *value.pointer_mut(pointer).unwrap() = bad;
        let body = value.to_string();
        fs::write(&path, &body).unwrap();
        assert!(
            matches!(RadarService::open(&dir.0), Err(RadarError::InvalidCache)),
            "{pointer}"
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), body);
    }
    let mut value = original;
    value["growth"]["items"][0]["score"] = json!(10);
    fs::write(&path, value.to_string()).unwrap();
    assert!(matches!(
        RadarService::open(&dir.0),
        Err(RadarError::InvalidCache)
    ));
}

/// Explicit network opt-in; aggregate output never includes titles, IDs or source payloads.
#[tokio::test]
#[ignore = "contacts the fixed production radar sources; run explicitly with --ignored --nocapture"]
async fn live_probe_fixed_production_sources() {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut nonce = [0_u8; 16];
    SystemRandom::new().fill(&mut nonce).unwrap();
    let suffix: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
    let path = std::env::temp_dir().join(format!("hongguo-radar-live-{suffix}"));
    // `mode` is the only mutation; on other platforms `mut` is an unused-mut error under
    // `-D warnings`, so the binding is spelled per-platform instead.
    #[cfg(unix)]
    let mut builder = fs::DirBuilder::new();
    #[cfg(not(unix))]
    let builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&path).unwrap();
    // Own the directory only after exclusive creation, so cleanup cannot remove another run's data.
    let dir = Directory(path);
    let service = RadarService::open(&dir.0).unwrap();
    let result = service.snapshot().await;
    drop(service);
    let cache_exists = dir.0.join("radar-v1.json").is_file();
    let cache_reopens = cache_exists && RadarService::open(&dir.0).is_ok();
    match result {
        Ok(snapshot) => {
            eprintln!(
                "radar_live ranks_stale={} growth_stale={} cache_write_failed={} cache_file_exists={} cache_reopens={}",
                snapshot.ranks_stale,
                snapshot.growth_stale,
                snapshot.cache_write_failed,
                cache_exists,
                cache_reopens,
            );
            if let Some(ranks) = &snapshot.ranks {
                for (name, bucket) in [
                    ("hot", &ranks.hot),
                    ("real", &ranks.real),
                    ("ai", &ranks.ai),
                    ("comic", &ranks.comic),
                ] {
                    eprintln!(
                        "radar_live bucket={name} count={} rank_date={} prev_rank_date={}",
                        bucket.items.len(),
                        bucket.rank_date,
                        bucket.prev_rank_date.as_deref().unwrap_or("absent")
                    );
                }
            } else {
                eprintln!("radar_live ranks=absent");
            }
            if let Some(growth) = &snapshot.growth {
                eprintln!(
                    "radar_live growth_count={} date={} prev_date={}",
                    growth.items.len(),
                    growth.date,
                    growth.prev_date.as_deref().unwrap_or("absent")
                );
            } else {
                eprintln!("radar_live growth=absent");
            }
            let cleanup_path = dir.0.clone();
            drop(dir);
            assert!(
                !cleanup_path.exists(),
                "live probe must remove only its own data directory"
            );
            assert!(
                snapshot.ranks.is_some() && snapshot.growth.is_some(),
                "both production branches must succeed"
            );
            assert!(
                !snapshot.ranks_stale && !snapshot.growth_stale,
                "the fresh isolated probe must not use stale branches"
            );
            assert!(
                !snapshot.cache_write_failed && cache_exists && cache_reopens,
                "production snapshot must save and reopen its own cache"
            );
        }
        Err(error) => {
            eprintln!(
                "radar_live error_code={} status={} cache_file_exists={cache_exists}",
                error.code(),
                error.status()
            );
            let cleanup_path = dir.0.clone();
            drop(dir);
            assert!(
                !cleanup_path.exists(),
                "live probe must remove only its own data directory"
            );
            panic!("fixed production radar live probe failed: {error}");
        }
    }
}
