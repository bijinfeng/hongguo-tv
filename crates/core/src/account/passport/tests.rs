use super::*;
use base64::{Engine, engine::general_purpose};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

/// Fake credentials for core owner/lifetime regressions, never a live-login acceptance fixture.
pub(crate) fn verified_fixture(uid: &str) -> VerifiedSession {
    assert!(valid_id(uid));
    let mut credential = PersistedSession::fresh().unwrap();
    credential.device_id = "7390000000000000001".into();
    credential.install_id = "7390000000000000002".into();
    credential.registered = true;
    credential.uid = Some(uid.into());
    credential
        .cookies
        .insert("sessionid".into(), "synthetic-core-owner-test-only".into());
    VerifiedSession {
        uid: uid.into(),
        name: "Synthetic account".into(),
        credential,
    }
}

struct Request {
    path: String,
    query: BTreeMap<String, String>,
    headers: BTreeMap<String, String>,
    body: Vec<u8>,
}
struct Response {
    status: u16,
    headers: Vec<(&'static str, String)>,
    body: Vec<u8>,
}
impl Response {
    fn json(value: Value) -> Self {
        Self {
            status: 200,
            headers: Vec::new(),
            body: value.to_string().into_bytes(),
        }
    }
    fn cookie(mut self, value: &str) -> Self {
        self.headers.push(("Set-Cookie", value.into()));
        self
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
                let handler = handler.clone();
                let recorded = recorded.clone();
                tokio::spawn(async move {
                    let mut bytes = Vec::new();
                    let mut buf = [0u8; 4096];
                    let end = loop {
                        let n = stream.read(&mut buf).await.unwrap();
                        assert!(n > 0);
                        bytes.extend_from_slice(&buf[..n]);
                        assert!(bytes.len() < 512 * 1024);
                        if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                            break end + 4;
                        }
                    };
                    let head = std::str::from_utf8(&bytes[..end]).unwrap();
                    let mut lines = head.split("\r\n");
                    let target = lines
                        .next()
                        .unwrap()
                        .split_ascii_whitespace()
                        .nth(1)
                        .unwrap();
                    let url =
                        reqwest::Url::parse(&format!("http://fixture.invalid{target}")).unwrap();
                    let headers: BTreeMap<String, String> = lines
                        .filter_map(|s| s.split_once(':'))
                        .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().into()))
                        .collect();
                    let size = headers
                        .get("content-length")
                        .map_or(0, |v| v.parse::<usize>().unwrap());
                    assert!(size < 4 * 1024 * 1024);
                    while bytes.len() < end + size {
                        let n = stream.read(&mut buf).await.unwrap();
                        assert!(n > 0);
                        bytes.extend_from_slice(&buf[..n]);
                    }
                    let request = Request {
                        path: url.path().into(),
                        query: url
                            .query_pairs()
                            .map(|(k, v)| (k.into_owned(), v.into_owned()))
                            .collect(),
                        headers,
                        body: bytes[end..end + size].to_vec(),
                    };
                    let response = handler(&request);
                    recorded.lock().unwrap().push(request);
                    let mut head = format!(
                        "HTTP/1.1 {} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n",
                        response.status,
                        response.body.len()
                    );
                    for (k, v) in response.headers {
                        head.push_str(&format!("{k}: {v}\r\n"));
                    }
                    head.push_str("\r\n");
                    stream.write_all(head.as_bytes()).await.unwrap();
                    stream.write_all(&response.body).await.unwrap();
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
        PassportClient::for_loopback_tests(PersistedSession::fresh().unwrap(), &self.origin)
            .unwrap()
    }
}
fn registered() -> Value {
    json!({"device_id_str":"7390000000000000001","install_id_str":"7390000000000000002"})
}
fn logged_in() -> Value {
    json!({"message":"success","data":{"user_id_str":"7390000000000000003","user_id":7390000000000000003u64,"screen_name":"Synthetic account"}})
}
fn form(request: &Request) -> BTreeMap<String, String> {
    let url = reqwest::Url::parse(&format!(
        "http://fixture.invalid/?{}",
        std::str::from_utf8(&request.body).unwrap()
    ))
    .unwrap();
    url.query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect()
}

#[test]
fn persisted_owner_validation_rejects_missing_credentials_and_wrong_owner() {
    let verified = verified_fixture("123");
    assert!(verified.credential.validate_for_uid("123").is_ok());
    assert!(verified.credential.validate_for_uid("124").is_err());
    let restored: PersistedSession =
        serde_json::from_str(&serde_json::to_string(&verified.credential).unwrap()).unwrap();
    assert!(restored.validate_for_uid("123").is_ok());
    let cleared = restored.without_credentials();
    assert!(cleared.validate().is_ok());
    assert!(!cleared.has_credentials());
    assert!(cleared.is_registered());
    assert!(cleared.validate_for_uid("123").is_err());
    let mut oversized = restored.clone();
    for index in 0..9 {
        oversized
            .cookies
            .insert(format!("bounded_{index}"), "x".repeat(16384));
    }
    assert!(oversized.validate().is_err());
    for origin in [
        "https://example.com/",
        "http://example.com/",
        "http://127.0.0.1/path",
        "http://127.0.0.1/?target=private",
        "http://user@127.0.0.1/",
    ] {
        assert!(
            PassportClient::for_loopback_tests(PersistedSession::fresh().unwrap(), origin).is_err()
        );
    }
    let failed = client::json(br#"{"message":"success"} {}"#);
    assert!(failed.is_err());
    assert!(client::login_uid(&json!({"message":"success","data":{"user_id":0}})).is_err());
    assert!(
        client::login_uid(&json!({"message":"success","data":{"user_id_str":"123","user_id":124}}))
            .is_err()
    );
    assert!(client::login_uid(&json!({"message":"error","data":{"user_id_str":"123"}})).is_err());
    assert!(matches!(
        client::login_uid(&json!({"message":"error","data":{"error_code":1105}})),
        Err(PassportError::CodeRejected)
    ));
}

#[test]
fn phone_regions_and_wire_formats_match_fixed_international_evidence() {
    let v: Value =
        serde_json::from_str(include_str!("fixtures/passport-international-v124.json")).unwrap();
    for region in v["regions"].as_array().unwrap() {
        let phone = PhoneNumber::parse(
            region["code"].as_str().unwrap(),
            region["local"].as_str().unwrap(),
        )
        .unwrap();
        assert!(phone.wire() == region["wire"].as_str().unwrap());
        assert!(!phone.masked().contains(region["local"].as_str().unwrap()));
        assert!(phone.cooldown_key().len() == 64);
        assert!(
            phone
                == PhoneNumber::parse(
                    region["code"].as_str().unwrap(),
                    region["local"].as_str().unwrap()
                )
                .unwrap()
        );
    }
    for (code, local) in [
        ("+1", "1234567890"),
        ("+86", "12800000000"),
        ("+852", "6123456"),
        ("+86", "138 00000000"),
    ] {
        assert!(PhoneNumber::parse(code, local).is_err());
    }
    // Explicit edge outputs from the fixed reference's fourteen-region table and formatter.
    for (code, min, max, shortest, longest) in [
        ("+86", 11, 11, "13800000000", "13800000000"),
        ("+852", 8, 8, "1234 5678", "1234 5678"),
        ("+853", 8, 8, "1234 5678", "1234 5678"),
        ("+886", 9, 10, "123 4567 89", "123 4567 890"),
        ("+60", 9, 10, "123 4567 89", "123 4567 890"),
        ("+65", 8, 8, "1234 5678", "1234 5678"),
        ("+62", 10, 13, "123 456 789 0", "123 456 789 012 3"),
        ("+95", 9, 10, "123 4567 89", "123 4567 890"),
        ("+63", 7, 10, "123 4567", "123 4567 890"),
        ("+84", 9, 10, "123 4567 89", "123 4567 890"),
        ("+855", 8, 9, "123 456 78", "123 456 789"),
        ("+81", 9, 11, "123 4567 89", "123 4567 8901"),
        ("+82", 8, 11, "123 4567 8", "123 4567 8901"),
        ("+971", 9, 9, "123 456 789", "123 456 789"),
    ] {
        for (len, expected) in [(min, shortest), (max, longest)] {
            let local = if code == "+86" {
                "13800000000"
            } else {
                &"1234567890123"[..len]
            };
            assert!(
                PhoneNumber::parse(code, local).unwrap().wire() == format!("{code}{expected}"),
                "wire grouping mismatch for {code} length {len}"
            );
        }
    }
}

#[test]
fn device_crypto_matches_independent_vector_and_rejects_corruption() {
    let v: Value =
        serde_json::from_str(include_str!("fixtures/passport-device-vector.json")).unwrap();
    let seed = crypto::unhex(v["seed"].as_str().unwrap());
    assert!(crypto::hex(&crypto::device_key(&seed)) == v["derived_key"].as_str().unwrap());
    let mut cipher = general_purpose::STANDARD
        .decode(v["ciphertext"].as_str().unwrap())
        .unwrap();
    let plain = crypto::decrypt_device(&cipher).unwrap();
    assert!(plain == v["plain"].as_str().unwrap().as_bytes());
    let encrypted = crypto::encrypt_device(&plain, &seed.try_into().unwrap()).unwrap();
    assert!(crypto::decrypt_device(&encrypted).unwrap() == plain);
    let end = cipher.len() - 1;
    cipher[end] ^= 1;
    assert!(crypto::decrypt_device(&cipher).is_err());
}

#[tokio::test]
async fn registration_precedes_phone_requests_and_binds_exact_identity_and_signature_mode() {
    let fixture = Fixture::new(|r| match r.path.as_str() {
        "/service/2/device_register/" => {
            assert!(!r.headers.contains_key("cookie"));
            assert!(!r.headers.contains_key("x-tt-token"));
            assert!(!r.query.contains_key("device_id"));
            assert!(!r.query.contains_key("iid"));
            let payload: Value =
                serde_json::from_slice(&crypto::decrypt_device(&r.body).unwrap()).unwrap();
            assert!(payload["header"]["cdid"].as_str() == r.query.get("cdid").map(String::as_str));
            assert!(payload["header"]["aid"] == 8662);
            assert!(!payload.to_string().contains("mobile"));
            assert!(
                r.headers.get("content-type").map(String::as_str)
                    == Some("application/octet-stream;tt-data=a")
            );
            assert!(
                r.headers
                    .get("x-ss-stub")
                    .is_some_and(|s| s == &crypto::hex(&crypto::md5(&r.body)))
            );
            Response::json(registered()).cookie("store-region=cn-tj; Path=/")
        }
        "/passport/mobile/send_code/v1/" => {
            assert!(r.query.get("device_id").map(String::as_str) == Some("7390000000000000001"));
            assert!(r.headers.get("passport-sdk-version").map(String::as_str) == Some("5051452"));
            let f = form(r);
            let international = f["mobile"]
                == crypto::hex(&b"+8526123 4567".iter().map(|b| b ^ 5).collect::<Vec<_>>());
            assert!(r.headers.contains_key("x-medusa") != international);
            assert!(r.headers.contains_key("x-argus") == international);
            assert!(
                r.headers
                    .get("x-ss-stub")
                    .is_some_and(|s| s == &crypto::hex(&crypto::md5(&r.body)).to_ascii_uppercase())
            );
            Response::json(json!({"message":"success","data":{"retry_time":120}}))
        }
        "/passport/mobile/sms_login/" => {
            Response::json(logged_in()).cookie("sessionid=synthetic-login-only; Path=/; Secure")
        }
        _ => panic!("unexpected fixture route"),
    })
    .await;
    let mut client = fixture.client();
    let phone = PhoneNumber::parse("+86", "13800000000").unwrap();
    assert!(matches!(
        client.send_code(&phone).await,
        Err(PassportError::MissingCredentials)
    ));
    assert!(fixture.requests.lock().unwrap().is_empty());
    client.register_device().await.unwrap();
    client.register_device().await.unwrap();
    let saved = client.credential();
    assert!(saved.is_registered());
    let code = client.send_code(&phone).await.unwrap();
    assert!(code.state == PhoneCodeState::Sent && code.retry_after == 120);
    client
        .send_code(&PhoneNumber::parse("+852", "61234567").unwrap())
        .await
        .unwrap();
    let PhoneLogin::Verified(verified) = client.login(&phone, "123456", None).await.unwrap() else {
        panic!("expected verified session");
    };
    assert!(verified.credential.validate_for_uid(&verified.uid).is_ok());
    assert!(
        fixture
            .requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == "/service/2/device_register/")
            .count()
            == 1
    );
}

#[tokio::test]
async fn sms_outcomes_preserve_uncertainty_rate_limits_and_rejections() {
    let fixture = Fixture::new(|r| {
        if r.path == "/service/2/device_register/" {
            return Response::json(registered());
        }
        let f = form(r);
        let mobile = f.get("mobile").unwrap();
        let status = if mobile.ends_with("35") { 429 } else { 403 };
        Response {
            status,
            headers: vec![("Retry-After", "121".into())],
            body: Vec::new(),
        }
    })
    .await;
    let mut client = fixture.client();
    client.register_device().await.unwrap();
    let rejected = client
        .send_code(&PhoneNumber::parse("+86", "13800000001").unwrap())
        .await
        .unwrap();
    assert!(rejected.state == PhoneCodeState::Rejected);
    let limited = client
        .send_code(&PhoneNumber::parse("+86", "13800000000").unwrap())
        .await
        .unwrap();
    assert!(limited.state == PhoneCodeState::Limited && limited.retry_after == 121);
}

#[tokio::test]
async fn mfa_preserves_upstream_fields_and_uses_ticket_only_for_final_login() {
    let fixture=Fixture::new(|r|match r.path.as_str() {
        "/service/2/device_register/"=>Response::json(registered()),
        "/passport/mobile/sms_login/"=>{
            let f=form(r);
            if f.contains_key("passport_mfa_retry_tag") {
                assert!(f.get("sms_code_key")==Some(&crypto::hex(&b"synthetic-ticket".iter().map(|b|b^5).collect::<Vec<_>>())));
                Response::json(logged_in()).cookie("sessionid=synthetic-mfa-only; Path=/")
            }else{
                Response::json(json!({"message":"error","data":{"error_code":2046,"encrypt_uid":"synthetic-uid","sms_code_key":"synthetic-key","event_params":{"log_id":"synthetic-log"},"verify_ways":[{"verify_way":"upsms","channel_mobile":"1060000","sms_content":"SYNTHETIC ONLY"}]}}))
            }
        },
        "/passport/upsms/verify/"=>{
            let f=form(r);assert!(f.len()==13);
            assert!(f.get("verify_reason").map(String::as_str)==Some("ato"));
            assert!(f.get("new_authn_sdk_version").map(String::as_str)==Some("1.1.31"));
            assert!(f.get("encrypt_uid").map(String::as_str)==Some("synthetic-uid"));
            let biz:Value=serde_json::from_str(&f["biz_params"]).unwrap();assert!(biz["sms_code_key"]=="synthetic-key");
            Response::json(json!({"message":"success","data":{"ticket":"synthetic-ticket"}}))
        },_=>panic!("unexpected fixture route"),
    }).await;
    let mut client = fixture.client();
    client.register_device().await.unwrap();
    let phone = PhoneNumber::parse("+86", "13800000000").unwrap();
    let PhoneLogin::Mfa(challenge) = client.login(&phone, "123456", None).await.unwrap() else {
        panic!("expected challenge");
    };
    assert!(challenge.sms_number == "1060000" && challenge.sms_content == "SYNTHETIC ONLY");
    let MfaResult::Ticket(ticket) = client.verify(&challenge, &phone).await.unwrap() else {
        panic!("expected ticket");
    };
    assert!(matches!(
        client.login(&phone, "123456", Some(&ticket)).await.unwrap(),
        PhoneLogin::Verified(_)
    ));
}

fn qr_png() -> String {
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], value: &[u8]) {
        out.extend_from_slice(&(value.len() as u32).to_be_bytes());
        out.extend_from_slice(kind);
        out.extend_from_slice(value);
        let mut crc = !0u32;
        for byte in kind.iter().chain(value) {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
            }
        }
        out.extend_from_slice(&(!crc).to_be_bytes());
    }
    use std::io::Write;
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut header = Vec::new();
    header.extend_from_slice(&32u32.to_be_bytes());
    header.extend_from_slice(&32u32.to_be_bytes());
    header.extend_from_slice(&[8, 0, 0, 0, 0]);
    chunk(&mut bytes, b"IHDR", &header);
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&vec![0; 33 * 32]).unwrap();
    chunk(&mut bytes, b"IDAT", &encoder.finish().unwrap());
    chunk(&mut bytes, b"IEND", &[]);
    general_purpose::STANDARD.encode(bytes)
}

#[tokio::test]
async fn qr_poll_redirect_and_verified_cookie_transfer_create_one_bound_session() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let polls = AtomicUsize::new(0);
    let fixture=Fixture::new(move|r|match r.path.as_str() {
        "/passport/web/get_qrcode/"=>{
            assert!(r.query.get("aid").map(String::as_str)==Some("513755"));
            assert!(!r.headers.contains_key("x-tt-token"));
            Response::json(json!({"message":"success","data":{"token":"synthetic-private-qr-only","qrcode":qr_png(),"expire_time":180}}))
                .cookie("install_id=synthetic-website-install; Path=/; Secure")
        },
        "/passport/web/check_qrconnect/"=>{
            assert!(r.query.get("token").map(String::as_str)==Some("synthetic-private-qr-only"));
            let n=polls.fetch_add(1,Ordering::SeqCst);
            Response::json(json!({"message":"success","data":{"status":if n==0 {1}else if n==1 {2}else{3},"redirect_url":"/qr-confirm"}}))
        },
        "/qr-confirm"=>Response {status:302,headers:vec![("Location","/qr-final".into()),("Set-Cookie","sessionid=synthetic-verified-qr; Domain=hongguoduanju.com; Path=/; Secure; Max-Age=300".into())],body:Vec::new()},
        "/qr-final"=>Response::json(json!({})),
        "/passport/account/info/v2/"=>{
            assert!(r.headers.get("cookie").is_some_and(|s|s.contains("sessionid=synthetic-verified-qr")));
            Response::json(logged_in())
        },
        "/service/2/device_register/"=>{
            assert!(!r.headers.contains_key("cookie"));assert!(!r.headers.contains_key("x-tt-token"));
            Response::json(registered())
        },_=>panic!("unexpected fixture route"),
    }).await;
    let mut client = fixture.client();
    let start = client.qr_start().await.unwrap();
    assert!(start.image.starts_with("data:image/png;base64,"));
    assert!((170000..=190000).contains(&start.expires_at.saturating_sub(now_millis().unwrap())));
    assert!(matches!(
        client.qr_poll(&start).await.unwrap(),
        QrPoll::Pending
    ));
    assert!(matches!(
        client.qr_poll(&start).await.unwrap(),
        QrPoll::Scanned
    ));
    let QrPoll::Confirmed(confirmed) = client.qr_poll(&start).await.unwrap() else {
        panic!("expected confirmation");
    };
    let verified = client.qr_complete(confirmed).await.unwrap();
    assert!(verified.credential.validate_for_uid(&verified.uid).is_ok());
    assert!(
        verified
            .credential
            .cookies
            .get("install_id")
            .map(String::as_str)
            == Some("7390000000000000002")
    );
    assert!(
        !serde_json::to_string(&verified.credential)
            .unwrap()
            .contains("synthetic-private-qr-only")
    );
}

#[tokio::test]
async fn qr_rejects_missing_session_invalid_identity_unsafe_redirect_and_invalid_png() {
    for scenario in [
        "missing-session",
        "invalid-identity",
        "unsafe-redirect",
        "invalid-png",
    ] {
        let fixture=Fixture::new(move|r|match r.path.as_str() {
            "/passport/web/get_qrcode/"=>Response::json(json!({"message":"success","data":{"token":"synthetic","qrcode":if scenario=="invalid-png" {"invalid".into()}else{qr_png()}}})),
            "/passport/web/check_qrconnect/"=>{
                let response=Response::json(json!({"message":"success","data":{"status":3,"redirect_url":if scenario=="unsafe-redirect" {"https://hongguoduanju.com.evil.invalid/"}else{""}}}));
                if scenario=="missing-session" {response}else{response.cookie("sessionid=synthetic; Path=/; Secure")}
            },
            "/passport/account/info/v2/"=>Response::json(json!({"message":"success","data":{"user_id_str":"0"}})),
            _=>panic!("rejected QR must not register a device"),
        }).await;
        let mut client = fixture.client();
        let start = client.qr_start().await;
        if scenario == "invalid-png" {
            assert!(start.is_err());
            continue;
        }
        let QrPoll::Confirmed(confirm) = client.qr_poll(&start.unwrap()).await.unwrap() else {
            panic!("expected confirmation");
        };
        assert!(client.qr_complete(confirm).await.is_err());
        assert!(!client.credential().has_credentials());
        assert!(
            !fixture
                .requests
                .lock()
                .unwrap()
                .iter()
                .any(|r| r.path == "/service/2/device_register/")
        );
    }
}
