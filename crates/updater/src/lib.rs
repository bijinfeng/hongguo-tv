//! Signed GitHub Releases update transport, independent of content services and UI.
use base64::{Engine, engine::general_purpose::STANDARD};
use ring::{digest, signature};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

const SOURCE: &str =
    "https://github.com/bijinfeng/hongguo-tv/releases/latest/download/tv-latest.json";
const PREFIX: &str = "https://github.com/bijinfeng/hongguo-tv/releases/download/";
const MAX_MANIFEST: u64 = 256 * 1024;
const MAX_APK: u64 = 512 * 1024 * 1024;
const DOMAIN: &[u8] = b"nsh-updater-manifest\0";

/// Verified identity and bytes of a TV update.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    /// Exact immutable download URL.
    pub url: String,
    /// Lowercase SHA-256 of the final signed APK.
    pub sha256: String,
    /// Exact APK size.
    pub size: u64,
    /// Monotonically increasing Android version code.
    pub version_code: u32,
    /// Android application ID.
    pub package_name: String,
    /// Minimum supported Android SDK.
    pub min_sdk: u32,
    /// Complete supported ABI list.
    pub abis: Vec<String>,
    /// Required APK signing certificate.
    pub signing_certificate_sha256: String,
}
/// A signature-verified stable manifest.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    schema_version: u32,
    channel: String,
    id: String,
    /// Human-readable release version.
    pub version: String,
    /// Update platforms.
    pub platforms: Platforms,
}
/// TV platform records.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Platforms {
    /// Android package record.
    pub android: Package,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trust {
    public_key: String,
    signing_certificate_sha256: String,
}
#[derive(Deserialize)]
struct Policy {
    tv: Trust,
}
#[derive(Serialize, Deserialize)]
struct Cached {
    manifest: String,
    signature: String,
}

fn trust() -> Trust {
    serde_json::from_str::<Policy>(include_str!("../../../tooling/release-policy.json"))
        .expect("checked-in release policy")
        .tv
}
fn failure() -> String {
    "更新包验证失败，请重新下载".to_owned()
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|v| format!("{v:02x}")).collect()
}

/// Verify the exact downloaded bytes before parsing or trusting any field.
pub fn verify(bytes: &[u8], sig: &str) -> Result<Manifest, String> {
    verify_with(bytes, sig, &trust())
}
fn verify_with(bytes: &[u8], sig: &str, policy: &Trust) -> Result<Manifest, String> {
    if bytes.len() as u64 > MAX_MANIFEST {
        return Err(failure());
    }
    let key = STANDARD.decode(&policy.public_key).map_err(|_| failure())?;
    let signature = STANDARD.decode(sig.trim()).map_err(|_| failure())?;
    let mut message = DOMAIN.to_vec();
    message.extend_from_slice(bytes);
    signature::UnparsedPublicKey::new(&signature::ED25519, key)
        .verify(&message, &signature)
        .map_err(|_| failure())?;
    let manifest: Manifest = serde_json::from_slice(bytes).map_err(|_| failure())?;
    let p = &manifest.platforms.android;
    let version = &manifest.version;
    let numbers: Vec<_> = version.split('.').collect();
    let stable = numbers.len() == 3
        && numbers.iter().all(|n| {
            !n.is_empty() && (n.len() == 1 || !n.starts_with('0')) && n.parse::<u32>().is_ok()
        });
    let expected = format!("{PREFIX}v{version}/hongguo-tv-{version}-android-arm64.apk");
    if manifest.schema_version != 1
        || manifest.channel != "stable"
        || !stable
        || manifest.id != "dev.hongguo.tv"
        || p.package_name != manifest.id
        || p.url != expected
        || p.version_code == 0
        || p.size == 0
        || p.size > MAX_APK
        || p.min_sdk != 26
        || p.abis != ["arm64-v8a"]
        || p.signing_certificate_sha256 != policy.signing_certificate_sha256
        || p.sha256.len() != 64
        || !p
            .sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(failure());
    }
    Ok(manifest)
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .tls_backend_preconfigured(
            rustls::ClientConfig::builder()
                .with_root_certificates(
                    webpki_roots::TLS_SERVER_ROOTS
                        .iter()
                        .cloned()
                        .collect::<rustls::RootCertStore>(),
                )
                .with_no_client_auth(),
        )
        .read_timeout(Duration::from_secs(10))
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            // GitHub asset redirects stay on its public HTTPS asset hosts.
            let url = attempt.url();
            if attempt.previous().len() >= 5
                || url.scheme() != "https"
                || url.port_or_known_default() != Some(443)
                || !url.username().is_empty()
                || url.password().is_some()
                || !matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.error("不允许的更新下载跳转")
            } else {
                attempt.follow()
            }
        }))
        .user_agent("hongguo-tv-updater/1")
        .build()
        .map_err(|_| "无法连接更新服务".to_owned())
}
async fn fetch(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let mut response = client(Duration::from_secs(30))?
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| "无法检查更新，请稍后重试".to_owned())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "更新清单下载中断".to_owned())?
    {
        if bytes.len() as u64 + chunk.len() as u64 > limit {
            return Err(failure());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
/// A checked candidate retains the original signed bytes for safe restart recovery.
#[derive(Clone)]
pub struct Candidate {
    cached: Arc<Cached>,
    manifest: Manifest,
}
impl Candidate {
    /// Fetch the public latest assets. A non-newer build never becomes a candidate.
    pub async fn check(current_build: u32) -> Result<Option<Self>, String> {
        let bytes = fetch(SOURCE, MAX_MANIFEST).await?;
        let sig = String::from_utf8(fetch(&format!("{SOURCE}.sig"), 1024).await?)
            .map_err(|_| failure())?;
        let manifest = verify(&bytes, &sig)?;
        if manifest.platforms.android.version_code <= current_build {
            return Ok(None);
        }
        Ok(Some(Self {
            manifest,
            cached: Arc::new(Cached {
                manifest: String::from_utf8(bytes).map_err(|_| failure())?,
                signature: sig,
            }),
        }))
    }
    /// Authenticated metadata for UI and the Android installer.
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }
    /// Recover only fully downloaded, still-newer, signature- and hash-verified files.
    pub fn restore(dir: &Path, current_build: u32) -> Result<Option<Self>, String> {
        Self::restore_with(dir, current_build, &trust())
    }
    fn restore_with(
        dir: &Path,
        current_build: u32,
        policy: &Trust,
    ) -> Result<Option<Self>, String> {
        let record = dir.join("candidate.json");
        if !record.exists() {
            clear(dir)?;
            return Ok(None);
        }
        if fs::metadata(&record).map_err(|_| failure())?.len() > MAX_MANIFEST * 2 {
            return Err(failure());
        }
        let bytes = fs::read(&record).map_err(|_| failure())?;
        if bytes.len() as u64 > MAX_MANIFEST * 2 {
            return Err(failure());
        }
        let cached: Cached = serde_json::from_slice(&bytes).map_err(|_| failure())?;
        let manifest = verify_with(cached.manifest.as_bytes(), &cached.signature, policy)?;
        if manifest.platforms.android.version_code <= current_build {
            clear(dir)?;
            return Ok(None);
        }
        verify_file(&dir.join("update.apk"), &manifest.platforms.android)?;
        Ok(Some(Self {
            cached: Arc::new(cached),
            manifest,
        }))
    }
    /// Bounded streaming download. Cancellation never leaves an installable partial file.
    pub async fn download(
        &self,
        dir: &Path,
        cancelled: &AtomicBool,
        received: &AtomicU64,
    ) -> Result<PathBuf, String> {
        fs::create_dir_all(dir).map_err(|_| "无法创建更新缓存".to_owned())?;
        clear(dir)?;
        let partial = dir.join("update.part");
        let result = self
            .download_inner(dir, &partial, cancelled, received)
            .await;
        if result.is_err() {
            let _ = clear(dir);
        }
        result
    }
    async fn download_inner(
        &self,
        dir: &Path,
        partial: &Path,
        cancelled: &AtomicBool,
        received: &AtomicU64,
    ) -> Result<PathBuf, String> {
        let package = &self.manifest.platforms.android;
        let response = client(Duration::from_secs(900))?
            .get(&package.url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|_| "更新下载失败，请重试".to_owned())?;
        self.write_response(response, dir, partial, cancelled, received)
            .await
    }
    async fn write_response(
        &self,
        mut response: reqwest::Response,
        dir: &Path,
        partial: &Path,
        cancelled: &AtomicBool,
        received: &AtomicU64,
    ) -> Result<PathBuf, String> {
        let package = &self.manifest.platforms.android;
        if response.content_length().is_some_and(|n| n != package.size) {
            return Err(failure());
        }
        let mut file =
            File::create(partial).map_err(|_| "无法写入更新包，请检查可用空间".to_owned())?;
        let mut hash = digest::Context::new(&digest::SHA256);
        let mut count = 0_u64;
        received.store(0, Ordering::Relaxed);
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "更新下载中断，请重试".to_owned())?
        {
            if cancelled.load(Ordering::Acquire) {
                return Err("下载已取消".to_owned());
            }
            count += chunk.len() as u64;
            if count > package.size {
                return Err(failure());
            }
            file.write_all(&chunk)
                .map_err(|_| "空间不足或更新包无法写入".to_owned())?;
            hash.update(&chunk);
            received.store(count, Ordering::Relaxed);
        }
        if cancelled.load(Ordering::Acquire) {
            return Err("下载已取消".to_owned());
        }
        if count != package.size || hex(hash.finish().as_ref()) != package.sha256 {
            return Err(failure());
        }
        file.sync_all().map_err(|_| "更新包无法保存".to_owned())?;
        drop(file);
        let path = dir.join("update.apk");
        fs::rename(partial, &path).map_err(|_| failure())?;
        let record = serde_json::to_vec(&*self.cached).map_err(|_| failure())?;
        let mut file = File::create(dir.join("candidate.part")).map_err(|_| failure())?;
        file.write_all(&record)
            .and_then(|_| file.sync_all())
            .map_err(|_| failure())?;
        fs::rename(dir.join("candidate.part"), dir.join("candidate.json"))
            .map_err(|_| failure())?;
        Ok(path)
    }
}
/// Revalidate a staged APK with bounded memory before handing it to the installer.
pub fn verify_file(path: &Path, package: &Package) -> Result<(), String> {
    let mut file = File::open(path).map_err(|_| failure())?;
    if file.metadata().map_err(|_| failure())?.len() != package.size {
        return Err(failure());
    }
    let mut hash = digest::Context::new(&digest::SHA256);
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|_| failure())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    if hex(hash.finish().as_ref()) != package.sha256 {
        return Err(failure());
    }
    Ok(())
}
/// Delete only this updater's known cache files, preserving application data.
pub fn clear(dir: &Path) -> Result<(), String> {
    for name in [
        "update.part",
        "update.apk",
        "candidate.json",
        "candidate.part",
    ] {
        match fs::remove_file(dir.join(name)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("无法清理更新缓存".to_owned()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
