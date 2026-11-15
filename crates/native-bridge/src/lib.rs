//! Shared in-process native business session. UI and host assembly stay outside this crate.
mod request;

use hongguo_core::{
    account::AccountService, catalog::CatalogClient, library::LibraryStore,
    playback::PlaybackService, radar::RadarService,
};
use hongguo_http_api::{DevPolicy, media_router};
use nsh_core::prelude::*;
use request::{
    Reply, Request, Services, account_error, catalog_error, library_error, playback_error,
    radar_error, token,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
};
use tokio::{
    runtime::Handle,
    sync::{Mutex as AsyncMutex, OwnedMutexGuard, watch},
    task::{AbortHandle, JoinHandle},
};

const MAX_CALLS: usize = 8;

/// Register the same native API in each platform's thin native module.
pub fn register(registry: &mut Registry) {
    registry
        .module::<NativeCore>()
        .class::<NativeSession>()
        .class::<NativeCall>();
}

/// Opens the bundled core using the host's own application data and runtime.
#[module]
pub struct NativeCore;

#[module]
impl NativeCore {
    /// Open native services. Failure preserves stored files and never selects a fallback backend.
    pub async fn open() -> Result<NativeSession, String> {
        let dir =
            data_dir().ok_or_else(|| "NATIVE_DATA_UNAVAILABLE: 应用数据目录不可用".to_owned())?;
        let task = background(async move { Session::open(&dir).await });
        let _cancel = AbortOnDrop(task.abort_handle());
        let session = task
            .await
            .map_err(|_| "NATIVE_INITIALIZATION_FAILED: 核心初始化失败".to_owned())?
            .map_err(|error| serde_json::to_string(&error).unwrap_or_default())?;
        Ok(NativeSession { session })
    }
}
struct AbortOnDrop(AbortHandle);
impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// One app-owned core, persistent guest library and local media listener.
#[class]
pub struct NativeSession {
    session: Arc<Session>,
}
#[class]
impl NativeSession {
    /// Exact origin of this session's media-only loopback listener.
    pub fn origin(&self) -> String {
        self.session.origin.clone()
    }

    /// Start a bounded business call. A null body selects a read, a JSON string a mutation.
    pub fn start(&self, path: String, body: Option<String>, method: Option<String>) -> NativeCall {
        self.session
            .start_with_method(&path, body.as_deref(), method.as_deref())
    }

    /// Stop pending work and media access. Calling this repeatedly is harmless.
    pub fn close(&self) {
        self.session.close();
    }
}
impl Drop for NativeSession {
    fn drop(&mut self) {
        self.session.close();
    }
}

/// A result owns any prepared media until accept; cancel/dispose releases losing results.
#[class]
pub struct NativeCall {
    inner: Arc<Call>,
}
#[class]
impl NativeCall {
    /// Await the common status/envelope JSON, without transferring its media ownership yet.
    pub async fn result(this: Instance<Self>) -> String {
        let call = this.with(|call| call.inner.clone());
        // Waiting must not keep the exported class alive after JS disposes it.
        drop(this);
        let reply = call.result().await;
        serde_json::to_string(&reply).unwrap_or_default()
    }
    /// Transfer a delivered media handle to the shared player and release the call's slot.
    pub fn accept(&self) {
        self.inner.accept();
    }
    /// Cancel pending work or release an unaccepted ready media handle.
    pub fn cancel(&self) {
        self.inner.cancel();
    }
}
impl Drop for NativeCall {
    fn drop(&mut self) {
        self.inner.cancel();
    }
}

struct Session {
    services: Services,
    origin: String,
    runtime: Handle,
    calls: Mutex<Calls>,
    shutdown: watch::Sender<bool>,
    lifecycle: Mutex<Option<Lifecycle>>,
}
struct Lifecycle {
    worker: Option<JoinHandle<()>>,
    lease: Option<OwnedMutexGuard<()>>,
}
#[derive(Default)]
struct Calls {
    closed: bool,
    next: u64,
    pending: HashMap<u64, Weak<Call>>,
}
impl Session {
    async fn open(dir: &Path) -> Result<Arc<Self>, Reply> {
        let lease = directory_lease(dir).await?;
        let dir = dir.to_owned();
        // Once admitted, initialization retains its lease even if the JS waiter is cancelled.
        tokio::spawn(async move { Self::initialize(&dir, lease).await })
            .await
            .map_err(|_| Reply::failure(500, "NATIVE_INITIALIZATION_FAILED", "核心初始化失败"))?
    }
    async fn initialize(dir: &Path, lease: OwnedMutexGuard<()>) -> Result<Arc<Self>, Reply> {
        let library = LibraryStore::open(dir.join("guest.sqlite3"))
            .await
            .map_err(library_error)?;
        let account = AccountService::open(dir, library.clone())
            .await
            .map_err(account_error)?;
        let catalog = CatalogClient::new().map_err(catalog_error)?;
        let playback = PlaybackService::new(dir).map_err(playback_error)?;
        let radar = RadarService::open(dir).map_err(radar_error)?;
        Self::with_services_and_lease(
            Services {
                catalog,
                library,
                playback,
                radar: Some(radar),
                account: Some(account),
            },
            Some(lease),
        )
        .await
    }
    #[cfg(test)]
    async fn with_services(services: Services) -> Result<Arc<Self>, Reply> {
        Self::with_services_and_lease(services, None).await
    }
    async fn with_services_and_lease(
        services: Services,
        lease: Option<OwnedMutexGuard<()>>,
    ) -> Result<Arc<Self>, Reply> {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| Reply::failure(500, "NATIVE_MEDIA_UNAVAILABLE", "本机媒体服务无法启动"))?;
        let address = listener
            .local_addr()
            .map_err(|_| Reply::failure(500, "NATIVE_MEDIA_UNAVAILABLE", "本机媒体服务无法启动"))?;
        let (shutdown, mut stopped) = watch::channel(false);
        let router = media_router(
            DevPolicy::new(address.port(), None),
            services.playback.clone(),
        );
        let session = Arc::new(Self {
            services,
            origin: format!("http://{address}"),
            runtime: Handle::current(),
            calls: Mutex::new(Calls::default()),
            shutdown,
            lifecycle: Mutex::new(Some(Lifecycle {
                worker: None,
                lease,
            })),
        });
        let owner = Arc::downgrade(&session);
        if let Some(account) = session.services.account.clone() {
            let stopped = session.shutdown.subscribe();
            let worker = tokio::spawn(async move {
                if let Err(error) = account.run_sync(stopped).await {
                    eprintln!("account sync worker stopped: {}", error.code());
                }
            });
            session.lifecycle.lock().unwrap().as_mut().unwrap().worker = Some(worker);
        }
        tokio::spawn(async move {
            let result = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    if !*stopped.borrow() {
                        let _ = stopped.changed().await;
                    }
                })
                .await;
            if result.is_err()
                && let Some(owner) = owner.upgrade()
            {
                owner.close();
            }
        });
        Ok(session)
    }
    #[cfg(test)]
    fn start(self: &Arc<Self>, path: &str, body: Option<&str>) -> NativeCall {
        self.start_with_method(path, body, None)
    }
    fn start_with_method(
        self: &Arc<Self>,
        path: &str,
        body: Option<&str>,
        method: Option<&str>,
    ) -> NativeCall {
        let request = match Request::parse_with_method(path, body, method) {
            Ok(request) => request,
            Err(reply) => {
                return NativeCall {
                    inner: Call::ready(reply),
                };
            }
        };
        let Ok(mut calls) = self.calls.lock() else {
            return NativeCall {
                inner: Call::ready(Reply::closed()),
            };
        };
        if calls.closed {
            return NativeCall {
                inner: Call::ready(Reply::closed()),
            };
        }
        if calls.pending.len() >= MAX_CALLS || calls.next == u64::MAX {
            return NativeCall {
                inner: Call::ready(Reply::failure(
                    503,
                    "NATIVE_CAPACITY",
                    "请求过多，请稍后重试",
                )),
            };
        }
        calls.next += 1;
        let id = calls.next;
        let (changed, _) = watch::channel(false);
        let call = Arc::new(Call {
            session: Arc::downgrade(self),
            id,
            state: Mutex::new(CallState::default()),
            changed,
        });
        calls.pending.insert(id, Arc::downgrade(&call));
        // Hold state while installing the abort handle so even an immediate result cannot race it.
        let mut state = call.state.lock().unwrap();
        let completion = Completion(Some(call.clone()));
        let services = self.services.clone();
        let task = self.runtime.spawn(async move {
            let reply = request.execute(&services).await;
            completion.finish(reply);
        });
        state.task = Some(task.abort_handle());
        drop(state);
        drop(calls);
        NativeCall { inner: call }
    }
    fn remove(&self, id: u64) {
        if let Ok(mut calls) = self.calls.lock() {
            calls.pending.remove(&id);
        }
    }
    fn close(&self) {
        if let Some(account) = &self.services.account {
            account.stop_sync();
        }
        let pending = if let Ok(mut calls) = self.calls.lock() {
            if calls.closed {
                return;
            }
            calls.closed = true;
            std::mem::take(&mut calls.pending)
                .into_values()
                .filter_map(|call| call.upgrade())
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        for call in pending {
            call.cancel();
        }
        self.services.playback.close();
        self.shutdown.send_replace(true);
        let lifecycle = self.lifecycle.lock().unwrap().take();
        if let Some(lifecycle) = lifecycle {
            let services = self.services.clone();
            self.runtime.spawn(async move {
                if let Some(worker) = lifecycle.worker
                    && worker.await.is_err()
                {
                    eprintln!("native shutdown drain failed: NATIVE_SYNC_TASK_FAILED");
                }
                // Acquiring the coordinator drains admitted import/session publications.
                if let Some(account) = &services.account {
                    if let Err(error) = account.state().await {
                        eprintln!("native shutdown drain failed: {}", error.code());
                    }
                    if let Err(error) = account.library_snapshot(None).await {
                        eprintln!("native shutdown drain failed: {}", error.code());
                    }
                }
                // Seal and drain guest compatibility writes, including dropped callers.
                if let Err(error) = services.library.invalidate_write_sessions().await {
                    eprintln!("native shutdown drain failed: {}", error.code());
                }
                drop(lifecycle.lease);
            });
        }
    }
    fn release(&self, path: Option<String>) {
        if let Some(token) = path.as_deref().and_then(token) {
            let _ = self.services.playback.release(token);
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.close();
    }
}

// Only lifecycle locks are indexed here; account data remains owned by each service.
async fn directory_lease(dir: &Path) -> Result<OwnedMutexGuard<()>, Reply> {
    static DIRECTORIES: OnceLock<Mutex<HashMap<PathBuf, Weak<AsyncMutex<()>>>>> = OnceLock::new();
    let path = directory_identity(dir)
        .map_err(|_| Reply::failure(500, "NATIVE_DATA_UNAVAILABLE", "应用数据目录不可用"))?;
    let gate = {
        let mut directories = DIRECTORIES
            .get_or_init(Mutex::default)
            .lock()
            .map_err(|_| Reply::failure(500, "NATIVE_INITIALIZATION_FAILED", "核心初始化失败"))?;
        directories.retain(|_, gate| gate.strong_count() > 0);
        if let Some(gate) = directories.get(&path).and_then(Weak::upgrade) {
            gate
        } else {
            let gate = Arc::new(AsyncMutex::new(()));
            directories.insert(path, Arc::downgrade(&gate));
            gate
        }
    };
    Ok(gate.lock_owned().await)
}

// Resolve aliases without creating the private directory before its lifecycle lease is acquired.
fn directory_identity(dir: &Path) -> std::io::Result<PathBuf> {
    let mut prefix = std::path::absolute(dir)?;
    let mut missing = Vec::new();
    loop {
        match std::fs::canonicalize(&prefix) {
            Ok(mut identity) => {
                for component in missing.into_iter().rev() {
                    identity.push(component);
                }
                return Ok(identity);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let component = prefix.file_name().ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid data directory")
                })?;
                missing.push(component.to_owned());
                if !prefix.pop() {
                    return Err(error);
                }
            }
            Err(error) => return Err(error),
        }
    }
}

struct Call {
    session: Weak<Session>,
    id: u64,
    state: Mutex<CallState>,
    changed: watch::Sender<bool>,
}
struct Completion(Option<Arc<Call>>);
impl Completion {
    fn finish(mut self, reply: Reply) {
        if let Some(call) = self.0.take() {
            call.finish(reply);
        }
    }
}
impl Drop for Completion {
    fn drop(&mut self) {
        if let Some(call) = self.0.take() {
            call.finish(Reply::failure(
                500,
                "CORE_REQUEST_FAILED",
                "核心请求失败，请重试",
            ));
        }
    }
}
#[derive(Default)]
struct CallState {
    reply: Option<Reply>,
    task: Option<AbortHandle>,
    cancelled: bool,
    accepted: bool,
}
impl Call {
    fn ready(reply: Reply) -> Arc<Self> {
        let (changed, _) = watch::channel(true);
        Arc::new(Self {
            session: Weak::new(),
            id: 0,
            state: Mutex::new(CallState {
                reply: Some(reply),
                ..CallState::default()
            }),
            changed,
        })
    }
    async fn result(&self) -> Reply {
        let mut changed = self.changed.subscribe();
        loop {
            if let Ok(state) = self.state.lock() {
                if let Some(reply) = &state.reply {
                    return reply.clone();
                }
            } else {
                return Reply::closed();
            }
            if changed.changed().await.is_err() {
                return Reply::closed();
            }
        }
    }
    fn finish(&self, mut reply: Reply) {
        if let Ok(mut state) = self.state.lock() {
            state.task = None;
            if !state.cancelled {
                state.reply = Some(reply);
                self.changed.send_replace(true);
                return;
            }
        }
        if let Some(session) = self.session.upgrade() {
            session.release(reply.media.take());
        }
    }
    fn accept(&self) {
        if let Ok(mut state) = self.state.lock() {
            if state.cancelled || state.reply.is_none() {
                return;
            }
            state.accepted = true;
            if let Some(reply) = &mut state.reply {
                reply.media = None;
            }
        }
        if let Some(session) = self.session.upgrade() {
            session.remove(self.id);
        }
    }
    fn cancel(&self) {
        let mut media = None;
        if let Ok(mut state) = self.state.lock() {
            if state.cancelled || state.accepted {
                return;
            }
            state.cancelled = true;
            if let Some(task) = state.task.take() {
                task.abort();
            }
            if let Some(reply) = &mut state.reply {
                media = reply.media.take();
            }
            state.reply = Some(Reply::cancelled());
            self.changed.send_replace(true);
        }
        if let Some(session) = self.session.upgrade() {
            session.release(media);
            session.remove(self.id);
        }
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[path = "lifecycle_tests.rs"]
mod lifecycle_tests;
