//! TV update state outlives pages; only verified candidates reach the Android installer.
use hongguo_updater::Candidate;
use nsh_core::prelude::*;
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

/// Opens one updater for the application lifetime.
#[module]
pub struct TvUpdates;
#[module]
impl TvUpdates {
    /// Restore a signed staged update using the actually installed Android version code.
    pub async fn open(current_build: u32) -> Result<TvUpdater, String> {
        let dir = data_dir().ok_or("应用数据目录不可用")?.join("updates");
        let restored = background(async move {
            let candidate = match Candidate::restore(&dir, current_build) {
                Ok(candidate) => candidate,
                Err(_) => {
                    hongguo_updater::clear(&dir)?;
                    None
                }
            };
            Ok::<_, String>((dir, candidate))
        })
        .await
        .map_err(|_| "无法恢复更新状态")??;
        let ready = restored.1.is_some();
        Ok(TvUpdater {
            inner: Arc::new(Updater {
                dir: restored.0,
                current_build,
                state: Mutex::new(State {
                    candidate: restored.1,
                    ready,
                }),
                closed: AtomicBool::new(false),
                busy: AtomicBool::new(false),
                cancel: AtomicBool::new(false),
                received: AtomicU64::new(0),
            }),
        })
    }
}
/// Native owner of checked metadata, downloads and cancellation.
#[class]
pub struct TvUpdater {
    inner: Arc<Updater>,
}
struct Updater {
    dir: PathBuf,
    current_build: u32,
    state: Mutex<State>,
    closed: AtomicBool,
    busy: AtomicBool,
    cancel: AtomicBool,
    received: AtomicU64,
}
struct State {
    candidate: Option<Candidate>,
    ready: bool,
}
struct Busy(Arc<Updater>);
impl Drop for Busy {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}
impl Updater {
    fn enter(self: &Arc<Self>) -> Result<Busy, String> {
        if self.closed.load(Ordering::Acquire) {
            return Err("更新服务已关闭".to_owned());
        }
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "更新操作正在进行")?;
        self.cancel.store(false, Ordering::Release);
        Ok(Busy(self.clone()))
    }
}
#[class]
impl TvUpdater {
    /// Return verified display/installer metadata and byte progress, never secret key material.
    pub fn snapshot(&self) -> Result<String, String> {
        let state = self.inner.state.lock().map_err(|_| "更新状态不可用")?;
        let mut value = serde_json::json!({"received": self.inner.received.load(Ordering::Relaxed), "ready": state.ready});
        if let Some(candidate) = &state.candidate {
            value["manifest"] =
                serde_json::to_value(candidate.manifest()).map_err(|_| "更新状态不可用")?;
            if state.ready {
                value["path"] = self
                    .inner
                    .dir
                    .join("update.apk")
                    .to_string_lossy()
                    .as_ref()
                    .into();
            }
        }
        Ok(value.to_string())
    }
    /// Check the fixed public GitHub Release source. A staged update remains locked until install.
    pub async fn check(this: Instance<Self>) -> Result<(), String> {
        let inner = this.with(|owner| owner.inner.clone());
        drop(this);
        let busy = inner.enter()?;
        background(async move {
            let _busy = busy;
            if inner.state.lock().map_err(|_| "更新状态不可用")?.ready {
                return Err("更新已准备好，请先安装".to_owned());
            }
            let candidate = Candidate::check(inner.current_build).await?;
            if inner.cancel.load(Ordering::Acquire) {
                return Err("检查已取消".to_owned());
            }
            inner.state.lock().map_err(|_| "更新状态不可用")?.candidate = candidate;
            Ok(())
        })
        .await
        .map_err(|_| "更新检查失败")?
    }
    /// Stream to private storage and publish an installable path only after all checks pass.
    pub async fn download(this: Instance<Self>) -> Result<(), String> {
        let inner = this.with(|owner| owner.inner.clone());
        drop(this);
        let busy = inner.enter()?;
        background(async move {
            let _busy = busy;
            let candidate = inner
                .state
                .lock()
                .map_err(|_| "更新状态不可用")?
                .candidate
                .clone()
                .ok_or("请先检查更新")?;
            inner.state.lock().map_err(|_| "更新状态不可用")?.ready = false;
            candidate
                .download(&inner.dir, &inner.cancel, &inner.received)
                .await?;
            inner.state.lock().map_err(|_| "更新状态不可用")?.ready = true;
            Ok(())
        })
        .await
        .map_err(|_| "更新下载失败")?
    }
    /// Request cancellation; partial bytes are removed before the download settles.
    pub fn cancel(&self) {
        self.inner.cancel.store(true, Ordering::Release);
    }
}
impl Drop for TvUpdater {
    fn drop(&mut self) {
        self.inner.closed.store(true, Ordering::Release);
        self.inner.cancel.store(true, Ordering::Release);
    }
}
