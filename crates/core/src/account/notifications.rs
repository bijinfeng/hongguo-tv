//! Foreground account update notifications backed by a small owner-scoped store.
//!
//! Notifications are derived from complete follow/reservation reads. They are deliberately
//! local-only: no push worker, playback popup, cloud sync or guessed episode identity lives here.
use super::follow::{FollowItem, FollowSnapshot};
use super::reservation::{ReservationItem, ReservationSnapshot};
use super::{AccountError, AccountService, online::OnlineScope};
use crate::catalog::Drama;
use rusqlite::{Connection, OpenFlags, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{DirBuilder, OpenOptions},
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use utoipa::ToSchema;

const APPLICATION_ID: i64 = 0x48474e54;
const MAX_ITEMS: usize = 200;
const MAX_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;

/// Stable notification category derived from a real upstream transition.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum NotificationKind {
    /// The complete follow card reports a changed episode count/update time tuple.
    FollowUpdate,
    /// The same reservation identity moved from upcoming to online.
    ReservationOnline,
}

/// One bounded local notification. It never contains a VID, episode list, URL or credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NotificationItem {
    /// Stable event identity used by mark-read and deduplication.
    pub id: String,
    /// Source transition category.
    pub kind: NotificationKind,
    /// Real series identity when supplied by the source.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub series_id: Option<String>,
    /// Real reservation item identity when supplied by the source.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reservation_id: Option<String>,
    /// Bounded display title.
    pub title: String,
    /// Real episode count when the follow source supplied one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub episode: Option<u32>,
    /// Short user-facing reason, derived locally from the real transition.
    pub message: String,
    /// Unix seconds when the event was observed.
    pub created_at: u64,
    /// Explicit local read flag.
    pub read: bool,
    /// Optional card summary with detail-only fields removed.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub drama: Option<Drama>,
}

/// Owner precondition for a foreground refresh.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NotificationQuery {
    /// Exact active account UID.
    pub owner_id: String,
    /// Exact current account generation.
    pub owner_epoch: String,
}

/// Explicit single/all read command. Exactly one of `id` and `all=true` is accepted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NotificationMarkReadRequest {
    /// Exact active account UID.
    pub owner_id: String,
    /// Exact current account generation.
    pub owner_epoch: String,
    /// One stable item ID to mark read.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub id: Option<String>,
    /// Mark every current item read when true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub all: Option<bool>,
}

impl NotificationMarkReadRequest {
    fn validate(&self) -> Result<(), AccountError> {
        let all = self.all.unwrap_or(false);
        if all == self.id.is_some() || self.owner_id.is_empty() || self.owner_epoch.is_empty() {
            return Err(AccountError::NotificationInvalidRead);
        }
        if self.id.as_deref().is_some_and(|id| {
            id.is_empty() || id.len() > 256 || id.bytes().any(|b| b.is_ascii_control())
        }) {
            return Err(AccountError::NotificationInvalidRead);
        }
        Ok(())
    }
}

/// Complete local notification snapshot returned by every query/mutation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct NotificationSnapshot {
    /// Active owner UID.
    pub owner_id: String,
    /// Current owner generation.
    pub owner_epoch: String,
    /// Newest first, capped at 200 rows.
    pub items: Vec<NotificationItem>,
    /// Count from committed local rows only.
    pub unread_count: u32,
    /// Unix seconds of the last successful complete source read.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub checked_at: Option<u64>,
    /// True when the last explicit refresh failed and old rows are being served.
    pub stale: bool,
    /// Safe retry copy; never raw upstream data.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct FollowBaseline {
    episode_count: u32,
    update_time: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct ReservationBaseline {
    online: bool,
    reservation_id: Option<String>,
    series_id: Option<String>,
    title: String,
    drama: Option<Drama>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct StoredState {
    #[serde(default)]
    follow: BTreeMap<String, FollowBaseline>,
    #[serde(default)]
    reservations: BTreeMap<String, ReservationBaseline>,
    #[serde(default)]
    items: Vec<NotificationItem>,
    #[serde(default)]
    checked_at: Option<u64>,
}

#[derive(Clone)]
struct NotificationStore {
    path: PathBuf,
    owner: String,
}
impl NotificationStore {
    async fn open(directory: &Path, owner: &str) -> Result<Self, AccountError> {
        let path = directory
            .join("accounts")
            .join(format!("{owner}.notifications.sqlite3"));
        let owner = owner.to_owned();
        let init_owner = owner.clone();
        let init_path = path.clone();
        tokio::task::spawn_blocking(move || init(&init_path, &init_owner))
            .await
            .map_err(|_| AccountError::NotificationUnavailable)??;
        Ok(Self { path, owner })
    }

    async fn load(&self) -> Result<StoredState, AccountError> {
        let path = self.path.clone();
        let owner = self.owner.clone();
        tokio::task::spawn_blocking(move || {
            let connection = connect(&path, &owner)?;
            let payload: Option<String> = connection
                .query_row("SELECT payload FROM state WHERE singleton=1", [], |row| {
                    row.get(0)
                })
                .map_err(|_| AccountError::NotificationUnavailable)?;
            let state: StoredState = payload
                .map(|value| {
                    if value.len() > MAX_PAYLOAD_BYTES {
                        return Err(AccountError::NotificationUnavailable);
                    }
                    serde_json::from_str(&value).map_err(|_| AccountError::NotificationUnavailable)
                })
                .transpose()
                .map(|value| value.unwrap_or_default())?;
            let mut state = state;
            state.items.sort_by(|left, right| {
                right
                    .created_at
                    .cmp(&left.created_at)
                    .then_with(|| right.id.cmp(&left.id))
            });
            state.items.truncate(MAX_ITEMS);
            Ok(state)
        })
        .await
        .map_err(|_| AccountError::NotificationUnavailable)?
    }

    async fn save(&self, state: StoredState) -> Result<(), AccountError> {
        let path = self.path.clone();
        let owner = self.owner.clone();
        tokio::task::spawn_blocking(move || {
            let mut connection = connect(&path, &owner)?;
            let mut state = state;
            state.items.sort_by(|left, right| {
                right
                    .created_at
                    .cmp(&left.created_at)
                    .then_with(|| right.id.cmp(&left.id))
            });
            state.items.truncate(MAX_ITEMS);
            let payload =
                serde_json::to_string(&state).map_err(|_| AccountError::NotificationUnavailable)?;
            if payload.len() > MAX_PAYLOAD_BYTES {
                return Err(AccountError::NotificationUnavailable);
            }
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| AccountError::NotificationUnavailable)?;
            transaction
                .execute(
                    "UPDATE state SET payload=?1 WHERE singleton=1",
                    params![payload],
                )
                .map_err(|_| AccountError::NotificationUnavailable)?;
            transaction
                .commit()
                .map_err(|_| AccountError::NotificationUnavailable)
        })
        .await
        .map_err(|_| AccountError::NotificationUnavailable)?
    }
}

fn init(path: &Path, owner: &str) -> Result<(), AccountError> {
    let parent = path.parent().ok_or(AccountError::NotificationUnavailable)?;
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    match builder.create(parent) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return Err(AccountError::NotificationUnavailable),
    }
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(path) {
        Ok(file) => file
            .sync_all()
            .map_err(|_| AccountError::NotificationUnavailable)?,
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return Err(AccountError::NotificationUnavailable),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Spelled in full rather than importing `std::fs` at the top: only the unix branch
        // uses the module itself, and a bare `fs::{self, …}` import is unused on Windows,
        // where clippy runs with `-D warnings`.
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|_| AccountError::NotificationUnavailable)?;
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|_| AccountError::NotificationUnavailable)?;
    connection
        .pragma_update(None, "secure_delete", "ON")
        .map_err(|_| AccountError::NotificationUnavailable)?;
    connection
        .pragma_update(None, "synchronous", "FULL")
        .map_err(|_| AccountError::NotificationUnavailable)?;
    let id: i64 = connection
        .query_row("PRAGMA application_id", [], |row| row.get(0))
        .map_err(|_| AccountError::NotificationUnavailable)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| AccountError::NotificationUnavailable)?;
    if id == 0 && version == 0 {
        connection
            .execute_batch(
                "CREATE TABLE state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, payload TEXT NOT NULL);
                 INSERT INTO state(singleton,owner,payload) VALUES(1,'','{}');
                 PRAGMA application_id=1212632660; PRAGMA user_version=1;",
            )
            .map_err(|_| AccountError::NotificationUnavailable)?;
    } else if id != APPLICATION_ID || version != 1 {
        return Err(AccountError::NotificationUnavailable);
    }
    let integrity: String = connection
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .map_err(|_| AccountError::NotificationUnavailable)?;
    if integrity != "ok" {
        return Err(AccountError::NotificationUnavailable);
    }
    let stored_owner: String = connection
        .query_row("SELECT owner FROM state WHERE singleton=1", [], |row| {
            row.get(0)
        })
        .map_err(|_| AccountError::NotificationUnavailable)?;
    if stored_owner.is_empty() {
        connection
            .execute(
                "UPDATE state SET owner=?1 WHERE singleton=1",
                params![owner],
            )
            .map_err(|_| AccountError::NotificationUnavailable)?;
    } else if stored_owner != owner {
        return Err(AccountError::NotificationUnavailable);
    }
    Ok(())
}

fn connect(path: &Path, owner: &str) -> Result<Connection, AccountError> {
    init(path, owner)?;
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|_| AccountError::NotificationUnavailable)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn summary(drama: Option<&Drama>) -> Option<Drama> {
    drama.map(|value| {
        let mut value = value.clone();
        value.episodes = None;
        value
    })
}

fn follow_baseline(items: &[FollowItem]) -> BTreeMap<String, FollowBaseline> {
    items
        .iter()
        .filter_map(|item| {
            Some((
                item.series_id.clone(),
                FollowBaseline {
                    episode_count: item.drama.as_ref()?.episode_count?,
                    update_time: item.follow_update_time?,
                },
            ))
        })
        .collect()
}

fn reservation_baseline(items: &[ReservationItem]) -> BTreeMap<String, ReservationBaseline> {
    items
        .iter()
        .filter_map(|item| {
            let (key, reservation_id, series_id) = if let Some(id) = &item.reservation_id {
                (
                    format!("item:{id}"),
                    Some(id.clone()),
                    item.series_id.clone(),
                )
            } else if let Some(id) = &item.series_id {
                (format!("series:{id}"), None, Some(id.clone()))
            } else {
                return None;
            };
            Some((
                key,
                ReservationBaseline {
                    online: item.online,
                    reservation_id,
                    series_id,
                    title: item
                        .title
                        .clone()
                        .or_else(|| item.drama.as_ref().map(|drama| drama.title.clone()))
                        .unwrap_or_default(),
                    drama: summary(item.drama.as_ref()),
                },
            ))
        })
        .collect()
}

fn generated_items(
    previous: &StoredState,
    follow: &FollowSnapshot,
    reservations: &ReservationSnapshot,
) -> Vec<NotificationItem> {
    let checked = now();
    let current_follow = follow_baseline(&follow.items);
    let current_reservations = reservation_baseline(&reservations.items);
    let mut next = previous.items.clone();
    for item in &follow.items {
        let Some(current) = current_follow.get(&item.series_id) else {
            continue;
        };
        let Some(old) = previous.follow.get(&item.series_id) else {
            continue;
        };
        if old.episode_count == current.episode_count && old.update_time == current.update_time {
            continue;
        }
        let id = format!(
            "follow:{}:{}:{}",
            item.series_id, current.episode_count, current.update_time
        );
        if next.iter().any(|row| row.id == id) {
            continue;
        }
        let title = item
            .drama
            .as_ref()
            .map_or_else(|| item.series_id.clone(), |drama| drama.title.clone());
        next.push(NotificationItem {
            id,
            kind: NotificationKind::FollowUpdate,
            series_id: Some(item.series_id.clone()),
            reservation_id: None,
            title,
            episode: Some(current.episode_count),
            message: format!("更新至第{}集", current.episode_count),
            created_at: checked,
            read: false,
            drama: summary(item.drama.as_ref()),
        });
    }
    for (key, current) in &current_reservations {
        let Some(old) = previous.reservations.get(key) else {
            continue;
        };
        if old.online || !current.online {
            continue;
        }
        let id = format!("reservation:{key}");
        if next.iter().any(|row| row.id == id) {
            continue;
        }
        next.push(NotificationItem {
            id,
            kind: NotificationKind::ReservationOnline,
            series_id: current.series_id.clone(),
            reservation_id: current.reservation_id.clone(),
            title: if current.title.is_empty() {
                key.clone()
            } else {
                current.title.clone()
            },
            episode: None,
            message: "已上线".into(),
            created_at: checked,
            read: false,
            drama: current.drama.clone(),
        });
    }
    next.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    next.truncate(MAX_ITEMS);
    next
}

fn snapshot(
    owner: &str,
    epoch: &str,
    state: StoredState,
    stale: bool,
    error: Option<String>,
) -> NotificationSnapshot {
    let unread_count = state.items.iter().filter(|item| !item.read).count() as u32;
    NotificationSnapshot {
        owner_id: owner.into(),
        owner_epoch: epoch.into(),
        items: state.items,
        unread_count,
        checked_at: state.checked_at,
        stale,
        error,
    }
}

fn source_error(error: AccountError) -> AccountError {
    match error {
        AccountError::OwnerChanged => AccountError::OwnerChanged,
        AccountError::NotificationLoginRequired => AccountError::NotificationLoginRequired,
        AccountError::InvalidSession => AccountError::InvalidSession,
        AccountError::Storage => AccountError::Storage,
        _ => AccountError::NotificationIncomplete,
    }
}

impl AccountService {
    /// Refresh notifications from complete foreground follow and reservation snapshots.
    pub async fn notification_snapshot(
        &self,
        query: NotificationQuery,
    ) -> Result<NotificationSnapshot, AccountError> {
        self.online_scope(
            &query.owner_id,
            &query.owner_epoch,
            AccountError::NotificationLoginRequired,
        )
        .await?;
        let _gate = self.online.gate.clone().lock_owned().await;
        let mut scope: OnlineScope = self
            .online_scope(
                &query.owner_id,
                &query.owner_epoch,
                AccountError::NotificationLoginRequired,
            )
            .await?;
        let store = NotificationStore::open(&self.directory, &query.owner_id).await?;
        let previous = store.load().await?;
        let mut client = self.online.client(scope.credential.clone())?;
        let follow = match self.read_follow(&mut scope, &mut client).await {
            Ok(value) => value,
            Err(error) => {
                let error = source_error(error);
                if matches!(
                    error,
                    AccountError::OwnerChanged
                        | AccountError::InvalidSession
                        | AccountError::Storage
                ) {
                    return Err(error);
                }
                // A source can fail just as logout or account switching interrupts the
                // online generation. Re-check before exposing the old snapshot so a
                // late stale response cannot cross the owner boundary.
                self.check_online_scope(&scope).await?;
                return Ok(snapshot(
                    &query.owner_id,
                    &query.owner_epoch,
                    previous,
                    true,
                    Some(error.to_string()),
                ));
            }
        };
        let reservations = match self.read_reservations(&mut scope, &mut client).await {
            Ok(value) => value,
            Err(error) => {
                let error = source_error(error);
                if matches!(
                    error,
                    AccountError::OwnerChanged
                        | AccountError::InvalidSession
                        | AccountError::Storage
                ) {
                    return Err(error);
                }
                self.check_online_scope(&scope).await?;
                return Ok(snapshot(
                    &query.owner_id,
                    &query.owner_epoch,
                    previous,
                    true,
                    Some(error.to_string()),
                ));
            }
        };
        self.check_online_scope(&scope).await?;
        let mut state = previous;
        let first = state.checked_at.is_none();
        if !first {
            state.items = generated_items(&state, &follow, &reservations);
        }
        state.follow = follow_baseline(&follow.items);
        state.reservations = reservation_baseline(&reservations.items);
        state.checked_at = Some(now());
        store.save(state.clone()).await?;
        self.check_online_scope(&scope).await?;
        Ok(snapshot(
            &query.owner_id,
            &query.owner_epoch,
            state,
            false,
            None,
        ))
    }

    /// Mark one notification or all current notifications read, without deleting history.
    pub async fn mark_notifications_read(
        &self,
        request: NotificationMarkReadRequest,
    ) -> Result<NotificationSnapshot, AccountError> {
        request.validate()?;
        self.online_scope(
            &request.owner_id,
            &request.owner_epoch,
            AccountError::NotificationLoginRequired,
        )
        .await?;
        let _gate = self.online.gate.clone().lock_owned().await;
        let scope = self
            .online_scope(
                &request.owner_id,
                &request.owner_epoch,
                AccountError::NotificationLoginRequired,
            )
            .await?;
        let store = NotificationStore::open(&self.directory, &request.owner_id).await?;
        let mut state = store.load().await?;
        if request.all.unwrap_or(false) {
            for item in &mut state.items {
                item.read = true;
            }
        } else if let Some(id) = request.id
            && let Some(item) = state.items.iter_mut().find(|item| item.id == id)
        {
            item.read = true;
        }
        store.save(state.clone()).await?;
        self.check_online_scope(&scope).await?;
        Ok(snapshot(
            &request.owner_id,
            &request.owner_epoch,
            state,
            false,
            None,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account::{FollowItem, ReservationItem};
    use crate::account::{
        passport::follow_fixture::{Fixture, Response, SERIES},
        service::follow::tests::{Temp, attach, switch},
    };
    use serde_json::json;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    fn follow(count: u32, update: u64) -> FollowItem {
        FollowItem {
            series_id: "100".into(),
            drama: Some(Drama {
                series_id: "100".into(),
                title: "测试剧".into(),
                episode_count: Some(count),
                ..Drama::default()
            }),
            follow_update_time: Some(update),
            ..FollowItem::default()
        }
    }

    fn reservation(online: bool) -> ReservationItem {
        ReservationItem {
            reservation_id: Some("200".into()),
            series_id: Some("100".into()),
            online,
            title: Some("预约剧".into()),
            ..ReservationItem::default()
        }
    }

    #[test]
    fn first_snapshot_only_builds_baseline_and_transition_is_deduplicated() {
        let follow_snapshot = FollowSnapshot {
            owner_id: "1".into(),
            owner_epoch: "e".into(),
            items: vec![follow(1, 10)],
        };
        let reservations = ReservationSnapshot {
            owner_id: "1".into(),
            owner_epoch: "e".into(),
            items: vec![reservation(false)],
            online_total: Some(0),
            upcoming_total: Some(1),
        };
        let initial = StoredState {
            follow: follow_baseline(&follow_snapshot.items),
            reservations: reservation_baseline(&reservations.items),
            ..StoredState::default()
        };
        let current = FollowSnapshot {
            items: vec![follow(2, 20)],
            ..follow_snapshot
        };
        let online = ReservationSnapshot {
            items: vec![reservation(true)],
            ..reservations
        };
        let next = generated_items(&initial, &current, &online);
        assert_eq!(next.len(), 2);
        assert!(next.iter().any(|item| item.id == "follow:100:2:20"));
        assert!(next.iter().any(|item| item.id == "reservation:item:200"));
        let state = StoredState {
            items: next.clone(),
            ..initial
        };
        assert_eq!(generated_items(&state, &current, &online), next);
    }

    #[test]
    fn incomplete_follow_fields_do_not_make_a_baseline_or_event() {
        let old = FollowSnapshot {
            owner_id: "1".into(),
            owner_epoch: "e".into(),
            items: vec![follow(1, 10)],
        };
        let current = FollowSnapshot {
            items: vec![FollowItem {
                series_id: "100".into(),
                ..FollowItem::default()
            }],
            ..old.clone()
        };
        let empty = ReservationSnapshot {
            owner_id: "1".into(),
            owner_epoch: "e".into(),
            items: Vec::new(),
            online_total: Some(0),
            upcoming_total: Some(0),
        };
        let previous = StoredState {
            follow: follow_baseline(&old.items),
            reservations: BTreeMap::new(),
            ..StoredState::default()
        };
        assert!(generated_items(&previous, &current, &empty).is_empty());
        assert!(follow_baseline(&current.items).is_empty());
    }

    #[test]
    fn mark_read_request_requires_exactly_one_operation() {
        let base = NotificationMarkReadRequest {
            owner_id: "1".into(),
            owner_epoch: "e".into(),
            id: None,
            all: Some(true),
        };
        assert!(base.validate().is_ok());
        assert!(
            NotificationMarkReadRequest {
                id: Some("x".into()),
                all: None,
                ..base.clone()
            }
            .validate()
            .is_ok()
        );
        assert!(
            NotificationMarkReadRequest {
                id: Some("x".into()),
                all: Some(true),
                ..base.clone()
            }
            .validate()
            .is_err()
        );
    }

    #[tokio::test]
    async fn store_roundtrip_is_durable_and_owner_bound() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hongguo-notification-test-{nonce}"));
        let store = NotificationStore::open(&root, "123").await.unwrap();
        let state = StoredState {
            checked_at: Some(7),
            items: vec![NotificationItem {
                id: "follow:100:2:20".into(),
                kind: NotificationKind::FollowUpdate,
                series_id: Some("100".into()),
                reservation_id: None,
                title: "测试剧".into(),
                episode: Some(2),
                message: "更新至第2集".into(),
                created_at: 7,
                read: false,
                drama: None,
            }],
            ..StoredState::default()
        };
        store.save(state.clone()).await.unwrap();
        assert_eq!(store.load().await.unwrap().items, state.items);
        let other = NotificationStore::open(&root, "456").await.unwrap();
        assert!(other.load().await.unwrap().items.is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn store_save_enforces_newest_two_hundred_items_before_persisting() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hongguo-notification-cap-{nonce}"));
        let store = NotificationStore::open(&root, "123").await.unwrap();
        let items = (0..205)
            .map(|index| NotificationItem {
                id: format!("follow:123:{index}:1"),
                kind: NotificationKind::FollowUpdate,
                series_id: Some("123".into()),
                reservation_id: None,
                title: format!("剧 {index}"),
                episode: Some(index),
                message: "更新".into(),
                created_at: index as u64,
                read: index % 2 == 0,
                drama: None,
            })
            .collect();
        store
            .save(StoredState {
                items,
                ..StoredState::default()
            })
            .await
            .unwrap();
        let state = store.load().await.unwrap();
        assert_eq!(state.items.len(), MAX_ITEMS);
        assert_eq!(state.items.first().map(|item| item.created_at), Some(204));
        assert_eq!(state.items.last().map(|item| item.created_at), Some(5));
        assert_eq!(state.items.first().map(|item| item.read), Some(true));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn service_refresh_builds_real_source_transitions_and_reads_them_back() {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let fixture = Fixture::new(move |request| {
            let round = seen.fetch_add(1, Ordering::SeqCst) / 3;
            if request.query.get("tab_type").map(String::as_str) != Some("14") {
                let group_online =
                    request.query.get("is_online").map(String::as_str) == Some("true");
                if group_online != (round > 0) {
                    return Response::json(
                        json!({"code":0,"data":{"has_more":false,"subscribe_items":[]}}),
                    );
                }
                let online = group_online;
                let row = json!({
                    "item_id": "200",
                    "is_online": online,
                    "subscribe_data": {"series_id": SERIES, "title": "预约剧", "episode_cnt": 2}
                });
                return Response::json(
                    json!({"code":0,"data":{"has_more":false,"subscribe_items":[row]}}),
                );
            }
            let episode = if round > 0 { 2 } else { 1 };
            let update = if round > 0 { 20 } else { 10 };
            Response::json(json!({"code":0,"data":{"has_more":false,"mix_data":[{
                "video_data": {
                    "video_id": SERIES,
                    "common": {"title": "追更剧", "video_content_type": 1, "vid_list": ["123"], "vid": "123"},
                    "expand": {"episode_cnt": episode, "update_info": {"follow_update_time_stamp": update}}
                }
            }]}}))
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, crate::account::passport::follow_fixture::UID).await;
        attach(&service, &fixture);
        let account = service.snapshot().await;
        let query = NotificationQuery {
            owner_id: account.owner_id,
            owner_epoch: account.owner_epoch,
        };
        let first = service.notification_snapshot(query.clone()).await.unwrap();
        assert!(first.items.is_empty() && !first.stale);
        let second = service.notification_snapshot(query.clone()).await.unwrap();
        assert_eq!(second.items.len(), 2);
        assert_eq!(second.unread_count, 2);
        let one = second.items[0].id.clone();
        let read = service
            .mark_notifications_read(NotificationMarkReadRequest {
                owner_id: query.owner_id.clone(),
                owner_epoch: query.owner_epoch.clone(),
                id: Some(one),
                all: None,
            })
            .await
            .unwrap();
        assert_eq!(read.unread_count, 1);
        let all = service
            .mark_notifications_read(NotificationMarkReadRequest {
                owner_id: query.owner_id,
                owner_epoch: query.owner_epoch,
                id: None,
                all: Some(true),
            })
            .await
            .unwrap();
        assert_eq!(all.unread_count, 0);
        drop(service);
        let reopened = temp.open().await;
        attach(&reopened, &fixture);
        let account = reopened.snapshot().await;
        let restored = reopened
            .notification_snapshot(NotificationQuery {
                owner_id: account.owner_id,
                owner_epoch: account.owner_epoch,
            })
            .await
            .unwrap();
        assert_eq!(restored.items.len(), 2);
        assert_eq!(restored.unread_count, 0);
    }

    #[tokio::test]
    async fn partial_source_failure_preserves_items_and_baseline_until_complete_retry() {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let fixture = Fixture::new(move |request| {
            let call = seen.fetch_add(1, Ordering::SeqCst);
            if request.query.get("tab_type").map(String::as_str) == Some("14") {
                let changed = call >= 3;
                let episode = if changed { 2 } else { 1 };
                let update = if changed { 20 } else { 10 };
                return Response::json(json!({"code":0,"data":{"has_more":false,"mix_data":[{
                    "video_data": {
                        "video_id": SERIES,
                        "common": {"title": "追更剧", "video_content_type": 1, "vid_list": ["123"], "vid": "123"},
                        "expand": {"episode_cnt": episode, "update_info": {"follow_update_time_stamp": update}}
                    }
                }]}}));
            }
            if call == 4 {
                let mut response = Response::json(json!({}));
                response.close = true;
                return response;
            }
            let recovered = call >= 5;
            let online = request.query.get("is_online").map(String::as_str) == Some("true");
            let include = if recovered { online } else { !online };
            let items = include
                .then(|| json!({
                    "item_id": "200",
                    "is_online": recovered,
                    "subscribe_data": {"series_id": SERIES, "title": "预约剧", "episode_cnt": 2}
                }))
                .into_iter()
                .collect::<Vec<_>>();
            Response::json(json!({"code":0,"data":{"has_more":false,"subscribe_items":items}}))
        })
        .await;
        let temp = Temp::new();
        let service = temp.open().await;
        switch(&service, crate::account::passport::follow_fixture::UID).await;
        attach(&service, &fixture);
        let account = service.snapshot().await;
        let query = NotificationQuery {
            owner_id: account.owner_id,
            owner_epoch: account.owner_epoch,
        };
        let first = service.notification_snapshot(query.clone()).await.unwrap();
        assert!(!first.stale && first.items.is_empty());
        let failed = service.notification_snapshot(query.clone()).await.unwrap();
        assert!(failed.stale);
        assert_eq!(failed.items, first.items);
        assert_eq!(failed.checked_at, first.checked_at);
        let recovered = service.notification_snapshot(query).await.unwrap();
        assert!(!recovered.stale);
        assert_eq!(recovered.items.len(), 2);
        assert_eq!(recovered.unread_count, 2);
    }
}
