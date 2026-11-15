//! Host-owned cloud worker. Network work never retains the account coordinator lock.
use super::{AccountService, State, now_millis};
use crate::{
    account::{
        AccountCommandResult, AccountError, AccountSyncState, GuestHistoryImportResult,
        passport::{
            CloudCard, CloudError, CloudFavorite, CloudHistory, CloudLibrary, PassportClient,
            PersistedSession,
        },
    },
    library::{
        Entry, FavoriteEntry, PendingChange, RemoteFavorite, RemoteHistory, RemoteLibrary,
        SyncMetadata,
    },
};
use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Notify, OwnedMutexGuard, watch};

pub(super) struct SyncRuntime {
    started: AtomicBool,
    running: AtomicBool,
    stopped: AtomicBool,
    generation: watch::Sender<u64>,
    wake: Notify,
    #[cfg(test)]
    timing: std::sync::Mutex<Timing>,
    #[cfg(test)]
    fixture: std::sync::Mutex<Option<String>>,
    #[cfg(test)]
    save_started: Notify,
}
impl Default for SyncRuntime {
    fn default() -> Self {
        Self {
            started: AtomicBool::new(false),
            running: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
            generation: watch::channel(0).0,
            wake: Notify::new(),
            #[cfg(test)]
            timing: std::sync::Mutex::new(Timing::default()),
            #[cfg(test)]
            fixture: std::sync::Mutex::new(None),
            #[cfg(test)]
            save_started: Notify::new(),
        }
    }
}
#[derive(Clone, Copy)]
struct Timing {
    coalesce: Duration,
    interval: Duration,
    round: Duration,
}
impl Default for Timing {
    fn default() -> Self {
        Self {
            coalesce: Duration::from_secs(2),
            interval: Duration::from_secs(90),
            round: Duration::from_secs(180),
        }
    }
}
impl SyncRuntime {
    pub(super) fn is_running(&self) -> bool {
        self.running.load(Ordering::Acquire) && !self.stopped.load(Ordering::Acquire)
    }
    pub(super) fn wake(&self) {
        self.wake.notify_one();
    }
    pub(super) fn interrupt(&self) {
        self.generation
            .send_modify(|generation| *generation = generation.saturating_add(1));
    }
    fn stop(&self) {
        if !self.stopped.swap(true, Ordering::AcqRel) {
            self.interrupt();
            self.wake.notify_waiters();
        }
    }
    fn current(&self, scope: &Scope) -> bool {
        scope.alive.load(Ordering::Acquire)
            && self.is_running()
            && *self.generation.borrow() == scope.generation
    }
    fn timing(&self) -> Timing {
        #[cfg(test)]
        {
            *self.timing.lock().expect("sync test timing")
        }
        #[cfg(not(test))]
        {
            Timing::default()
        }
    }
    fn client(&self, session: PersistedSession) -> Result<PassportClient, AccountError> {
        #[cfg(test)]
        if let Some(origin) = &*self.fixture.lock().expect("sync test fixture") {
            return PassportClient::for_loopback_tests(session, origin)
                .map_err(|_| AccountError::InvalidSession);
        }
        PassportClient::new(session).map_err(|_| AccountError::InvalidSession)
    }
}
struct Worker(Arc<SyncRuntime>);
impl Drop for Worker {
    fn drop(&mut self) {
        self.0.stop();
        self.0.running.store(false, Ordering::Release);
    }
}
#[derive(Clone)]
struct Scope {
    owner: String,
    epoch: String,
    generation: u64,
    alive: Arc<AtomicBool>,
}
struct Round(Arc<AtomicBool>);
impl Drop for Round {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
enum SyncFailure {
    Account(AccountError),
    Cloud(CloudError),
    Timeout,
}
impl From<AccountError> for SyncFailure {
    fn from(error: AccountError) -> Self {
        Self::Account(error)
    }
}
impl From<CloudError> for SyncFailure {
    fn from(error: CloudError) -> Self {
        Self::Cloud(error)
    }
}
impl SyncFailure {
    fn message(&self) -> String {
        match self {
            Self::Timeout => "云同步超时，请稍后重试",
            Self::Cloud(CloudError::Passport(crate::account::passport::PassportError::Timeout)) => {
                "云同步超时，请稍后重试"
            }
            Self::Cloud(CloudError::Passport(
                crate::account::passport::PassportError::MissingCredentials
                | crate::account::passport::PassportError::InvalidIdentity,
            )) => "账号凭据未能确认，请重新登录",
            Self::Cloud(_) => "云同步暂不可用，本机记录与待同步操作已保留",
            Self::Account(AccountError::Storage | AccountError::InvalidSession) => {
                "账号同步状态保存失败，请检查本机存储后重试"
            }
            Self::Account(_) => "本机同步记录读写失败，请重试",
        }
        .into()
    }
}

impl AccountService {
    /// Stop synchronously before host shutdown. New fenced steps are rejected immediately.
    /// Already-admitted SQLite work can finish; cancellation never claims a rollback.
    pub fn stop_sync(&self) {
        self.sync.stop();
    }

    /// Run once per service lifetime, explicitly spawned and awaited by the owning host.
    /// A second worker is rejected; shutdown or dropping the future permanently stops it.
    pub async fn run_sync(&self, mut shutdown: watch::Receiver<bool>) -> Result<(), AccountError> {
        if self.sync.stopped.load(Ordering::Acquire) {
            return Err(AccountError::NotImplemented);
        }
        if self
            .sync
            .started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(AccountError::Busy);
        }
        self.sync.running.store(true, Ordering::Release);
        let _worker = Worker(self.sync.clone());
        let timing = self.sync.timing();
        let mut ticker = tokio::time::interval(timing.interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        ticker.tick().await;
        if self.state.lock().await.saved.is_some() {
            self.sync.wake();
        }
        let mut lifecycle = self.sync.generation.subscribe();
        loop {
            if self.sync.stopped.load(Ordering::Acquire) || *shutdown.borrow() {
                break;
            }
            tokio::select! {
                biased;
                _ = shutdown.changed() => { self.stop_sync(); break; }
                _ = lifecycle.changed() => { continue; }
                _ = self.sync.wake.notified() => {},
                _ = ticker.tick() => {},
            }
            if self.sync.stopped.load(Ordering::Acquire) || *shutdown.borrow() {
                break;
            }
            let mut stopping = self.sync.generation.subscribe();
            tokio::select! {
                biased;
                _ = shutdown.changed() => { self.stop_sync(); break; }
                _ = stopping.changed() => { continue; }
                _ = tokio::time::sleep(timing.coalesce) => {},
            }
            let scope = {
                let mut state = self.state.lock().await;
                if self.sync.stopped.load(Ordering::Acquire) {
                    break;
                }
                if state.saved.is_none() {
                    continue;
                }
                state.syncing = true;
                state.sync_error = None;
                Scope {
                    owner: state.owner().into(),
                    epoch: state.epoch.clone(),
                    generation: *self.sync.generation.borrow(),
                    alive: Arc::new(AtomicBool::new(true)),
                }
            };
            let round = Round(scope.alive.clone());
            let mut cancelled = self.sync.generation.subscribe();
            if !self.sync.current(&scope) {
                continue;
            }
            let result = tokio::select! {
                biased;
                _ = shutdown.changed() => { self.stop_sync(); break; }
                _ = cancelled.changed() => { continue; }
                result = tokio::time::timeout(timing.round, self.sync_round(&scope)) => {
                    match result { Ok(result) => result, Err(_) => Err(SyncFailure::Timeout) }
                },
            };
            drop(round);
            if let Err(error) = result {
                // Invalidating the round fences admitted continuations; acquiring the guard drains them.
                let status_scope = Scope {
                    alive: Arc::new(AtomicBool::new(true)),
                    ..scope.clone()
                };
                let _ = self
                    .scoped(&status_scope, move |mut state| async move {
                        state.syncing = false;
                        state.sync_error = Some(error.message());
                        Ok(())
                    })
                    .await;
            }
        }
        self.stop_sync();
        // A graceful host shutdown drains admitted work before the worker reports completion.
        self.state.lock().await.syncing = false;
        Ok(())
    }

    // The owned guard lives in admitted work, even when its waiter/round is cancelled.
    async fn scoped<T, F, Fut>(&self, scope: &Scope, operation: F) -> Result<T, AccountError>
    where
        T: Send + 'static,
        F: FnOnce(OwnedMutexGuard<State>) -> Fut + Send + 'static,
        Fut: Future<Output = Result<T, AccountError>> + Send + 'static,
    {
        let state = self.state.clone().lock_owned().await;
        state.check_scope(&scope.owner, &scope.epoch)?;
        if !self.sync.current(scope) {
            return Err(AccountError::OwnerChanged);
        }
        let runtime = self.sync.clone();
        let scope = scope.clone();
        tokio::spawn(async move {
            if !runtime.current(&scope) {
                return Err(AccountError::OwnerChanged);
            }
            let result = operation(state).await;
            if !runtime.current(&scope) {
                return Err(AccountError::OwnerChanged);
            }
            result
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }

    async fn sync_round(&self, scope: &Scope) -> Result<(), SyncFailure> {
        let (session, local, boundary) = self
            .scoped(scope, |state| async move {
                let session = state
                    .saved
                    .as_ref()
                    .ok_or(AccountError::IdentityMismatch)?
                    .clone();
                session.validate()?;
                let boundary = state
                    .library
                    .sync_boundary()
                    .await
                    .map_err(|_| AccountError::Library)?;
                let local = state
                    .library
                    .local_sync_snapshot()
                    .await
                    .map_err(|_| AccountError::Library)?;
                Ok((session, local, boundary))
            })
            .await?;
        let mut client = self.sync.client(session.credential)?;
        let remote = client.pull_library(&scope.owner, &to_cloud(local)?).await?;
        self.scoped(scope, move |state| async move {
            state
                .library
                .merge_remote(from_cloud(remote), boundary)
                .await
                .map_err(|_| AccountError::Library)?;
            Ok(())
        })
        .await?;
        loop {
            let next = self
                .scoped(scope, |state| async move {
                    state
                        .library
                        .next_pending()
                        .await
                        .map_err(|_| AccountError::Library)
                })
                .await?;
            let Some(next) = next else {
                break;
            };
            match next.change {
                PendingChange::Progress(history) => {
                    client.upload_progress(&cloud_history(*history)?).await?
                }
                PendingChange::Favorite(value) => {
                    client.set_favorite(&next.series_id, value).await?
                }
            }
            self.scoped(scope, move |state| async move {
                state
                    .library
                    .ack_sync(next.sequence)
                    .await
                    .map_err(|_| AccountError::Library)
            })
            .await?;
        }
        let credential = client.credential();
        let storage = self.storage.clone();
        let runtime = self.sync.clone();
        let owned = scope.clone();
        self.scoped(scope, move |mut state| async move {
            let mut saved = state
                .saved
                .as_ref()
                .ok_or(AccountError::IdentityMismatch)?
                .clone();
            saved.credential = credential;
            saved.validate()?;
            #[cfg(test)]
            runtime.save_started.notify_one();
            storage.replace(Some(saved.clone())).await?;
            if !runtime.current(&owned) {
                return Err(AccountError::OwnerChanged);
            }
            state.saved = Some(saved);
            let stamp = i64::try_from(now_millis()?).map_err(|_| AccountError::Storage)?;
            state
                .library
                .mark_synced(stamp)
                .await
                .map_err(|_| AccountError::Library)?;
            if !runtime.current(&owned) {
                return Err(AccountError::OwnerChanged);
            }
            state.syncing = false;
            state.sync_error = None;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub(super) async fn request_sync(
        &self,
        owner: &str,
        epoch: &str,
    ) -> Result<AccountCommandResult, AccountError> {
        let mut state = self.state.lock().await;
        state.check_scope(owner, epoch)?;
        if state.saved.is_none() {
            return Err(AccountError::IdentityMismatch);
        }
        if !self.sync.running.load(Ordering::Acquire) || self.sync.stopped.load(Ordering::Acquire) {
            return Err(AccountError::NotImplemented);
        }
        self.sync.wake();
        state.refresh_sync_view().await?;
        let library = state
            .library
            .snapshot()
            .await
            .map_err(|_| AccountError::Library)?;
        Ok(AccountCommandResult {
            account: state.account(),
            library,
            import_history: None,
        })
    }

    pub(super) async fn import_history(
        &self,
        owner: &str,
        epoch: &str,
    ) -> Result<AccountCommandResult, AccountError> {
        let mut state = self.state.clone().lock_owned().await;
        state.check_scope(owner, epoch)?;
        if state.saved.is_none() {
            return Err(AccountError::IdentityMismatch);
        }
        let runtime = self.sync.clone();
        tokio::spawn(async move {
            // Snapshot waits for the exact admitted tail before importing, without sealing it.
            state
                .library
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?;
            let guest = state
                .guest
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?;
            let imported: GuestHistoryImportResult = state
                .library
                .import_guest_history(guest)
                .await
                .map_err(|error| match error {
                    crate::library::LibraryError::SyncQueueFull => {
                        AccountError::LibrarySyncQueueFull
                    }
                    _ => AccountError::Library,
                })?;
            runtime.wake();
            state.refresh_sync_view().await?;
            let library = state
                .library
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?;
            Ok(AccountCommandResult {
                account: state.account(),
                library,
                import_history: Some(imported),
            })
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }
}

impl State {
    pub(super) async fn refresh_sync_view(&mut self) -> Result<(), AccountError> {
        self.guest_history = None;
        self.sync_view = self
            .library
            .sync_status()
            .await
            .map_err(|_| AccountError::Library)?;
        if self.saved.is_some() {
            let guest = self
                .guest
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?;
            self.guest_history = Some(
                self.library
                    .guest_history_status(&guest)
                    .await
                    .map_err(|_| AccountError::Library)?,
            );
            if self.syncing {
                self.sync_view.state = AccountSyncState::Syncing;
            } else if let Some(error) = &self.sync_error {
                self.sync_view.state = AccountSyncState::Error;
                self.sync_view.error = Some(error.clone());
            }
        }
        Ok(())
    }
}

fn cloud_history(row: RemoteHistory) -> Result<CloudHistory, AccountError> {
    let entry = row.entry;
    Ok(CloudHistory {
        card: card(entry.drama, row.metadata),
        episode: entry.episode.ok_or(AccountError::Library)?,
        video_id: entry.video_id,
        position: entry.position.ok_or(AccountError::Library)?,
        duration: entry.duration.ok_or(AccountError::Library)?,
        completed: entry.completed.ok_or(AccountError::Library)?,
        last_played_at: entry.last_played_at.ok_or(AccountError::Library)?,
    })
}
fn card(drama: crate::catalog::Drama, metadata: SyncMetadata) -> CloudCard {
    CloudCard {
        drama,
        season_index: metadata.season_index,
        multi_season: metadata.multi_season,
        metadata_pending: metadata.metadata_pending,
    }
}
fn to_cloud(local: RemoteLibrary) -> Result<CloudLibrary, AccountError> {
    Ok(CloudLibrary {
        owner_id: local.owner_id,
        history: local
            .history
            .into_iter()
            .map(cloud_history)
            .collect::<Result<_, _>>()?,
        favorites: local
            .favorites
            .into_iter()
            .map(|row| CloudFavorite {
                card: card(row.entry.drama, row.metadata),
                favorite_at: row.entry.favorite_at,
            })
            .collect(),
    })
}
fn metadata(card: &CloudCard) -> SyncMetadata {
    SyncMetadata {
        season_index: card.season_index,
        multi_season: card.multi_season,
        metadata_pending: card.metadata_pending,
    }
}
fn from_cloud(remote: CloudLibrary) -> RemoteLibrary {
    RemoteLibrary {
        owner_id: remote.owner_id,
        history: remote
            .history
            .into_iter()
            .map(|row| RemoteHistory {
                metadata: metadata(&row.card),
                entry: Entry {
                    drama: row.card.drama,
                    episode: Some(row.episode),
                    video_id: row.video_id,
                    position: Some(row.position),
                    duration: Some(row.duration),
                    completed: Some(row.completed),
                    last_played_at: Some(row.last_played_at),
                },
            })
            .collect(),
        favorites: remote
            .favorites
            .into_iter()
            .map(|row| RemoteFavorite {
                metadata: metadata(&row.card),
                entry: FavoriteEntry {
                    drama: row.card.drama,
                    favorite_at: row.favorite_at,
                },
            })
            .collect(),
    }
}

#[cfg(test)]
#[path = "sync/tests.rs"]
mod tests;
