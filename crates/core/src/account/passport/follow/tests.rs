//! Synthetic wire and real disposable loopback transport; never live-account acceptance.
use super::*;
use crate::catalog::SeriesStatus;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Semaphore,
    task::JoinHandle,
};

pub(crate) const UID: &str = "7390000000000000003";
pub(crate) const SERIES: &str = "7690163276214176792";
pub(crate) const LIST: &str = "/reading/user/subscribe/list/v1/";
pub(crate) const SET: &str = "/reading/user/subscribe/delete/v";

#[derive(Clone)]
pub(crate) struct Request {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) query: BTreeMap<String, String>,
    pub(crate) body: Value,
    pub(crate) token: Option<String>,
    pub(crate) headers: BTreeMap<String, String>,
    pub(crate) wire_body: Vec<u8>,
}
pub(crate) struct Response {
    pub(crate) body: Value,
    pub(crate) gate: Option<Arc<Semaphore>>,
    pub(crate) token: Option<&'static str>,
    pub(crate) close: bool,
}
impl Response {
    pub(crate) fn json(body: Value) -> Self {
        Self {
            body,
            gate: None,
            token: None,
            close: false,
        }
    }
}
pub(crate) struct Fixture {
    pub(crate) origin: String,
    pub(crate) requests: Arc<Mutex<Vec<Request>>>,
    started: Arc<Semaphore>,
    task: JoinHandle<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Fixture {
    pub(crate) async fn new(
        handler: impl Fn(&Request) -> Response + Send + Sync + 'static,
    ) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = requests.clone();
        let started = Arc::new(Semaphore::new(0));
        let accepted = started.clone();
        let handler = Arc::new(handler);
        let task = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                let handler = handler.clone();
                let recorded = recorded.clone();
                let accepted = accepted.clone();
                tokio::spawn(async move {
                    let mut bytes = Vec::new();
                    let mut buffer = [0; 4096];
                    let end = loop {
                        let Ok(n) = stream.read(&mut buffer).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                        assert!(bytes.len() < 512 * 1024);
                        if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                            break end + 4;
                        }
                    };
                    let head = String::from_utf8(bytes[..end].to_vec()).unwrap();
                    let mut parts = head.lines().next().unwrap().split_ascii_whitespace();
                    let method = parts.next().unwrap().to_owned();
                    let url = reqwest::Url::parse(&format!(
                        "http://fixture.invalid{}",
                        parts.next().unwrap()
                    ))
                    .unwrap();
                    let length = head
                        .lines()
                        .filter_map(|v| v.split_once(':'))
                        .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
                        .map_or(0, |(_, v)| v.trim().parse::<usize>().unwrap());
                    assert!(length < 512 * 1024);
                    while bytes.len() < end + length {
                        let Ok(n) = stream.read(&mut buffer).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                    }
                    let headers = head
                        .lines()
                        .filter_map(|line| line.split_once(':'))
                        .map(|(name, value)| (name.to_ascii_lowercase(), value.trim().to_owned()))
                        .collect::<BTreeMap<_, _>>();
                    let wire_body = bytes[end..end + length].to_vec();
                    let decoded = if headers.get("content-encoding").is_some_and(|v| v == "gzip") {
                        use std::io::Read;
                        let mut decoded = Vec::new();
                        flate2::read::GzDecoder::new(wire_body.as_slice())
                            .take(512 * 1024 + 1)
                            .read_to_end(&mut decoded)
                            .unwrap();
                        assert!(decoded.len() <= 512 * 1024);
                        decoded
                    } else {
                        wire_body.clone()
                    };
                    let request = Request {
                        method,
                        path: url.path().into(),
                        query: url
                            .query_pairs()
                            .map(|(k, v)| (k.into_owned(), v.into_owned()))
                            .collect(),
                        body: serde_json::from_slice(&decoded).unwrap_or(Value::Null),
                        headers,
                        wire_body,
                        token: head
                            .lines()
                            .filter_map(|line| line.split_once(':'))
                            .find(|(name, _)| name.eq_ignore_ascii_case("x-tt-token"))
                            .map(|(_, value)| value.trim().to_owned()),
                    };
                    let response = handler(&request);
                    recorded.lock().unwrap().push(request);
                    accepted.add_permits(1);
                    if let Some(gate) = response.gate {
                        let Ok(permit) = gate.acquire().await else {
                            return;
                        };
                        permit.forget();
                    }
                    if response.close {
                        return;
                    }
                    let body = response.body.to_string();
                    let token = response
                        .token
                        .map(|v| format!("x-tt-token: {v}\r\n"))
                        .unwrap_or_default();
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n{token}\r\n",
                        body.len()
                    );
                    if stream.write_all(header.as_bytes()).await.is_ok() {
                        let _ = stream.write_all(body.as_bytes()).await;
                    }
                });
            }
        });
        Self {
            origin,
            requests,
            started,
            task,
        }
    }
    pub(crate) async fn next_request(&self) {
        tokio::time::timeout(std::time::Duration::from_secs(3), self.started.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
    }
    fn client(&self) -> PassportClient {
        PassportClient::for_loopback_tests(
            crate::account::passport::verified_fixture(UID).credential,
            &self.origin,
        )
        .unwrap()
    }
}
pub(crate) fn membership(present: bool) -> Value {
    json!({"code":0,"data":{"mix_data":if present {vec![json!({"series_id":SERIES,"title":"合成追更剧","series_status":0,"episode_cnt":12})]}else{vec![]},"has_more":false}})
}

#[test]
fn mac_shape_merges_actual_metadata_and_never_retains_vids() {
    let row=item(&json!({"video_data":{"video_id":SERIES,"common":{"title":"追更剧","video_content_type":1,"vid_list":["123"],"vid":"123"},"expand":{"episode_cnt":12,"latest_watched_vid_index":4,"extra":{"series_status":0},"update_info":{"show_update_frequency":"每日更新","has_watched_latest_episode":true,"follow_update_time_stamp":123}}}})).unwrap();
    assert_eq!(row.series_id, SERIES);
    assert_eq!(row.series_status, Some(SeriesStatus::Ongoing));
    assert_eq!(row.latest_watched_episode, Some(4));
    assert_eq!(row.has_watched_latest_episode, Some(true));
    assert_eq!(row.follow_update_time, Some(123));
    let drama = row.drama.as_ref().unwrap();
    assert_eq!(drama.episode_count, Some(12));
    assert!(drama.episodes.is_none());
    let value = serde_json::to_value(row).unwrap();
    assert!(value.to_string().find("vid_list").is_none());
    assert!(value["drama"].get("video_id").is_none());
}
#[test]
fn unavailable_cards_keep_members_but_conflicting_identity_fails() {
    for row in [
        json!({"series_id":SERIES}),
        json!({"series_id":SERIES,"title":"不支持","content_type":1003}),
    ] {
        assert!(item(&row).unwrap().drama.is_none());
    }
    for row in [
        json!({"series_id":"0"}),
        json!({"series_id":SERIES,"book_id":"123"}),
        json!({"video_id":SERIES,"common":{"series_id":"123"}}),
        json!({"video_id":SERIES,"video_id_str":"123","common":{}}),
        json!({"common":{"series_id":SERIES},"expand":{"series_id":"123"}}),
        json!({"common":{"series_id":SERIES},"expand":{"extra":{"series_id":"123"}}}),
        json!({"common":{"series_id":SERIES},"expand":{"update_info":{"series_id":"123"}}}),
        json!({"video_id":"123","common":{"series_id":SERIES},"expand":{"series_id":null}}),
        json!({"common":{"series_id":SERIES},"expand":{"series_id":null,"extra":{"series_id":"123"}}}),
        json!({"series_id":1.5}),
        json!({"video_data":null}),
    ] {
        assert_eq!(item(&row), Err(CloudError::IncompleteFollow));
    }
    let row=item(&json!({"series_id":SERIES,"title":"剧","series_episode_info":{"series_status":"1"},"latest_watched_index":0})).unwrap();
    assert_eq!(row.series_status, Some(SeriesStatus::Ended));
    assert_eq!(row.latest_watched_episode, Some(0));
}
#[test]
fn page_shapes_and_optional_fields_are_validated() {
    for key in ["mix_data", "follow_update_list", "subscribe_items"] {
        let p = json!({"data":{(key):[{"series_id":SERIES}],"follow_list_info":{"cursor":"next","has_more":true}}});
        let (rows, more, cursor) = page(&p).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(more);
        assert_eq!(cursor, "next");
    }
    for payload in [
        json!({"data":{}}),
        json!({"data":{"mix_data":[],"has_more":"bad"}}),
        json!({"data":{"mix_data":{},"has_more":false}}),
        json!({"data":{"mix_data":[],"has_more":false,"follow_list_info":1}}),
        json!({"data":{"mix_data":vec![json!({"series_id":SERIES});MAX_ROWS+1],"has_more":false}}),
    ] {
        assert!(page(&payload).is_err());
    }
    for row in [
        json!({"series_id":SERIES,"latest_watched_index":10001}),
        json!({"series_id":SERIES,"has_watched_latest_episode":"bad"}),
        json!({"series_id":SERIES,"show_update_frequency":"bad\nlabel"}),
    ] {
        assert!(item(&row).is_err());
    }
}

#[tokio::test]
async fn full_pull_preserves_cursor_wire_order_and_deduplicates() {
    let fixture=Fixture::new(|r|{assert_eq!(r.method,"GET");assert_eq!(r.path,LIST);assert_eq!(r.query.get("count").unwrap(),"20");assert_eq!(r.query.get("tab_type").unwrap(),"14");
        Response::json(if r.query.get("cursor").unwrap().is_empty(){json!({"code":0,"data":{"mix_data":[{"series_id":SERIES}],"has_more":true,"cursor":"next"}})}else{assert_eq!(r.query.get("cursor").unwrap(),"next");json!({"code":0,"data":{"subscribe_items":[{"series_id":SERIES},{"series_id":"123"}],"has_more":false}})})
    }).await;
    let rows = fixture.client().pull_follow(|| true).await.unwrap();
    assert_eq!(
        rows.iter()
            .map(|v| v.series_id.as_str())
            .collect::<Vec<_>>(),
        [SERIES, "123"]
    );
    assert_eq!(fixture.requests.lock().unwrap().len(), 2);
}
#[tokio::test]
async fn continuation_failures_never_return_partial_membership() {
    for mode in 0..5 {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let fixture=Fixture::new(move |_| {let call=seen.fetch_add(1,Ordering::SeqCst);Response::json(if mode==0 {json!({"code":0,"data":{"mix_data":[{"series_id":SERIES}],"has_more":true}})} else if call==0 {json!({"code":0,"data":{"mix_data":[{"series_id":SERIES}],"has_more":true,"cursor":"a"}})}else{match mode {
            1=>json!({"code":0,"data":{"mix_data":[{"series_id":"123"}],"has_more":true,"cursor":"a"}}),
            2=>json!({"code":0,"data":{"mix_data":[],"has_more":true,"cursor":"b"}}),
            3=>json!({"code":0,"data":{"mix_data":[{"series_id":SERIES}],"has_more":true,"cursor":"b"}}),
            _=>json!({"code":0,"data":{"mix_data":[{"series_id":"bad"}],"has_more":false}}),
        }})}).await;
        assert_eq!(
            fixture.client().pull_follow(|| true).await,
            Err(CloudError::IncompleteFollow)
        );
    }
}
#[tokio::test]
async fn cursor_cycle_is_incomplete_even_when_each_page_adds_a_member() {
    let fixture = Fixture::new(|request| {
        let (id, next) = match request.query["cursor"].as_str() {
            "" => (SERIES, "a"),
            "a" => ("123", "b"),
            "b" => ("456", "a"),
            _ => panic!("cycle must stop before another dispatch"),
        };
        Response::json(json!({"code":0,"data":{
            "mix_data":[{"series_id":id}], "has_more":true, "cursor":next
        }}))
    })
    .await;
    assert_eq!(
        fixture.client().pull_follow(|| true).await,
        Err(CloudError::IncompleteFollow)
    );
    assert_eq!(fixture.requests.lock().unwrap().len(), 3);
}
#[tokio::test]
async fn pull_resource_budgets_and_pre_dispatch_cancellation_fail_closed() {
    let fixture = Fixture::new(|_| Response::json(membership(true))).await;
    assert!(fixture.client().pull_follow(|| false).await.is_err());
    assert!(fixture.requests.lock().unwrap().is_empty());
    assert_eq!(
        fixture
            .client()
            .pull_follow_bounded(|| true, 1, 0, MAX_BYTES)
            .await,
        Err(CloudError::IncompleteFollow)
    );
    assert_eq!(
        fixture
            .client()
            .pull_follow_bounded(|| true, 1, MAX_ITEMS, 1)
            .await,
        Err(CloudError::IncompleteFollow)
    );
    let fixture=Fixture::new(|_|Response::json(json!({"code":0,"data":{"mix_data":[{"series_id":SERIES}],"has_more":true,"cursor":"next"}}))).await;
    assert_eq!(
        fixture
            .client()
            .pull_follow_bounded(|| true, 1, MAX_ITEMS, MAX_BYTES)
            .await,
        Err(CloudError::IncompleteFollow)
    );
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn response_budget_counts_unknown_fields_and_duplicate_rows_across_pages() {
    let fixture = Fixture::new(|_| {
        Response::json(json!({"code":0,"data":{
            "mix_data":[{"series_id":SERIES},{"series_id":SERIES}],
            "has_more":false,"ignored": "x".repeat(512)
        }}))
    })
    .await;
    assert_eq!(
        fixture
            .client()
            .pull_follow_bounded(|| true, MAX_PAGES, MAX_ITEMS, 256)
            .await,
        Err(CloudError::IncompleteFollow)
    );

    let fixture = Fixture::new(|request| {
        let (id, more) = if request.query["cursor"].is_empty() {
            (SERIES, true)
        } else {
            ("123", false)
        };
        Response::json(json!({"code":0,"data":{
            "mix_data":[{"series_id":id}],"has_more":more,"cursor":"next","ignored":"x".repeat(150)
        }}))
    })
    .await;
    assert_eq!(
        fixture
            .client()
            .pull_follow_bounded(|| true, MAX_PAGES, MAX_ITEMS, 400)
            .await,
        Err(CloudError::IncompleteFollow)
    );
    assert_eq!(fixture.requests.lock().unwrap().len(), 2);
}
#[tokio::test]
async fn mutation_wire_is_explicit_and_rejection_is_not_an_ack() {
    let fixture = Fixture::new(|r| {
        assert_eq!(r.path, SET);
        assert_eq!(r.method, "POST");
        assert_eq!(r.body["series_id"], SERIES);
        assert_eq!(r.body["book_id"], SERIES);
        assert_eq!(r.body["book_type"], 2);
        Response::json(json!({"code":0,"data":{}}))
    })
    .await;
    let mut client = fixture.client();
    client.set_follow_update(SERIES, true).await.unwrap();
    client.set_follow_update(SERIES, false).await.unwrap();
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .map(|r| r.body["op_type"].as_u64().unwrap())
            .collect::<Vec<_>>(),
        [1, 2]
    );
    assert!(client.set_follow_update("0", true).await.is_err());
    assert_eq!(fixture.requests.lock().unwrap().len(), 2);
    let fixture =
        Fixture::new(|_| Response::json(json!({"code":12,"message":"private diagnostic"}))).await;
    let error = fixture
        .client()
        .set_follow_update(SERIES, true)
        .await
        .unwrap_err();
    assert_eq!(error, CloudError::Rejected);
    assert!(!error.to_string().contains("private"));
}
