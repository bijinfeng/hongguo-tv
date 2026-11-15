//! Account reservations, with calendar item identities kept separate from season series identities.
use super::{AccountService, online::OnlineScope};
use crate::{
    account::{
        AccountError,
        passport::{CloudError, PassportClient, PassportError},
    },
    catalog::Drama,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use utoipa::ToSchema;

/// A precise endpoint identity. Identical digits in different kinds are not interchangeable.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ReservationTarget {
    /// Calendar or account-list raw item identity.
    Item {
        /// Canonical positive signed-64-bit decimal identity.
        id: String,
    },
    /// Eligible season's series identity, never its nested subscribe_item.item_id.
    Series {
        /// Canonical positive signed-64-bit decimal identity.
        id: String,
    },
}
impl ReservationTarget {
    pub(crate) fn id(&self) -> &str {
        match self {
            Self::Item { id } | Self::Series { id } => id,
        }
    }
    fn observed(&self, item: &ReservationItem) -> Option<bool> {
        match self {
            Self::Item { id } => item.reservation_id.as_ref().map(|value| value == id),
            Self::Series { id } => item.series_id.as_ref().map(|value| value == id),
        }
    }
}
/// Both current-owner and current-epoch are required, never an account selector.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReservationQuery {
    /// Active authenticated account UID.
    pub owner_id: String,
    /// Current opaque account generation.
    pub owner_epoch: String,
}
/// One real account-list member; unavailable metadata never removes a valid identity.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ReservationItem {
    /// Raw item_id when valid; never inferred from series identity.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reservation_id: Option<String>,
    /// Actual subscribe_data series identity when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub series_id: Option<String>,
    /// Actual released/upcoming account-list group.
    pub online: bool,
    /// Supported released summary only; upcoming trailers do not become playable.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub drama: Option<Drama>,
    /// Actual bounded name, absent when unavailable.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub title: Option<String>,
    /// Approved public image or empty when unavailable.
    pub cover: String,
    /// Approved JPEG alternative or empty when unavailable.
    pub cover_fallback: String,
    /// Actual bounded description, empty when absent.
    pub intro: String,
    /// Upstream publication time in seconds, never inferred from the current date.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub publish_time: Option<u64>,
    /// Actual bounded publication label.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub publish_text: Option<String>,
    /// Actual bounded tags.
    pub tags: Vec<String>,
}
/// Complete bounded membership from both online and upcoming account lists.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ReservationSnapshot {
    /// Account that owned all page requests.
    pub owner_id: String,
    /// Generation that owned all page requests.
    pub owner_epoch: String,
    /// Complete validated members, without an atomic-remote-snapshot guarantee.
    pub items: Vec<ReservationItem>,
    /// Actual remote count when supplied consistently, not the visible-card count.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub online_total: Option<u32>,
    /// Actual remote count when supplied consistently, not the visible-card count.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub upcoming_total: Option<u32>,
}
/// Explicit online desired state, never a toggle or offline operation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReservationMutationRequest {
    /// Expected active account UID.
    pub owner_id: String,
    /// Expected account generation.
    pub owner_epoch: String,
    /// Identity selected by its real calendar/list/season source.
    pub target: ReservationTarget,
    /// True to reserve, false to cancel.
    pub enabled: bool,
}
/// A valid ACK plus a separate complete-membership observation result.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ReservationMutationResult {
    /// Owning account UID.
    pub owner_id: String,
    /// Owning generation.
    pub owner_epoch: String,
    /// Exact requested identity, including its kind.
    pub target: ReservationTarget,
    /// Explicit requested state.
    pub enabled: bool,
    /// Always true in this successful ACK result; ambiguous writes return an error.
    pub acknowledged: bool,
    /// True only when complete, sufficient same-scope identity evidence matches the goal.
    pub confirmed: bool,
    /// Complete observation when available, even if unknown or inconsistent with the goal.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub snapshot: Option<ReservationSnapshot>,
    /// Safe readback/storage failure code only.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reconciliation_error: Option<String>,
}
/// Reservation wire requires numeric JSON i64; preserve exact canonical decimal intent.
pub(crate) fn valid_reservation_id(id: &str) -> bool {
    id.parse::<i64>()
        .is_ok_and(|value| value > 0 && value.to_string() == id)
}
fn read_error(error: CloudError) -> AccountError {
    match error {
        CloudError::IncompleteReservation
        | CloudError::Passport(PassportError::InvalidResponse) => {
            AccountError::ReservationIncomplete
        }
        CloudError::Rejected => AccountError::ReservationRejected,
        CloudError::Passport(PassportError::InvalidInput) => AccountError::InvalidInput,
        CloudError::Passport(
            PassportError::InvalidIdentity | PassportError::MissingCredentials,
        ) => AccountError::IdentityMismatch,
        _ => AccountError::ReservationUnavailable,
    }
}
impl AccountService {
    pub(super) async fn read_reservations(
        &self,
        scope: &mut OnlineScope,
        client: &mut PassportClient,
    ) -> Result<ReservationSnapshot, AccountError> {
        let runtime = self.online.clone();
        let generation = scope.generation;
        let (items, online_total, upcoming_total) = self
            .online_network(
                scope,
                self.online.deadline(),
                client.pull_reservations(move || runtime.current(generation)),
                read_error,
            )
            .await?;
        self.save_online_credential(scope, client.credential())
            .await?;
        self.check_online_scope(scope).await?;
        Ok(ReservationSnapshot {
            owner_id: scope.owner_id.clone(),
            owner_epoch: scope.owner_epoch.clone(),
            items,
            online_total,
            upcoming_total,
        })
    }
    /// Complete both account-list groups after all admitted online account mutations.
    pub async fn reservation_snapshot(
        &self,
        query: ReservationQuery,
    ) -> Result<ReservationSnapshot, AccountError> {
        self.online_scope(
            &query.owner_id,
            &query.owner_epoch,
            AccountError::ReservationLoginRequired,
        )
        .await?;
        let _gate = self.online.gate.clone().lock_owned().await;
        let mut scope = self
            .online_scope(
                &query.owner_id,
                &query.owner_epoch,
                AccountError::ReservationLoginRequired,
            )
            .await?;
        let mut client = self.online.client(scope.credential.clone())?;
        self.read_reservations(&mut scope, &mut client).await
    }
    /// Send one explicit numeric-identity reservation request, then observe without replaying it.
    pub async fn set_reservation(
        &self,
        request: ReservationMutationRequest,
    ) -> Result<ReservationMutationResult, AccountError> {
        if !valid_reservation_id(request.target.id()) {
            return Err(AccountError::InvalidInput);
        }
        self.online_scope(
            &request.owner_id,
            &request.owner_epoch,
            AccountError::ReservationLoginRequired,
        )
        .await?;
        let mutation = self
            .online
            .admit_mutation()
            .map_err(|_| AccountError::ReservationBusy)?;
        let gate = self.online.gate.clone().lock_owned().await;
        let mut scope = self
            .online_scope(
                &request.owner_id,
                &request.owner_epoch,
                AccountError::ReservationLoginRequired,
            )
            .await?;
        let mut client = self.online.client(scope.credential.clone())?;
        let service = self.clone();
        tokio::spawn(async move {
            let (_gate, _mutation) = (gate, mutation);
            match service
                .online_network(
                    &mut scope,
                    Duration::from_secs(25),
                    client.set_reservation_update(request.target.id(), request.enabled),
                    read_error,
                )
                .await
            {
                Ok(()) => {}
                Err(
                    error @ (AccountError::ReservationRejected
                    | AccountError::OwnerChanged
                    | AccountError::InvalidInput
                    | AccountError::IdentityMismatch),
                ) => return Err(error),
                Err(_) => return Err(AccountError::ReservationUncertain),
            }
            let refreshed = client.credential();
            let observed = match service
                .save_online_credential(&scope, refreshed.clone())
                .await
            {
                Ok(()) => {
                    scope.credential = refreshed;
                    service.read_reservations(&mut scope, &mut client).await
                }
                Err(error) => Err(error),
            };
            service.check_online_scope(&scope).await?;
            let (snapshot, reconciliation_error) = match observed {
                Ok(snapshot) => (Some(snapshot), None),
                Err(AccountError::OwnerChanged) => return Err(AccountError::OwnerChanged),
                Err(error) => (None, Some(error.code().into())),
            };
            let confirmed = snapshot.as_ref().is_some_and(|snapshot| {
                let mut unknown = false;
                for item in &snapshot.items {
                    match request.target.observed(item) {
                        Some(true) => return request.enabled,
                        None => unknown = true,
                        Some(false) => {}
                    }
                }
                !request.enabled && !unknown
            });
            Ok(ReservationMutationResult {
                owner_id: request.owner_id,
                owner_epoch: request.owner_epoch,
                target: request.target,
                enabled: request.enabled,
                acknowledged: true,
                confirmed,
                snapshot,
                reconciliation_error,
            })
        })
        .await
        .map_err(|_| AccountError::ReservationUncertain)?
    }
}

#[cfg(test)]
#[path = "reservation/tests.rs"]
mod tests;
