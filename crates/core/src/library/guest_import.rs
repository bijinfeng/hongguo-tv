//! Explicit import of this application's guest progress, preserving original event times.
use super::{Entry, Library, LibraryError, LibraryKind, LibraryStore, sync};
use crate::account::{GuestHistoryImportResult, GuestHistoryStatus};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use std::collections::BTreeMap;

impl LibraryStore {
    pub(crate) async fn guest_history_status(
        &self,
        guest: &Library,
    ) -> Result<GuestHistoryStatus, LibraryError> {
        if self.2.is_empty() {
            return Err(LibraryError::OwnerChanged);
        }
        let total = u64::try_from(guest.entries.len()).map_err(|_| LibraryError::InvalidInput)?;
        let candidates = guest_candidates(guest)?;
        self.run(move |conn| {
            let mut available = 0;
            for entry in candidates.values() {
                if eligible(conn, entry)? {
                    available += 1;
                }
            }
            Ok(GuestHistoryStatus { total, available })
        })
        .await
    }

    /// AccountService fences the owner epoch and supplies its own guest-store snapshot.
    pub(crate) async fn import_guest_history(
        &self,
        guest: Library,
    ) -> Result<GuestHistoryImportResult, LibraryError> {
        if self.2.is_empty() {
            return Err(LibraryError::OwnerChanged);
        }
        let candidates = guest_candidates(&guest)?;
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let mut imported = 0;
            let mut remaining = 0;
            for (id, entry) in candidates {
                if !eligible(&tx, &entry)? {
                    continue;
                }
                if !sync::can_enqueue(&tx, "progress", &id)? {
                    remaining += 1;
                    continue;
                }
                sync::enqueue_progress(&tx, &entry)?;
                sync::write_entry(&tx, &entry)?;
                sync::clear_hidden(&tx, LibraryKind::History, &id)?;
                sync::cancel_backfill(&tx, &id)?;
                tx.execute(
                    "UPDATE sync_metadata SET history_remote=0 WHERE series_id=?1",
                    [&id],
                )?;
                tx.execute(
                    "INSERT INTO guest_import_watermark(series_id,played_at) VALUES(?1,?2)
                     ON CONFLICT(series_id) DO UPDATE SET played_at=excluded.played_at",
                    params![id, entry.last_played_at],
                )?;
                imported += 1;
            }
            if imported == 0 && remaining > 0 {
                return Err(LibraryError::SyncQueueFull);
            }
            // Commit precedes publishing counts; a failed commit exposes no partial success.
            tx.commit()?;
            Ok(GuestHistoryImportResult {
                imported,
                remaining,
            })
        })
        .await
    }
}

fn guest_candidates(guest: &Library) -> Result<BTreeMap<String, Entry>, LibraryError> {
    if guest.owner_id.as_deref() != Some("") {
        return Err(LibraryError::OwnerChanged);
    }
    let mut candidates: BTreeMap<String, Entry> = BTreeMap::new();
    for entry in &guest.entries {
        if sync::strict_progress(entry).is_err() {
            continue;
        }
        let id = &entry.drama.series_id;
        if candidates
            .get(id)
            .is_none_or(|old| old.last_played_at < entry.last_played_at)
        {
            candidates.insert(id.clone(), entry.clone());
        }
    }
    Ok(candidates)
}

fn eligible(conn: &Connection, entry: &Entry) -> Result<bool, LibraryError> {
    let id = &entry.drama.series_id;
    let Some(stamp) = entry.last_played_at else {
        return Ok(false);
    };
    let local: Option<i64> = conn
        .query_row(
            "SELECT last_played_at FROM history WHERE series_id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    let watermark: Option<i64> = conn
        .query_row(
            "SELECT played_at FROM guest_import_watermark WHERE series_id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    let hidden = sync::hidden_at(conn, LibraryKind::History, id)?;
    Ok([local, watermark, hidden]
        .into_iter()
        .flatten()
        .all(|bound| stamp > bound))
}

#[cfg(test)]
mod tests;
