use super::*;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{Notify, Semaphore},
    task::JoinSet,
};

#[derive(Clone, Copy)]
enum Mode {
    Good,
    BadTabMedia,
    Denied,
    MediaDenied,
    EmptyTab,
    StallTab,
    GateMedia,
}
struct Fixture {
    service: PlaybackService,
    path: PathBuf,
    task: tokio::task::JoinHandle<()>,
    models: Arc<AtomicUsize>,
    reads: Arc<AtomicUsize>,
    gate: Arc<Semaphore>,
    started: Arc<Notify>,
    disconnected: Arc<Notify>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.service.close();
        self.task.abort();
        let _ = std::fs::remove_dir_all(&self.path);
    }
}
fn bytes() -> Vec<u8> {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../../contracts/fixtures/playback/media.json"
    ))
    .unwrap();
    fixture["hex"]
        .as_str()
        .unwrap()
        .as_bytes()
        .chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).unwrap())
        .collect()
}
fn selection(vid: &str) -> PlaybackRequest {
    PlaybackRequest::new("11", vid, "1004", "", "default").unwrap()
}
impl Fixture {
    async fn new(mode: Mode) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}/", listener.local_addr().unwrap());
        let path = std::env::temp_dir().join(format!(
            "hongguo-resolution-{}-{}",
            std::process::id(),
            super::super::protocol::uuid().unwrap()
        ));
        let models = Arc::new(AtomicUsize::new(0));
        let reads = Arc::new(AtomicUsize::new(0));
        let gate = Arc::new(Semaphore::new(0));
        let started = Arc::new(Notify::new());
        let disconnected = Arc::new(Notify::new());
        let (mc, rc, g, s, d) = (
            models.clone(),
            reads.clone(),
            gate.clone(),
            started.clone(),
            disconnected.clone(),
        );
        let task = tokio::spawn(async move {
            let mut tasks = JoinSet::new();
            loop {
                tokio::select! {
                    socket=listener.accept()=>{
                        let(mut socket,_)=socket.unwrap();let(mc,rc,g,s,d)=(mc.clone(),rc.clone(),g.clone(),s.clone(),d.clone());
                        tasks.spawn(async move{
                            let mut request=Vec::new();let mut b=[0];
                            while !request.ends_with(b"\r\n\r\n")&&request.len()<32768{if socket.read(&mut b).await.unwrap_or(0)==0{return}request.push(b[0]);}
                            let head=String::from_utf8_lossy(&request).to_string();let lower=head.to_ascii_lowercase();
                            let content_length=lower.lines().find_map(|l|l.strip_prefix("content-length: ")?.parse::<usize>().ok()).unwrap_or(0);let mut body=vec![0;content_length];let _=socket.read_exact(&mut body).await;
                            let path=head.split_whitespace().nth(1).unwrap_or("");let register=path.starts_with("/service/");let media=path.starts_with("/good")||path.starts_with("/bad");let tab=path.starts_with("/reading/");
                            let(status,body)=if register{(200,br#"{"device_id_str":"111","install_id_str":"222"}"#.to_vec())}else if media {
                                rc.fetch_add(1,Ordering::SeqCst);
                                if matches!(mode,Mode::GateMedia){s.notify_one();tokio::select!{permit=g.acquire()=>{permit.unwrap().forget();},_=socket.read(&mut b)=>{d.notify_one();return}}}
                                if matches!(mode,Mode::MediaDenied){(403,b"signed secret".to_vec())}else{(200,if path.starts_with("/bad"){b"not MP4".to_vec()}else{bytes()})}
                            }else{
                                mc.fetch_add(1,Ordering::SeqCst);
                                if tab&&matches!(mode,Mode::StallTab){s.notify_one();let _=socket.read(&mut b).await;d.notify_one();return;}
                                let vid=if tab {reqwest::Url::parse(&format!("http://127.0.0.1{path}")).unwrap().query_pairs().find(|(k,_)|k=="video_id").unwrap().1.to_string()}else{let payload:Value=serde_json::from_slice(&body).unwrap();payload["mixed_video_id_map"]["1004"][0].as_str().or(payload["video_id"].as_str()).unwrap().into()};
                                let model=if matches!(mode,Mode::Denied){json!({"code":403,"error":"signed secret"})}else{json!({"data":{"video_model":{"vid":vid,"video_list":[{"codec_type":"hevc","vheight":720,"main_url":if tab&&matches!(mode,Mode::BadTabMedia){"https://media.example.invalid/bad"}else{"https://media.example.invalid/good"}}]}}})};
                                (200,if tab&&matches!(mode,Mode::EmptyTab){Vec::new()}else{serde_json::to_vec(&model).unwrap()})
                            };
                            let header=format!("HTTP/1.1 {status} Test\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",body.len());let _=socket.write_all(header.as_bytes()).await;let _=socket.write_all(&body).await;
                        });
                    }
                    _=tasks.join_next(),if !tasks.is_empty()=>{}
                }
            }
        });
        let service = PlaybackService::with_services(
            PlaybackClient::for_loopback_tests(&origin).unwrap(),
            MediaStore::for_loopback_tests(&path, &origin).unwrap(),
        );
        Self {
            service,
            path,
            task,
            models,
            reads,
            gate,
            started,
            disconnected,
        }
    }
}
#[tokio::test]
async fn model_is_accepted_only_after_media_is_ready_and_empty_tab_recovery_is_bounded() {
    for mode in [Mode::Good, Mode::BadTabMedia, Mode::EmptyTab] {
        let f = Fixture::new(mode).await;
        let info = f.service.resolve(&selection("22")).await.unwrap();
        assert_eq!(info.vid, "22");
        assert_eq!(info.quality, "720P");
        assert_eq!(info.qualities, ["720P"]);
        assert!(info.path.starts_with("/minireel-proxy/media/"));
        assert!(!format!("{info:?}").contains("secret"));
        let token = info.path.rsplit('/').next().unwrap();
        let lease = f.service.lease(token).unwrap();
        assert_eq!(lease.chunk(0, 15).await.unwrap(), bytes()[..16]);
        assert_eq!(
            f.models.load(Ordering::SeqCst),
            if matches!(mode, Mode::Good) {
                1
            } else if matches!(mode, Mode::EmptyTab) {
                3
            } else {
                2
            }
        );
    }
}
#[tokio::test]
async fn explicit_model_and_media_denials_stop_every_fallback() {
    for mode in [Mode::Denied, Mode::MediaDenied] {
        let f = Fixture::new(mode).await;
        assert_eq!(
            f.service.resolve(&selection("22")).await.err(),
            Some(PlaybackError::AccessDenied)
        );
        assert_eq!(f.models.load(Ordering::SeqCst), 1);
        assert_eq!(
            f.reads.load(Ordering::SeqCst),
            usize::from(matches!(mode, Mode::MediaDenied))
        );
    }
}
#[tokio::test]
async fn shared_preparation_has_independent_handles_and_canceling_one_owner_keeps_the_other() {
    let f = Fixture::new(Mode::GateMedia).await;
    let mut tasks = Vec::new();
    for _ in 0..3 {
        let service = f.service.clone();
        tasks.push(tokio::spawn(async move {
            service.resolve(&selection("22")).await
        }));
    }
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    assert_eq!(f.models.load(Ordering::SeqCst), 1);
    let canceled = tasks.pop().unwrap();
    canceled.abort();
    let _ = canceled.await;
    f.gate.add_permits(2);
    let first = tasks.remove(0).await.unwrap().unwrap();
    let second = tasks.remove(0).await.unwrap().unwrap();
    assert_ne!(first.path, second.path);
    assert_eq!(f.reads.load(Ordering::SeqCst), 2);
    f.service
        .release(first.path.rsplit('/').next().unwrap())
        .unwrap();
    f.service
        .release(first.path.rsplit('/').next().unwrap())
        .unwrap();
    assert!(
        f.service
            .lease(second.path.rsplit('/').next().unwrap())
            .is_ok()
    );
}
#[tokio::test]
async fn last_owner_cancels_owned_io_and_a_new_revision_cannot_receive_the_old_result() {
    let f = Fixture::new(Mode::GateMedia).await;
    let service = f.service.clone();
    let old = tokio::spawn(async move { service.resolve(&selection("22")).await });
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    old.abort();
    let _ = old.await;
    timeout(Duration::from_secs(2), f.disconnected.notified())
        .await
        .unwrap();
    assert!(f.service.inner.jobs.lock().unwrap().pending.is_empty());
    let service = f.service.clone();
    let new = tokio::spawn(async move { service.resolve(&selection("23")).await });
    timeout(Duration::from_secs(2), f.started.notified())
        .await
        .unwrap();
    f.gate.add_permits(2);
    assert_eq!(new.await.unwrap().unwrap().vid, "23");
    assert_eq!(f.models.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn close_cancels_jobs_and_job_capacity_is_bounded() {
    let f = Fixture::new(Mode::GateMedia).await;
    let mut tasks = Vec::new();
    for vid in ["22", "23"] {
        let service = f.service.clone();
        tasks.push(tokio::spawn(async move {
            service.resolve(&selection(vid)).await
        }));
        timeout(Duration::from_secs(2), f.started.notified())
            .await
            .unwrap();
    }
    assert_eq!(
        f.service.resolve(&selection("24")).await.err(),
        Some(PlaybackError::Capacity)
    );
    f.service.close();
    for task in tasks {
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .err(),
            Some(PlaybackError::Expired)
        );
    }
    assert_eq!(
        f.service.resolve(&selection("22")).await.err(),
        Some(PlaybackError::Expired)
    );
}
#[tokio::test]
async fn a_stalled_family_leaves_a_budget_for_a_usable_later_family() {
    let f = Fixture::new(Mode::StallTab).await;
    let started = Instant::now();
    let info = timeout(Duration::from_secs(12), f.service.resolve(&selection("22")))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(info.vid, "22");
    assert!(started.elapsed() >= Duration::from_secs(7));
    assert_eq!(f.models.load(Ordering::SeqCst), 2);
}
