//! Account-owned online follow membership. No local library or offline write queue.
use super::AccountService;
use crate::account::{
    AccountError,
    passport::{CloudError, PassportClient, PassportError, PersistedSession},
};
use crate::catalog::{Drama, SeriesStatus};
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, watch};
use utoipa::ToSchema;

/// Preconditions for the active authenticated account, never an account selector.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FollowQuery {
    /// Exact active account UID.
    pub owner_id: String,
    /// Opaque generation from the current account snapshot.
    pub owner_epoch: String,
}

/// Remote membership survives missing or unsupported playable card metadata.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FollowItem {
    /// Exact series identity, never a reservation ID or episode VID.
    pub series_id: String,
    /// Supported compact card, without episodes or invented playback progress.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub drama: Option<Drama>,
    /// Actual upstream completion state when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub series_status: Option<SeriesStatus>,
    /// Actual remote latest-watched index; not a local resume checkpoint.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub latest_watched_episode: Option<u32>,
    /// Whether the upstream explicitly reports the account caught up.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub has_watched_latest_episode: Option<bool>,
    /// Actual bounded update label, never a generated schedule.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub show_update_frequency: Option<String>,
    /// Exact upstream update timestamp when supplied; no unit inference.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub follow_update_time: Option<u64>,
}

/// Complete validated remote membership for one current owner and epoch.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FollowSnapshot {
    /// Active authenticated UID.
    pub owner_id: String,
    /// Scope under which all pages were read.
    pub owner_epoch: String,
    /// Unique members in upstream order, including unavailable cards.
    pub items: Vec<FollowItem>,
}

/// One explicit online desired state, not a toggle or durable offline operation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FollowMutationRequest {
    /// Expected current authenticated UID.
    pub owner_id: String,
    /// Expected current generation.
    pub owner_epoch: String,
    /// Exact decimal series identity.
    pub series_id: String,
    /// True to add, false to cancel.
    pub enabled: bool,
}

/// Returned only after a valid remote ACK; confirmation also requires complete observation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FollowMutationResult {
    /// Account that owned this request.
    pub owner_id: String,
    /// Exact generation that owned this request.
    pub owner_epoch: String,
    /// Exact mutated series identity.
    pub series_id: String,
    /// Desired state sent to the remote service.
    pub enabled: bool,
    /// Always true on this success type; failures use AccountError.
    pub acknowledged: bool,
    /// True only when a same-scope complete snapshot observes the desired state.
    pub confirmed: bool,
    /// Complete observation when readback succeeded, even if it disagrees with the intent.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub snapshot: Option<FollowSnapshot>,
    /// Stable safe error code for failed readback, never upstream data.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reconciliation_error: Option<String>,
}

pub(super) struct FollowRuntime {
    gate: Arc<Mutex<()>>,
    mutation: Arc<AtomicBool>,
    stopped: AtomicBool,
    generation: watch::Sender<u64>,
    #[cfg(test)]
    fixture: std::sync::Mutex<Option<String>>,
    #[cfg(test)]
    timeout: std::sync::Mutex<Duration>,
}
impl Default for FollowRuntime {
    fn default() -> Self {
        Self {
            gate: Arc::new(Mutex::new(())),
            mutation: Arc::new(AtomicBool::new(false)),
            stopped: AtomicBool::new(false),
            generation: watch::channel(0).0,
            #[cfg(test)]
            fixture: std::sync::Mutex::new(None),
            #[cfg(test)]
            timeout: std::sync::Mutex::new(Duration::from_secs(60)),
        }
    }
}
impl FollowRuntime {
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
    fn current(&self, generation: u64) -> bool {
        !self.stopped.load(Ordering::Acquire) && *self.generation.borrow() == generation
    }
    fn deadline(&self) -> Duration {
        #[cfg(test)]
        {
            *self.timeout.lock().expect("follow timeout")
        }
        #[cfg(not(test))]
        {
            Duration::from_secs(60)
        }
    }
    fn client(&self, session: PersistedSession) -> Result<PassportClient, AccountError> {
        #[cfg(test)]
        if let Some(origin) = &*self.fixture.lock().expect("follow fixture") {
            return PassportClient::for_loopback_tests(session, origin)
                .map_err(|_| AccountError::InvalidSession);
        }
        PassportClient::new(session).map_err(|_| AccountError::InvalidSession)
    }
}
struct MutationGuard(Arc<AtomicBool>);
impl Drop for MutationGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
struct Scope {
    query: FollowQuery,
    generation: u64,
    cancellation: watch::Receiver<u64>,
    credential: PersistedSession,
}
fn read_error(error: CloudError) -> AccountError {
    match error {
        CloudError::IncompleteFollow | CloudError::Passport(PassportError::InvalidResponse) => {
            AccountError::FollowIncomplete
        }
        CloudError::Rejected => AccountError::FollowRejected,
        CloudError::Passport(PassportError::InvalidInput) => AccountError::InvalidInput,
        CloudError::Passport(
            PassportError::InvalidIdentity | PassportError::MissingCredentials,
        ) => AccountError::IdentityMismatch,
        _ => AccountError::FollowUnavailable,
    }
}

impl AccountService {
    async fn follow_scope(&self, query: FollowQuery) -> Result<Scope, AccountError> {
        let cancellation = self.follow.generation.subscribe();
        let generation = *cancellation.borrow();
        let state = self.state.lock().await;
        state.check_scope(&query.owner_id, &query.owner_epoch)?;
        let saved = state
            .saved
            .as_ref()
            .ok_or(AccountError::FollowLoginRequired)?;
        if !self.follow.current(generation) {
            return Err(AccountError::OwnerChanged);
        }
        Ok(Scope {
            query,
            generation,
            cancellation,
            credential: saved.credential.clone(),
        })
    }
    async fn check_follow_scope(&self, scope: &Scope) -> Result<(), AccountError> {
        let state = self.state.lock().await;
        state.check_scope(&scope.query.owner_id, &scope.query.owner_epoch)?;
        if !self.follow.current(scope.generation) {
            return Err(AccountError::OwnerChanged);
        }
        Ok(())
    }
    async fn follow_network<T>(
        &self,
        scope: &mut Scope,
        duration: Duration,
        work: impl Future<Output = Result<T, CloudError>>,
    ) -> Result<T, AccountError> {
        self.check_follow_scope(scope).await?;
        let result = tokio::select! {
            biased;
            _ = scope.cancellation.changed() => return Err(AccountError::OwnerChanged),
            result = tokio::time::timeout(duration, work) => result.map_err(|_| AccountError::FollowUnavailable)?.map_err(read_error),
        };
        self.check_follow_scope(scope).await?;
        result
    }
    async fn save_follow_credential(
        &self,
        scope: &Scope,
        credential: PersistedSession,
    ) -> Result<(), AccountError> {
        let original =
            serde_json::to_vec(&scope.credential).map_err(|_| AccountError::InvalidSession)?;
        let next = serde_json::to_vec(&credential).map_err(|_| AccountError::InvalidSession)?;
        if original == next {
            return self.check_follow_scope(scope).await;
        }
        let mut state = self.state.clone().lock_owned().await;
        state.check_scope(&scope.query.owner_id, &scope.query.owner_epoch)?;
        if !self.follow.current(scope.generation) {
            return Err(AccountError::OwnerChanged);
        }
        let mut saved = state
            .saved
            .as_ref()
            .ok_or(AccountError::FollowLoginRequired)?
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
        let runtime = self.follow.clone();
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
    async fn read_follow(
        &self,
        scope: &mut Scope,
        client: &mut PassportClient,
    ) -> Result<FollowSnapshot, AccountError> {
        let runtime = self.follow.clone();
        let generation = scope.generation;
        let items = self
            .follow_network(
                scope,
                self.follow.deadline(),
                client.pull_follow(move || runtime.current(generation)),
            )
            .await?;
        self.save_follow_credential(scope, client.credential())
            .await?;
        self.check_follow_scope(scope).await?;
        Ok(FollowSnapshot {
            owner_id: scope.query.owner_id.clone(),
            owner_epoch: scope.query.owner_epoch.clone(),
            items,
        })
    }

    /// Read complete authenticated membership after any previously admitted follow mutation.
    pub async fn follow_snapshot(
        &self,
        query: FollowQuery,
    ) -> Result<FollowSnapshot, AccountError> {
        // Reject obsolete/guest requests before waiting, then capture again under the gate.
        self.follow_scope(query.clone()).await?;
        let _gate = self.follow.gate.clone().lock_owned().await;
        let mut scope = self.follow_scope(query).await?;
        let mut client = self.follow.client(scope.credential.clone())?;
        self.read_follow(&mut scope, &mut client).await
    }

    /// Send one explicit online desired state. Losing the caller never replays the write.
    pub async fn set_follow(
        &self,
        request: FollowMutationRequest,
    ) -> Result<FollowMutationResult, AccountError> {
        if !super::super::passport::valid_id(&request.series_id) {
            return Err(AccountError::InvalidInput);
        }
        let query = FollowQuery {
            owner_id: request.owner_id.clone(),
            owner_epoch: request.owner_epoch.clone(),
        };
        self.follow_scope(query.clone()).await?;
        self.follow
            .mutation
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| AccountError::FollowBusy)?;
        let mutation = MutationGuard(self.follow.mutation.clone());
        let gate = self.follow.gate.clone().lock_owned().await;
        let mut scope = self.follow_scope(query).await?;
        let mut client = self.follow.client(scope.credential.clone())?;
        let service = self.clone();
        tokio::spawn(async move {
            let (_gate, _mutation) = (gate, mutation);
            let sent = service
                .follow_network(
                    &mut scope,
                    Duration::from_secs(25),
                    client.set_follow_update(&request.series_id, request.enabled),
                )
                .await;
            match sent {
                Ok(()) => {}
                Err(
                    error @ (AccountError::FollowRejected
                    | AccountError::OwnerChanged
                    | AccountError::InvalidInput
                    | AccountError::IdentityMismatch),
                ) => return Err(error),
                Err(_) => return Err(AccountError::FollowUncertain),
            }
            let refreshed = client.credential();
            let observed = match service
                .save_follow_credential(&scope, refreshed.clone())
                .await
            {
                Ok(()) => {
                    scope.credential = refreshed;
                    service.read_follow(&mut scope, &mut client).await
                }
                Err(error) => Err(error),
            };
            service.check_follow_scope(&scope).await?;
            let (snapshot, reconciliation_error) = match observed {
                Ok(snapshot) => (Some(snapshot), None),
                Err(AccountError::OwnerChanged) => return Err(AccountError::OwnerChanged),
                Err(error) => (None, Some(error.code().to_owned())),
            };
            let confirmed = snapshot.as_ref().is_some_and(|s| {
                s.items
                    .iter()
                    .any(|item| item.series_id == request.series_id)
                    == request.enabled
            });
            Ok(FollowMutationResult {
                owner_id: request.owner_id,
                owner_epoch: request.owner_epoch,
                series_id: request.series_id,
                enabled: request.enabled,
                acknowledged: true,
                confirmed,
                snapshot,
                reconciliation_error,
            })
        })
        .await
        .map_err(|_| AccountError::FollowUncertain)?
    }
}

#[cfg(test)]
#[path = "follow/tests.rs"]
mod tests;
