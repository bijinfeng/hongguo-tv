use super::{FavoriteEntry, LibraryError};
use crate::catalog::Drama;
use rusqlite::{Connection, Transaction, params};

pub(super) fn snapshot(conn: &Connection) -> Result<Vec<FavoriteEntry>, LibraryError> {
    let mut statement = conn.prepare(
        "SELECT series_id,drama_json,favorite_at FROM favorites ORDER BY favorite_at DESC,series_id",
    )?;
    let mut rows = statement.query([])?;
    let mut entries = Vec::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let json: String = row.get(1)?;
        let favorite_at: i64 = row.get(2)?;
        let drama: Drama =
            serde_json::from_str(&json).map_err(|_| LibraryError::InvalidDatabase)?;
        if super::validate_drama(&drama).is_err()
            || id != drama.series_id
            || favorite_at <= 0
            || super::compact_drama(drama.clone()) != drama
        {
            return Err(LibraryError::InvalidDatabase);
        }
        entries.push(FavoriteEntry { drama, favorite_at });
    }
    Ok(entries)
}

pub(super) fn set(
    tx: &Transaction<'_>,
    drama: Drama,
    value: bool,
    stamp: i64,
) -> Result<(), LibraryError> {
    if value {
        let drama = super::compact_drama(drama);
        let json = serde_json::to_string(&drama).map_err(|_| LibraryError::InvalidInput)?;
        // Replaying a desired state must not reorder an existing favorite.
        tx.execute(
            "INSERT INTO favorites(series_id,drama_json,favorite_at) VALUES(?1,?2,?3)
             ON CONFLICT(series_id) DO UPDATE SET drama_json=excluded.drama_json",
            params![drama.series_id, json, stamp],
        )?;
    } else {
        remove(tx, &drama.series_id)?;
    }
    Ok(())
}

pub(super) fn remove(tx: &Transaction<'_>, series_id: &str) -> Result<(), LibraryError> {
    tx.execute("DELETE FROM favorites WHERE series_id=?1", [series_id])?;
    Ok(())
}

pub(super) fn clear(tx: &Transaction<'_>) -> Result<(), LibraryError> {
    tx.execute("DELETE FROM favorites", [])?;
    Ok(())
}
