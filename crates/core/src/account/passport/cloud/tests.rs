use super::super::{
    crypto::{hex, md5},
    verified_fixture,
};
use super::*;
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

const UID: &str = "7390000000000000003";
const SERIES: &str = "7690163276214176792";
const VIDEO: &str = "7690163276214176793";
const OTHER: &str = "7690163276214176794";

struct Request {
    method: String,
    path: String,
    query: BTreeMap<String, String>,
    headers: BTreeMap<String, String>,
    body: Vec<u8>,
}
struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    delay: Duration,
    chunked: bool,
}
impl Response {
    fn json(value: Value) -> Self {
        Self {
            status: 200,
            headers: Vec::new(),
            body: value.to_string().into_bytes(),
            delay: Duration::ZERO,
            chunked: false,
        }
    }
    fn status(status: u16) -> Self {
        Self {
            status,
            ..Self::json(value!({}))
        }
    }
}
struct Fixture {
    origin: String,
    requests: Arc<Mutex<Vec<Request>>>,
    task: JoinHandle<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Fixture {
    async fn new(handler: impl Fn(&Request) -> Response + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = requests.clone();
        let handler = Arc::new(handler);
        let task = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                let recorded = recorded.clone();
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut bytes = Vec::new();
                    let mut buffer = [0u8; 4096];
                    let end = loop {
                        let Ok(n) = stream.read(&mut buffer).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                        assert!(bytes.len() < 512 * 1024);
                        if let Some(end) = bytes.windows(4).position(|x| x == b"\r\n\r\n") {
                            break end + 4;
                        }
                    };
                    let head = std::str::from_utf8(&bytes[..end]).unwrap();
                    let mut lines = head.split("\r\n");
                    let mut first = lines.next().unwrap().split_ascii_whitespace();
                    let method = first.next().unwrap().to_owned();
                    let url =
                        Url::parse(&format!("http://fixture.invalid{}", first.next().unwrap()))
                            .unwrap();
                    let headers: BTreeMap<String, String> = lines
                        .filter_map(|line| line.split_once(':'))
                        .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_owned()))
                        .collect();
                    let length = headers
                        .get("content-length")
                        .map_or(0, |s| s.parse::<usize>().unwrap());
                    assert!(length < MAX_BODY);
                    while bytes.len() < end + length {
                        let n = stream.read(&mut buffer).await.unwrap();
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buffer[..n]);
                    }
                    let request = Request {
                        method,
                        path: url.path().into(),
                        query: url
                            .query_pairs()
                            .map(|(k, v)| (k.into_owned(), v.into_owned()))
                            .collect(),
                        headers,
                        body: bytes[end..end + length].to_vec(),
                    };
                    let response = handler(&request);
                    recorded.lock().unwrap().push(request);
                    if !response.delay.is_zero() {
                        tokio::time::sleep(response.delay).await;
                    }
                    let framing = if response.chunked {
                        "Transfer-Encoding: chunked".into()
                    } else {
                        format!("Content-Length: {}", response.body.len())
                    };
                    let mut head = format!(
                        "HTTP/1.1 {} Fixture\r\n{framing}\r\nConnection: close\r\n",
                        response.status
                    );
                    for (key, value) in response.headers {
                        head.push_str(&format!("{key}: {value}\r\n"));
                    }
                    head.push_str("\r\n");
                    if stream.write_all(head.as_bytes()).await.is_ok() {
                        if response.chunked
                            && stream
                                .write_all(format!("{:x}\r\n", response.body.len()).as_bytes())
                                .await
                                .is_err()
                        {
                            return;
                        }
                        let _ = stream.write_all(&response.body).await;
                        if response.chunked {
                            let _ = stream.write_all(b"\r\n0\r\n\r\n").await;
                        }
                    }
                });
            }
        });
        Self {
            origin,
            requests,
            task,
        }
    }
    fn client(&self) -> PassportClient {
        let mut credential = verified_fixture(UID).credential;
        credential.token = "synthetic-cloud-token-only".into();
        PassportClient::for_loopback_tests(credential, &self.origin).unwrap()
    }
}
fn wire() -> Value {
    serde_json::from_str(include_str!("fixtures/library.json")).unwrap()
}
fn local() -> CloudLibrary {
    CloudLibrary {
        owner_id: UID.into(),
        ..CloudLibrary::default()
    }
}
fn upload() -> CloudHistory {
    CloudHistory {
        card: CloudCard {
            drama: Drama {
                series_id: SERIES.into(),
                title: "Synthetic upload".into(),
                episode_count: Some(80),
                ..Drama::default()
            },
            season_index: 13,
            multi_season: true,
            metadata_pending: false,
        },
        episode: 8,
        video_id: Some(VIDEO.into()),
        position: 15.25,
        duration: 90.0,
        completed: false,
        last_played_at: 1_700_000_000_123,
    }
}
fn response(request: &Request) -> Response {
    let wire = wire();
    match request.path.as_str() {
        "/reading/bookapi/read_history/list/v" => Response::json(wire["history"].clone()),
        "/reading/bookapi/bookshelf/video/list/v" => Response::json(wire["favorites"].clone()),
        "/novel/player/multi_video_detail/preload/v1" => Response::json(wire["metadata"].clone()),
        "/reading/bookapi/read_progress/get/v" => Response::json(wire["progress"].clone()),
        _ => Response::json(value!({"code":0})),
    }
}
fn request_json(request: &Request) -> Value {
    serde_json::from_slice(&request.body).unwrap()
}

#[tokio::test]
async fn complete_pull_keeps_favorite_only_membership_and_exact_numeric_ids() {
    let fixture = Fixture::new(response).await;
    let result = fixture.client().pull_library(UID, &local()).await.unwrap();
    assert_eq!(result.history.len(), 1);
    assert_eq!(result.favorites.len(), 2);
    let history = &result.history[0];
    assert_eq!(history.card.drama.series_id, SERIES);
    assert_eq!(history.video_id.as_deref(), Some(VIDEO));
    assert_eq!(history.episode, 7);
    assert_eq!(history.position, 12.5);
    assert_eq!(history.last_played_at, 1_700_000_000_000);
    assert_eq!(history.card.season_index, 13);
    assert!(history.card.multi_season);
    let favorite = result
        .favorites
        .iter()
        .find(|row| row.card.drama.series_id == OTHER)
        .unwrap();
    assert_eq!(favorite.favorite_at, 1_699_999_900_000);
    assert_eq!(favorite.card.drama.title, "Synthetic favorite");
    let requests = fixture.requests.lock().unwrap();
    assert_eq!(requests.len(), 4);
    for request in requests.iter() {
        assert!(!request.headers["x-medusa"].is_empty());
        assert!(!request.headers["x-gorgon"].is_empty());
        assert_eq!(request.headers["passport-sdk-version"], "6031190");
    }
    let history = &requests[0];
    assert_eq!(history.method, "GET");
    assert!(history.body.is_empty());
    assert!(!history.headers.contains_key("content-type"));
    assert!(!history.headers.contains_key("x-ss-stub"));
    for (key, value) in [
        ("limit", "0"),
        ("offset", "0"),
        ("book_type", "2"),
        ("full_field", "false"),
        ("query_soft_deleted", "false"),
        ("last_min_read_timestamp_ms", "0"),
        ("is_first_load", "true"),
    ] {
        assert_eq!(history.query[key], value);
    }
    assert_eq!(requests[1].query["target_user_id"], UID);
    let metadata = request_json(&requests[2]);
    assert_eq!(metadata["series_id"], OTHER);
    assert_eq!(metadata["dr_scene"], "preload");
    assert_eq!(metadata["biz_param"]["source"], 7);
    assert_eq!(metadata["biz_param"]["use_os_player"], false);
    let progress = request_json(&requests[3]);
    assert_eq!(progress["book_ids"]["2"][0].to_string(), SERIES);
    assert!(progress["book_ids"]["2"][0].is_number());
}

#[tokio::test]
async fn signed_json_matches_actual_body_and_write_shapes_match_fixed_reference() {
    let fixture = Fixture::new(response).await;
    let mut client = fixture.client();
    client.upload_progress(&upload()).await.unwrap();
    client.set_favorite(SERIES, true).await.unwrap();
    client.set_favorite(SERIES, false).await.unwrap();
    let requests = fixture.requests.lock().unwrap();
    assert_eq!(requests.len(), 4);
    for request in requests.iter() {
        assert_eq!(request.method, "POST");
        assert_eq!(request.headers["passport-sdk-version"], "6031190");
        assert_eq!(request.headers["sdk-version"], "2");
        assert_eq!(request.headers["x-ss-dp"], "8662");
        assert_eq!(request.headers["x-tt-token"], "synthetic-cloud-token-only");
        assert!(request.headers["cookie"].contains("sessionid=synthetic-core-owner-test-only"));
        assert_eq!(
            request.headers["content-type"],
            "application/json; charset=utf-8"
        );
        assert_eq!(
            request.headers["x-ss-stub"],
            hex(&md5(&request.body)).to_ascii_uppercase()
        );
        assert!(!request.headers["x-medusa"].is_empty());
        assert!(!request.headers["x-gorgon"].is_empty());
        assert!(!request.headers.contains_key("x-argus"));
        assert!(!request.headers.contains_key("x-vc-bdturing-sdk-version"));
    }
    let history = request_json(&requests[0]);
    let history = &history["update_datas"][0];
    assert!(history["book_id"].is_number());
    assert!(history["vid"].is_number());
    assert_eq!(history["book_id"].to_string(), SERIES);
    assert_eq!(history["vid"].to_string(), VIDEO);
    assert_eq!(history["current_play_position"], 15250);
    assert_eq!(history["duration"], 90000);
    assert_eq!(history["read_timestamp_ms"], 1_700_000_000_123i64);
    assert_eq!(history["season_index"], 13);
    assert_eq!(history["is_multi_season"], 1);
    for key in [
        "is_delete",
        "is_interactive_game",
        "is_listen_mode",
        "user_digg",
        "use_soft_delete",
        "meet_guide_comment_tag",
        "user_playlet_comment_flag",
    ] {
        assert_eq!(history[key], false);
    }
    let progress = request_json(&requests[1]);
    let progress = &progress["books"][0];
    assert_eq!(progress["book_id"], SERIES);
    assert_eq!(progress["item_id"], VIDEO);
    assert_eq!(progress["current_play_time"], 15250);
    for key in [
        "check_timestamp",
        "is_listen_mode",
        "is_local_book",
        "listen_and_read",
    ] {
        assert_eq!(progress[key], false);
    }
    for (request, operation) in [(&requests[2], 0), (&requests[3], 1)] {
        let favorite = request_json(request);
        assert_eq!(favorite["is_cancelled"], false);
        assert_eq!(
            favorite["update_bookshelf_video_list"][0]["book_id"],
            SERIES
        );
        assert_eq!(
            favorite["update_bookshelf_video_list"][0]["video_shelf_operate_type"],
            operation
        );
        assert_eq!(favorite["shark_extra"]["is_active_behavior"], "1");
        assert!(
            favorite["update_bookshelf_video_list"][0]["modify_time"]
                .as_u64()
                .unwrap()
                > 0
        );
    }
}

#[tokio::test]
async fn partial_double_write_returns_error_and_retry_repeats_history() {
    for fail_first in [true, false] {
        let attempts = Arc::new(AtomicUsize::new(0));
        let observed = attempts.clone();
        let fixture=Fixture::new(move|request| {
            let index=observed.fetch_add(1,Ordering::SeqCst);
            if (fail_first && index==0)||(!fail_first && index==1) {
                Response::json(value!({"code":0,"data":{"error_code":401,"description":"private-body-never-published"}}))
            } else { response(request) }
        }).await;
        let mut client = fixture.client();
        let error = client.upload_progress(&upload()).await.err().unwrap();
        assert_eq!(error, CloudError::Rejected);
        assert!(!error.to_string().contains("private"));
        assert_eq!(
            attempts.load(Ordering::SeqCst),
            if fail_first { 1 } else { 2 }
        );
        client.upload_progress(&upload()).await.unwrap();
        let requests = fixture.requests.lock().unwrap();
        assert_eq!(
            requests
                .iter()
                .filter(|r| r.path == Endpoint::UploadHistory.path())
                .count(),
            2
        );
        assert_eq!(
            requests.last().unwrap().path,
            Endpoint::UploadProgress.path()
        );
    }
}

#[tokio::test]
async fn missing_credentials_and_wrong_owner_never_reach_network() {
    let fixture = Fixture::new(response).await;
    let mut client = fixture.client();
    assert!(client.pull_library("123", &local()).await.is_err());
    let mut wrong = local();
    wrong.owner_id = "456".into();
    assert!(client.pull_library(UID, &wrong).await.is_err());
    client.session.token.clear();
    client.session.cookies.clear();
    assert!(client.set_favorite(SERIES, true).await.is_err());
    assert!(fixture.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn envelope_rejections_never_publish_refreshed_credentials() {
    for payload in [
        value!({}),
        value!({"message":"success","data":{}}),
        value!({"code":401}),
        value!({"code":0,"error_code":12,"data":{"error_code":0}}),
        value!({"code":0,"data":{"error_code":401}}),
        value!({"code":0,"data":{"error_code":"malformed"}}),
    ] {
        let fixture = Fixture::new(move |_| {
            let mut response = Response::json(payload.clone());
            response
                .headers
                .push(("X-Tt-Token".into(), "must-not-publish".into()));
            response.headers.push((
                "Set-Cookie".into(),
                "sessionid=must-not-publish; Path=/".into(),
            ));
            response
        })
        .await;
        let mut client = fixture.client();
        assert!(client.set_favorite(SERIES, true).await.is_err());
        assert_eq!(client.session.token, "synthetic-cloud-token-only");
        assert_eq!(
            client.session.cookies["sessionid"],
            "synthetic-core-owner-test-only"
        );
    }
}

#[tokio::test]
async fn successful_cloud_response_refreshes_only_private_validated_session() {
    let fixture = Fixture::new(|_| {
        let mut response = Response::json(value!({"code":"0","data":{"error_code":0}}));
        response
            .headers
            .push(("X-Tt-Token".into(), "synthetic-refreshed-token-only".into()));
        response.headers.push((
            "Set-Cookie".into(),
            "sessionid=synthetic-refreshed-cookie-only; Path=/".into(),
        ));
        response
    })
    .await;
    let mut client = fixture.client();
    client.set_favorite(SERIES, true).await.unwrap();
    assert_eq!(client.credential().uid.as_deref(), Some(UID));
    assert_eq!(client.credential().token, "synthetic-refreshed-token-only");
    assert_eq!(
        client.credential().cookies["sessionid"],
        "synthetic-refreshed-cookie-only"
    );
}

#[tokio::test]
async fn redirect_oversize_trailing_json_and_timeout_fail_closed() {
    for case in 0..5 {
        let fixture = Fixture::new(move |_| {
            let mut response = Response::json(value!({"code":0}));
            match case {
                0 => {
                    response.status = 302;
                    response.headers.push((
                        "Location".into(),
                        "http://127.0.0.1:1/private-target".into(),
                    ));
                }
                1 => {
                    response.body =
                        Response::json(value!({"code":0,"padding":"x".repeat(MAX_BODY)})).body
                }
                2 => response.body = b"{\"code\":0}{\"code\":0}".to_vec(),
                3 => response.delay = Duration::from_millis(200),
                _ => {
                    response.body =
                        Response::json(value!({"code":0,"padding":"x".repeat(MAX_BODY)})).body;
                    response.chunked = true;
                }
            }
            response
        })
        .await;
        let mut client = fixture.client();
        client.http = crate::http::client_builder()
            .timeout(Duration::from_millis(if case == 3 { 80 } else { 1000 }))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let error = client.set_favorite(SERIES, true).await.err().unwrap();
        match case {
            0 => assert_eq!(
                error,
                CloudError::Passport(PassportError::UpstreamHttp {
                    status: 302,
                    retry_after: 0
                })
            ),
            3 => assert_eq!(error, CloudError::Passport(PassportError::Timeout)),
            _ => assert_eq!(error, CloudError::Passport(PassportError::InvalidResponse)),
        }
        assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn complete_paging_goes_beyond_five_pages_and_falls_back_by_500() {
    for cursor in 0..3 {
        let fixture=Fixture::new(move|request| {
            if request.path==Endpoint::History.path() {
                let offset=request.query["offset"].parse::<u64>().unwrap();
                let page=offset/500;
                let mut payload=value!({"code":0,"data":{"data_list":[{"book_id_str":(8000000000000000000u64+page).to_string(),"book_name":"Synthetic page","vid_index":1,"read_timestamp_ms":1700000000000i64}],"has_more":page<5,"next_offset":if cursor==0 {offset+500}else {0}}});
                if cursor==2 {payload["data"].as_object_mut().unwrap().remove("next_offset");}
                Response::json(payload)
            } else if request.path==Endpoint::Favorites.path() { Response::json(value!({"code":0,"data":{"video_shelf_info":[]}})) }
            else {Response::json(value!({"code":0,"video_data":[]}))}
        }).await;
        let result = fixture.client().pull_library(UID, &local()).await.unwrap();
        assert_eq!(result.history.len(), 6);
        let requests = fixture.requests.lock().unwrap();
        let pages: Vec<_> = requests
            .iter()
            .filter(|r| r.path == Endpoint::History.path())
            .collect();
        assert_eq!(pages.len(), 6);
        for (index, page) in pages.iter().enumerate() {
            assert_eq!(page.query["offset"], (index * 500).to_string());
        }
    }
}

#[tokio::test]
async fn incomplete_history_never_returns_partial_membership() {
    for case in 0..3 {
        let fixture=Fixture::new(move|request| {
            if case==0 {return Response::json(value!({"code":0,"data":{"data_list":[],"has_more":true}}));}
            let offset=request.query["offset"].parse::<u64>().unwrap();
            Response::json(value!({"code":0,"data":{"data_list":[{"book_id_str":if case==1 {SERIES.into()}else {(8000000000000000000u64+offset).to_string()},"book_name":"Synthetic page","vid_index":1,"read_timestamp_ms":1700000000000i64}],"has_more":true}}))
        }).await;
        let error = fixture
            .client()
            .pull_library(UID, &local())
            .await
            .err()
            .unwrap();
        assert_eq!(error, CloudError::IncompleteHistory);
        let requests = fixture.requests.lock().unwrap();
        assert_eq!(
            requests.len(),
            match case {
                0 => 1,
                1 => 2,
                _ => 200,
            }
        );
        assert!(requests.iter().all(|r| r.path == Endpoint::History.path()));
    }
}

#[tokio::test]
async fn malformed_membership_and_progress_never_return_a_snapshot() {
    for case in 0..6 {
        let fixture=Fixture::new(move |request| {
            if request.path==Endpoint::Favorites.path() {
                return match case {
                    0=>Response::json(value!({"code":0,"data":{}})),
                    1=>Response::json(value!({"code":0,"data":{"video_shelf_info":[{"series_id":"wrong"}]}})),
                    2=>Response::json(value!({"code":0,"data":{"video_shelf_info":[],"has_more":true}})),
                    _=>response(request),
                };
            }
            if request.path==Endpoint::Progress.path() {
                return match case {
                    3=>Response::json(value!({"code":0,"data":{}})),
                    4=>Response::json(value!({"code":0,"video_data":[null]})),
                    _=>Response::json(value!({"code":0,"video_data":[{"series_id":"999","vid_index":1,"last_watch_time":1700000000}]})),
                };
            }
            response(request)
        }).await;
        assert!(fixture.client().pull_library(UID, &local()).await.is_err());
    }
}

#[tokio::test]
async fn history_page_200_may_finish_without_being_rejected_as_truncated() {
    let fixture = Fixture::new(|request| {
        if request.path == Endpoint::History.path() {
            let page = request.query["offset"].parse::<u64>().unwrap() / 500;
            Response::json(value!({"code":0,"data":{"data_list":[{
                "book_id_str":(8000000000000000000u64+page).to_string(),
                "book_name":"Synthetic boundary page","vid_index":1,"read_timestamp_ms":1700000000000i64
            }],"has_more":page<199}}))
        } else if request.path == Endpoint::Favorites.path() {
            Response::json(value!({"code":0,"data":{"video_shelf_info":[]}}))
        } else {
            Response::json(value!({"code":0,"video_data":[]}))
        }
    }).await;
    let result = fixture.client().pull_library(UID, &local()).await.unwrap();
    assert_eq!(result.history.len(), 200);
    assert_eq!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == Endpoint::History.path())
            .count(),
        200
    );
}

#[tokio::test]
async fn malformed_later_history_page_cannot_publish_earlier_valid_rows() {
    for row in [
        Value::Null,
        value!({"book_id_str":"wrong"}),
        value!({"book_id_str":OTHER,"vid_index":10001,"read_timestamp_ms":1700000000000i64}),
    ] {
        let fixture = Fixture::new(move |request| {
            if request.query["offset"] == "0" {
                let mut first = wire()["history"].clone();
                first["data"]["has_more"] = value!(true);
                Response::json(first)
            } else {
                Response::json(
                    value!({"code":0,"data":{"data_list":[row.clone()],"has_more":false}}),
                )
            }
        })
        .await;
        assert!(fixture.client().pull_library(UID, &local()).await.is_err());
        let requests = fixture.requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|r| r.path == Endpoint::History.path()));
    }
}

#[tokio::test]
async fn metadata_absence_or_failure_preserves_membership_and_retries_later() {
    for rejected in [false, true] {
        let fixture = Fixture::new(move |request| {
            if request.path == Endpoint::Metadata.path() {
                if rejected {
                    Response::status(503)
                } else {
                    Response::json(value!({"code":0,"data":{}}))
                }
            } else {
                response(request)
            }
        })
        .await;
        let first = fixture.client().pull_library(UID, &local()).await.unwrap();
        let pending = first
            .favorites
            .iter()
            .find(|row| row.card.drama.series_id == OTHER)
            .unwrap();
        assert!(pending.card.metadata_pending);
        assert!(!pending.card.drama.title.is_empty());
        assert_eq!(first.history.len(), 1);
        let restored = Fixture::new(response).await;
        let second = restored.client().pull_library(UID, &first).await.unwrap();
        let favorite = second
            .favorites
            .iter()
            .find(|row| row.card.drama.series_id == OTHER)
            .unwrap();
        assert!(!favorite.card.metadata_pending);
        assert_eq!(favorite.card.drama.title, "Synthetic favorite");
    }
}

#[tokio::test]
async fn mismatched_card_identity_fails_the_entire_pull() {
    let fixture=Fixture::new(|request| {
        if request.path==Endpoint::Metadata.path() {
            Response::json(value!({"code":0,"data":{(OTHER):{"video_data":{"series_id":SERIES,"series_title":"Wrong identity"}}}}))
        } else {response(request)}
    }).await;
    let error = fixture
        .client()
        .pull_library(UID, &local())
        .await
        .err()
        .unwrap();
    assert_eq!(error, CloudError::MetadataIdentity);
    assert!(
        !fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .any(|r| r.path == Endpoint::Progress.path())
    );
}

#[tokio::test]
async fn newer_episode_from_nested_progress_stays_incomplete_without_a_video_id() {
    let fixture=Fixture::new(|request| {
        if request.path==Endpoint::Progress.path() {
            Response::json(value!({"code":0,"video_data":null,"data":{"video_data":[{"series_id":SERIES,"vid_index":8,"last_watch_time":1700000001,"episode_count":81},{"series_id":OTHER,"vid_index":2,"last_watch_time":1700000002}]}}))
        } else {response(request)}
    }).await;
    let result = fixture.client().pull_library(UID, &local()).await.unwrap();
    assert_eq!(result.history.len(), 2);
    let history = result
        .history
        .iter()
        .find(|row| row.card.drama.series_id == SERIES)
        .unwrap();
    assert_eq!(history.episode, 8);
    assert!(history.video_id.is_none());
    assert_eq!(history.position, 0.0);
    assert_eq!(history.duration, 0.0);
    assert_eq!(history.card.drama.episode_count, Some(81));
    assert_eq!(history.last_played_at, 1_700_000_001_000);
    assert!(fixture.client().upload_progress(history).await.is_err());
}

#[tokio::test]
async fn season_metadata_survives_missing_title_and_missing_remote_season() {
    for (remote_season, title, saved_season) in [
        (0, "Synthetic", 13),
        (13, "Synthetic", 0),
        (13, "", 2),
        (0, "", 13),
    ] {
        let fixture=Fixture::new(move|request| {
            if request.path==Endpoint::History.path() {
                Response::json(value!({"code":0,"data":{"data_list":[{"book_id_str":SERIES,"book_name":title,"vid_index":1,"read_timestamp_ms":1700000000000i64,"season_index":remote_season,"is_multi_season":remote_season>0}],"has_more":false}}))
            } else if request.path==Endpoint::Favorites.path() {Response::json(value!({"code":0,"data":{"video_shelf_info":[]}}))}
            else {Response::json(value!({"code":0,"video_data":[]}))}
        }).await;
        let mut saved = local();
        let mut entry = upload();
        entry.card.season_index = saved_season;
        entry.card.multi_season = saved_season > 0;
        saved.history.push(entry);
        let result = fixture.client().pull_library(UID, &saved).await.unwrap();
        assert_eq!(result.history[0].card.season_index, 13);
        assert!(result.history[0].card.multi_season);
    }
}

#[tokio::test]
async fn metadata_and_progress_batches_respect_20_and_200_limits() {
    let fixture=Fixture::new(|request| {
        if request.path==Endpoint::History.path() {Response::json(value!({"code":0,"data":{"data_list":[],"has_more":false}}))}
        else if request.path==Endpoint::Favorites.path() {
            let rows:Vec<_>=(0..205).map(|n|value!({"series_id":(8000000000000000000u64+n).to_string(),"collect_time":1700000000})).collect();
            Response::json(value!({"code":0,"data":{"video_shelf_info":rows}}))
        } else if request.path==Endpoint::Metadata.path() {Response::json(value!({"code":0,"data":{}}))}
        else {Response::json(value!({"code":0,"video_data":[]}))}
    }).await;
    let result = fixture.client().pull_library(UID, &local()).await.unwrap();
    assert!(result.history.is_empty());
    assert_eq!(result.favorites.len(), 205);
    let requests = fixture.requests.lock().unwrap();
    let metadata: Vec<_> = requests
        .iter()
        .filter(|r| r.path == Endpoint::Metadata.path())
        .collect();
    assert_eq!(metadata.len(), 11);
    assert!(metadata.iter().all(|r| {
        request_json(r)["series_id"]
            .as_str()
            .unwrap()
            .split(',')
            .count()
            <= 20
    }));
    let progress: Vec<_> = requests
        .iter()
        .filter(|r| r.path == Endpoint::Progress.path())
        .collect();
    assert_eq!(progress.len(), 2);
    assert_eq!(
        request_json(progress[0])["book_ids"]["2"]
            .as_array()
            .unwrap()
            .len(),
        200
    );
    assert_eq!(
        request_json(progress[1])["book_ids"]["2"]
            .as_array()
            .unwrap()
            .len(),
        5
    );
}

#[tokio::test]
async fn invalid_uploads_stop_before_network_and_32_digit_ids_stay_numbers() {
    let fixture = Fixture::new(response).await;
    let mut client = fixture.client();
    for case in 0..6 {
        let mut entry = upload();
        match case {
            0 => entry.position = f64::NAN,
            1 => entry.position = -1.0,
            2 => entry.duration = 86400.01,
            3 => entry.episode = 0,
            4 => entry.card.drama.series_id = "00123".into(),
            _ => entry.video_id = Some("wrong".into()),
        }
        assert!(client.upload_progress(&entry).await.is_err());
    }
    let mut missing = upload();
    missing.video_id = None;
    assert!(client.upload_progress(&missing).await.is_err());
    let mut invalid = upload();
    invalid.last_played_at = 0;
    assert!(client.upload_progress(&invalid).await.is_err());
    assert!(client.set_favorite("0", true).await.is_err());
    assert!(fixture.requests.lock().unwrap().is_empty());
    let mut large = upload();
    large.card.drama.series_id = "99999999999999999999999999999999".into();
    large.video_id = Some("88888888888888888888888888888888".into());
    client.upload_progress(&large).await.unwrap();
    let requests = fixture.requests.lock().unwrap();
    assert_eq!(
        request_json(&requests[0])["update_datas"][0]["book_id"].to_string(),
        large.card.drama.series_id
    );
    assert_eq!(
        request_json(&requests[1])["books"][0]["book_id"],
        large.card.drama.series_id
    );
}

/// The reading identity carries the name the account goes by, which Passport's placeholder
/// does not, and the picture. Both are optional: a missing or malformed field is not a failure.
#[tokio::test]
async fn reading_identity_prefers_its_own_name_and_accepts_picture_shapes() {
    let fixture = Fixture::new(|request| {
        assert_eq!(request.method, "GET");
        assert_eq!(request.path, "/reading/user/info/v1/");
        Response::json(value!({
            "code": 0,
            "data": {
                "biz_user_id": "066831371270",
                "user_name": "  柯柏  ",
                "avatar_url": "https://p6-passport.byteacctimg.com/img/mosaic-legacy/3793/a~120x256.image",
            }
        }))
    })
    .await;
    let mut client = fixture.client();
    assert_eq!(
        client.read_identity().await.unwrap(),
        (
            Some("柯柏".into()),
            Some(
                "https://p6-passport.byteacctimg.com/img/mosaic-legacy/3793/a~120x256.image".into()
            )
        )
    );
}

#[tokio::test]
async fn reading_identity_accepts_url_list_and_falls_back_to_passport_spellings() {
    let fixture = Fixture::new(|_| {
        Response::json(value!({
            "code": 0,
            "data": {
                "nickname": "备用昵称",
                "avatar": { "url_list": ["https://p3-novel.byteimg.com/a~tplv-shrink:200:200.image"] },
            }
        }))
    })
    .await;
    let mut client = fixture.client();
    assert_eq!(
        client.read_identity().await.unwrap(),
        (
            Some("备用昵称".into()),
            Some("https://p3-novel.byteimg.com/a~tplv-shrink:200:200.image".into())
        )
    );
}

/// A rejected host or an unusable name leaves that field absent rather than inventing one;
/// the caller then keeps the Passport values.
#[tokio::test]
async fn reading_identity_drops_unusable_fields_without_failing() {
    let fixture = Fixture::new(|_| {
        Response::json(value!({
            "code": 0,
            "data": {
                "user_name": "   ",
                "avatar_url": "http://evil.invalid/a.png",
            }
        }))
    })
    .await;
    let mut client = fixture.client();
    assert_eq!(client.read_identity().await.unwrap(), (None, None));
}

#[tokio::test]
async fn reading_identity_reports_a_rejected_envelope() {
    let fixture = Fixture::new(|_| Response::json(value!({ "code": 1003, "data": {} }))).await;
    let mut client = fixture.client();
    assert!(client.read_identity().await.is_err());
}
