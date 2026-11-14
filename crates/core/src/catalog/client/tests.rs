use super::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::mpsc,
};

const SEARCH: &str = include_str!("../../../../../contracts/fixtures/catalog/search.input.json");
const DETAIL: &str = include_str!("../../../../../contracts/fixtures/catalog/detail.input.html");
const SUGGESTIONS: &str =
    include_str!("../../../../../contracts/fixtures/catalog/suggestions.input.json");

struct Server {
    origin: String,
    requests: mpsc::UnboundedReceiver<String>,
    count: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(responses: Vec<String>) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (tx, requests) = mpsc::unbounded_channel();
    let count = Arc::new(AtomicUsize::new(0));
    let captured = count.clone();
    let task = tokio::spawn(async move {
        for response in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut byte = [0];
            while !request.ends_with(b"\r\n\r\n") && request.len() < 8192 {
                if socket.read(&mut byte).await.unwrap_or(0) == 0 {
                    break;
                }
                request.push(byte[0]);
            }
            captured.fetch_add(1, Ordering::SeqCst);
            tx.send(String::from_utf8(request).unwrap()).unwrap();
            let _ = socket.write_all(response.as_bytes()).await;
        }
    });
    Server {
        origin,
        requests,
        count,
        task,
    }
}
fn response(status: u16, body: &str, headers: &str) -> String {
    format!(
        "HTTP/1.1 {status} Test\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n{body}",
        body.len()
    )
}
fn query() -> SearchQuery {
    SearchQuery::new("字 &?=+", 0, None).unwrap()
}
fn client(server: &Server) -> CatalogClient {
    let mut client = CatalogClient::for_loopback_tests(&server.origin).unwrap();
    client.attempt_timeout = Duration::from_millis(150);
    client.total_timeout = Duration::from_millis(400);
    client.retry_delay = Duration::from_millis(5);
    client
}

#[test]
fn production_tls_initializes_and_fixture_origins_are_restricted() {
    assert!(CatalogClient::new().is_ok());
    for origin in [
        "https://evil.test",
        "http://localhost:8080",
        "http://192.168.1.1",
        "http://127.0.0.1:0",
        "http://u:p@127.0.0.1",
        "http://127.0.0.1/path",
        "http://127.0.0.1?x=1",
        "http://127.0.0.1#x",
    ] {
        assert!(
            matches!(
                CatalogClient::for_loopback_tests(origin),
                Err(CatalogError::Configuration)
            ),
            "{origin}"
        );
    }
    assert!(CatalogClient::for_loopback_tests("http://[::1]:1234").is_ok());
}

#[tokio::test]
async fn encodes_queries_and_preserves_anonymous_page_and_detail_contracts() {
    let page2 = SEARCH.replace("\"pageNum\": 1", "\"pageNum\": 2");
    let mut server = server(vec![
        response(200, SEARCH, "Set-Cookie: session=synthetic\r\n"),
        response(200, &page2, ""),
        response(200, DETAIL, ""),
    ])
    .await;
    let client = client(&server);
    assert_eq!(client.search(&query()).await.unwrap().items.len(), 1);
    let second = SearchQuery::new(query().term(), 1, Some("web")).unwrap();
    assert_eq!(client.search(&second).await.unwrap().next_offset, 2);
    assert_eq!(
        client
            .detail("7690163276214176792", None)
            .await
            .unwrap()
            .episodes
            .unwrap()
            .len(),
        5
    );
    let first = server.requests.recv().await.unwrap();
    assert!(
        first.starts_with("GET /api/search/result?query=%E5%AD%97+%26%3F%3D%2B HTTP/1.1"),
        "{first}"
    );
    let second = server.requests.recv().await.unwrap().to_ascii_lowercase();
    assert!(second.contains("&page=2 "));
    for request in [
        first.to_ascii_lowercase(),
        second,
        server.requests.recv().await.unwrap().to_ascii_lowercase(),
    ] {
        assert!(!request.contains("\r\ncookie:"));
        assert!(!request.contains("\r\nauthorization:"));
        assert!(request.contains("\r\nreferer: http://127.0.0.1:"));
    }
}

#[tokio::test]
async fn retries_only_transport_read_timeout_and_server_failures() {
    for first in [
        response(503, "temporary secret", ""),
        "HTTP/1.1 200 Test\r\nContent-Length: 100\r\n\r\ntruncated".into(),
        "".into(),
    ] {
        let mut server = server(vec![first, response(200, SEARCH, "")]).await;
        assert!(client(&server).search(&query()).await.is_ok());
        let one = server.requests.recv().await.unwrap();
        assert_eq!(one, server.requests.recv().await.unwrap());
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    }
    let server = server(vec![response(503, "", ""); 3]).await;
    assert_eq!(
        client(&server).search(&query()).await,
        Err(CatalogError::UpstreamStatus(503))
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn challenges_redirects_bad_data_and_oversize_never_retry() {
    let cases = [
        (
            response(
                403,
                r#"{"code":"search_verification_required","secret":"hidden"}"#,
                "",
            ),
            CatalogError::VerificationRequired,
        ),
        (
            response(403, "hidden", ""),
            CatalogError::UpstreamStatus(403),
        ),
        (
            response(302, "", "Location: http://127.0.0.1:1/leak\r\n"),
            CatalogError::UpstreamStatus(302),
        ),
        (response(200, "{", ""), CatalogError::InvalidData),
        (
            response(200, SEARCH, "Content-Type: text/html\r\n"),
            CatalogError::InvalidData,
        ),
        (
            format!(
                "HTTP/1.1 200 Test\r\nContent-Length: {}\r\n\r\n",
                SEARCH_LIMIT + 1
            ),
            CatalogError::TooLarge,
        ),
        (
            format!(
                "HTTP/1.1 200 Test\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
                SEARCH_LIMIT + 1,
                "x".repeat(SEARCH_LIMIT + 1)
            ),
            CatalogError::TooLarge,
        ),
    ];
    for (first, expected) in cases {
        let server = server(vec![first, response(200, SEARCH, "")]).await;
        let result = client(&server).search(&query()).await;
        assert_eq!(result, Err(expected));
        assert_eq!(server.count.load(Ordering::SeqCst), 1);
        assert!(!expected.to_string().contains("hidden"));
    }
    let server = server(vec![format!(
        "HTTP/1.1 200 Test\r\nContent-Length: {}\r\n\r\n",
        DETAIL_LIMIT + 1
    )])
    .await;
    assert_eq!(
        client(&server).detail("1", None).await,
        Err(CatalogError::TooLarge)
    );
}

#[tokio::test]
async fn deadlines_bound_attempts_and_total_operation() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    client.attempt_timeout = Duration::from_millis(20);
    client.total_timeout = Duration::from_millis(80);
    client.retry_delay = Duration::from_millis(5);
    let start = tokio::time::Instant::now();
    assert_eq!(client.search(&query()).await, Err(CatalogError::Timeout));
    assert!(start.elapsed() < Duration::from_millis(500));
    client.attempt_timeout = Duration::from_secs(1);
    client.total_timeout = Duration::from_millis(20);
    assert_eq!(client.search(&query()).await, Err(CatalogError::Timeout));
}

#[tokio::test]
async fn dropping_pending_response_closes_connection_and_prevents_retry() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut byte = [0];
        while !request.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut byte).await.unwrap();
            request.push(byte[0]);
        }
        socket
            .write_all(b"HTTP/1.1 200 Test\r\nContent-Length: 100000\r\n\r\n{")
            .await
            .unwrap();
        tx.send(()).unwrap();
        let closed = timeout(Duration::from_secs(1), socket.read(&mut byte))
            .await
            .unwrap();
        assert!(
            matches!(closed, Ok(0))
                || closed.is_err_and(|e| e.kind() == std::io::ErrorKind::ConnectionReset)
        );
        assert!(
            timeout(Duration::from_millis(300), listener.accept())
                .await
                .is_err()
        );
    });
    let query = query();
    let mut pending = Box::pin(client.search(&query));
    tokio::select! { _ = rx => {}, _ = &mut pending => panic!("response should remain pending") }
    drop(pending);
    server.await.unwrap();
}

#[tokio::test]
async fn suggestions_use_only_the_fixed_public_query_without_history_registration_or_cache() {
    let mut server = server(vec![
        response(200, SUGGESTIONS, "Set-Cookie: account=synthetic\r\n"),
        response(200, SUGGESTIONS, ""),
    ])
    .await;
    let client = client(&server);
    let empty = super::super::SuggestionQuery::new(" \n ").unwrap();
    assert!(client.suggestions(&empty).await.unwrap().items.is_empty());
    assert_eq!(server.count.load(Ordering::SeqCst), 0);
    let query = super::super::SuggestionQuery::new(" 字 &?=+ ").unwrap();
    for _ in 0..2 {
        assert_eq!(client.suggestions(&query).await.unwrap().items.len(), 6);
        let request = server.requests.recv().await.unwrap().to_ascii_lowercase();
        assert!(request.starts_with("get /incent_resource/suggestion?app_id=8662&query=%e5%ad%97+%26%3f%3d%2b&count=10 http/1.1"), "{request}");
        for forbidden in [
            "\r\ncookie:",
            "\r\nauthorization:",
            "history",
            "device_id",
            "install_id",
            "/service/",
        ] {
            assert!(!request.contains(forbidden), "{request}");
        }
        assert!(request.contains("\r\naccept: application/json\r\n"));
    }
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn suggestions_enforce_response_limit_error_categories_and_bounded_retries() {
    let query = super::super::SuggestionQuery::new("typed").unwrap();
    let limit = super::super::suggestions::BODY_LIMIT;
    for (first, expected) in [
        (
            response(
                403,
                r#"{"code":"search_verification_required","secret":"hidden"}"#,
                "",
            ),
            CatalogError::VerificationRequired,
        ),
        (
            response(302, "hidden", "Location: http://127.0.0.1:1/leak\r\n"),
            CatalogError::UpstreamStatus(302),
        ),
        (
            response(403, "hidden", ""),
            CatalogError::UpstreamStatus(403),
        ),
        (response(200, "{", ""), CatalogError::InvalidData),
        (
            response(200, r#"{"code":1,"suggest_list":[]}"#, ""),
            CatalogError::InvalidData,
        ),
        (
            response(200, SUGGESTIONS, "Content-Type: text/html\r\n"),
            CatalogError::InvalidData,
        ),
        (
            format!("HTTP/1.1 200 Test\r\nContent-Length: {}\r\n\r\n", limit + 1),
            CatalogError::TooLarge,
        ),
        (
            format!(
                "HTTP/1.1 200 Test\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
                limit + 1,
                "x".repeat(limit + 1)
            ),
            CatalogError::TooLarge,
        ),
    ] {
        let server = server(vec![first, response(200, SUGGESTIONS, "")]).await;
        assert_eq!(client(&server).suggestions(&query).await, Err(expected));
        assert_eq!(server.count.load(Ordering::SeqCst), 1);
        assert!(!expected.to_string().contains("hidden"));
    }
    for first in [
        response(503, "hidden", ""),
        "HTTP/1.1 200 Test\r\nContent-Length: 100\r\n\r\ntruncated".into(),
    ] {
        let mut server = server(vec![first, response(200, SUGGESTIONS, "")]).await;
        assert!(client(&server).suggestions(&query).await.is_ok());
        assert_eq!(
            server.requests.recv().await.unwrap(),
            server.requests.recv().await.unwrap()
        );
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    }
    let server = server(vec![response(500, "hidden", ""); 3]).await;
    assert_eq!(
        client(&server).suggestions(&query).await,
        Err(CatalogError::UpstreamStatus(500))
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn suggestion_deadlines_and_owner_drop_terminate_pending_work() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let query = super::super::SuggestionQuery::new("typed").unwrap();
    client.attempt_timeout = Duration::from_millis(10);
    client.total_timeout = Duration::from_millis(50);
    client.retry_delay = Duration::from_millis(1);
    assert_eq!(client.suggestions(&query).await, Err(CatalogError::Timeout));
    client.attempt_timeout = Duration::from_secs(1);
    client.total_timeout = Duration::from_millis(20);
    let start = tokio::time::Instant::now();
    assert_eq!(client.suggestions(&query).await, Err(CatalogError::Timeout));
    assert!(start.elapsed() < Duration::from_millis(500));
    drop(listener);

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut byte = [0];
        while !request.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut byte).await.unwrap();
            request.push(byte[0]);
        }
        socket
            .write_all(b"HTTP/1.1 200 Test\r\nContent-Length: 100000\r\n\r\n{")
            .await
            .unwrap();
        tx.send(()).unwrap();
        let closed = timeout(Duration::from_secs(1), socket.read(&mut byte))
            .await
            .unwrap();
        assert!(
            matches!(closed, Ok(0))
                || closed.is_err_and(|e| e.kind() == std::io::ErrorKind::ConnectionReset)
        );
        assert!(
            timeout(Duration::from_millis(300), listener.accept())
                .await
                .is_err()
        );
    });
    let mut pending = Box::pin(client.suggestions(&query));
    tokio::select! { _ = rx => {}, _ = &mut pending => panic!("suggestions must still be pending") }
    drop(pending);
    server.await.unwrap();
}

const ACTOR_WORKS: &str =
    include_str!("../../../../../contracts/fixtures/catalog/actor-works.input.html");
#[tokio::test]
async fn actor_works_enforce_response_limit_error_categories_and_bounded_retries() {
    let query = super::super::ActorQuery::new("99999999999999999999").unwrap();
    let limit = super::super::actor_works::BODY_LIMIT;
    for (first, expected) in [
        (
            response(
                403,
                r#"{"code":"search_verification_required","secret":"hidden"}"#,
                "",
            ),
            CatalogError::VerificationRequired,
        ),
        (
            response(302, "hidden", "Location: http://127.0.0.1:1/leak\r\n"),
            CatalogError::UpstreamStatus(302),
        ),
        (
            response(403, "hidden", ""),
            CatalogError::UpstreamStatus(403),
        ),
        (response(200, "{", ""), CatalogError::InvalidData),
        (
            response(200, r#"{"code":1,"suggest_list":[]}"#, ""),
            CatalogError::InvalidData,
        ),
        (
            format!("HTTP/1.1 200 Test\r\nContent-Length: {}\r\n\r\n", limit + 1),
            CatalogError::TooLarge,
        ),
        (
            format!(
                "HTTP/1.1 200 Test\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
                limit + 1,
                "x".repeat(limit + 1)
            ),
            CatalogError::TooLarge,
        ),
    ] {
        let server = server(vec![first, response(200, ACTOR_WORKS, "")]).await;
        assert_eq!(client(&server).actor_works(&query).await, Err(expected));
        assert_eq!(server.count.load(Ordering::SeqCst), 1);
        assert!(!expected.to_string().contains("hidden"));
    }
    for first in [
        response(503, "hidden", ""),
        "HTTP/1.1 200 Test\r\nContent-Length: 100\r\n\r\ntruncated".into(),
    ] {
        let mut server = server(vec![first, response(200, ACTOR_WORKS, "")]).await;
        assert!(client(&server).actor_works(&query).await.is_ok());
        assert_eq!(
            server.requests.recv().await.unwrap(),
            server.requests.recv().await.unwrap()
        );
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    }
    let server = server(vec![response(500, "hidden", ""); 3]).await;
    assert_eq!(
        client(&server).actor_works(&query).await,
        Err(CatalogError::UpstreamStatus(500))
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn actor_deadlines_and_owner_drop_terminate_pending_work() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let query = super::super::ActorQuery::new("99999999999999999999").unwrap();
    client.attempt_timeout = Duration::from_millis(10);
    client.total_timeout = Duration::from_millis(50);
    client.retry_delay = Duration::from_millis(1);
    assert_eq!(client.actor_works(&query).await, Err(CatalogError::Timeout));
    client.attempt_timeout = Duration::from_secs(1);
    client.total_timeout = Duration::from_millis(20);
    let start = tokio::time::Instant::now();
    assert_eq!(client.actor_works(&query).await, Err(CatalogError::Timeout));
    assert!(start.elapsed() < Duration::from_millis(500));
    drop(listener);

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client =
        CatalogClient::for_loopback_tests(&format!("http://{}", listener.local_addr().unwrap()))
            .unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut byte = [0];
        while !request.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut byte).await.unwrap();
            request.push(byte[0]);
        }
        socket
            .write_all(b"HTTP/1.1 200 Test\r\nContent-Length: 100000\r\n\r\n{")
            .await
            .unwrap();
        tx.send(()).unwrap();
        let closed = timeout(Duration::from_secs(1), socket.read(&mut byte))
            .await
            .unwrap();
        assert!(
            matches!(closed, Ok(0))
                || closed.is_err_and(|e| e.kind() == std::io::ErrorKind::ConnectionReset)
        );
        assert!(
            timeout(Duration::from_millis(300), listener.accept())
                .await
                .is_err()
        );
    });
    let mut pending = Box::pin(client.actor_works(&query));
    tokio::select! { _ = rx => {}, _ = &mut pending => panic!("actor works must still be pending") }
    drop(pending);
    server.await.unwrap();
}

#[tokio::test]
async fn actor_works_pin_exact_path_accept_html_and_never_send_credentials() {
    let mut server = server(vec![
        response(
            200,
            ACTOR_WORKS,
            "Set-Cookie: session=synthetic\r\n"
        );
        2
    ])
    .await;
    let client = client(&server);
    let query = super::super::ActorQuery::new(" 99999999999999999999 ").unwrap();
    for _ in 0..2 {
        let result = client.actor_works(&query).await.unwrap();
        assert_eq!(result.actor.id, query.id());
        let request = server.requests.recv().await.unwrap().to_ascii_lowercase();
        assert!(request.starts_with("get /character/99999999999999999999 http/1.1\r\n"));
        assert!(request.contains("\r\naccept: text/html\r\n"));
        assert!(request.contains("\r\nreferer: http://127.0.0.1:"));
        assert!(!request.contains("\r\ncookie:"));
        assert!(!request.contains("\r\nauthorization:"));
    }
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
}
