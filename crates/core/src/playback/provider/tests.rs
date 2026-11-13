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

struct Server {
    origin: String,
    requests: mpsc::UnboundedReceiver<Vec<u8>>,
    count: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(model: &[u8], status: u16, extra: &str, stall: bool) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (model, extra) = (
        String::from_utf8_lossy(model)
            .replace("{{origin}}", &origin)
            .into_bytes(),
        extra.to_string(),
    );
    let fallback = serde_json::from_slice::<serde_json::Value>(&model)
        .ok()
        .and_then(|v| v.get("fixture_fallback").cloned())
        .map(|v| serde_json::to_vec(&v).unwrap());
    let (tx, requests) = mpsc::unbounded_channel();
    let count = Arc::new(AtomicUsize::new(0));
    let captured = count.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut byte = [0];
            while !request.ends_with(b"\r\n\r\n") && request.len() < 16384 {
                if socket.read(&mut byte).await.unwrap_or(0) == 0 {
                    break;
                }
                request.push(byte[0]);
            }
            let head = String::from_utf8_lossy(&request);
            let length = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|s| s.parse::<usize>().ok())
                })
                .unwrap_or(0);
            let registration = head.starts_with("POST /service/2/device_register/");
            let fallback_request = head.starts_with("GET /fallback?");
            let offset = request.len();
            request.resize(offset + length, 0);
            let _ = socket.read_exact(&mut request[offset..]).await;
            captured.fetch_add(1, Ordering::SeqCst);
            tx.send(request).unwrap();
            if stall && !registration {
                let mut b = [0];
                let _ = socket.read(&mut b).await;
                continue;
            }
            let body = if registration {
                br#"{"device_id_str":"111","install_id_str":"222"}"#.as_slice()
            } else if fallback_request {
                fallback.as_deref().unwrap_or(&model)
            } else {
                model.as_slice()
            };
            let header = format!(
                "HTTP/1.1 {} Test\r\nConnection: close\r\nContent-Length: {}\r\n{}\r\n",
                if registration { 200 } else { status },
                body.len(),
                if registration { "" } else { &extra }
            );
            let _ = socket.write_all(header.as_bytes()).await;
            let _ = socket.write_all(body).await;
        }
    });
    Server {
        origin,
        requests,
        count,
        task,
    }
}

#[tokio::test]
async fn fallback_keeps_identity_signed_query_bytes_and_finite_codec_attempts() {
    let video = json!({"video_id":query().vid(),"video_duration":91,"video_list":[{"codec_type":"h264","main_url":"https://media.example.invalid/v","vheight":1080}]});
    let mut envelope = json!({"code":0,"data":{"video_model":{"video_id":query().vid(),"video_duration":91,"video_list":[],"fallback_api":"{{origin}}/fallback?sig=a%2Bb&sig=c&codec_type=2"}},"fixture_fallback":{"Code":0,"video_info":{"data":video}}});
    let mut server = server(&serde_json::to_vec(&envelope).unwrap(), 200, "", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(
        client
            .candidates(&query(), PlaybackSource::VideoTab)
            .await
            .is_ok()
    );
    for _ in 0..2 {
        server.requests.recv().await.unwrap();
    }
    assert!(
        parts(&server.requests.recv().await.unwrap())
            .0
            .starts_with("GET /fallback?sig=a%2Bb&sig=c&codec_type=2 HTTP/1.1")
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 3);

    envelope["fixture_fallback"]["video_info"]["data"]["video_id"] = json!("different");
    let server =
        super::tests::server(&serde_json::to_vec(&envelope).unwrap(), 200, "", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(matches!(
        client.candidates(&query(), PlaybackSource::VideoTab).await,
        Err(PlaybackError::IdentityMismatch)
    ));
    assert_eq!(server.count.load(Ordering::SeqCst), 3);

    envelope["fixture_fallback"]["video_info"]["data"]["video_id"] = json!(query().vid());
    envelope["fixture_fallback"]["video_info"]["data"]["video_list"][0]["codec_type"] =
        json!("bytevc2");
    let mut server =
        super::tests::server(&serde_json::to_vec(&envelope).unwrap(), 200, "", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(matches!(
        client.candidates(&query(), PlaybackSource::VideoTab).await,
        Err(PlaybackError::UnsupportedMedia)
    ));
    let mut fallback_requests = Vec::new();
    for _ in 0..6 {
        let bytes = server.requests.recv().await.unwrap();
        let (head, _) = parts(&bytes);
        if head.starts_with("GET /fallback?") {
            fallback_requests.push(head);
        }
    }
    assert_eq!(fallback_requests.len(), 4);
    assert!(
        fallback_requests[1].starts_with("GET /fallback?sig=a%2Bb&sig=c&codec_type=1 HTTP/1.1")
    );
    assert!(
        fallback_requests[2]
            .starts_with("GET /fallback?sig=a%2Bb&sig=c&codec_type=0&force_codec=h264 HTTP/1.1")
    );
}

#[tokio::test]
async fn fallback_fixture_never_contacts_an_external_or_untrusted_address() {
    for target in [
        "https://api.fqnovel.com/fallback",
        "http://192.168.1.1/fallback",
        "file:///tmp/secret",
        "https://fqnovel.com.evil.invalid/fallback",
    ] {
        let envelope = json!({"code":0,"data":{"video_model":{"video_id":query().vid(),"video_list":[],"fallback_api":target}}});
        let server = server(&serde_json::to_vec(&envelope).unwrap(), 200, "", false).await;
        let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
        assert!(matches!(
            client.candidates(&query(), PlaybackSource::VideoTab).await,
            Err(PlaybackError::InvalidModel)
        ));
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    }
}
fn query() -> PlaybackRequest {
    PlaybackRequest::new("1", "90071992547409931234", "1004", "1080P", "default").unwrap()
}
fn parts(bytes: &[u8]) -> (String, &[u8]) {
    let n = bytes.windows(4).position(|s| s == b"\r\n\r\n").unwrap() + 4;
    (String::from_utf8(bytes[..n].to_vec()).unwrap(), &bytes[n..])
}

#[tokio::test]
async fn every_fixed_provider_emits_its_own_profile_and_exact_episode_bytes() {
    for source in [
        PlaybackSource::VideoTab,
        PlaybackSource::RegisteredLegacy,
        PlaybackSource::RegisteredLegacyAlternate,
        PlaybackSource::RegisteredSingle,
        PlaybackSource::LegacySingle,
    ] {
        let mut server = server(
            include_bytes!("../../../../../contracts/fixtures/playback/legacy-model.json"),
            200,
            "",
            false,
        )
        .await;
        let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
        let model = client.candidates(&query(), source).await.unwrap();
        assert_eq!(model.select(&query()).unwrap().quality(), "1080P");
        let register = server.requests.recv().await.unwrap();
        let (head, body) = parts(&register);
        assert!(!head.to_ascii_lowercase().contains("cookie:"));
        let payload = if source == PlaybackSource::RegisteredSingle {
            body.to_vec()
        } else {
            super::super::protocol::decrypt_device(body).unwrap()
        };
        let payload: serde_json::Value = serde_json::from_slice(&payload).unwrap();
        assert_eq!(
            payload["header"]["version_code"],
            if source == PlaybackSource::LegacySingle {
                73932
            } else {
                73532
            }
        );
        let request = server.requests.recv().await.unwrap();
        let (head, body) = parts(&request);
        let lower = head.to_ascii_lowercase();
        assert!(head.contains("device_id=111"));
        assert!(head.contains("iid=222"));
        assert!(!lower.contains("x-medusa"));
        assert!(!lower.contains("account"));
        if source == PlaybackSource::VideoTab {
            assert!(head.starts_with("GET /reading/bookapi/video_tab/multi_video_model/v1/"));
            assert!(head.contains("video_id=90071992547409931234"));
            assert!(body.is_empty());
            assert!(!lower.contains("x-argus:"));
        } else {
            assert!(lower.contains("x-argus:"));
            assert!(lower.contains("x-ladon:"));
            assert!(lower.contains("x-gorgon:"));
            assert!(!lower.contains("content-encoding: gzip"));
            let actual: serde_json::Value = serde_json::from_slice(body).unwrap();
            if matches!(
                source,
                PlaybackSource::RegisteredLegacy | PlaybackSource::RegisteredLegacyAlternate
            ) {
                assert_eq!(
                    actual,
                    json!({"biz_param":{"detail_page_version":0,"device_level":3,"disable_digg_stat":false,"need_all_video_definition":true,"need_mp4_align":false,"use_os_player":false,"use_server_dns":false,"video_platform":1024},"mixed_video_id_map":{"1004":[query().vid()]}})
                );
                assert!(head.contains("version_code=71332"));
            } else {
                assert_eq!(actual["video_id"], query().vid());
                assert_eq!(actual["biz_param"]["video_platform"], 3);
                assert_eq!(
                    actual.get("content_type").is_some(),
                    source == PlaybackSource::RegisteredSingle
                );
                assert!(head.starts_with("POST /novel/player/video_model/v1/"));
            }
        }
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
    }
}

#[tokio::test]
async fn model_failures_are_sanitized_and_never_escape_fixture_origin() {
    for (body, status, extra, expected) in [
        (
            b"sensitive signed body".as_slice(),
            403,
            "",
            PlaybackError::AccessDenied,
        ),
        (
            br#"{"code":403,"message":"signed secret"}"#,
            200,
            "",
            PlaybackError::AccessDenied,
        ),
        (
            b"",
            302,
            "Location: https://public.example.invalid/secret\r\n",
            PlaybackError::Transport,
        ),
        (b"{", 200, "", PlaybackError::InvalidModel),
        (
            include_bytes!("../../../../../contracts/fixtures/playback/identity-mismatch.json")
                .as_slice(),
            200,
            "",
            PlaybackError::IdentityMismatch,
        ),
        (
            br#"{"code":0,"data":{}}"#,
            200,
            "",
            PlaybackError::EmptySource,
        ),
    ] {
        let server = server(body, status, extra, false).await;
        let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
        let result = client.candidates(&query(), PlaybackSource::VideoTab).await;
        assert!(matches!(result,Err(e)if e==expected));
        assert_eq!(server.count.load(Ordering::SeqCst), 2);
        assert!(!expected.to_string().contains("secret"));
    }
}

#[tokio::test]
async fn actual_empty_body_refreshes_once_and_fails_under_cooldown() {
    let server = server(b"", 200, "", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(matches!(
        client.candidates(&query(), PlaybackSource::VideoTab).await,
        Err(PlaybackError::EmptyResponse)
    ));
    assert_eq!(server.count.load(Ordering::SeqCst), 4);
    assert!(
        client
            .candidates(&query(), PlaybackSource::VideoTab)
            .await
            .is_err()
    );
    assert_eq!(server.count.load(Ordering::SeqCst), 5);
}

#[tokio::test]
async fn oversized_and_stalled_models_fail_without_raw_transport_details() {
    let server = server(&vec![b'x'; 4 * 1024 * 1024 + 1], 200, "", false).await;
    let client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    assert!(
        client
            .candidates(&query(), PlaybackSource::VideoTab)
            .await
            .is_err()
    );
    let mut server = super::tests::server(b"", 200, "", true).await;
    let mut client = PlaybackClient::for_loopback_tests(&server.origin).unwrap();
    client.http = ClientBuilder::new()
        .timeout(Duration::from_millis(100))
        .build()
        .unwrap();
    assert!(matches!(
        client.candidates(&query(), PlaybackSource::VideoTab).await,
        Err(PlaybackError::Timeout)
    ));
    assert_eq!(server.count.load(Ordering::SeqCst), 2);
    let _ = server.requests.try_recv();
}
use reqwest::ClientBuilder;
