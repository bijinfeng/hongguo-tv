//! Durable local reconciliation. Network and owner-epoch fencing belong to AccountService.
use super::{Entry, FavoriteEntry, Library, LibraryError, LibraryKind, LibraryStore, Progress};
use crate::account::{AccountSyncState, AccountSyncStatus};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub(super) const OUTBOX_LIMIT: i64 = 2000;

/// Protocol-neutral private metadata; never expands the public Drama contract.
#[derive(Clone, Default, PartialEq)]
pub(crate) struct SyncMetadata {
    pub(crate) season_index: u32,
    pub(crate) multi_season: bool,
    pub(crate) metadata_pending: bool,
}
#[derive(Clone, PartialEq)]
pub(crate) struct RemoteHistory {
    pub(crate) entry: Entry,
    pub(crate) metadata: SyncMetadata,
}
#[derive(Clone, PartialEq)]
pub(crate) struct RemoteFavorite {
    pub(crate) entry: FavoriteEntry,
    pub(crate) metadata: SyncMetadata,
}
#[derive(Clone, Default, PartialEq)]
pub(crate) struct RemoteLibrary {
    pub(crate) owner_id: String,
    pub(crate) history: Vec<RemoteHistory>,
    pub(crate) favorites: Vec<RemoteFavorite>,
}
#[derive(Clone, PartialEq)]
pub(crate) enum PendingChange {
    Progress(Box<RemoteHistory>),
    Favorite(bool),
}
#[derive(Clone, PartialEq)]
pub(crate) struct PendingSync {
    pub(crate) sequence: i64,
    pub(crate) series_id: String,
    pub(crate) change: PendingChange,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase", deny_unknown_fields)]
enum Payload {
    Progress { entry: Box<Entry> },
    Favorite { value: bool },
}

impl LibraryStore {
    pub(crate) async fn local_sync_snapshot(&self) -> Result<RemoteLibrary, LibraryError> {
        require_account(&self.2)?;
        let owner = self.2.clone();
        self.run(move |conn| {
            let snapshot = super::store::snapshot(conn, &owner)?;
            let history = snapshot
                .entries
                .into_iter()
                .map(|entry| {
                    let metadata = metadata(conn, &entry.drama.series_id)?;
                    Ok(RemoteHistory { entry, metadata })
                })
                .collect::<Result<Vec<_>, LibraryError>>()?;
            let favorites = snapshot
                .favorites
                .into_iter()
                .map(|entry| {
                    let metadata = metadata(conn, &entry.drama.series_id)?;
                    Ok(RemoteFavorite { entry, metadata })
                })
                .collect::<Result<Vec<_>, LibraryError>>()?;
            Ok(RemoteLibrary {
                owner_id: owner,
                history,
                favorites,
            })
        })
        .await
    }

    pub(crate) async fn sync_boundary(&self) -> Result<i64, LibraryError> {
        require_account(&self.2)?;
        self.run(|conn| sequence(conn)).await
    }

    /// The single worker captures boundary before pulling and cannot ACK during that pull.
    pub(crate) async fn merge_remote(
        &self,
        remote: RemoteLibrary,
        boundary: i64,
    ) -> Result<Library, LibraryError> {
        require_account(&self.2)?;
        if remote.owner_id != self.2 {
            return Err(LibraryError::OwnerChanged);
        }
        validate_snapshot(&remote)?;
        let owner = self.2.clone();
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if boundary < 0 || boundary > sequence(&tx)? {
                return Err(LibraryError::InvalidInput);
            }
            merge(&tx, remote, boundary)?;
            backfill(&tx)?;
            let result = super::store::snapshot(&tx, &owner)?;
            tx.commit()?;
            Ok(result)
        })
        .await
    }

    #[cfg(test)]
    pub(crate) async fn pending_sync(&self) -> Result<Vec<PendingSync>, LibraryError> {
        require_account(&self.2)?;
        self.run(|conn| pending(conn, OUTBOX_LIMIT + 1)).await
    }

    pub(crate) async fn next_pending(&self) -> Result<Option<PendingSync>, LibraryError> {
        require_account(&self.2)?;
        self.run(|conn| Ok(pending(conn, 1)?.into_iter().next()))
            .await
    }

    /// A stale ACK cannot remove a same-key replacement with a newer sequence.
    pub(crate) async fn ack_sync(&self, sequence: i64) -> Result<(), LibraryError> {
        require_account(&self.2)?;
        if sequence <= 0 {
            return Err(LibraryError::InvalidInput);
        }
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let removed = tx.execute("DELETE FROM sync_outbox WHERE sequence=?1", [sequence])?;
            if removed != 0 {
                backfill(&tx)?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }

    /// Only a completely drained round can publish its successful timestamp.
    pub(crate) async fn mark_synced(&self, stamp: i64) -> Result<(), LibraryError> {
        require_account(&self.2)?;
        if stamp <= 0 {
            return Err(LibraryError::InvalidInput);
        }
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if pending_count(&tx)? != 0 || backfill_count(&tx)? != 0 {
                return Err(LibraryError::OperationPending);
            }
            tx.execute(
                "UPDATE sync_state SET last_sync=MAX(COALESCE(last_sync,0),?1) WHERE singleton=1",
                [stamp],
            )?;
            tx.commit()?;
            Ok(())
        })
        .await
    }

    pub(crate) async fn sync_status(&self) -> Result<AccountSyncStatus, LibraryError> {
        let account = !self.2.is_empty();
        self.run(move |conn| {
            let pending = pending_count(conn)? + backfill_count(conn)?;
            let last_sync = conn.query_row(
                "SELECT last_sync FROM sync_state WHERE singleton=1",
                [],
                |row| row.get(0),
            )?;
            Ok(AccountSyncStatus {
                state: if !account {
                    AccountSyncState::Local
                } else if pending > 0 {
                    AccountSyncState::Pending
                } else {
                    AccountSyncState::Idle
                },
                pending: u32::try_from(pending).map_err(|_| LibraryError::InvalidDatabase)?,
                last_sync,
                error: None,
            })
        })
        .await
    }
}

fn require_account(owner: &str) -> Result<(), LibraryError> {
    if super::valid_id(owner) {
        Ok(())
    } else {
        Err(LibraryError::OwnerChanged)
    }
}
fn sequence(conn: &Connection) -> Result<i64, LibraryError> {
    conn.query_row(
        "SELECT sequence FROM sync_state WHERE singleton=1",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}
pub(super) fn pending_count(conn: &Connection) -> Result<i64, LibraryError> {
    conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| row.get(0))
        .map_err(Into::into)
}
fn backfill_count(conn: &Connection) -> Result<i64, LibraryError> {
    // An already-pending key is not counted twice.
    conn.query_row(
        "SELECT COUNT(*) FROM sync_backfill b WHERE NOT EXISTS
         (SELECT 1 FROM sync_outbox o WHERE o.kind='progress' AND o.series_id=b.series_id)",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}
pub(super) fn can_enqueue(conn: &Connection, kind: &str, id: &str) -> Result<bool, LibraryError> {
    let exists = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE kind=?1 AND series_id=?2)",
        params![kind, id],
        |row| row.get::<_, bool>(0),
    )?;
    Ok(exists || pending_count(conn)? < OUTBOX_LIMIT)
}
fn enqueue(
    tx: &Transaction<'_>,
    kind: &str,
    id: &str,
    payload: Payload,
) -> Result<(), LibraryError> {
    if !can_enqueue(tx, kind, id)? {
        return Err(LibraryError::SyncQueueFull);
    }
    let sequence = sequence(tx)?
        .checked_add(1)
        .ok_or(LibraryError::InvalidDatabase)?;
    let json = serde_json::to_string(&payload).map_err(|_| LibraryError::InvalidInput)?;
    tx.execute(
        "UPDATE sync_state SET sequence=?1 WHERE singleton=1",
        [sequence],
    )?;
    tx.execute(
        "INSERT INTO sync_outbox(sequence,kind,series_id,payload_json) VALUES(?1,?2,?3,?4)
         ON CONFLICT(kind,series_id) DO UPDATE SET sequence=excluded.sequence,payload_json=excluded.payload_json",
        params![sequence, kind, id, json],
    )?;
    Ok(())
}
pub(super) fn enqueue_progress(tx: &Transaction<'_>, entry: &Entry) -> Result<(), LibraryError> {
    strict_progress(entry)?;
    enqueue(
        tx,
        "progress",
        &entry.drama.series_id,
        Payload::Progress {
            entry: Box::new(entry.clone()),
        },
    )
}
pub(super) fn enqueue_favorite(
    tx: &Transaction<'_>,
    id: &str,
    value: bool,
) -> Result<(), LibraryError> {
    if !super::valid_id(id) {
        return Err(LibraryError::InvalidInput);
    }
    enqueue(tx, "favorite", id, Payload::Favorite { value })
}

fn kind_name(kind: LibraryKind) -> &'static str {
    match kind {
        LibraryKind::History => "history",
        LibraryKind::Favorites => "favorites",
    }
}
pub(super) fn hide(
    tx: &Transaction<'_>,
    kind: LibraryKind,
    id: &str,
    stamp: i64,
) -> Result<(), LibraryError> {
    if !super::valid_id(id) || stamp <= 0 {
        return Err(LibraryError::InvalidInput);
    }
    tx.execute(
        "INSERT INTO sync_hidden(kind,series_id,hidden_at) VALUES(?1,?2,?3)
         ON CONFLICT(kind,series_id) DO UPDATE SET hidden_at=MAX(hidden_at,excluded.hidden_at)",
        params![kind_name(kind), id, stamp],
    )?;
    Ok(())
}
pub(super) fn hide_all(
    tx: &Transaction<'_>,
    kind: LibraryKind,
    stamp: i64,
) -> Result<(), LibraryError> {
    if stamp <= 0 {
        return Err(LibraryError::InvalidInput);
    }
    let table = match kind {
        LibraryKind::History => "history",
        LibraryKind::Favorites => "favorites",
    };
    tx.execute(
        &format!("INSERT INTO sync_hidden(kind,series_id,hidden_at) SELECT ?1,series_id,?2 FROM {table} WHERE 1
          ON CONFLICT(kind,series_id) DO UPDATE SET hidden_at=MAX(hidden_at,excluded.hidden_at)"),
        params![kind_name(kind), stamp],
    )?;
    if kind == LibraryKind::History {
        tx.execute("DELETE FROM sync_backfill", [])?;
    }
    Ok(())
}
pub(super) fn clear_hidden(
    tx: &Transaction<'_>,
    kind: LibraryKind,
    id: &str,
) -> Result<(), LibraryError> {
    tx.execute(
        "DELETE FROM sync_hidden WHERE kind=?1 AND series_id=?2",
        params![kind_name(kind), id],
    )?;
    Ok(())
}
pub(super) fn cancel_backfill(tx: &Transaction<'_>, id: &str) -> Result<(), LibraryError> {
    tx.execute("DELETE FROM sync_backfill WHERE series_id=?1", [id])?;
    Ok(())
}
pub(super) fn hidden_at(
    conn: &Connection,
    kind: LibraryKind,
    id: &str,
) -> Result<Option<i64>, LibraryError> {
    conn.query_row(
        "SELECT hidden_at FROM sync_hidden WHERE kind=?1 AND series_id=?2",
        params![kind_name(kind), id],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

/// Cloud records may have no playback identity; local checkpoints always use strict_progress.
pub(super) fn validate_remote_entry(entry: &Entry) -> Result<(), LibraryError> {
    super::validate_drama(&entry.drama)?;
    if super::compact_drama(entry.drama.clone()) != entry.drama
        || entry.episode.is_none_or(|episode| episode > 10000)
        || entry
            .video_id
            .as_ref()
            .is_some_and(|id| !super::valid_id(id))
        || entry.position.is_none_or(|value| !super::valid_time(value))
        || entry.duration.is_none_or(|value| !super::valid_time(value))
        || entry.completed.is_none()
        || entry.last_played_at.is_none_or(|stamp| stamp <= 0)
    {
        return Err(LibraryError::InvalidInput);
    }
    Ok(())
}
pub(super) fn strict_progress(entry: &Entry) -> Result<Progress, LibraryError> {
    let progress = Progress {
        owner_id: None,
        drama: entry.drama.clone(),
        episode: entry.episode.ok_or(LibraryError::InvalidInput)?,
        video_id: entry.video_id.clone().ok_or(LibraryError::InvalidInput)?,
        position: entry.position.ok_or(LibraryError::InvalidInput)?,
        duration: entry.duration.ok_or(LibraryError::InvalidInput)?,
        completed: entry.completed.ok_or(LibraryError::InvalidInput)?,
    };
    progress.validate()?;
    let stamp = entry
        .last_played_at
        .filter(|stamp| *stamp > 0)
        .ok_or(LibraryError::InvalidInput)?;
    if progress.clone().into_entry(stamp) != *entry {
        return Err(LibraryError::InvalidInput);
    }
    Ok(progress)
}
fn validate_metadata(metadata: &SyncMetadata) -> Result<(), LibraryError> {
    if metadata.season_index > 10000 {
        Err(LibraryError::InvalidInput)
    } else {
        Ok(())
    }
}
fn validate_snapshot(remote: &RemoteLibrary) -> Result<(), LibraryError> {
    require_account(&remote.owner_id)?;
    let mut histories = BTreeSet::new();
    let mut favorites = BTreeSet::new();
    for history in &remote.history {
        validate_remote_entry(&history.entry)?;
        validate_metadata(&history.metadata)?;
        if !histories.insert(&history.entry.drama.series_id) {
            return Err(LibraryError::InvalidInput);
        }
    }
    for favorite in &remote.favorites {
        super::validate_drama(&favorite.entry.drama)?;
        validate_metadata(&favorite.metadata)?;
        if favorite.entry.favorite_at <= 0
            || super::compact_drama(favorite.entry.drama.clone()) != favorite.entry.drama
            || !favorites.insert(&favorite.entry.drama.series_id)
        {
            return Err(LibraryError::InvalidInput);
        }
    }
    Ok(())
}

pub(super) fn write_entry(tx: &Transaction<'_>, entry: &Entry) -> Result<(), LibraryError> {
    let json = serde_json::to_string(entry).map_err(|_| LibraryError::InvalidInput)?;
    tx.execute(
        "INSERT INTO history(series_id,entry_json,last_played_at) VALUES(?1,?2,?3)
         ON CONFLICT(series_id) DO UPDATE SET entry_json=excluded.entry_json,last_played_at=excluded.last_played_at",
        params![entry.drama.series_id, json, entry.last_played_at],
    )?;
    Ok(())
}
pub(super) fn stored_entry(conn: &Connection, id: &str) -> Result<Option<Entry>, LibraryError> {
    let json: Option<String> = conn
        .query_row(
            "SELECT entry_json FROM history WHERE series_id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    json.map(|json| serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase))
        .transpose()
}
fn metadata(conn: &Connection, id: &str) -> Result<SyncMetadata, LibraryError> {
    conn.query_row(
        "SELECT season_index,multi_season,metadata_pending FROM sync_metadata WHERE series_id=?1",
        [id],
        |row| {
            Ok(SyncMetadata {
                season_index: row.get(0)?,
                multi_season: row.get(1)?,
                metadata_pending: row.get(2)?,
            })
        },
    )
    .optional()
    .map(|meta| meta.unwrap_or_default())
    .map_err(Into::into)
}
fn write_metadata(
    tx: &Transaction<'_>,
    id: &str,
    incoming: &SyncMetadata,
    remote_history: bool,
) -> Result<(), LibraryError> {
    tx.execute(
        "INSERT INTO sync_metadata(series_id,season_index,multi_season,metadata_pending,history_remote)
         VALUES(?1,?2,?3,?4,?5) ON CONFLICT(series_id) DO UPDATE SET
         season_index=CASE WHEN excluded.metadata_pending=0 OR sync_metadata.metadata_pending=1 THEN excluded.season_index ELSE sync_metadata.season_index END,
         multi_season=CASE WHEN excluded.metadata_pending=0 OR sync_metadata.metadata_pending=1 THEN excluded.multi_season ELSE sync_metadata.multi_season END,
         metadata_pending=MIN(sync_metadata.metadata_pending,excluded.metadata_pending),
         history_remote=MAX(sync_metadata.history_remote,excluded.history_remote)",
        params![id, incoming.season_index, incoming.multi_season, incoming.metadata_pending, remote_history],
    )?;
    Ok(())
}

fn merge(tx: &Transaction<'_>, remote: RemoteLibrary, boundary: i64) -> Result<(), LibraryError> {
    let mut operations = BTreeMap::new();
    {
        let mut statement = tx.prepare("SELECT kind,series_id,sequence FROM sync_outbox")?;
        let rows = statement.query_map([], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (key, value) = row?;
            operations.insert(key, value);
        }
    }
    for mut history in remote.history {
        let id = history.entry.drama.series_id.clone();
        let pending = operations
            .get(&(String::from("progress"), id.clone()))
            .copied();
        if pending.is_some_and(|sequence| sequence > boundary)
            || hidden_at(tx, LibraryKind::History, &id)?.is_some()
        {
            continue;
        }
        let existing = stored_entry(tx, &id)?;
        if let Some(mut local) = existing.clone()
            && local.last_played_at >= history.entry.last_played_at
        {
            // A metadata retry can repair a placeholder without replacing equal/older progress.
            if !history.metadata.metadata_pending && metadata(tx, &id)?.metadata_pending {
                local.drama = history.entry.drama;
                write_entry(tx, &local)?;
                write_metadata(tx, &id, &history.metadata, false)?;
            }
            continue;
        }
        if history.metadata.metadata_pending {
            if let Some(local) = existing.as_ref() {
                history.entry.drama = local.drama.clone();
            } else {
                let json: Option<String> = tx
                    .query_row(
                        "SELECT drama_json FROM favorites WHERE series_id=?1",
                        [&id],
                        |row| row.get(0),
                    )
                    .optional()?;
                if let Some(json) = json {
                    history.entry.drama =
                        serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
                }
            }
        }
        write_entry(tx, &history.entry)?;
        write_metadata(tx, &id, &history.metadata, true)?;
        tx.execute(
            "DELETE FROM sync_outbox WHERE kind='progress' AND series_id=?1 AND sequence<=?2",
            params![id, boundary],
        )?;
        cancel_backfill(tx, &id)?;
    }
    let remote_ids: BTreeSet<_> = remote
        .favorites
        .iter()
        .map(|favorite| favorite.entry.drama.series_id.clone())
        .collect();
    for local in super::favorites::snapshot(tx)? {
        let id = &local.drama.series_id;
        if !remote_ids.contains(id)
            && !operations.contains_key(&(String::from("favorite"), id.clone()))
        {
            super::favorites::remove(tx, id)?;
        }
    }
    for mut favorite in remote.favorites {
        let id = favorite.entry.drama.series_id.clone();
        if operations.contains_key(&(String::from("favorite"), id.clone()))
            || hidden_at(tx, LibraryKind::Favorites, &id)?.is_some()
        {
            continue;
        }
        if favorite.metadata.metadata_pending {
            let json: Option<String> = tx
                .query_row(
                    "SELECT drama_json FROM favorites WHERE series_id=?1",
                    [&id],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(json) = json {
                favorite.entry.drama =
                    serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
            } else if let Some(local) = stored_entry(tx, &id)? {
                favorite.entry.drama = local.drama;
            }
        }
        let json =
            serde_json::to_string(&favorite.entry.drama).map_err(|_| LibraryError::InvalidInput)?;
        tx.execute(
            "INSERT INTO favorites(series_id,drama_json,favorite_at) VALUES(?1,?2,?3)
             ON CONFLICT(series_id) DO UPDATE SET drama_json=excluded.drama_json,favorite_at=excluded.favorite_at",
            params![id, json, favorite.entry.favorite_at],
        )?;
        write_metadata(tx, &id, &favorite.metadata, false)?;
    }
    Ok(())
}

fn backfill(tx: &Transaction<'_>) -> Result<(), LibraryError> {
    let ids = {
        let mut query = tx.prepare("SELECT series_id FROM sync_backfill ORDER BY series_id")?;
        query
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
    };
    for id in ids {
        let Some(entry) = stored_entry(tx, &id)? else {
            cancel_backfill(tx, &id)?;
            continue;
        };
        if hidden_at(tx, LibraryKind::History, &id)?.is_some() || strict_progress(&entry).is_err() {
            cancel_backfill(tx, &id)?;
            continue;
        }
        if !can_enqueue(tx, "progress", &id)? {
            continue;
        }
        // The latest committed checkpoint is authoritative; preserve its original viewing time.
        enqueue_progress(tx, &entry)?;
        cancel_backfill(tx, &id)?;
    }
    Ok(())
}

fn pending(conn: &Connection, limit: i64) -> Result<Vec<PendingSync>, LibraryError> {
    let mut query = conn.prepare(
        "SELECT sequence,kind,series_id,payload_json FROM sync_outbox ORDER BY sequence LIMIT ?1",
    )?;
    let mut rows = query.query([limit])?;
    let mut pending = Vec::new();
    while let Some(row) = rows.next()? {
        let sequence: i64 = row.get(0)?;
        let kind: String = row.get(1)?;
        let id: String = row.get(2)?;
        let json: String = row.get(3)?;
        let payload: Payload =
            serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
        if sequence <= 0 || !super::valid_id(&id) {
            return Err(LibraryError::InvalidDatabase);
        }
        let change = match payload {
            Payload::Progress { entry } if kind == "progress" && entry.drama.series_id == id => {
                strict_progress(&entry).map_err(|_| LibraryError::InvalidDatabase)?;
                PendingChange::Progress(Box::new(RemoteHistory {
                    entry: *entry,
                    metadata: metadata(conn, &id)?,
                }))
            }
            Payload::Favorite { value } if kind == "favorite" => PendingChange::Favorite(value),
            _ => return Err(LibraryError::InvalidDatabase),
        };
        pending.push(PendingSync {
            sequence,
            series_id: id,
            change,
        });
        if pending.len() > OUTBOX_LIMIT as usize {
            return Err(LibraryError::InvalidDatabase);
        }
    }
    Ok(pending)
}

#[cfg(test)]
mod tests;
