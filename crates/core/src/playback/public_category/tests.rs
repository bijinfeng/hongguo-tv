use super::*;
use crate::catalog::CategoryParams;
use crate::playback::protocol;
use reqwest::Url;
use std::{
    collections::HashSet,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::time::timeout;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Semaphore, mpsc},
};

const PAGE: &str = include_str!("../../../../../contracts/fixtures/category/page.input.json");
struct Server {
    origin: String,
    requests: mpsc::UnboundedReceiver<String>,
    closed: Arc<Semaphore>,
    count: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(replies: Vec<Option<String>>) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (tx, requests) = mpsc::unbounded_channel();
    let closed = Arc::new(Semaphore::new(0));
    let ended = closed.clone();
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let task = tokio::spawn(async move {
        for reply in replies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut byte = [0];
            while !bytes.ends_with(b"\r\n\r\n") {
                assert!(bytes.len() < 16384);
                if socket.read(&mut byte).await.unwrap_or(0) == 0 {
                    return;
                }
                bytes.push(byte[0]);
            }
            let head = String::from_utf8(bytes).unwrap();
            let len = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .map(|n| n.parse::<usize>().unwrap())
                })
                .unwrap();
            let mut body = vec![0; len];
            socket.read_exact(&mut body).await.unwrap();
            calls.fetch_add(1, Ordering::SeqCst);
            tx.send(head + &String::from_utf8(body).unwrap()).unwrap();
            if let Some(reply) = reply {
                let _ = socket.write_all(reply.as_bytes()).await;
            } else {
                assert_eq!(socket.read(&mut byte).await.unwrap(), 0);
                ended.add_permits(1);
            }
        }
    });
    Server {
        origin,
        requests,
        closed,
        count,
        task,
    }
}
fn response(status: u16, body: &str) -> Option<String> {
    Some(format!(
        "HTTP/1.1 {status} Test\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    ))
}
fn query() -> CategoryQuery {
    CategoryQuery::new(CategoryParams {
        offset: 15,
        selectors: Some("1".into()),
        genre: Some("".into()),
        category_dim_theme: Some("cate_165".into()),
        session_id: Some("s1".into()),
        shown: Some("11,12".into()),
        ..Default::default()
    })
    .unwrap()
}
#[tokio::test]
async fn signed_body_context_privacy_and_fresh_empty_retry() {
    let mut s = server(vec![
        response(200, ""),
        response(200, ""),
        response(200, PAGE),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let result = client.public_category(&query()).await.unwrap();
    assert_eq!(result.items.len(), 2);
    let mut ids = HashSet::new();
    for _ in 0..3 {
        let req = s.requests.recv().await.unwrap();
        let (head, body) = req.split_once("\r\n\r\n").unwrap();
        let line = head.lines().next().unwrap();
        assert!(line.starts_with("POST /reading/distribution/category/landpage/v/?"));
        let url = Url::parse(&format!(
            "http://fixture{}",
            line.split_whitespace().nth(1).unwrap()
        ))
        .unwrap();
        let params = url
            .query_pairs()
            .collect::<std::collections::BTreeMap<_, _>>();
        ids.insert(params["device_id"].to_string());
        assert_eq!(params["aid"], "8662");
        for forbidden in ["uid", "user_id", "cdid", "openudid", "history"] {
            assert!(!params.contains_key(forbidden));
        }
        let h = head.to_ascii_lowercase();
        for forbidden in ["cookie:", "authorization:", "x-tt-token:"] {
            assert!(!h.contains(forbidden));
        }
        for header in ["x-medusa:", "x-helios:", "x-gorgon:", "x-khronos:"] {
            assert!(h.contains(header));
        }
        let headers: std::collections::BTreeMap<_, _> =
            h.lines().filter_map(|line| line.split_once(": ")).collect();
        let gorgon = headers["x-gorgon"];
        let nonce = u16::from_le_bytes([
            u8::from_str_radix(&gorgon[4..6], 16).unwrap(),
            u8::from_str_radix(&gorgon[6..8], 16).unwrap(),
        ]);
        let stamp = headers["x-khronos"].parse().unwrap();
        assert_eq!(
            gorgon,
            protocol::registration_gorgon(url.query().unwrap(), body.as_bytes(), stamp, nonce)
        );
        assert_ne!(
            gorgon,
            protocol::registration_gorgon(url.query().unwrap(), b"", stamp, nonce)
        );
        assert!(h.contains(&format!(
            "x-ss-stub: {}",
            protocol::hex(&protocol::md5(body.as_bytes()))
        )));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(body).unwrap(),
            *query().payload()
        );
    }
    assert_eq!(ids.len(), 3);
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
}
#[tokio::test]
async fn only_confirmed_empty_200_is_retryable() {
    for (status, body, want) in [
        (403, "secret", CatalogError::VerificationRequired),
        (302, "secret", CatalogError::UpstreamStatus(302)),
        (500, "secret", CatalogError::UpstreamStatus(500)),
        (200, "not json", CatalogError::InvalidData),
        (
            200,
            r#"{"code":0,"data":{"error_code":5}}"#,
            CatalogError::InvalidData,
        ),
    ] {
        let s = server(vec![response(status, body)]).await;
        assert_eq!(
            PlaybackClient::for_loopback_tests(&s.origin)
                .unwrap()
                .public_category(&query())
                .await,
            Err(want)
        );
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
    let s = server(vec![response(200, ""); 3]).await;
    assert_eq!(
        PlaybackClient::for_loopback_tests(&s.origin)
            .unwrap()
            .public_category(&query())
            .await,
        Err(CatalogError::InvalidData)
    );
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
    let s = server(vec![Some(
        "HTTP/1.1 200 OK\r\nContent-Length: 4194305\r\n\r\n".into(),
    )])
    .await;
    assert_eq!(
        PlaybackClient::for_loopback_tests(&s.origin)
            .unwrap()
            .public_category(&query())
            .await,
        Err(CatalogError::TooLarge)
    );
}
#[tokio::test]
async fn dropping_and_deadline_close_read_without_retry() {
    let mut s = server(vec![None, response(200, PAGE)]).await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let owned = client.clone();
    let task = tokio::spawn(async move { owned.public_category(&query()).await });
    timeout(Duration::from_secs(2), s.requests.recv())
        .await
        .unwrap()
        .unwrap();
    task.abort();
    let _ = task.await;
    timeout(Duration::from_secs(2), s.closed.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    assert_eq!(s.count.load(Ordering::SeqCst), 1);
    assert!(client.public_category(&query()).await.is_ok());
    assert_eq!(s.count.load(Ordering::SeqCst), 2);
    for (total, attempt) in [
        (Duration::from_millis(100), Duration::from_secs(1)),
        (Duration::from_secs(1), Duration::from_millis(100)),
    ] {
        let s = server(vec![None]).await;
        let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
        assert_eq!(
            client
                .category_with_deadline(&query(), total, attempt)
                .await,
            Err(CatalogError::Timeout)
        );
        timeout(Duration::from_secs(2), s.closed.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
}
