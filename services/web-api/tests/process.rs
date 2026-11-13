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
    let child = Command::new(env!("CARGO_BIN_EXE_hongguo-web-api"))
        .args(["--port", "0"])
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
        ("/api/v1/search?q=test", "501 Not Implemented"),
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
