use super::*;
use crate::catalog::FeedParams;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Semaphore, mpsc},
};
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
                .unwrap_or(0);
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

#[tokio::test]
async fn anonymous_feed_phase_query_signatures_and_privacy_are_preserved() {
    let mut s = server(vec![
        response(
            200,
            include_str!("../../../../../contracts/fixtures/feed/tab.input.json"),
        ),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/feed/cell.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let first = client
        .public_feed(
            &FeedQuery::new(FeedParams {
                channel: Some("39".into()),
                ..Default::default()
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let next = client
        .public_feed(
            &FeedQuery::new(FeedParams {
                channel: Some("39".into()),
                offset: first.next_offset,
                feed_cell: Some(first.feed_cell),
                feed_plan: Some(first.feed_plan),
                session_id: Some(first.session_id),
                shown: Some("11,12".into()),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(next.items.len(), 2);
    assert_eq!(next.next_offset, 6);
    for phase in ["tab", "cell/change"] {
        let request = s.requests.recv().await.unwrap();
        let head = request.to_ascii_lowercase();
        let path = request
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap();
        let url = Url::parse(&format!("http://fixture{path}")).unwrap();
        assert_eq!(url.path(), format!("/reading/bookapi/bookmall/{phase}/v"));
        let q = url.query_pairs().collect::<BTreeMap<_, _>>();
        assert_eq!(q["tab_type"], "39");
        assert_eq!(q["offset"], "0");
        if phase == "cell/change" {
            assert_eq!(q["cell_id"], "7650476176527343678");
            assert_eq!(q["plan_id"], "7650476689721409598");
            assert_eq!(q["session_id"], "tab-session");
            assert_eq!(q["filter_ids"], "11,12");
        }
        for forbidden in ["uid", "user_id", "history", "cdid", "openudid"] {
            assert!(!q.contains_key(forbidden));
        }
        for forbidden in ["cookie:", "authorization:", "x-tt-token:"] {
            assert!(!head.contains(forbidden));
        }
        let h = head
            .lines()
            .filter_map(|l| l.split_once(": "))
            .collect::<BTreeMap<_, _>>();
        for name in ["x-medusa", "x-helios", "x-gorgon", "x-khronos"] {
            assert!(h.contains_key(name));
        }
        let g = h["x-gorgon"];
        let nonce = u16::from_le_bytes([
            u8::from_str_radix(&g[4..6], 16).unwrap(),
            u8::from_str_radix(&g[6..8], 16).unwrap(),
        ]);
        assert_eq!(
            g,
            protocol::registration_gorgon(
                url.query().unwrap(),
                b"",
                h["x-khronos"].parse().unwrap(),
                nonce
            )
        );
    }
    assert_eq!(s.count.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn feed_only_retries_confirmed_empty_responses_and_cancels_owned_reads() {
    let query = FeedQuery::new(FeedParams::default()).unwrap();
    let s = server(vec![response(200, ""); 3]).await;
    assert_eq!(
        PlaybackClient::for_loopback_tests(&s.origin)
            .unwrap()
            .public_feed(&query)
            .await,
        Err(CatalogError::InvalidData)
    );
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
    for (status, want) in [
        (403, CatalogError::VerificationRequired),
        (302, CatalogError::UpstreamStatus(302)),
        (500, CatalogError::UpstreamStatus(500)),
    ] {
        let s = server(vec![response(status, "secret")]).await;
        assert_eq!(
            PlaybackClient::for_loopback_tests(&s.origin)
                .unwrap()
                .public_feed(&query)
                .await,
            Err(want)
        );
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
    let mut s = server(vec![
        None,
        response(
            200,
            include_str!("../../../../../contracts/fixtures/feed/cell.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let owned = client.clone();
    let query2 = query.clone();
    let task = tokio::spawn(async move { owned.public_feed(&query2).await });
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
    assert!(client.public_feed(&query).await.is_ok());
    assert_eq!(s.count.load(Ordering::SeqCst), 2);
}
