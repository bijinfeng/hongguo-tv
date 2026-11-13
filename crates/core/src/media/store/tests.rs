use super::*;
use crate::playback::{PlaybackRequest, parse_model};
use std::sync::atomic::AtomicUsize;
use tokio::{net::TcpListener, task::JoinSet};

#[derive(Clone, Copy)]
enum Mode {
    Range,
    Full,
    Weak,
    Wrong,
    Changed,
    Truncated,
    Redirect,
    Oversized,
    SlowFull,
    SlowRange,
    Encoding,
}
struct Server {
    origin: String,
    requests: Arc<AtomicUsize>,
    started: Arc<tokio::sync::Notify>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn origin_server(bytes: Vec<u8>, mode: Mode) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}/", listener.local_addr().unwrap());
    let requests = Arc::new(AtomicUsize::new(0));
    let started = Arc::new(tokio::sync::Notify::new());
    let (count, signal) = (requests.clone(), started.clone());
    let bytes = Arc::new(bytes);
    let task = tokio::spawn(async move {
        let mut tasks = JoinSet::new();
        loop {
            tokio::select! {
                connection = listener.accept() => {
                    let (mut socket, _) = connection.unwrap();
                    let (bytes, count, signal) = (bytes.clone(), count.clone(), signal.clone());
                    tasks.spawn(async move {
                        let mut request=Vec::new();let mut b=[0];
                        while request.len()<16384 && !request.ends_with(b"\r\n\r\n") {
                            if socket.read(&mut b).await.unwrap_or(0)==0 { return; }request.push(b[0]);
                        }
                        let head=String::from_utf8_lossy(&request).to_ascii_lowercase();
                        let n=count.fetch_add(1,Ordering::SeqCst);
                        let range=head.lines().find_map(|l|l.strip_prefix("range: bytes="));
                        let (start,end)=range.and_then(|r|r.split_once('-')).map(|(s,e)|(s.parse::<usize>().unwrap(),e.parse::<usize>().unwrap().min(bytes.len()-1))).unwrap_or((0,bytes.len()-1));
                        let full=range.is_none() || matches!(mode,Mode::Full|Mode::SlowFull|Mode::Encoding|Mode::Oversized);
                        let status=if matches!(mode,Mode::Redirect){302}else if full {200}else{206};
                        let body=if full{bytes.as_slice()}else{&bytes[start..=end]};
                        let length=if matches!(mode,Mode::Oversized){MAX_FILE+1}else{body.len()as u64};
                        let etag=if matches!(mode,Mode::Weak){"W/\"v1\""}else if matches!(mode,Mode::Changed)&&n>0{"\"v2\""}else{"\"v1\""};
                        let extra=if matches!(mode,Mode::Encoding){"Content-Encoding: gzip\r\n"}else if matches!(mode,Mode::Redirect){"Location: https://example.invalid/secret\r\n"}else{""};
                        let offset=if matches!(mode,Mode::Wrong){start+1}else{start};
                        let range_header=if full{String::new()}else{format!("Content-Range: bytes {offset}-{end}/{}\r\n",bytes.len())};
                        let header=format!("HTTP/1.1 {status} Test\r\nConnection: close\r\nContent-Length: {length}\r\nETag: {etag}\r\n{extra}{range_header}\r\n");
                        if socket.write_all(header.as_bytes()).await.is_err(){return;}
                        if matches!(mode,Mode::SlowFull)&&range.is_none() || matches!(mode,Mode::SlowRange) {
                            let _=socket.write_all(&body[..body.len().min(16)]).await;
                            signal.notify_one();
                            let _=socket.read(&mut b).await;
                            return;
                        }
                        let body=if matches!(mode,Mode::Truncated){&body[..body.len()/2]}else{body};
                        let _=socket.write_all(body).await;
                    });
                }
                _ = tasks.join_next(), if !tasks.is_empty() => {}
            }
        }
    });
    Server {
        origin,
        requests,
        started,
        task,
    }
}
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("hongguo-media-{}", token().unwrap()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn request() -> PlaybackRequest {
    PlaybackRequest::new("11", "22", "1004", "", "default").unwrap()
}
fn model() -> crate::playback::PlaybackModel {
    parse_model(br#"{"data":{"video_model":{"vid":"22","video_list":[{"codec_type":"hevc","vheight":720,"main_url":"https://media.example.invalid/video?secret=signed"}]}}}"#,&request()).unwrap()
}
fn token_from(path: &str) -> &str {
    path.strip_prefix("/minireel-proxy/media/").unwrap()
}

#[tokio::test]
async fn range_and_full_paths_return_exact_bytes_at_every_boundary() {
    for mode in [Mode::Range, Mode::Full, Mode::Weak] {
        let bytes = mp4::tests::fixture(false, false);
        let server = origin_server(bytes.clone(), mode).await;
        let temp = Temp::new();
        let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
        let model = model();
        let prepared = store
            .prepare(model.select(&request()).unwrap())
            .await
            .unwrap();
        assert_eq!(prepared.length(), bytes.len() as u64);
        assert_eq!(prepared.codec(), "hevc");
        let path = store.publish(prepared).unwrap();
        let lease = store.lease(token_from(&path)).unwrap();
        for start in 0..bytes.len() {
            let end = (start + 29).min(bytes.len() - 1);
            assert_eq!(
                lease.chunk(start as u64, end as u64).await.unwrap(),
                bytes[start..=end]
            );
        }
        assert_eq!(lease.chunk(10, 9).await, Err(PlaybackError::InvalidInput));
        assert_eq!(
            lease.chunk(0, bytes.len() as u64).await,
            Err(PlaybackError::InvalidInput)
        );
        store.release(token_from(&path)).unwrap();
        store.release(token_from(&path)).unwrap();
        assert!(matches!(
            store.lease(token_from(&path)),
            Err(PlaybackError::Expired)
        ));
        assert_eq!(lease.chunk(0, 15).await.unwrap(), bytes[..16]); // Release does not destroy an active read.
        drop(lease);
        assert_eq!(store.inner.budget.load(Ordering::Acquire), 0);
    }
}

#[tokio::test]
async fn changed_representation_invalidates_handle_instead_of_mixing_versions() {
    let bytes = mp4::tests::fixture(false, false);
    let length = bytes.len() as u64;
    let server = origin_server(bytes, Mode::Changed).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let model = model();
    let ready = store
        .prepare(model.select(&request()).unwrap())
        .await
        .unwrap();
    let path = store.publish(ready).unwrap();
    let lease = store.lease(token_from(&path)).unwrap();
    assert_eq!(
        lease.chunk(length - 1, length - 1).await,
        Err(PlaybackError::MediaChanged)
    );
    assert_eq!(lease.chunk(0, 15).await, Err(PlaybackError::Expired));
    assert!(matches!(
        store.lease(token_from(&path)),
        Err(PlaybackError::Expired)
    ));
}

#[tokio::test]
async fn bad_origins_never_publish_or_leave_partial_files() {
    for mode in [Mode::Wrong, Mode::Truncated, Mode::Redirect, Mode::Encoding] {
        let server = origin_server(mp4::tests::fixture(false, false), mode).await;
        let temp = Temp::new();
        let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
        let model = model();
        assert!(
            store
                .prepare(model.select(&request()).unwrap())
                .await
                .is_err()
        );
        assert!(store.inner.entries.lock().unwrap().is_empty());
        assert_eq!(store.inner.budget.load(Ordering::Acquire), 0);
        assert_eq!(
            fs::read_dir(&store.inner.directory.path).unwrap().count(),
            1
        );
        assert_eq!(
            server.requests.load(Ordering::SeqCst),
            if matches!(mode, Mode::Encoding) { 2 } else { 1 }
        );
    }
}

#[tokio::test]
async fn full_size_limit_storage_and_cross_instance_boundaries() {
    let temp = Temp::new();
    let server = origin_server(mp4::tests::fixture(false, false), Mode::Oversized).await;
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let model = model();
    // A separately prepared full response is rejected before its oversized body is read.
    assert_eq!(
        store.prepare(model.select(&request()).unwrap()).await.err(),
        Some(PlaybackError::MediaTooLarge)
    );
    fs::write(temp.0.join("not-directory"), b"history").unwrap();
    assert!(matches!(
        MediaStore::new(&temp.0.join("not-directory")),
        Err(PlaybackError::Storage)
    ));
    let other = MediaStore::new(&temp.0).unwrap();
    assert!(store.inner.directory.path.exists());
    let server2 = origin_server(mp4::tests::fixture(false, false), Mode::Full).await;
    let third = MediaStore::for_loopback_tests(&temp.0, &server2.origin).unwrap();
    let prepared = third
        .prepare(model.select(&request()).unwrap())
        .await
        .unwrap();
    assert_eq!(
        store.publish(prepared).unwrap_err(),
        PlaybackError::InvalidInput
    );
    drop(other);
}

#[tokio::test]
async fn last_prepare_cancellation_reclaims_file_budget_and_permit() {
    let server = origin_server(mp4::tests::fixture(false, false), Mode::SlowFull).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let cloned = store.clone();
    let task = tokio::spawn(async move {
        let model = model();
        cloned.prepare(model.select(&request()).unwrap()).await
    });
    timeout(Duration::from_secs(2), server.started.notified())
        .await
        .unwrap();
    task.abort();
    let _ = task.await;
    assert_eq!(store.inner.preparing.available_permits(), 2);
    assert_eq!(store.inner.budget.load(Ordering::Acquire), 0);
    assert_eq!(
        fs::read_dir(&store.inner.directory.path).unwrap().count(),
        1
    );
}

#[tokio::test]
async fn preparation_capacity_is_two_and_close_discards_pending_results() {
    let server = origin_server(mp4::tests::fixture(false, false), Mode::SlowRange).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let mut tasks = Vec::new();
    for _ in 0..2 {
        let store = store.clone();
        tasks.push(tokio::spawn(async move {
            let model = model();
            store.prepare(model.select(&request()).unwrap()).await
        }));
        timeout(Duration::from_secs(2), server.started.notified())
            .await
            .unwrap();
    }
    let model = model();
    assert_eq!(
        store.prepare(model.select(&request()).unwrap()).await.err(),
        Some(PlaybackError::Capacity)
    );
    store.close();
    assert_eq!(
        store.prepare(model.select(&request()).unwrap()).await.err(),
        Some(PlaybackError::Expired)
    );
    for task in tasks {
        task.abort();
        let _ = task.await;
    }
    assert_eq!(store.inner.preparing.available_permits(), 2);
}

#[tokio::test]
async fn opaque_handles_expiration_eviction_and_active_leases() {
    let server = origin_server(mp4::tests::fixture(false, false), Mode::Full).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let model = model();
    let prepared = store
        .prepare(model.select(&request()).unwrap())
        .await
        .unwrap();
    let mut paths = Vec::new();
    let mut leases = Vec::new();
    for _ in 0..MAX_HANDLES {
        let path = store.publish(prepared.clone()).unwrap();
        leases.push(store.lease(token_from(&path)).unwrap());
        paths.push(path);
    }
    assert_eq!(
        store.publish(prepared.clone()).unwrap_err(),
        PlaybackError::Capacity
    );
    for token in [
        "../../history.sqlite",
        "https://example.invalid",
        "",
        &"0".repeat(64),
    ] {
        assert!(store.lease(token).is_err());
    }
    assert_eq!(server.requests.load(Ordering::SeqCst), 2);
    // All handles share this representation; no active resource may be evicted.
    drop(leases);
    let fresh = store.publish(prepared.clone()).unwrap();
    assert_eq!(store.inner.entries.lock().unwrap().len(), MAX_HANDLES);
    {
        let mut entries = store.inner.entries.lock().unwrap();
        for e in entries.values_mut() {
            e.accessed = Instant::now() - IDLE - Duration::from_secs(1);
        }
        prune(&mut entries);
        assert!(entries.is_empty());
    }
    assert!(store.lease(token_from(&fresh)).is_err());
    drop(prepared);
    assert_eq!(store.inner.budget.load(Ordering::Acquire), 0);
    let directory = store.inner.directory.path.clone();
    store.close();
    drop(store);
    tokio::task::yield_now().await;
    assert!(!directory.exists());
}

#[test]
fn registry_contention_fails_without_reclaiming_live_media_and_retries_after_release() {
    let temp = Temp::new();
    let live = MediaStore::new(&temp.0).unwrap();
    let registry = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(temp.0.join("media/.instances.lock"))
        .unwrap();
    try_lock(&registry).unwrap();
    assert!(matches!(
        MediaStore::new(&temp.0),
        Err(PlaybackError::Capacity)
    ));
    assert!(live.inner.directory.path.exists());
    drop(registry);
    let next = MediaStore::new(&temp.0).unwrap();
    assert!(live.inner.directory.path.exists());
    assert!(next.inner.directory.path.exists());
}

#[test]
fn stale_cleanup_never_deletes_live_or_unrelated_directories_and_budget_is_atomic() {
    let temp = Temp::new();
    let base = temp.0.join("media");
    fs::create_dir(&base).unwrap();
    let stale = base.join(format!("nsh-{}", "a".repeat(64)));
    fs::create_dir(&stale).unwrap();
    fs::write(stale.join("lease"), b"").unwrap();
    fs::write(stale.join("partial.mp4"), b"partial").unwrap();
    let unrelated = base.join("legacy");
    fs::create_dir(&unrelated).unwrap();
    fs::write(unrelated.join("history"), b"keep").unwrap();
    let first = MediaStore::new(&temp.0).unwrap();
    let second = MediaStore::new(&temp.0).unwrap();
    assert!(!stale.exists());
    assert!(first.inner.directory.path.exists());
    assert!(second.inner.directory.path.exists());
    assert!(unrelated.join("history").exists());
    let total = Arc::new(AtomicU64::new(0));
    let mut a = Budget {
        total: total.clone(),
        bytes: 0,
    };
    let mut b = Budget {
        total: total.clone(),
        bytes: 0,
    };
    a.grow(MAX_CACHE - 1).unwrap();
    b.grow(1).unwrap();
    assert_eq!(b.grow(1), Err(PlaybackError::Capacity));
    drop(a);
    b.grow(MAX_CACHE - 1).unwrap();
    drop(b);
    assert_eq!(total.load(Ordering::Acquire), 0);
}

#[tokio::test]
async fn whole_sample_cenc_is_patched_and_decrypted_on_both_paths() {
    let key = [
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f,
        0x3c,
    ];
    for mode in [Mode::Range, Mode::Full] {
        let mut bytes = mp4::tests::fixture(true, false);
        let end = mp4::prefix_end(&bytes, bytes.len() as u64)
            .unwrap()
            .unwrap();
        let len = bytes.len() as u64;
        let index = mp4::initialize(&mut bytes[..end], 0, len, Some(&key)).unwrap();
        mp4::transform(&mut bytes, 0, &index.samples, &key).unwrap();
        let server = origin_server(mp4::tests::fixture(true, false), mode).await;
        let temp = Temp::new();
        let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
        let model = model();
        let candidate = model.select(&request()).unwrap();
        let mut candidate = candidate.clone();
        candidate.key = Some(key);
        let prepared = store.prepare(&candidate).await.unwrap();
        let path = store.publish(prepared).unwrap();
        let lease = store.lease(token_from(&path)).unwrap();
        for start in [0, end - 3, end, end + 9, bytes.len() - 1] {
            let finish = (start + 35).min(bytes.len() - 1);
            assert_eq!(
                lease.chunk(start as u64, finish as u64).await.unwrap(),
                bytes[start..=finish]
            );
        }
    }
}

#[tokio::test]
async fn large_initialization_and_late_moov_use_bounded_separate_paths() {
    let original = mp4::tests::fixture(false, false);
    let moov_end = mp4::prefix_end(&original, original.len() as u64)
        .unwrap()
        .unwrap();
    let ftyp_end = u32::from_be_bytes(original[..4].try_into().unwrap()) as usize;
    let padding = mp4::tests::atom(b"free", &vec![0; PROBE as usize + 100]);
    let mut moov = original[ftyp_end..moov_end].to_vec();
    let size = moov.len() + padding.len();
    moov[..4].copy_from_slice(&(size as u32).to_be_bytes());
    moov.extend_from_slice(&padding);
    let at = moov.windows(4).position(|w| w == b"stco").unwrap() + 12;
    let offset = (ftyp_end + moov.len() + 8) as u32;
    moov[at..at + 4].copy_from_slice(&offset.to_be_bytes());
    let large = [
        &original[..ftyp_end],
        moov.as_slice(),
        &original[moov_end..],
    ]
    .concat();
    let mut late_moov = original[ftyp_end..moov_end].to_vec();
    let at = late_moov.windows(4).position(|w| w == b"stco").unwrap() + 12;
    late_moov[at..at + 4].copy_from_slice(&((ftyp_end + 8) as u32).to_be_bytes());
    let late = [
        &original[..ftyp_end],
        &original[moov_end..],
        late_moov.as_slice(),
    ]
    .concat();
    for bytes in [large, late] {
        let server = origin_server(bytes.clone(), Mode::Range).await;
        let temp = Temp::new();
        let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
        let model = model();
        let ready = store
            .prepare(model.select(&request()).unwrap())
            .await
            .unwrap();
        let path = store.publish(ready).unwrap();
        let lease = store.lease(token_from(&path)).unwrap();
        assert_eq!(lease.chunk(0, bytes.len() as u64 - 1).await.unwrap(), bytes);
        assert!(server.requests.load(Ordering::SeqCst) >= 2);
    }
}

#[tokio::test]
async fn janitor_expires_idle_handles_without_an_incoming_request() {
    let server = origin_server(mp4::tests::fixture(false, false), Mode::Full).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let model = model();
    let ready = store
        .prepare(model.select(&request()).unwrap())
        .await
        .unwrap();
    let path = store.publish(ready).unwrap();
    store
        .inner
        .entries
        .lock()
        .unwrap()
        .get_mut(token_from(&path))
        .unwrap()
        .accessed = Instant::now() - IDLE - Duration::from_secs(1);
    timeout(Duration::from_secs(2), async {
        loop {
            if store.inner.entries.lock().unwrap().is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(store.inner.budget.load(Ordering::Acquire), 0);
}

#[tokio::test]
async fn fixture_paths_cannot_replace_the_loopback_authority() {
    let server = origin_server(mp4::tests::fixture(false, false), Mode::Range).await;
    let temp = Temp::new();
    let store = MediaStore::for_loopback_tests(&temp.0, &server.origin).unwrap();
    let model = model();
    let mut candidate = model.select(&request()).unwrap().clone();
    candidate.url = Url::parse("https://media.example.invalid//example.invalid/video").unwrap();
    assert!(store.prepare(&candidate).await.is_ok());
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
    for origin in [
        "https://127.0.0.1/",
        "http://localhost/",
        "http://127.0.0.1/x",
        "http://127.0.0.1/?target=x",
    ] {
        assert!(MediaStore::for_loopback_tests(&temp.0, origin).is_err());
    }
}
