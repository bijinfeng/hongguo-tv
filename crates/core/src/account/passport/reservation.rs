//! Reservation wire pinned to de9712bf: tab 13 lists and gzip numeric uncover_subscribe writes.
use super::{CloudError, PassportClient, PassportError, cloud::Endpoint};
use crate::{
    account::{ReservationItem, service::reservation::valid_reservation_id},
    catalog,
};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
const MAX_PAGES: usize = 100;
const MAX_ITEMS: usize = 2000;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_ROWS: usize = 128;
fn invalid() -> CloudError {
    CloudError::IncompleteReservation
}
fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}
fn identity(value: Option<&Value>) -> Result<Option<String>, CloudError> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(value) => {
            let value = scalar(value).ok_or_else(invalid)?;
            if value == "0" {
                return Ok(None);
            }
            if !valid_reservation_id(&value) {
                return Err(invalid());
            }
            Ok(Some(value))
        }
    }
}
fn series_identity(row: &Value) -> Result<Option<String>, CloudError> {
    let mut id = None;
    for key in ["series_id", "series_id_str", "seriesId", "book_id", "id"] {
        if let Some(next) = identity(row.get(key))? {
            if id.as_ref().is_some_and(|old| old != &next) {
                return Err(invalid());
            }
            id = Some(next);
        }
    }
    Ok(id)
}
fn boolean(value: &Value) -> Result<bool, CloudError> {
    match value {
        Value::Bool(value) => Ok(*value),
        _ => match scalar(value).as_deref() {
            Some("1" | "true") => Ok(true),
            Some("0" | "false") => Ok(false),
            _ => Err(invalid()),
        },
    }
}
fn text(value: &Value, chars: usize) -> Option<String> {
    let text = value.as_str()?;
    if text.len() > chars * 4 || text.chars().count() > chars || text.chars().any(char::is_control)
    {
        return None;
    }
    let text = text.trim();
    (!text.is_empty()).then(|| text.into())
}
fn first(row: &Value, keys: &[&str], chars: usize) -> Option<String> {
    keys.iter().find_map(|key| text(&row[*key], chars))
}
fn number(value: &Value, maximum: u64) -> Result<u64, CloudError> {
    scalar(value)
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v <= maximum)
        .ok_or_else(invalid)
}
fn member(raw: &Value, online: bool) -> Result<ReservationItem, CloudError> {
    let row = raw.as_object().ok_or_else(invalid)?;
    if let Some(value) = row.get("is_online").filter(|v| !v.is_null())
        && boolean(value)? != online
    {
        return Err(invalid());
    }
    let reservation_id = identity(row.get("item_id"))?;
    let detail = &raw["subscribe_data"];
    if !detail.is_null() && !detail.is_object() {
        return Err(invalid());
    }
    let detail = detail.get("video_data").unwrap_or(detail);
    let series_id = series_identity(detail)?;
    if reservation_id.is_none() && series_id.is_none() {
        return Err(invalid());
    }
    let actual_title = first(detail, &["series_title", "series_name", "title"], 100);
    let drama = if online && actual_title.is_some() {
        catalog::card_summary(detail).filter(|drama| {
            series_id.as_deref() == Some(drama.series_id.as_str())
                && drama.episode_count.is_some_and(|n| n > 0)
        })
    } else {
        None
    };
    let title = actual_title.or_else(|| first(raw, &["name"], 100));
    let cover = {
        let value = catalog::public_cover(detail);
        if value.is_empty() {
            catalog::public_cover(raw)
        } else {
            value
        }
    };
    let cover_fallback = catalog::cover_fallback(&cover)
        .filter(|v| v.len() <= 2048)
        .unwrap_or_default();
    let intro = first(detail, &["series_intro", "video_desc", "description"], 1024)
        .or_else(|| first(raw, &["item_desc"], 1024))
        .unwrap_or_default();
    let mut publish_time = None;
    for key in ["schedule_publish_time", "expected_publish_time"] {
        if let Some(value) = raw.get(key).filter(|v| !v.is_null()) {
            let stamp = number(value, 253_402_300_799)?;
            if stamp > 0 {
                publish_time = Some(stamp);
                break;
            }
        }
    }
    let mut tags = raw["categories"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| text(v, 24))
        .take(8)
        .collect::<Vec<_>>();
    if tags.is_empty() {
        tags = raw["sub_title_list"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| text(&v["content"], 24))
            .take(8)
            .collect();
    }
    Ok(ReservationItem {
        reservation_id,
        series_id,
        online,
        drama,
        title,
        cover,
        cover_fallback,
        intro,
        publish_time,
        publish_text: first(raw, &["sub_info", "expected_rec_text"], 100),
        tags,
    })
}
fn merge_count(saved: &mut Option<u32>, value: Option<&Value>) -> Result<(), CloudError> {
    if let Some(value) = value.filter(|v| !v.is_null()) {
        let next = number(value, u64::from(u32::MAX))? as u32;
        if saved.is_some_and(|old| old != next) {
            return Err(invalid());
        }
        *saved = Some(next);
    }
    Ok(())
}
impl PassportClient {
    /// Both groups must finish before any membership is exposed; no partial absence proofs.
    pub(crate) async fn pull_reservations(
        &mut self,
        active: impl Fn() -> bool,
    ) -> Result<(Vec<ReservationItem>, Option<u32>, Option<u32>), CloudError> {
        self.pull_reservations_bounded(active, MAX_PAGES, MAX_ITEMS, MAX_BYTES)
            .await
    }
    async fn pull_reservations_bounded(
        &mut self,
        active: impl Fn() -> bool,
        max_pages: usize,
        max_items: usize,
        max_bytes: usize,
    ) -> Result<(Vec<ReservationItem>, Option<u32>, Option<u32>), CloudError> {
        let mut items: Vec<ReservationItem> = Vec::new();
        let mut identities: HashMap<String, usize> = HashMap::new();
        let (mut online_total, mut upcoming_total) = (None, None);
        let (mut pages, mut bytes) = (0usize, 0usize);
        for online in [true, false] {
            let mut offset = 0u64;
            let mut session: Option<String> = None;
            loop {
                if !active() {
                    return Err(PassportError::Transport.into());
                }
                if pages >= max_pages {
                    return Err(invalid());
                }
                let mut params = BTreeMap::from([
                    ("tab_type".into(), "13".into()),
                    ("subscribe_order_type".into(), "0".into()),
                    ("swipe_type".into(), "0".into()),
                    ("need_calendar_schema".into(), "false".into()),
                    ("offset".into(), offset.to_string()),
                    ("subscribe_offset".into(), "0".into()),
                    ("limit".into(), "20".into()),
                    ("is_online".into(), online.to_string()),
                ]);
                if let Some(value) = &session {
                    params.insert("session_id".into(), value.clone());
                }
                let payload = self
                    .cloud_request(Endpoint::ReservationList, params, None)
                    .await?;
                pages += 1;
                bytes = bytes
                    .checked_add(serde_json::to_vec(&payload).map_err(|_| invalid())?.len())
                    .ok_or_else(invalid)?;
                if bytes > max_bytes {
                    return Err(invalid());
                }
                let data = payload
                    .get("data")
                    .and_then(Value::as_object)
                    .ok_or_else(invalid)?;
                let rows = data
                    .get("subscribe_items")
                    .and_then(Value::as_array)
                    .ok_or_else(invalid)?;
                if rows.len() > MAX_ROWS {
                    return Err(invalid());
                }
                merge_count(&mut online_total, data.get("online_total_count"))?;
                merge_count(&mut upcoming_total, data.get("offline_total_count"))?;
                for row in rows {
                    let item = member(row, online)?;
                    let key = if let Some(id) = &item.reservation_id {
                        format!("item:{id}")
                    } else {
                        format!("series:{}", item.series_id.as_ref().ok_or_else(invalid)?)
                    };
                    if let Some(index) = identities.get(&key) {
                        let prior = &items[*index];
                        if prior.online != item.online
                            || matches!((&prior.series_id,&item.series_id),(Some(a),Some(b)) if a!=b)
                        {
                            return Err(invalid());
                        }
                    } else {
                        if items.len() >= max_items {
                            return Err(invalid());
                        }
                        identities.insert(key, items.len());
                        items.push(item);
                    }
                }
                let more = boolean(data.get("has_more").ok_or_else(invalid)?)?;
                if !more {
                    break;
                }
                if let Some(value) = data.get("session_id").filter(|v| !v.is_null()) {
                    let value = value.as_str().ok_or_else(invalid)?;
                    if value.len() > 12000 || value.chars().any(char::is_control) {
                        return Err(invalid());
                    }
                    if !value.is_empty() {
                        session = Some(value.to_owned());
                    }
                }
                let next = data
                    .get("next_offset")
                    .filter(|v| !v.is_null())
                    .map(|v| number(v, 100_000))
                    .transpose()?;
                let next = match next {
                    Some(next) if next > offset => next,
                    _ if !rows.is_empty() => offset
                        .checked_add(20)
                        .filter(|n| *n <= 100_000)
                        .ok_or_else(invalid)?,
                    _ => return Err(invalid()),
                };
                offset = next;
            }
        }
        Ok((items, online_total, upcoming_total))
    }
    /// Numeric i64 JSON, gzip and fixed reading headers; one dispatch with no write retry.
    pub(crate) async fn set_reservation_update(
        &mut self,
        id: &str,
        enabled: bool,
    ) -> Result<(), CloudError> {
        if !valid_reservation_id(id) {
            return Err(PassportError::InvalidInput.into());
        }
        let id = id.parse::<i64>().map_err(|_| PassportError::InvalidInput)?;
        self.cloud_request(Endpoint::SetReservation,BTreeMap::new(),Some(json!({
            "item_id":id,"item_type":1,"op_type":if enabled {1}else{2},
            "shark_param":{"enter_from":"BulletActivity","previous_page":"MainFragmentActivity","page_list":"MainFragmentActivity,BulletActivity"},"wish_list_all_del":0
        }))).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
