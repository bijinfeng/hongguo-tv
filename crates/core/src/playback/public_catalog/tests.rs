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

#[tokio::test]
async fn seasons_signed_reads_use_exact_scenes_and_verify_one_reciprocal_identity() {
    use crate::catalog::SeriesQuery;
    let mut s = server(vec![
        response(
            200,
            include_str!("../../../../../contracts/fixtures/seasons/selector.input.json"),
        ),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/seasons/relation.input.json"),
        ),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/seasons/reciprocal.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    assert_eq!(
        client
            .public_series_seasons(&SeriesQuery::new("7690163276214176792").unwrap())
            .await
            .unwrap()
            .items
            .len(),
        4
    );
    let next = client
        .public_next_season(&SeriesQuery::new("100").unwrap())
        .await
        .unwrap();
    assert_eq!(next.current_season, 1);
    assert_eq!(next.next.unwrap().drama.series_id, "200");
    for (book, scene) in [
        ("7690163276214176792", "single_col_same_ip_series"),
        ("100", "series_short_play_info"),
        ("200", "series_short_play_info"),
    ] {
        let request = s.requests.recv().await.unwrap();
        assert!(request.starts_with("GET /reading/bookapi/plan/v?"));
        let url = Url::parse(&format!(
            "http://fixture{}",
            request
                .lines()
                .next()
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap()
        ))
        .unwrap();
        let q = url.query_pairs().collect::<BTreeMap<_, _>>();
        assert_eq!(q["book_id"], book);
        assert_eq!(q["filter_ids"], book);
        assert_eq!(q["scene"], "10");
        assert_eq!(q["from"], scene);
        assert_eq!(q["limit"], "0");
        assert_eq!(q["offset"], "0");
        for forbidden in ["uid", "user_id", "history", "cdid", "openudid"] {
            assert!(!q.contains_key(forbidden));
        }
        let head = request.to_ascii_lowercase();
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
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
}
#[tokio::test]
async fn seasons_finite_empty_retry_sanitized_status_and_cancellation_at_both_reads() {
    use crate::catalog::SeriesQuery;
    let query = SeriesQuery::new("100").unwrap();
    let s = server(vec![response(200, ""); 3]).await;
    assert_eq!(
        PlaybackClient::for_loopback_tests(&s.origin)
            .unwrap()
            .public_series_seasons(&query)
            .await,
        Err(CatalogError::InvalidData)
    );
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
    for (status, body, want) in [
        (403, "secret", CatalogError::VerificationRequired),
        (302, "secret", CatalogError::UpstreamStatus(302)),
        (500, "secret", CatalogError::UpstreamStatus(500)),
        (200, "secret", CatalogError::InvalidData),
    ] {
        let s = server(vec![response(status, body)]).await;
        assert_eq!(
            PlaybackClient::for_loopback_tests(&s.origin)
                .unwrap()
                .public_series_seasons(&query)
                .await,
            Err(want)
        );
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
    for second in [false, true] {
        let mut replies = vec![];
        if second {
            replies.push(response(
                200,
                include_str!("../../../../../contracts/fixtures/seasons/relation.input.json"),
            ));
        }
        replies.push(None);
        let mut s = server(replies).await;
        let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
        let q = query.clone();
        let task = tokio::spawn(async move { client.public_next_season(&q).await });
        for _ in 0..if second { 2 } else { 1 } {
            timeout(Duration::from_secs(2), s.requests.recv())
                .await
                .unwrap()
                .unwrap();
        }
        task.abort();
        let _ = task.await;
        timeout(Duration::from_secs(2), s.closed.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        assert_eq!(s.count.load(Ordering::SeqCst), if second { 2 } else { 1 });
    }
}

#[tokio::test]
async fn calendar_signed_transport_keeps_fixed_destination_omission_and_privacy() {
    use crate::catalog::{CalendarParams, CalendarQuery, NewSeriesParams, NewSeriesQuery};
    let mut s = server(vec![
        response(
            200,
            include_str!("../../../../../contracts/fixtures/calendar/released.input.json"),
        ),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/calendar/transition.input.json"),
        ),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/calendar/new.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    client
        .public_calendar(&CalendarQuery::new(CalendarParams::default()).unwrap())
        .await
        .unwrap();
    client
        .public_calendar(
            &CalendarQuery::new(CalendarParams {
                offset: 45,
                subscribe_offset: Some(0),
                date: Some("20261114".into()),
                ..Default::default()
            })
            .unwrap(),
        )
        .await
        .unwrap();
    client
        .public_new_series(&NewSeriesQuery::new(NewSeriesParams::default()).unwrap())
        .await
        .unwrap();
    for index in 0..3 {
        let request = s.requests.recv().await.unwrap();
        let lower = request.to_ascii_lowercase();
        for secret in [
            "cookie:",
            "authorization:",
            "passport-sdk-sign:",
            "/service/",
        ] {
            assert!(!lower.contains(secret));
        }
        assert!(lower.contains("x-gorgon:"));
        assert!(lower.contains("x-khronos:"));
        let target = request
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap();
        let url = Url::parse(&format!("http://localhost{target}")).unwrap();
        let q: BTreeMap<_, _> = url.query_pairs().into_owned().collect();
        if index < 2 {
            assert_eq!(url.path(), "/reading/user/subscribe/list/v1/");
            assert_eq!(q["tab_type"], "5");
            assert_eq!(q["gender_type"], "2");
            if index == 0 {
                assert!(!q.contains_key("subscribe_offset"));
            } else {
                assert_eq!(q["subscribe_offset"], "0");
                assert_eq!(q["target_date"], "20261114");
            }
        } else {
            assert_eq!(url.path(), "/reading/bookapi/bookmall/cell/change/v1/");
            assert_eq!(q["selected_items"], "firstonlinetime_new");
            assert_eq!(q["cell_gender"], "2");
        }
    }
}
#[tokio::test]
async fn calendar_transport_retries_only_empty_and_drops_owned_reads() {
    use crate::catalog::{CalendarParams, CalendarQuery};
    let q = CalendarQuery::new(CalendarParams::default()).unwrap();
    let mut s = server(vec![
        response(200, ""),
        response(200, ""),
        response(
            200,
            include_str!("../../../../../contracts/fixtures/calendar/released.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    assert!(client.public_calendar(&q).await.is_ok());
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
    for _ in 0..3 {
        s.requests.recv().await.unwrap();
    }
    let mut s = server(vec![None]).await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let task = tokio::spawn(async move { client.public_calendar(&q).await });
    s.requests.recv().await.unwrap();
    task.abort();
    let _ = task.await;
    tokio::time::timeout(Duration::from_secs(1), s.closed.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    assert_eq!(s.count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn calendar_nonempty_failures_are_sanitized_without_retries() {
    use crate::catalog::{CalendarParams, CalendarQuery};
    for (status, body, expected) in [
        (403, "secret", CatalogError::VerificationRequired),
        (500, "secret", CatalogError::UpstreamStatus(500)),
        (200, "secret", CatalogError::InvalidData),
    ] {
        let s = server(vec![response(status, body)]).await;
        let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
        assert_eq!(
            client
                .public_calendar(&CalendarQuery::new(CalendarParams::default()).unwrap())
                .await,
            Err(expected)
        );
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
}

#[tokio::test]
async fn rankings_signed_transport_retains_exact_dynamic_context_without_credentials() {
    use crate::catalog::{RankParams, RankQuery};
    let mut s = server(vec![
        response(
            200,
            include_str!("../../../../../contracts/fixtures/rankings/page.input.json")
        );
        2
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    for offset in [0, 10] {
        let query = RankQuery::new(RankParams {
            offset,
            rank: Some("all&encoded=value".into()),
            rank_sub: Some("ranklist_hot_play_sc".into()),
            rank_panel: Some("any".into()),
            session_id: Some("session+context".into()),
            shown: Some("11,12".into()),
        })
        .unwrap();
        assert_eq!(
            client.public_rankings(&query).await.unwrap().next_offset,
            20
        );
        let request = s.requests.recv().await.unwrap();
        assert!(request.starts_with("GET /reading/bookapi/bookmall/cell/change/v?"));
        let url = Url::parse(&format!(
            "http://fixture{}",
            request
                .lines()
                .next()
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap()
        ))
        .unwrap();
        let q = url.query_pairs().collect::<BTreeMap<_, _>>();
        assert_eq!(q["tab_type"], if offset == 0 { "26" } else { "18" });
        assert_eq!(q["selected_items"], "all&encoded=value");
        assert_eq!(q["sub_selected_items"], "ranklist_hot_play_sc");
        assert_eq!(q["panel_selected_items"], "any");
        assert_eq!(q["session_id"], "session+context");
        assert_eq!(q["filter_ids"], "11,12");
        assert_eq!(q["offset"], offset.to_string());
        assert!(!q.contains_key("encoded"));
        for forbidden in ["uid", "user_id", "history", "cdid", "openudid"] {
            assert!(!q.contains_key(forbidden));
        }
        let head = request.to_ascii_lowercase();
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
async fn rankings_retries_only_empty_and_cancellation_stops_owned_reads() {
    use crate::catalog::{RankParams, RankQuery};
    let query = RankQuery::new(RankParams::default()).unwrap();
    let s = server(vec![response(200, ""); 3]).await;
    assert_eq!(
        PlaybackClient::for_loopback_tests(&s.origin)
            .unwrap()
            .public_rankings(&query)
            .await,
        Err(CatalogError::InvalidData)
    );
    assert_eq!(s.count.load(Ordering::SeqCst), 3);
    for (status, body, want) in [
        (403, "secret", CatalogError::VerificationRequired),
        (302, "secret", CatalogError::UpstreamStatus(302)),
        (500, "secret", CatalogError::UpstreamStatus(500)),
        (200, "{secret", CatalogError::InvalidData),
    ] {
        let s = server(vec![response(status, body)]).await;
        assert_eq!(
            PlaybackClient::for_loopback_tests(&s.origin)
                .unwrap()
                .public_rankings(&query)
                .await,
            Err(want)
        );
        assert_eq!(s.count.load(Ordering::SeqCst), 1);
    }
    let mut s = server(vec![
        None,
        response(
            200,
            include_str!("../../../../../contracts/fixtures/rankings/page.input.json"),
        ),
    ])
    .await;
    let client = PlaybackClient::for_loopback_tests(&s.origin).unwrap();
    let owned = client.clone();
    let q = query.clone();
    let task = tokio::spawn(async move { owned.public_rankings(&q).await });
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
    assert!(client.public_rankings(&query).await.is_ok());
    assert_eq!(s.count.load(Ordering::SeqCst), 2);
}
