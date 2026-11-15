//! Account-owned online follow membership. No local library or offline write queue.
use super::{AccountService, online::OnlineScope};
use crate::account::{
    AccountError,
    passport::{CloudError, PassportClient, PassportError},
};
use crate::catalog::{Drama, SeriesStatus};
use serde::{Deserialize, Serialize};
use std::time::Duration;
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
    async fn read_follow(
        &self,
        scope: &mut OnlineScope,
        client: &mut PassportClient,
    ) -> Result<FollowSnapshot, AccountError> {
        let runtime = self.online.clone();
        let generation = scope.generation;
        let items = self
            .online_network(
                scope,
                self.online.deadline(),
                client.pull_follow(move || runtime.current(generation)),
                read_error,
            )
            .await?;
        self.save_online_credential(scope, client.credential())
            .await?;
        self.check_online_scope(scope).await?;
        Ok(FollowSnapshot {
            owner_id: scope.owner_id.clone(),
            owner_epoch: scope.owner_epoch.clone(),
            items,
        })
    }

    /// Read complete authenticated membership after any previously admitted follow mutation.
    pub async fn follow_snapshot(
        &self,
        query: FollowQuery,
    ) -> Result<FollowSnapshot, AccountError> {
        // Reject obsolete/guest requests before waiting, then capture again under the gate.
        self.online_scope(
            &query.owner_id,
            &query.owner_epoch,
            AccountError::FollowLoginRequired,
        )
        .await?;
        let _gate = self.online.gate.clone().lock_owned().await;
        let mut scope = self
            .online_scope(
                &query.owner_id,
                &query.owner_epoch,
                AccountError::FollowLoginRequired,
            )
            .await?;
        let mut client = self.online.client(scope.credential.clone())?;
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
        self.online_scope(
            &query.owner_id,
            &query.owner_epoch,
            AccountError::FollowLoginRequired,
        )
        .await?;
        let mutation = self
            .online
            .admit_mutation()
            .map_err(|_| AccountError::FollowBusy)?;
        let gate = self.online.gate.clone().lock_owned().await;
        let mut scope = self
            .online_scope(
                &query.owner_id,
                &query.owner_epoch,
                AccountError::FollowLoginRequired,
            )
            .await?;
        let mut client = self.online.client(scope.credential.clone())?;
        let service = self.clone();
        tokio::spawn(async move {
            let (_gate, _mutation) = (gate, mutation);
            let sent = service
                .online_network(
                    &mut scope,
                    Duration::from_secs(25),
                    client.set_follow_update(&request.series_id, request.enabled),
                    read_error,
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
                .save_online_credential(&scope, refreshed.clone())
                .await
            {
                Ok(()) => {
                    scope.credential = refreshed;
                    service.read_follow(&mut scope, &mut client).await
                }
                Err(error) => Err(error),
            };
            service.check_online_scope(&scope).await?;
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
pub(super) mod tests;
