use super::*;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Semaphore, mpsc},
    task::JoinSet,
    time::timeout,
};
const ID: &str = "90071992547409931234";
fn row(id: &str, title: &str, kind: &str) -> Value {
    json!({"series_id":id,"title":title,"content_type":kind,"card_tips":"120万热搜值","episode_cnt":24})
}
fn plan() -> Value {
    json!({"code":0,"data":[{"lynx_data":serde_json::to_string(&json!([
    {"cell_name":"猜你想搜","search_tag_data":[{"tag_title":"都市逆袭","tag_id":ID}]},
    {"cell_data":[{"cell_name":"热搜榜","video_data":[row(ID,"漫剧样例","1004"),row("7391234567890123457","短剧样例","1"),row("7391234567890123457","重复","1"),row("123","小说","3")]}]}
])).unwrap()}]})
}
#[test]
fn known_cells_preserve_exact_ids_position_and_nonplayable_keywords() {
    let output = parse_discovery(&serde_json::to_vec(&plan()).unwrap()).unwrap();
    assert_eq!(output.guesses[0].query.as_deref(), Some("都市逆袭"));
    assert!(output.guesses[0].drama.series_id.is_empty());
    assert_eq!(output.boards.len(), 2);
    assert_eq!(output.boards[0].id, DiscoveryBoardKind::Short);
    assert_eq!(output.boards[0].items[0].position, Some(2));
    assert_eq!(output.boards[1].items[0].drama.series_id, ID);
    assert_eq!(
        output.boards[1].items[0].search_score.as_deref(),
        Some("120万热搜值")
    );
    let numeric = format!(
        r#"{{"code":0,"data":[{{"cell_name":"短剧热搜榜","video_data":[{{"series_id":{ID},"title":"精确数字"}},{{"series_id":9.007199254740993e19,"title":"指数"}},{{"series_id":1.2,"title":"小数"}}]}}]}}"#
    );
    let output = parse_discovery(numeric.as_bytes()).unwrap();
    assert_eq!(output.boards[0].items.len(), 1);
    assert_eq!(output.boards[0].items[0].drama.series_id, ID);
}
#[test]
fn parser_bounds_known_wrappers_and_each_board_independently() {
    let mut rows = vec![row("0", "无效", "1"), row("123", "未知", "")];
    rows.extend((0..20).map(|i| {
        row(
            &(1000 + i).to_string(),
            "热榜",
            if i < 10 { "1" } else { "1004" },
        )
    }));
    let data = json!({"code":"0","data":[{"cell_name":"热搜榜","video_data":rows},
        {"cell_name":"短剧热搜榜","video_data":[row("888","错分类","1004")]},
        {"unknown":{"cell_name":"漫剧热搜榜","video_data":[row("999","注入","1004")]}}]});
    let output = parse_discovery(&serde_json::to_vec(&data).unwrap()).unwrap();
    assert_eq!(
        output
            .boards
            .iter()
            .map(|b| b.items.len())
            .collect::<Vec<_>>(),
        vec![6, 6]
    );
    assert_eq!(output.boards[0].items[0].position, Some(3));
    for bad in [
        b"{}".as_slice(),
        b"{\"code\":1,\"data\":[]}",
        b"{\"code\":0,\"data\":[]} garbage",
    ] {
        assert_eq!(parse_discovery(bad), Err(CatalogError::InvalidData));
    }
    let mut nested = json!({"cell_name":"热搜榜","video_data":[row("123","过深","1")]});
    for _ in 0..10 {
        nested = json!({"cell_data":nested});
    }
    assert!(
        parse_discovery(&serde_json::to_vec(&json!({"code":0,"data":nested})).unwrap())
            .unwrap()
            .boards
            .is_empty()
    );
    assert!(
        parse_discovery(
            &serde_json::to_vec(&json!({"code":0,"data":{"lynx_data":"[] trailing"}})).unwrap()
        )
        .unwrap()
        .boards
        .is_empty()
    );
    assert_eq!(
        parse_discovery(&vec![b' '; 2 * 1024 * 1024 + 1]),
        Err(CatalogError::TooLarge)
    );
    let invalid = json!({"code":0,"data":[{"cell_name":"猜你想搜","video_data":[row("111",&"长".repeat(81),"1"),row("222","含\u{0001}控制符","1"),row("333","正常","1")]}]});
    let output = parse_discovery(&serde_json::to_vec(&invalid).unwrap()).unwrap();
    assert_eq!(output.guesses.len(), 1);
    assert_eq!(output.guesses[0].drama.title, "正常");
}
struct Server {
    origin: String,
    requests: mpsc::UnboundedReceiver<String>,
    registrations: Arc<AtomicUsize>,
    plans: Arc<AtomicUsize>,
    closed: Arc<AtomicUsize>,
    gate: Arc<Semaphore>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(plan_status: u16, body: String, paused: bool) -> Server {
    server_with_registration(plan_status, body, paused, false).await
}
async fn server_with_registration(
    plan_status: u16,
    body: String,
    paused: bool,
    pause_registration: bool,
) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (tx, requests) = mpsc::unbounded_channel();
    let registrations = Arc::new(AtomicUsize::new(0));
    let plans = Arc::new(AtomicUsize::new(0));
    let closed = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(Semaphore::new(if paused { 0 } else { 100 }));
    let (reg, plan_count, closed_count, plan_gate) = (
        registrations.clone(),
        plans.clone(),
        closed.clone(),
        gate.clone(),
    );
    let task = tokio::spawn(async move {
        let mut jobs = JoinSet::new();
        loop {
            tokio::select! {
                accepted=listener.accept()=>{let (mut socket,_)=accepted.unwrap();let (tx,reg,plan_count,closed_count,gate,body)=(tx.clone(),reg.clone(),plan_count.clone(),closed_count.clone(),plan_gate.clone(),body.clone());
                    jobs.spawn(async move {
                        let mut bytes=Vec::new();let mut one=[0];
                        while !bytes.ends_with(b"\r\n\r\n") && bytes.len()<32768 {if socket.read(&mut one).await.unwrap_or(0)==0{return;} bytes.push(one[0]);}
                        let text=String::from_utf8(bytes).unwrap();let length=text.lines().find_map(|line|line.to_ascii_lowercase().strip_prefix("content-length: ").and_then(|v|v.parse::<usize>().ok())).unwrap_or(0);
                        if length>1024*1024 {return;}let mut body_in=vec![0;length];if socket.read_exact(&mut body_in).await.is_err(){return;}
                        let is_register=text.starts_with("POST /service/2/device_register/"); let _=tx.send(text);
                        let (status,payload)=if is_register {reg.fetch_add(1,Ordering::SeqCst);
                            if pause_registration {tokio::select!{p=gate.acquire()=>{if let Ok(p)=p{p.forget();}},_=socket.read(&mut one)=>{closed_count.fetch_add(1,Ordering::SeqCst);return;}}}
                            (200,r#"{"device_id_str":"7000000000000000001","install_id_str":"7000000000000000002"}"#.to_owned())}
                            else {plan_count.fetch_add(1,Ordering::SeqCst);tokio::select!{p=gate.acquire()=>{if let Ok(p)=p{p.forget();}},_=socket.read(&mut one)=>{closed_count.fetch_add(1,Ordering::SeqCst);return;}}(plan_status,body)};
                        let reply=format!("HTTP/1.1 {status} Fixture\r\nConnection: close\r\nContent-Length: {}\r\nSet-Cookie: ttreq=synthetic\r\nSet-Cookie: sessionid=private\r\n\r\n{payload}",payload.len());let _=socket.write_all(reply.as_bytes()).await;
                    });
                },_=jobs.join_next(),if !jobs.is_empty()=>{}
            }
        }
    });
    Server {
        origin,
        requests,
        registrations,
        plans,
        closed,
        gate,
        task,
    }
}
#[tokio::test]
async fn signed_public_request_is_private_and_cached_for_concurrent_readers() {
    let mut server = server(200, plan().to_string(), false).await;
    let discovery = Discovery::new(Some(&server.origin)).unwrap();
    let mut calls = JoinSet::new();
    for _ in 0..8 {
        let d = discovery.clone();
        calls.spawn(async move { d.get().await });
    }
    while let Some(r) = calls.join_next().await {
        assert_eq!(r.unwrap().unwrap().boards.len(), 2);
    }
    assert_eq!(server.registrations.load(Ordering::SeqCst), 1);
    assert_eq!(server.plans.load(Ordering::SeqCst), 1);
    let _register = server.requests.recv().await.unwrap();
    let request = server.requests.recv().await.unwrap();
    let lower = request.to_ascii_lowercase();
    assert!(
        lower.contains("x-medusa:") && lower.contains("x-helios:") && lower.contains("x-gorgon:")
    );
    assert!(
        !lower.contains("x-argus:")
            && !lower.contains("x-tt-token:")
            && !lower.contains("private")
            && !lower.contains("ttreq=")
    );
    assert!(lower.contains("cookie: install_id=7000000000000000002\r\n"));
    let path = request
        .lines()
        .next()
        .unwrap()
        .split_whitespace()
        .nth(1)
        .unwrap();
    let url = reqwest::Url::parse(&format!("http://fixture.invalid{path}")).unwrap();
    let q: std::collections::BTreeMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(url.path(), "/reading/bookapi/plan/v1/");
    assert_eq!(q["user_is_login"], "0");
    assert_eq!(q["from"], "search_input_page");
    assert_eq!(q["search_middle_page_version"], "4");
    for absent in ["query", "search_history", "token", "uid"] {
        assert!(!q.contains_key(absent));
    }
    assert!(lower.contains(&format!("x-ss-req-ticket: {}\r\n", q["_rticket"])));
}
#[tokio::test]
async fn cancel_and_deadline_cover_lock_registration_and_plan_without_poisoning() {
    let server = server(200, plan().to_string(), true).await;
    let d = Discovery::new(Some(&server.origin)).unwrap();
    let c = d.clone();
    let first = tokio::spawn(async move { c.get().await });
    timeout(Duration::from_secs(2), async {
        while server.plans.load(Ordering::SeqCst) < 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let mut impatient = d.clone();
    impatient.deadline = Duration::from_millis(20);
    assert_eq!(impatient.get().await, Err(CatalogError::Timeout));
    first.abort();
    let _ = first.await;
    timeout(Duration::from_secs(2), async {
        while server.closed.load(Ordering::SeqCst) < 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    server.gate.add_permits(10);
    assert_eq!(d.get().await.unwrap().boards.len(), 2);
    assert_eq!(server.registrations.load(Ordering::SeqCst), 2);
    assert_eq!(server.plans.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn empty_and_error_snapshots_expire_without_playback_registration_cooldown() {
    for (status, body, expected) in [
        (200, r#"{"code":0,"data":[]}"#.into(), None),
        (
            403,
            "private upstream secret".into(),
            Some(CatalogError::VerificationRequired),
        ),
        (
            302,
            "redirect".into(),
            Some(CatalogError::UpstreamStatus(302)),
        ),
        (200, "garbage".into(), Some(CatalogError::InvalidData)),
        (
            200,
            " ".repeat(2 * 1024 * 1024 + 1),
            Some(CatalogError::TooLarge),
        ),
    ] {
        let server = server(status, body, false).await;
        let mut d = Discovery::new(Some(&server.origin)).unwrap();
        d.empty_ttl = Duration::from_millis(5);
        let result = d.get().await;
        if let Some(e) = expected {
            assert_eq!(result, Err(e));
        } else {
            assert_eq!(result.unwrap(), SearchDiscovery::default());
        }
        let _ = d.get().await;
        assert_eq!(server.plans.load(Ordering::SeqCst), 1);
        tokio::time::sleep(Duration::from_millis(10)).await;
        let _ = d.get().await;
        assert_eq!(server.plans.load(Ordering::SeqCst), 2);
    }
}

#[test]
fn business_errors_never_become_empty_success() {
    for value in [
        json!({"code":0,"data":{"error_code":1105}}),
        json!({"code":0,"error_code":"1105","data":[]}),
        json!({"code":0,"error_code":1105,"data":{"error_code":0}}),
        json!({"code":0,"error_code":null,"data":[]}),
        json!({"code":0,"data":{"error_code":false}}),
    ] {
        assert_eq!(
            parse_discovery(&serde_json::to_vec(&value).unwrap()),
            Err(CatalogError::InvalidData)
        );
    }
    for value in [
        json!({"code":0,"data":{"error_code":"0"}}),
        json!({"code":0,"error_code":0,"data":[]}),
    ] {
        assert_eq!(
            parse_discovery(&serde_json::to_vec(&value).unwrap()),
            Ok(SearchDiscovery::default())
        );
    }
}

#[tokio::test]
async fn fetch_timeout_is_cached_but_cancelled_registration_can_retry() {
    for pause_registration in [true, false] {
        let server =
            server_with_registration(200, plan().to_string(), true, pause_registration).await;
        let mut d = Discovery::new(Some(&server.origin)).unwrap();
        // Allow signing/registration CPU work under parallel suites; the server gate forces expiry.
        d.deadline = Duration::from_secs(2);
        d.empty_ttl = Duration::from_millis(40);
        assert_eq!(d.get().await, Err(CatalogError::Timeout));
        assert_eq!(d.get().await, Err(CatalogError::Timeout));
        assert_eq!(server.registrations.load(Ordering::SeqCst), 1);
        assert_eq!(
            server.plans.load(Ordering::SeqCst),
            usize::from(!pause_registration)
        );
        tokio::time::sleep(Duration::from_millis(60)).await;
        server.gate.add_permits(10);
        assert_eq!(d.get().await.unwrap().boards.len(), 2);
        assert_eq!(server.registrations.load(Ordering::SeqCst), 2);
    }
    let server = server_with_registration(200, plan().to_string(), true, true).await;
    let d = Discovery::new(Some(&server.origin)).unwrap();
    let c = d.clone();
    let first = tokio::spawn(async move { c.get().await });
    timeout(Duration::from_secs(2), async {
        while server.registrations.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    first.abort();
    let _ = first.await;
    timeout(Duration::from_secs(2), async {
        while server.closed.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    server.gate.add_permits(10);
    assert_eq!(d.get().await.unwrap().boards.len(), 2);
    assert_eq!(server.registrations.load(Ordering::SeqCst), 2);
}

#[test]
fn traversal_and_cover_allowlists_do_not_expand_optional_data() {
    let mut rows = vec![json!({}); 128];
    rows.push(row("123", "越界数组", "1"));
    let value = json!({"code":0,"data":[{"cell_name":"短剧热搜榜","video_data":rows}]});
    assert!(
        parse_discovery(&serde_json::to_vec(&value).unwrap())
            .unwrap()
            .boards
            .is_empty()
    );
    let exhausted = vec![json!({"cell_data":vec![json!({});128]}); 8];
    let mut cells = exhausted;
    cells.push(json!({"cell_name":"短剧热搜榜","video_data":[row("123","超出总预算","1")]}));
    assert!(
        parse_discovery(&serde_json::to_vec(&json!({"code":0,"data":cells})).unwrap())
            .unwrap()
            .boards
            .is_empty()
    );
    for (url, accepted) in [
        ("https://p.example.byteimg.com/image.jpg", true),
        ("https://p.fqnovelpic.com/image.jpg", true),
        ("https://byteimg.com/image.jpg", false),
        ("https://evilbyteimg.com/image.jpg", false),
        ("https://p.byteimg.com.evil.invalid/image.jpg", false),
        ("http://p.byteimg.com/image.jpg", false),
        ("https://secret@p.byteimg.com/image.jpg", false),
        ("https://p.byteimg.com:444/image.jpg", false),
    ] {
        let value = json!({"code":0,"data":[{"cell_name":"短剧热搜榜","video_data":[{"series_id":"123","title":"封面","cover":url}]}]});
        let data = parse_discovery(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(
            !data.boards[0].items[0].drama.cover.is_empty(),
            accepted,
            "{url}"
        );
    }
}
