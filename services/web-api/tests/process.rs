//! Validate the actual binary, readiness contract, loopback transport and termination.
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};

struct Server(Child);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn invalid_configuration_never_starts_a_listener() {
    for args in [
        vec!["--port", "invalid"],
        vec!["--port"],
        vec!["--allow-origin", "https://evil.test"],
        vec!["--unknown"],
        vec!["--data-dir"],
        vec!["--data-dir", ""],
        vec![],
    ] {
        let result = Command::new(env!("CARGO_BIN_EXE_hongguo-web-api"))
            .args(args)
            .output()
            .unwrap();
        assert!(!result.status.success());
        assert!(result.stdout.is_empty());
    }
}

#[test]
fn binary_serves_real_loopback_requests_and_exits() {
    let temp = Temp::new();
    let child = Command::new(env!("CARGO_BIN_EXE_hongguo-web-api"))
        .args(["--port", "0", "--data-dir"])
        .arg(&temp.0)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut server = Server(child);
    let stdout = server.0.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
        let _ = tx.send(result);
    });
    let ready: serde_json::Value =
        serde_json::from_str(&rx.recv_timeout(Duration::from_secs(5)).unwrap().unwrap()).unwrap();
    assert_eq!(ready["event"], "ready");
    let address = ready["origin"]
        .as_str()
        .unwrap()
        .strip_prefix("http://")
        .unwrap();
    assert!(address.starts_with("127.0.0.1:"));
    for (path, expected) in [
        ("/healthz", "200 OK"),
        ("/api/v1/status", "200 OK"),
        ("/api/v1/play/info", "501 Not Implemented"),
    ] {
        let mut socket = TcpStream::connect(address).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        write!(
            socket,
            "GET {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        assert!(
            response.starts_with(&format!("HTTP/1.1 {expected}")),
            "{response}"
        );
    }
    #[cfg(unix)]
    {
        assert!(
            Command::new("kill")
                .args(["-TERM", &server.0.id().to_string()])
                .status()
                .unwrap()
                .success()
        );
        for _ in 0..100 {
            if let Some(status) = server.0.try_wait().unwrap() {
                assert!(status.success());
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("graceful shutdown timed out");
    }
    #[cfg(not(unix))]
    {
        server.0.kill().unwrap();
        server.0.wait().unwrap();
    }
}

struct Temp(std::path::PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-history-process-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn start(temp: &Temp) -> (Server, String) {
    let child = Command::new(env!("CARGO_BIN_EXE_hongguo-web-api"))
        .arg("--data-dir")
        .arg(&temp.0)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut server = Server(child);
    let stdout = server.0.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = tx.send(BufReader::new(stdout).read_line(&mut line).map(|_| line));
    });
    let event: serde_json::Value =
        serde_json::from_str(&rx.recv_timeout(Duration::from_secs(5)).unwrap().unwrap()).unwrap();
    let address = event["origin"]
        .as_str()
        .unwrap()
        .strip_prefix("http://")
        .unwrap()
        .to_owned();
    (server, address)
}
fn http(address: &str, method: &str, path: &str, body: &str) -> serde_json::Value {
    let mut socket = TcpStream::connect(address).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(socket,"{method} {path} HTTP/1.1\r\nHost: {address}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
    let mut response = String::new();
    socket.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    serde_json::from_str(response.split_once("\r\n\r\n").unwrap().1).unwrap()
}
#[test]
fn guest_history_survives_real_process_restart() {
    let temp = Temp::new();
    let (server, address) = start(&temp);
    assert_eq!(
        http(&address, "GET", "/api/v1/library", "")["data"]["entries"],
        serde_json::json!([])
    );
    let payload = serde_json::json!({"action":"progress","drama":{"series_id":"1234567890123456789","title":"离线样本","cover":"","intro":""},"episode":3,"video_id":"999","position":30.5,"duration":60,"completed":true});
    let saved = http(&address, "POST", "/api/v1/library", &payload.to_string());
    drop(server);
    let (_server, address) = start(&temp);
    assert_eq!(http(&address, "GET", "/api/v1/library", ""), saved);
    assert_eq!(saved["data"]["entries"][0]["completed"], true);
}
#[test]
fn storage_failure_never_publishes_ready_or_overwrites_corrupt_data() {
    let temp = Temp::new();
    let path = temp.0.join("guest.sqlite3");
    std::fs::write(&path, b"private corrupt database").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_hongguo-web-api"))
        .arg("--data-dir")
        .arg(&temp.0)
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert_eq!(std::fs::read(path).unwrap(), b"private corrupt database");
    assert!(!String::from_utf8_lossy(&output.stderr).contains("private corrupt"));
}
