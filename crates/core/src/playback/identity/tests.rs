use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::mpsc,
};

struct Server {
    origin: String,
    requests: mpsc::UnboundedReceiver<Vec<u8>>,
    count: Arc<AtomicUsize>,
    release: Arc<tokio::sync::Semaphore>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(body: &str, paused: bool) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let body = body.to_string();
    let (tx, requests) = mpsc::unbounded_channel();
    let count = Arc::new(AtomicUsize::new(0));
    let captured = count.clone();
    let release = Arc::new(tokio::sync::Semaphore::new(usize::from(!paused) * 100));
    let gate = release.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut byte = [0];
            while !request.ends_with(b"\r\n\r\n") && request.len() < 8192 {
                if socket.read(&mut byte).await.unwrap_or(0) == 0 {
                    break;
                }
                request.push(byte[0]);
            }
            let header = String::from_utf8_lossy(&request);
            let length: usize = header
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|s| s.parse().ok())
                })
                .unwrap_or(0);
            let offset = request.len();
            request.resize(offset + length, 0);
            let _ = socket.read_exact(&mut request[offset..]).await;
            captured.fetch_add(1, Ordering::SeqCst);
            tx.send(request).unwrap();
            let _permit = gate.acquire().await.unwrap();
            let reply = format!(
                "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\nSet-Cookie: account_token=secret\r\nSet-Cookie: ttreq=synthetic\r\nSet-Cookie: odin_tt=secret\r\n\r\n{body}",
                body.len()
            );
            let _ = socket.write_all(reply.as_bytes()).await;
        }
    });
    Server {
        origin,
        requests,
        count,
        release,
        task,
    }
}
const RESPONSE: &str =
    r#"{"device_id_str":"90071992547409931234","install_id_str":"90071992547409939999"}"#;

#[test]
fn production_tls_and_fixture_origin_restrictions() {
    assert!(PlaybackClient::new().is_ok());
    for origin in [
        "https://127.0.0.1",
        "http://localhost:80",
        "http://127.0.0.1:0",
        "http://192.168.1.1",
        "http://u:p@127.0.0.1",
        "http://127.0.0.1/path",
        "http://127.0.0.1?x=1",
        "http://127.0.0.1#f",
    ] {
        assert!(
            PlaybackClient::for_loopback_tests(origin).is_err(),
            "{origin}"
        );
    }
    assert!(PlaybackClient::for_loopback_tests("http://[::1]:9876").is_ok());
}

#[tokio::test]
async fn concurrent_registration_is_shared_and_cookies_are_anonymous_only() {
    let mut server = server(RESPONSE, true).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    let c = client.clone();
    let first = tokio::spawn(async move { c.identity(Profile::Legacy, None).await });
    let request = timeout(Duration::from_secs(1), server.requests.recv())
        .await
        .unwrap()
        .unwrap();
    let c = client.clone();
    let second = tokio::spawn(async move { c.identity(Profile::Legacy, None).await });
    tokio::task::yield_now().await;
    first.abort();
    let _ = first.await;
    server.release.add_permits(10);
    let identity = timeout(Duration::from_secs(1), second)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(identity.device_id, "90071992547409931234");
    assert_eq!(
        identity.cookie,
        "install_id=90071992547409939999; ttreq=synthetic"
    );
    let cached = client.identity(Profile::Legacy, None).await.unwrap();
    assert_eq!(cached.revision, identity.revision);
    assert_eq!(server.count.load(Ordering::SeqCst), 1);
    let split = request.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
    let headers = String::from_utf8_lossy(&request[..split]).to_ascii_lowercase();
    assert!(headers.starts_with("post /service/2/device_register/?"));
    assert!(!headers.contains("cookie:"));
    assert!(!headers.contains("x-tt-token:"));
    assert!(!headers.contains("device_id="));
    assert!(!headers.contains("iid="));
    let payload = protocol::decrypt_device(&request[split..]).unwrap();
    let payload: Value = serde_json::from_slice(&payload).unwrap();
    assert_eq!(payload["header"]["version_code"], 73532);
    assert_eq!(payload["header"]["cdid"], identity.cdid);
    assert_eq!(payload["header"]["openudid"], identity.openudid);
    assert!(
        !String::from_utf8_lossy(&serde_json::to_vec(&payload).unwrap()).contains("account_token")
    );
}

#[tokio::test]
async fn failure_and_last_owner_cancellation_keep_registration_bounded() {
    let mut server = server("invalid sensitive body", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(matches!(
        client.identity(Profile::Legacy, None).await,
        Err(PlaybackError::InvalidModel)
    ));
    assert!(matches!(
        client.identity(Profile::Legacy, None).await,
        Err(PlaybackError::InvalidModel)
    ));
    assert_eq!(server.count.load(Ordering::SeqCst), 1);
    let _ = server.requests.recv().await;

    let mut stalled = super::tests::server(RESPONSE, true).await;
    let client = PlaybackClient::for_loopback_tests(&stalled.origin).unwrap();
    let c = client.clone();
    let pending = tokio::spawn(async move { c.identity(Profile::Legacy, None).await });
    stalled.requests.recv().await.unwrap();
    pending.abort();
    let _ = pending.await;
    assert!(client.caches[0].state.lock().unwrap().pending.is_none());
    assert_eq!(stalled.count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn old_revision_cannot_refresh_new_identity_and_ttl_does_not_grow_cache() {
    let server = server(RESPONSE, false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    let old = client.identity(Profile::Legacy, None).await.unwrap();
    {
        let mut state = client.caches[0].state.lock().unwrap();
        state.cooldown = None;
    }
    let new = client
        .identity(Profile::Legacy, Some(old.revision))
        .await
        .unwrap();
    assert!(new.revision > old.revision);
    let late = client
        .identity(Profile::Legacy, Some(old.revision))
        .await
        .unwrap();
    assert_eq!(late.revision, new.revision);
    assert!(
        client
            .identity(Profile::Legacy, Some(new.revision))
            .await
            .is_err()
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
    {
        let mut state = client.caches[0].state.lock().unwrap();
        state.ready.as_mut().unwrap().1 = Instant::now();
        state.cooldown = None;
    }
    let renewed = client.identity(Profile::Legacy, None).await.unwrap();
    assert!(renewed.revision > new.revision);
    let separate = client.identity(Profile::Single, None).await.unwrap();
    assert_ne!(separate.cdid, renewed.cdid);
    assert_eq!(client.caches.len(), 3);
    let isolated = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert_ne!(
        isolated.identity(Profile::Legacy, None).await.unwrap().cdid,
        renewed.cdid
    );
}
