//! Follow wire pinned to upstream.lock.json de9712bf358d, separate from favorites/reservations.
use super::{CloudError, PassportClient, PassportError, cloud::Endpoint, valid_id};
use crate::{account::FollowItem, catalog};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashSet};

const MAX_PAGES: usize = 100;
const MAX_ITEMS: usize = 2000;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_ROWS: usize = 128;
const ID_KEYS: &[&str] = &["series_id", "series_id_str", "seriesId", "book_id", "id"];

fn invalid() -> CloudError {
    CloudError::IncompleteFollow
}
fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}
fn identity(row: &Map<String, Value>) -> Result<Option<String>, CloudError> {
    let mut found = None;
    for key in ID_KEYS {
        if let Some(value) = row.get(*key).filter(|v| !v.is_null()) {
            let id = scalar(value).ok_or_else(invalid)?;
            if !valid_id(&id) || found.as_ref().is_some_and(|prior| prior != &id) {
                return Err(invalid());
            }
            found = Some(id);
        }
    }
    Ok(found)
}
fn merge_member_fields(
    target: &mut Map<String, Value>,
    incoming: &Map<String, Value>,
) -> Result<(), CloudError> {
    if let (Some(a), Some(b)) = (identity(target)?, identity(incoming)?)
        && a != b
    {
        return Err(invalid());
    }
    // Empty aliases cannot erase already validated membership evidence.
    target.extend(
        incoming
            .iter()
            .filter(|(key, value)| !(ID_KEYS.contains(&key.as_str()) && value.is_null()))
            .map(|(key, value)| (key.clone(), value.clone())),
    );
    Ok(())
}
fn optional_number(row: &Value, keys: &[&str], maximum: u64) -> Result<Option<u64>, CloudError> {
    for key in keys {
        if let Some(value) = row.get(*key).filter(|v| !v.is_null()) {
            let n = scalar(value)
                .and_then(|s| s.parse::<u64>().ok())
                .filter(|n| *n <= maximum)
                .ok_or_else(invalid)?;
            return Ok(Some(n));
        }
    }
    Ok(None)
}
fn boolean(value: &Value) -> Result<bool, CloudError> {
    match value {
        Value::Bool(v) => Ok(*v),
        _ => match scalar(value).as_deref() {
            Some("0" | "false") => Ok(false),
            Some("1" | "true") => Ok(true),
            _ => Err(invalid()),
        },
    }
}
fn optional_label(row: &Value, keys: &[&str]) -> Result<Option<String>, CloudError> {
    for key in keys {
        if let Some(value) = row.get(*key).filter(|v| !v.is_null()) {
            let value = value.as_str().ok_or_else(invalid)?;
            if value.len() > 400
                || value.chars().count() > 100
                || value.chars().any(char::is_control)
            {
                return Err(invalid());
            }
            return Ok((!value.trim().is_empty()).then(|| value.trim().to_owned()));
        }
    }
    Ok(None)
}

fn item(raw: &Value) -> Result<FollowItem, CloudError> {
    let raw = raw.get("video_data").unwrap_or(raw);
    let outer = raw.as_object().ok_or_else(invalid)?;
    let mut merged = match outer.get("common") {
        Some(common) => common.as_object().ok_or_else(invalid)?.clone(),
        None => outer.clone(),
    };
    if outer.contains_key("common") {
        if let Some(expand) = outer.get("expand") {
            let expand = expand.as_object().ok_or_else(invalid)?;
            merge_member_fields(&mut merged, expand)?;
            for key in ["extra", "update_info"] {
                if let Some(value) = expand.get(key).filter(|v| !v.is_null()) {
                    merge_member_fields(&mut merged, value.as_object().ok_or_else(invalid)?)?;
                }
            }
        }
        let mut outer_id = identity(outer)?;
        for key in ["video_id", "video_id_str"] {
            if let Some(value) = outer.get(key).filter(|v| !v.is_null()) {
                let id = scalar(value).filter(|v| valid_id(v)).ok_or_else(invalid)?;
                if outer_id.as_ref().is_some_and(|prior| prior != &id) {
                    return Err(invalid());
                }
                outer_id = Some(id);
            }
        }
        let inner_id = identity(&merged)?;
        if let (Some(a), Some(b)) = (&outer_id, &inner_id)
            && a != b
        {
            return Err(invalid());
        }
        let id = inner_id.or(outer_id).ok_or_else(invalid)?;
        merged.insert("series_id".into(), Value::String(id));
    }
    let id = identity(&merged)?.ok_or_else(invalid)?;
    if !merged.contains_key("content_type")
        && !merged.contains_key("contentType")
        && let Some(value) = merged.get("video_content_type").cloned()
    {
        merged.insert("content_type".into(), value);
    }
    let row = Value::Object(merged);
    let title_present = ["series_title", "series_name", "title"].iter().any(|key| {
        row[*key].as_str().is_some_and(|s| {
            !s.trim().is_empty() && s.chars().count() <= 100 && !s.chars().any(char::is_control)
        })
    });
    let drama = title_present.then(|| catalog::card_summary(&row)).flatten();
    Ok(FollowItem {
        series_id: id,
        series_status: catalog::series_status(&row),
        drama,
        latest_watched_episode: optional_number(
            &row,
            &["latest_watched_index", "latest_watched_vid_index"],
            10000,
        )?
        .map(|n| n as u32),
        has_watched_latest_episode: row
            .get("has_watched_latest_episode")
            .filter(|v| !v.is_null())
            .map(boolean)
            .transpose()?,
        show_update_frequency: optional_label(
            &row,
            &["show_update_frequency", "showUpdateFrequency"],
        )?,
        follow_update_time: optional_number(
            &row,
            &["follow_update_time_stamp", "follow_update_time"],
            9_007_199_254_740_991,
        )?,
    })
}

fn page(payload: &Value) -> Result<(Vec<FollowItem>, bool, String), CloudError> {
    let data = payload
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    let mut rows = None;
    for key in ["mix_data", "follow_update_list", "subscribe_items"] {
        if let Some(value) = data.get(key).filter(|v| !v.is_null()) {
            rows = Some(value.as_array().ok_or_else(invalid)?);
            break;
        }
    }
    let rows = rows.ok_or_else(invalid)?;
    if rows.len() > MAX_ROWS {
        return Err(invalid());
    }
    let mut more = None;
    let mut cursor = String::new();
    for key in ["follow_list_info", "comment_list_info"] {
        if data
            .get(key)
            .is_some_and(|v| !v.is_null() && !v.is_object())
        {
            return Err(invalid());
        }
    }
    for source in std::iter::once(data).chain(
        ["follow_list_info", "comment_list_info"]
            .into_iter()
            .filter_map(|key| data.get(key).and_then(Value::as_object)),
    ) {
        if let Some(value) = source.get("has_more") {
            more = Some(more.unwrap_or(false) || boolean(value)?);
        }
        for key in ["cursor", "next_cursor"] {
            if let Some(value) = source.get(key).filter(|v| !v.is_null()) {
                let value = scalar(value).ok_or_else(invalid)?;
                if value.len() > 1024 || value.chars().any(char::is_control) {
                    return Err(invalid());
                }
                if cursor.is_empty() {
                    cursor = value;
                }
            }
        }
    }
    Ok((
        rows.iter().map(item).collect::<Result<_, _>>()?,
        more.ok_or_else(invalid)?,
        cursor,
    ))
}

impl PassportClient {
    /// All required pages or an error; no partial membership escapes this boundary.
    pub(crate) async fn pull_follow(
        &mut self,
        active: impl Fn() -> bool,
    ) -> Result<Vec<FollowItem>, CloudError> {
        self.pull_follow_bounded(active, MAX_PAGES, MAX_ITEMS, MAX_BYTES)
            .await
    }

    async fn pull_follow_bounded(
        &mut self,
        active: impl Fn() -> bool,
        max_pages: usize,
        max_items: usize,
        max_bytes: usize,
    ) -> Result<Vec<FollowItem>, CloudError> {
        let mut cursor = String::new();
        let mut cursors = HashSet::new();
        let mut ids = HashSet::new();
        let mut items = Vec::new();
        let mut bytes = 0usize;
        for _ in 0..max_pages {
            if !active() {
                return Err(PassportError::Transport.into());
            }
            let payload = self
                .cloud_request(
                    Endpoint::FollowList,
                    BTreeMap::from([
                        ("cursor".into(), cursor.clone()),
                        ("count".into(), "20".into()),
                        ("tab_type".into(), "14".into()),
                    ]),
                    None,
                )
                .await?;
            bytes = bytes
                .checked_add(serde_json::to_vec(&payload).map_err(|_| invalid())?.len())
                .ok_or_else(invalid)?;
            if bytes > max_bytes {
                return Err(invalid());
            }
            let (rows, more, next) = page(&payload)?;
            let before = items.len();
            for item in rows {
                if ids.insert(item.series_id.clone()) {
                    if items.len() >= max_items {
                        return Err(invalid());
                    }
                    items.push(item);
                }
            }
            if !more {
                return Ok(items);
            }
            if next.is_empty()
                || next == cursor
                || !cursors.insert(next.clone())
                || items.len() == before
            {
                return Err(invalid());
            }
            cursor = next;
        }
        Err(invalid())
    }

    /// Fixed explicit desired state; never retries a possibly delivered mutation.
    pub(crate) async fn set_follow_update(
        &mut self,
        series_id: &str,
        enabled: bool,
    ) -> Result<(), CloudError> {
        if !valid_id(series_id) {
            return Err(PassportError::InvalidInput.into());
        }
        self.cloud_request(Endpoint::SetFollow, BTreeMap::new(), Some(json!({
            "series_id":series_id,"book_id":series_id,"book_type":2,"op_type":if enabled {1} else {2},
        }))).await?;
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests;
