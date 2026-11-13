use super::mp4;
use crate::playback::{PlaybackError, Representation};
use reqwest::{Client, Url, header};
use ring::rand::{SecureRandom, SystemRandom};
use std::{
    collections::HashMap,
    fs,
    net::IpAddr,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    sync::Semaphore,
    time::timeout,
};

const MAX_FILE: u64 = 512 * 1024 * 1024;
const MAX_CACHE: u64 = 512 * 1024 * 1024;
pub(super) const CHUNK: usize = 512 * 1024;
const PROBE: u64 = 64 * 1024;
const MAX_HANDLES: usize = 24;
const IDLE: Duration = Duration::from_secs(15 * 60);

// std::fs::File::try_lock is unsupported on Android; keep descriptor-owned locks on Unix.
#[cfg(unix)]
fn try_lock(file: &fs::File) -> std::io::Result<()> {
    rustix::fs::flock(file, rustix::fs::FlockOperation::NonBlockingLockExclusive)
        .map_err(Into::into)
}
#[cfg(not(unix))]
fn try_lock(file: &fs::File) -> std::io::Result<()> {
    file.try_lock().map_err(Into::into)
}

/// Validated media cache. Signed URLs, content keys and physical paths never leave core.
#[derive(Clone)]
pub struct MediaStore {
    inner: Arc<Store>,
}
struct Store {
    http: Client,
    fixture: Option<Url>,
    directory: Arc<Directory>,
    budget: Arc<AtomicU64>,
    preparing: Semaphore,
    entries: Mutex<HashMap<String, Entry>>,
    closed: Arc<AtomicBool>,
    janitor: AtomicBool,
    wake: Arc<tokio::sync::Notify>,
}
struct Directory {
    path: PathBuf,
    lock: Option<fs::File>,
}
impl Drop for Directory {
    fn drop(&mut self) {
        drop(self.lock.take());
        let _ = fs::remove_dir_all(&self.path);
    }
}
struct Entry {
    resource: Arc<Ready>,
    accessed: Instant,
}
struct Budget {
    total: Arc<AtomicU64>,
    bytes: u64,
}
impl Budget {
    fn grow(&mut self, bytes: u64) -> Result<(), PlaybackError> {
        self.total
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |total| {
                total.checked_add(bytes).filter(|n| *n <= MAX_CACHE)
            })
            .map_err(|_| PlaybackError::Capacity)?;
        self.bytes += bytes;
        Ok(())
    }
}
impl Drop for Budget {
    fn drop(&mut self) {
        self.total.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
struct LocalFile {
    path: PathBuf,
    _directory: Arc<Directory>,
}
impl Drop for LocalFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}
enum Bytes {
    Range {
        url: Url,
        etag: String,
        prefix: Vec<u8>,
        index: mp4::Index,
        key: Option<[u8; 16]>,
    },
    File(LocalFile),
}
struct Ready {
    http: Client,
    length: u64,
    codec: &'static str,
    bytes: Bytes,
    valid: AtomicBool,
    readers: AtomicUsize,
    closed: Arc<AtomicBool>,
    _budget: Budget,
}

/// Prepared representation, before a caller owns an opaque playback handle.
#[derive(Clone)]
pub struct PreparedMedia {
    inner: Arc<Ready>,
}
impl PreparedMedia {
    /// Validated representation byte length.
    pub fn length(&self) -> u64 {
        self.inner.length
    }
    /// Codec confirmed from MP4 metadata.
    pub fn codec(&self) -> &str {
        self.inner.codec
    }
}

/// A read lease keeps its media alive through eviction, release and stream cancellation.
pub struct MediaLease {
    inner: Arc<Ready>,
}
impl Drop for MediaLease {
    fn drop(&mut self) {
        self.inner.readers.fetch_sub(1, Ordering::AcqRel);
    }
}
impl MediaLease {
    /// Total stable representation length.
    pub fn length(&self) -> u64 {
        self.inner.length
    }
    /// Read a single bounded inclusive chunk; dropping the future cancels owned network I/O.
    pub async fn chunk(&self, start: u64, end: u64) -> Result<Vec<u8>, PlaybackError> {
        if !self.inner.valid.load(Ordering::Acquire) || self.inner.closed.load(Ordering::Acquire) {
            return Err(PlaybackError::Expired);
        }
        if start > end || end >= self.inner.length || end - start >= CHUNK as u64 {
            return Err(PlaybackError::InvalidInput);
        }
        match &self.inner.bytes {
            Bytes::File(file) => {
                let mut file = File::open(&file.path)
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                file.seek(std::io::SeekFrom::Start(start))
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                let mut bytes = vec![0; (end - start + 1) as usize];
                file.read_exact(&mut bytes)
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                Ok(bytes)
            }
            Bytes::Range {
                url,
                etag,
                prefix,
                index,
                key,
            } => {
                if end < prefix.len() as u64 {
                    return Ok(prefix[start as usize..=end as usize].to_vec());
                }
                let result =
                    read_range(&self.inner.http, url, start, end, self.inner.length, etag).await;
                let mut bytes = match result {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        if matches!(
                            error,
                            PlaybackError::MediaChanged | PlaybackError::InvalidMedia
                        ) {
                            self.inner.valid.store(false, Ordering::Release);
                        }
                        return Err(error);
                    }
                };
                if start < prefix.len() as u64 {
                    let count = (prefix.len() as u64 - start).min(bytes.len() as u64) as usize;
                    bytes[..count].copy_from_slice(&prefix[start as usize..start as usize + count]);
                }
                if let Some(key) = key {
                    mp4::transform(&mut bytes, start, &index.samples, key)?;
                }
                Ok(bytes)
            }
        }
    }
}

impl MediaStore {
    /// Create an app-owned media directory and reclaim only stale, unlocked media instances.
    /// The parent must be this application's state directory, never a legacy client directory.
    pub fn new(app_state: &Path) -> Result<Self, PlaybackError> {
        Self::build(app_state, None)
    }
    /// Explicit fixture transport. Every media request is rewritten onto this bare loopback origin.
    pub fn for_loopback_tests(app_state: &Path, origin: &str) -> Result<Self, PlaybackError> {
        let url = Url::parse(origin).map_err(|_| PlaybackError::Configuration)?;
        let loopback = url
            .host_str()
            .and_then(|h| h.trim_matches(['[', ']']).parse::<IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if url.scheme() != "http"
            || !loopback
            || url.port_or_known_default() == Some(0)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(PlaybackError::Configuration);
        }
        Self::build(app_state, Some(url))
    }
    fn build(app_state: &Path, fixture: Option<Url>) -> Result<Self, PlaybackError> {
        let http = crate::http::client_builder()
            .http1_only()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|_| PlaybackError::Configuration)?;
        let base = app_state.join("media");
        fs::create_dir_all(&base).map_err(|_| PlaybackError::Storage)?;
        if !fs::symlink_metadata(&base).is_ok_and(|m| m.file_type().is_dir()) {
            return Err(PlaybackError::Storage);
        }
        // Serialize creation with reclamation so a new lease cannot be reclaimed before locking.
        let registry_path = base.join(".instances.lock");
        if fs::symlink_metadata(&registry_path).is_ok_and(|m| !m.file_type().is_file()) {
            return Err(PlaybackError::Storage);
        }
        let registry = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(registry_path)
            .map_err(|_| PlaybackError::Storage)?;
        try_lock(&registry).map_err(|error| {
            if error.kind() == std::io::ErrorKind::WouldBlock {
                PlaybackError::Capacity
            } else {
                PlaybackError::Storage
            }
        })?;
        // Stale cleanup requires the per-instance lock; live service directories are never removed.
        for entry in fs::read_dir(&base).map_err(|_| PlaybackError::Storage)? {
            let entry = entry.map_err(|_| PlaybackError::Storage)?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.strip_prefix("nsh-").is_some_and(valid_token)
                && entry.file_type().is_ok_and(|t| t.is_dir())
            {
                let lease = entry.path().join("lease");
                if fs::symlink_metadata(&lease).is_ok_and(|m| m.file_type().is_file())
                    && let Ok(lock) = fs::OpenOptions::new().read(true).write(true).open(lease)
                    && try_lock(&lock).is_ok()
                {
                    drop(lock);
                    if let Err(error) = fs::remove_dir_all(entry.path())
                        && error.kind() != std::io::ErrorKind::NotFound
                    {
                        return Err(PlaybackError::Storage);
                    }
                }
            }
        }
        let path = base.join(format!("nsh-{}", token()?));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&path).map_err(|_| PlaybackError::Storage)?;
        let mut directory = Directory { path, lock: None };
        let lock = fs::OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(directory.path.join("lease"))
            .map_err(|_| PlaybackError::Storage)?;
        try_lock(&lock).map_err(|_| PlaybackError::Storage)?;
        directory.lock = Some(lock);
        Ok(Self {
            inner: Arc::new(Store {
                http,
                fixture,
                directory: Arc::new(directory),
                budget: Arc::new(AtomicU64::new(0)),
                preparing: Semaphore::new(2),
                entries: Mutex::new(HashMap::new()),
                closed: Arc::new(AtomicBool::new(false)),
                janitor: AtomicBool::new(false),
                wake: Arc::new(tokio::sync::Notify::new()),
            }),
        })
    }

    /// Validate and prepare one authorized model candidate, without publishing a handle.
    pub async fn prepare(
        &self,
        candidate: &Representation,
    ) -> Result<PreparedMedia, PlaybackError> {
        if self.inner.closed.load(Ordering::Acquire) {
            return Err(PlaybackError::Expired);
        }
        self.start_janitor();
        let _permit = self
            .inner
            .preparing
            .try_acquire()
            .map_err(|_| PlaybackError::Capacity)?;
        let mut url = candidate.url.clone();
        if let Some(origin) = &self.inner.fixture {
            let mut target = origin.clone();
            target.set_path(url.path());
            target.set_query(url.query());
            url = target;
        }
        timeout(Duration::from_secs(90), async {
            let prepared = match self.incremental(&url, candidate.key).await? {
                Some(ready) => ready,
                None => self.full(&url, candidate.key).await?,
            };
            if prepared.inner.codec != candidate.codec() {
                return Err(PlaybackError::InvalidMedia);
            }
            if self.inner.closed.load(Ordering::Acquire) {
                return Err(PlaybackError::Expired);
            }
            Ok(prepared)
        })
        .await
        .unwrap_or(Err(PlaybackError::Timeout))
    }

    /// Issue a cryptographically random local token after preparation succeeded.
    pub fn publish(&self, prepared: PreparedMedia) -> Result<String, PlaybackError> {
        if !Arc::ptr_eq(&self.inner.closed, &prepared.inner.closed) {
            return Err(PlaybackError::InvalidInput);
        }
        if self.inner.closed.load(Ordering::Acquire)
            || !prepared.inner.valid.load(Ordering::Acquire)
        {
            return Err(PlaybackError::Expired);
        }
        let mut entries = self
            .inner
            .entries
            .lock()
            .map_err(|_| PlaybackError::Configuration)?;
        if self.inner.closed.load(Ordering::Acquire) {
            return Err(PlaybackError::Expired);
        }
        prune(&mut entries);
        if entries.len() >= MAX_HANDLES {
            let oldest = entries
                .iter()
                .filter(|(_, entry)| entry.resource.readers.load(Ordering::Acquire) == 0)
                .min_by_key(|(_, entry)| entry.accessed)
                .map(|(token, _)| token.clone())
                .ok_or(PlaybackError::Capacity)?;
            entries.remove(&oldest);
        }
        let token = token()?;
        if entries.contains_key(&token) {
            return Err(PlaybackError::Capacity);
        }
        entries.insert(
            token.clone(),
            Entry {
                resource: prepared.inner,
                accessed: Instant::now(),
            },
        );
        self.inner.wake.notify_one();
        Ok(format!("/minireel-proxy/media/{token}"))
    }
    /// Resolve only a known opaque token. Invalid input cannot access network or filesystem paths.
    pub fn lease(&self, token: &str) -> Result<MediaLease, PlaybackError> {
        if !valid_token(token) || self.inner.closed.load(Ordering::Acquire) {
            return Err(PlaybackError::Expired);
        }
        let mut entries = self
            .inner
            .entries
            .lock()
            .map_err(|_| PlaybackError::Configuration)?;
        prune(&mut entries);
        let entry = entries.get_mut(token).ok_or(PlaybackError::Expired)?;
        entry.accessed = Instant::now();
        if !entry.resource.valid.load(Ordering::Acquire) {
            return Err(PlaybackError::Expired);
        }
        entry.resource.readers.fetch_add(1, Ordering::AcqRel);
        Ok(MediaLease {
            inner: entry.resource.clone(),
        })
    }
    /// Idempotent ownership release; active readers retain their current resource until they end.
    pub fn release(&self, token: &str) -> Result<(), PlaybackError> {
        if valid_token(token) {
            self.inner
                .entries
                .lock()
                .map_err(|_| PlaybackError::Configuration)?
                .remove(token);
        }
        Ok(())
    }
    /// Stop new work and discard handles. In-flight owners are canceled by the playback service.
    pub fn close(&self) {
        self.inner.closed.store(true, Ordering::Release);
        self.inner.wake.notify_one();
        if let Ok(mut entries) = self.inner.entries.lock() {
            entries.clear();
        }
    }

    fn start_janitor(&self) {
        if self.inner.janitor.swap(true, Ordering::AcqRel) {
            return;
        }
        let store = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            loop {
                let Some(inner) = store.upgrade() else { break };
                if inner.closed.load(Ordering::Acquire) {
                    break;
                }
                let next = {
                    let Ok(mut entries) = inner.entries.lock() else {
                        break;
                    };
                    prune(&mut entries);
                    entries
                        .values()
                        .map(|e| IDLE.saturating_sub(e.accessed.elapsed()))
                        .min()
                        .unwrap_or(IDLE)
                        .max(Duration::from_secs(1))
                };
                let wake = inner.wake.clone();
                drop(inner);
                tokio::select! { _=tokio::time::sleep(next)=>{}, _=wake.notified()=>{} }
            }
        });
    }

    async fn incremental(
        &self,
        url: &Url,
        key: Option<[u8; 16]>,
    ) -> Result<Option<PreparedMedia>, PlaybackError> {
        let mut response = request_range(&self.inner.http, url, 0, PROBE - 1, None).await?;
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(PlaybackError::AccessDenied);
        }
        if response.status().as_u16() == 200 {
            return Ok(None);
        }
        if response.status().as_u16() != 206 {
            return Err(PlaybackError::Transport);
        }
        let etag = response
            .headers()
            .get(header::ETAG)
            .and_then(|h| h.to_str().ok())
            .filter(|s| strong_etag(s))
            .map(str::to_owned);
        let Some(etag) = etag else { return Ok(None) };
        let (start, end, length) = content_range(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|s| s.to_str().ok())
                .ok_or(PlaybackError::InvalidMedia)?,
        )?;
        if length > MAX_FILE {
            return Err(PlaybackError::MediaTooLarge);
        }
        if start != 0 || end != (PROBE - 1).min(length - 1) {
            return Err(PlaybackError::InvalidMedia);
        }
        let mut prefix = exact_body(&mut response, (end + 1) as usize).await?;
        mp4::validate_ftyp(&prefix)?;
        let Some(init_end) = mp4::prefix_end(&prefix, length)? else {
            return Ok(None);
        };
        while prefix.len() < init_end {
            let start = prefix.len() as u64;
            let end = (init_end as u64 - 1).min(start + CHUNK as u64 - 1);
            prefix.extend_from_slice(
                &read_range(&self.inner.http, url, start, end, length, &etag).await?,
            );
        }
        prefix.truncate(init_end);
        let index = mp4::initialize(&mut prefix, 0, length, key.as_ref())?;
        let mut budget = Budget {
            total: self.inner.budget.clone(),
            bytes: 0,
        };
        budget.grow(
            prefix.len() as u64 + (index.samples.len() * std::mem::size_of::<mp4::Sample>()) as u64,
        )?;
        let codec = index.codec;
        Ok(Some(PreparedMedia {
            inner: Arc::new(Ready {
                http: self.inner.http.clone(),
                length,
                codec,
                bytes: Bytes::Range {
                    url: url.clone(),
                    etag,
                    prefix,
                    index,
                    key,
                },
                valid: AtomicBool::new(true),
                readers: AtomicUsize::new(0),
                closed: self.inner.closed.clone(),
                _budget: budget,
            }),
        }))
    }

    async fn full(&self, url: &Url, key: Option<[u8; 16]>) -> Result<PreparedMedia, PlaybackError> {
        let path = self.inner.directory.path.join(format!("{}.mp4", token()?));
        let owned = LocalFile {
            path: path.clone(),
            _directory: self.inner.directory.clone(),
        };
        let mut options = tokio::fs::OpenOptions::new();
        options.create_new(true).read(true).write(true);
        #[cfg(unix)]
        {
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .await
            .map_err(|_| PlaybackError::Storage)?;
        let mut response = self
            .inner
            .http
            .get(url.clone())
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(network_error)?;
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(PlaybackError::AccessDenied);
        }
        if response.status().as_u16() != 200 {
            return Err(PlaybackError::Transport);
        }
        if response
            .headers()
            .get(header::CONTENT_ENCODING)
            .is_some_and(|v| v != "identity")
        {
            return Err(PlaybackError::InvalidMedia);
        }
        let declared = response.content_length();
        if declared.is_some_and(|n| n > MAX_FILE) {
            return Err(PlaybackError::MediaTooLarge);
        }
        let mut budget = Budget {
            total: self.inner.budget.clone(),
            bytes: 0,
        };
        let mut length = 0u64;
        while let Some(chunk) = response.chunk().await.map_err(network_error)? {
            if self.inner.closed.load(Ordering::Acquire) {
                return Err(PlaybackError::Expired);
            }
            if chunk.len() > CHUNK {
                return Err(PlaybackError::InvalidMedia);
            }
            if chunk.len() as u64 > MAX_FILE - length {
                return Err(PlaybackError::MediaTooLarge);
            }
            budget.grow(chunk.len() as u64)?;
            file.write_all(&chunk)
                .await
                .map_err(|_| PlaybackError::Storage)?;
            length += chunk.len() as u64;
        }
        if length == 0 || declared.is_some_and(|n| n != length) {
            return Err(PlaybackError::InvalidMedia);
        }
        file.flush().await.map_err(|_| PlaybackError::Storage)?;
        let (mut metadata, base) = read_metadata(&mut file, length).await?;
        let index = mp4::initialize(&mut metadata, base, length, key.as_ref())?;
        let codec = index.codec;
        file.seek(std::io::SeekFrom::Start(base))
            .await
            .map_err(|_| PlaybackError::Storage)?;
        file.write_all(&metadata)
            .await
            .map_err(|_| PlaybackError::Storage)?;
        if let Some(key) = key {
            let mut at = 0u64;
            while at < length {
                let size = (length - at).min(CHUNK as u64) as usize;
                let mut bytes = vec![0; size];
                file.seek(std::io::SeekFrom::Start(at))
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                file.read_exact(&mut bytes)
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                mp4::transform(&mut bytes, at, &index.samples, &key)?;
                file.seek(std::io::SeekFrom::Start(at))
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                file.write_all(&bytes)
                    .await
                    .map_err(|_| PlaybackError::Storage)?;
                at += size as u64;
            }
        }
        file.flush().await.map_err(|_| PlaybackError::Storage)?;
        drop(file);
        Ok(PreparedMedia {
            inner: Arc::new(Ready {
                http: self.inner.http.clone(),
                length,
                codec,
                bytes: Bytes::File(owned),
                valid: AtomicBool::new(true),
                readers: AtomicUsize::new(0),
                closed: self.inner.closed.clone(),
                _budget: budget,
            }),
        })
    }
}

fn valid_token(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn token() -> Result<String, PlaybackError> {
    let mut bytes = [0u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| PlaybackError::Configuration)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn prune(entries: &mut HashMap<String, Entry>) {
    entries.retain(|_, entry| {
        entry.accessed.elapsed() < IDLE || entry.resource.readers.load(Ordering::Acquire) > 0
    });
}
fn network_error(error: reqwest::Error) -> PlaybackError {
    if error.is_timeout() {
        PlaybackError::Timeout
    } else {
        PlaybackError::Transport
    }
}
fn strong_etag(tag: &str) -> bool {
    tag.len() >= 2
        && tag.len() <= 256
        && tag.starts_with('"')
        && tag.ends_with('"')
        && tag[1..tag.len() - 1]
            .bytes()
            .all(|b| b == 0x21 || (0x23..=0x7e).contains(&b))
}
fn content_range(value: &str) -> Result<(u64, u64, u64), PlaybackError> {
    let invalid = PlaybackError::InvalidMedia;
    let value = value.strip_prefix("bytes ").ok_or(invalid)?;
    let (range, length) = value.split_once('/').ok_or(invalid)?;
    let (start, end) = range.split_once('-').ok_or(invalid)?;
    let number = |s: &str| {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            return Err(invalid);
        }
        s.parse::<u64>().map_err(|_| invalid)
    };
    let (start, end, length) = (number(start)?, number(end)?, number(length)?);
    if length == 0 || start > end || end >= length {
        return Err(invalid);
    }
    Ok((start, end, length))
}
async fn request_range(
    http: &Client,
    url: &Url,
    start: u64,
    end: u64,
    etag: Option<&str>,
) -> Result<reqwest::Response, PlaybackError> {
    let mut request = http
        .get(url.clone())
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::RANGE, format!("bytes={start}-{end}"));
    if let Some(etag) = etag {
        request = request.header(header::IF_RANGE, etag);
    }
    request.send().await.map_err(network_error)
}
async fn exact_body(
    response: &mut reqwest::Response,
    count: usize,
) -> Result<Vec<u8>, PlaybackError> {
    if count > CHUNK
        || response.content_length().is_some_and(|n| n != count as u64)
        || response
            .headers()
            .get(header::CONTENT_ENCODING)
            .is_some_and(|v| v != "identity")
    {
        return Err(PlaybackError::InvalidMedia);
    }
    let mut bytes = Vec::with_capacity(count);
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if chunk.len() > count - bytes.len() {
            return Err(PlaybackError::InvalidMedia);
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() != count {
        return Err(PlaybackError::InvalidMedia);
    }
    Ok(bytes)
}
async fn read_range(
    http: &Client,
    url: &Url,
    start: u64,
    end: u64,
    length: u64,
    etag: &str,
) -> Result<Vec<u8>, PlaybackError> {
    let mut response = request_range(http, url, start, end, Some(etag)).await?;
    if response.status().as_u16() != 206
        || response
            .headers()
            .get(header::ETAG)
            .and_then(|s| s.to_str().ok())
            != Some(etag)
    {
        return Err(PlaybackError::MediaChanged);
    }
    let range = content_range(
        response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|s| s.to_str().ok())
            .ok_or(PlaybackError::InvalidMedia)?,
    )?;
    if range != (start, end, length) {
        return Err(PlaybackError::MediaChanged);
    }
    exact_body(&mut response, (end - start + 1) as usize).await
}
async fn read_metadata(file: &mut File, length: u64) -> Result<(Vec<u8>, u64), PlaybackError> {
    file.seek(std::io::SeekFrom::Start(0))
        .await
        .map_err(|_| PlaybackError::Storage)?;
    let mut first = [0; 16];
    file.read_exact(&mut first)
        .await
        .map_err(|_| PlaybackError::InvalidMedia)?;
    mp4::validate_ftyp(&first)?;
    let mut at = 0u64;
    let mut count = 0;
    while length.saturating_sub(at) >= 8 {
        count += 1;
        if count > 1_000_000 {
            return Err(PlaybackError::InvalidMedia);
        }
        file.seek(std::io::SeekFrom::Start(at))
            .await
            .map_err(|_| PlaybackError::Storage)?;
        let mut header = [0; 16];
        file.read_exact(&mut header[..8])
            .await
            .map_err(|_| PlaybackError::InvalidMedia)?;
        let size = u32::from_be_bytes(
            header[..4]
                .try_into()
                .map_err(|_| PlaybackError::InvalidMedia)?,
        );
        let (header_size, size) = match size {
            0 => (8, length - at),
            1 => {
                file.read_exact(&mut header[8..])
                    .await
                    .map_err(|_| PlaybackError::InvalidMedia)?;
                (
                    16,
                    u64::from_be_bytes(
                        header[8..]
                            .try_into()
                            .map_err(|_| PlaybackError::InvalidMedia)?,
                    ),
                )
            }
            n => (8, u64::from(n)),
        };
        if size < header_size || size > length - at {
            return Err(PlaybackError::InvalidMedia);
        }
        if &header[4..8] == b"moov" {
            if size > mp4::INIT_LIMIT as u64 {
                return Err(PlaybackError::InvalidMedia);
            }
            let mut bytes = vec![0; size as usize];
            file.seek(std::io::SeekFrom::Start(at))
                .await
                .map_err(|_| PlaybackError::Storage)?;
            file.read_exact(&mut bytes)
                .await
                .map_err(|_| PlaybackError::InvalidMedia)?;
            return Ok((bytes, at));
        }
        at += size;
    }
    Err(PlaybackError::InvalidMedia)
}

#[cfg(test)]
mod tests;
