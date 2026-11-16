//! Shared owner fencing, serialization and credential persistence for online account actions.
use super::AccountService;
use crate::account::{
    AccountError,
    passport::{CloudError, PassportClient, PassportError, PersistedSession},
};
use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, watch};
pub(super) struct OnlineRuntime {
    pub(super) gate: Arc<Mutex<()>>,
    mutation: Arc<AtomicBool>,
    stopped: AtomicBool,
    generation: watch::Sender<u64>,
    #[cfg(any(test, feature = "test-support"))]
    pub(super) fixture: std::sync::Mutex<Option<String>>,
    #[cfg(any(test, feature = "test-support"))]
    pub(super) timeout: std::sync::Mutex<Duration>,
}
impl Default for OnlineRuntime {
    fn default() -> Self {
        Self {
            gate: Arc::new(Mutex::new(())),
            mutation: Arc::new(AtomicBool::new(false)),
            stopped: AtomicBool::new(false),
            generation: watch::channel(0).0,
            #[cfg(any(test, feature = "test-support"))]
            fixture: std::sync::Mutex::new(None),
            #[cfg(any(test, feature = "test-support"))]
            timeout: std::sync::Mutex::new(Duration::from_secs(60)),
        }
    }
}
impl OnlineRuntime {
    pub(super) fn admit_mutation(&self) -> Result<MutationGuard, ()> {
        self.mutation
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| ())?;
        Ok(MutationGuard(self.mutation.clone()))
    }
    pub(super) fn interrupt(&self) {
        self.generation
            .send_modify(|value| *value = value.saturating_add(1));
    }
    pub(super) fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        self.interrupt();
    }
    pub(super) async fn drain(&self) {
        let _guard = self.gate.lock().await;
    }
    pub(super) fn current(&self, generation: u64) -> bool {
        !self.stopped.load(Ordering::Acquire) && *self.generation.borrow() == generation
    }
    pub(super) fn deadline(&self) -> Duration {
        #[cfg(any(test, feature = "test-support"))]
        {
            *self.timeout.lock().expect("follow timeout")
        }
        #[cfg(not(any(test, feature = "test-support")))]
        {
            Duration::from_secs(60)
        }
    }
    pub(super) fn client(&self, session: PersistedSession) -> Result<PassportClient, AccountError> {
        #[cfg(any(test, feature = "test-support"))]
        if let Some(origin) = &*self.fixture.lock().expect("follow fixture") {
            return PassportClient::for_loopback_tests(session, origin)
                .map_err(|_| AccountError::InvalidSession);
        }
        PassportClient::new(session).map_err(|_| AccountError::InvalidSession)
    }
}
pub(super) struct MutationGuard(Arc<AtomicBool>);
impl Drop for MutationGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
pub(super) struct OnlineScope {
    pub(super) owner_id: String,
    pub(super) owner_epoch: String,
    pub(super) generation: u64,
    cancellation: watch::Receiver<u64>,
    pub(super) credential: PersistedSession,
}
impl AccountService {
    pub(super) async fn online_scope(
        &self,
        owner_id: &str,
        owner_epoch: &str,
        login_error: AccountError,
    ) -> Result<OnlineScope, AccountError> {
        let cancellation = self.online.generation.subscribe();
        let generation = *cancellation.borrow();
        let state = self.state.lock().await;
        state.check_scope(owner_id, owner_epoch)?;
        let saved = state.saved.as_ref().ok_or(login_error)?;
        if !self.online.current(generation) {
            return Err(AccountError::OwnerChanged);
        }
        Ok(OnlineScope {
            owner_id: owner_id.into(),
            owner_epoch: owner_epoch.into(),
            generation,
            cancellation,
            credential: saved.credential.clone(),
        })
    }
    pub(super) async fn check_online_scope(&self, scope: &OnlineScope) -> Result<(), AccountError> {
        let state = self.state.lock().await;
        state.check_scope(&scope.owner_id, &scope.owner_epoch)?;
        if !self.online.current(scope.generation) {
            return Err(AccountError::OwnerChanged);
        }
        Ok(())
    }
    pub(super) async fn online_network<T>(
        &self,
        scope: &mut OnlineScope,
        duration: Duration,
        work: impl Future<Output = Result<T, CloudError>>,
        map_error: fn(CloudError) -> AccountError,
    ) -> Result<T, AccountError> {
        self.check_online_scope(scope).await?;
        let result = tokio::select! {
            biased;
            _ = scope.cancellation.changed() => return Err(AccountError::OwnerChanged),
            result = tokio::time::timeout(duration, work) => result.map_err(|_| map_error(CloudError::Passport(PassportError::Transport)))?.map_err(map_error),
        };
        self.check_online_scope(scope).await?;
        result
    }
    pub(super) async fn save_online_credential(
        &self,
        scope: &OnlineScope,
        credential: PersistedSession,
    ) -> Result<(), AccountError> {
        let original =
            serde_json::to_vec(&scope.credential).map_err(|_| AccountError::InvalidSession)?;
        let next = serde_json::to_vec(&credential).map_err(|_| AccountError::InvalidSession)?;
        if original == next {
            return self.check_online_scope(scope).await;
        }
        let mut state = self.state.clone().lock_owned().await;
        state.check_scope(&scope.owner_id, &scope.owner_epoch)?;
        if !self.online.current(scope.generation) {
            return Err(AccountError::OwnerChanged);
        }
        let mut saved = state
            .saved
            .as_ref()
            .ok_or(AccountError::IdentityMismatch)?
            .clone();
        // Another same-epoch operation may have refreshed credentials while this request was in flight.
        if serde_json::to_vec(&saved.credential).map_err(|_| AccountError::InvalidSession)?
            != original
        {
            return Ok(());
        }
        saved.credential = credential;
        saved.validate()?;
        let storage = self.storage.clone();
        let runtime = self.online.clone();
        let generation = scope.generation;
        // Once persistence is admitted it retains the coordinator even if the caller disappears.
        tokio::spawn(async move {
            if !runtime.current(generation) {
                return Err(AccountError::OwnerChanged);
            }
            storage.replace(Some(saved.clone())).await?;
            if !runtime.current(generation) {
                return Err(AccountError::OwnerChanged);
            }
            state.saved = Some(saved);
            Ok(())
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }
}
