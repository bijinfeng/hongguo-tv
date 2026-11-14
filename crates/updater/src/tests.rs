use super::*;
use ring::signature::{Ed25519KeyPair, KeyPair};

fn signed(mut change: impl FnMut(&mut serde_json::Value)) -> (Vec<u8>, String, Trust) {
    let key = Ed25519KeyPair::from_seed_unchecked(&[7; 32]).unwrap();
    let mut value = serde_json::json!({
        "schemaVersion": 1, "channel": "stable", "id": "dev.hongguo.tv", "version": "1.2.3",
        "platforms": { "android": { "url": format!("{PREFIX}v1.2.3/hongguo-tv-1.2.3-android-arm64.apk"),
            "sha256": "a".repeat(64), "size": 100, "versionCode": 2,
            "packageName": "dev.hongguo.tv", "minSdk": 26, "abis": ["arm64-v8a"],
            "signingCertificateSha256": trust().signing_certificate_sha256 } }
    });
    change(&mut value);
    let bytes = serde_json::to_vec(&value).unwrap();
    let mut message = DOMAIN.to_vec();
    message.extend_from_slice(&bytes);
    let sig = STANDARD.encode(key.sign(&message).as_ref());
    let policy = Trust {
        public_key: STANDARD.encode(key.public_key().as_ref()),
        ..trust()
    };
    (bytes, sig, policy)
}
#[test]
fn accepts_domain_separated_exact_bytes_and_rejects_tampering() {
    let (mut bytes, sig, policy) = signed(|_| {});
    assert_eq!(
        verify_with(&bytes, &format!("{sig}\n"), &policy)
            .unwrap()
            .platforms
            .android
            .version_code,
        2
    );
    bytes.push(b' ');
    assert!(verify_with(&bytes, &sig, &policy).is_err());
    let (bytes, sig, _) = signed(|_| {});
    assert!(verify(&bytes, &sig).is_err()); // Test key is not a production trust root.
    assert!(verify_with(&bytes, "invalid", &policy).is_err());
    let key = Ed25519KeyPair::from_seed_unchecked(&[7; 32]).unwrap();
    assert!(verify_with(&bytes, &STANDARD.encode(key.sign(&bytes).as_ref()), &policy).is_err());
}
#[test]
fn signed_but_wrong_identity_or_unsafe_artifact_is_rejected() {
    for (field, bad) in [
        ("url", serde_json::json!("http://github.com/evil.apk")),
        (
            "url",
            serde_json::json!(format!("{PREFIX}v9/hongguo-tv-1.2.3-android-arm64.apk")),
        ),
        ("packageName", serde_json::json!("other.app")),
        ("sha256", serde_json::json!("A".repeat(64))),
        ("size", serde_json::json!(MAX_APK + 1)),
        ("size", serde_json::json!(0)),
        ("versionCode", serde_json::json!(0)),
        ("minSdk", serde_json::json!(27)),
        ("abis", serde_json::json!(["x86_64"])),
        (
            "signingCertificateSha256",
            serde_json::json!("b".repeat(64)),
        ),
    ] {
        let (bytes, sig, policy) =
            signed(|value| value["platforms"]["android"][field] = bad.clone());
        assert!(verify_with(&bytes, &sig, &policy).is_err(), "{field}");
    }
    for version in [
        "1.2.3/other",
        "01.2.3",
        "1.2.3-beta",
        "1.2",
        "999999999999.1.1",
    ] {
        let (bytes, sig, policy) = signed(|v| v["version"] = version.into());
        assert!(verify_with(&bytes, &sig, &policy).is_err());
    }
    for (field, bad) in [("channel", "beta"), ("id", "other.app")] {
        let (bytes, sig, policy) = signed(|v| v[field] = bad.into());
        assert!(verify_with(&bytes, &sig, &policy).is_err());
    }
}
#[test]
fn bounded_file_verification_and_cleanup_preserve_other_data() {
    let dir = std::env::temp_dir().join(format!("hongguo-updater-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let file = dir.join("update.apk");
    fs::write(&file, b"signed apk bytes").unwrap();
    fs::write(dir.join("guest.sqlite3"), b"history").unwrap();
    let (bytes, sig, policy) = signed(|v| {
        v["platforms"]["android"]["size"] = 16.into();
        v["platforms"]["android"]["sha256"] =
            hex(digest::digest(&digest::SHA256, b"signed apk bytes").as_ref()).into();
    });
    let manifest = verify_with(&bytes, &sig, &policy).unwrap();
    verify_file(&file, &manifest.platforms.android).unwrap();
    fs::write(&file, b"tampered apk byt").unwrap();
    assert!(verify_file(&file, &manifest.platforms.android).is_err());
    fs::write(dir.join("candidate.json"), b"not a manifest").unwrap();
    assert!(Candidate::restore(&dir, 1).is_err());
    clear(&dir).unwrap();
    assert!(!file.exists());
    assert_eq!(fs::read(dir.join("guest.sqlite3")).unwrap(), b"history");
    fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn streamed_bytes_restore_after_restart_and_invalid_partial_never_becomes_installable() {
    use std::net::TcpListener;
    let _ = rustls::crypto::ring::default_provider().install_default();
    let (bytes, sig, policy) = signed(|v| {
        v["platforms"]["android"]["size"] = 16.into();
        v["platforms"]["android"]["sha256"] =
            hex(digest::digest(&digest::SHA256, b"signed apk bytes").as_ref()).into();
    });
    let candidate = Candidate {
        manifest: verify_with(&bytes, &sig, &policy).unwrap(),
        cached: Arc::new(Cached {
            manifest: String::from_utf8(bytes).unwrap(),
            signature: sig,
        }),
    };
    let dir = std::env::temp_dir().join(format!("hongguo-updater-stream-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let cancelled = AtomicBool::new(false);
    let progress = AtomicU64::new(0);
    for (body, length, cancel, valid) in [
        ("signed apk bytes", 16, false, true),
        ("bad bytes.......", 16, false, false),
        ("signed apk bytes", 17, false, false),
        ("signed apk bytes", 16, true, false),
    ] {
        clear(&dir).unwrap();
        cancelled.store(cancel, Ordering::Release);
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let serving = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let mut request = [0; 4096];
            assert!(socket.read(&mut request).unwrap() > 0);
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}"
            )
            .unwrap();
        });
        // Only this private response seam accepts a local fixture; production URLs stay fixed HTTPS.
        let response = reqwest::Client::new()
            .get(format!("http://{address}/apk"))
            .send()
            .await
            .unwrap();
        let result = candidate
            .write_response(
                response,
                &dir,
                &dir.join("update.part"),
                &cancelled,
                &progress,
            )
            .await;
        serving.join().unwrap();
        assert_eq!(result.is_ok(), valid);
        if valid {
            assert_eq!(progress.load(Ordering::Relaxed), 16);
            assert!(Candidate::restore_with(&dir, 1, &policy).unwrap().is_some());
            assert!(Candidate::restore_with(&dir, 2, &policy).unwrap().is_none());
            assert!(!dir.join("update.apk").exists());
        } else {
            assert!(!dir.join("candidate.json").exists());
            assert!(!dir.join("update.apk").exists());
            assert!(Candidate::restore_with(&dir, 1, &policy).unwrap().is_none());
            assert!(!dir.join("update.part").exists());
        }
    }
    fs::remove_dir_all(dir).unwrap();
}
