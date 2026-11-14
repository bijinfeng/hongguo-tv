//! Anonymous new releases and full-day released/upcoming discovery.
use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use utoipa::{IntoParams, ToSchema};

pub(crate) const NEW_ENDPOINT: &str =
    "https://api5-normal-lq.fqnovel.com/reading/bookapi/bookmall/cell/change/v1/";
pub(crate) const CALENDAR_ENDPOINT: &str =
    "https://api5-normal-lq.fqnovel.com/reading/user/subscribe/list/v1/";
const BODY_LIMIT: usize = 4 * 1024 * 1024;

/// Strict HTTP/native new-release inputs, independent of category/feed cursors.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct NewSeriesParams {
    /// New-release audience0/1/2; defaults to2.
    pub gender: Option<String>,
    /// Consumed upstream offset0–100000.
    #[serde(default)]
    pub offset: u32,
    /// Opaque upstream session, at most1024 control-free bytes.
    pub session_id: Option<String>,
}
/// Strict HTTP/native calendar inputs; omitted and explicit0 subscription cursors differ.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct CalendarParams {
    /// Real Gregorian date YYYYMMDD; absent uses the upstream current-day default.
    pub date: Option<String>,
    /// Released-section upstream offset0–100000.
    #[serde(default)]
    pub offset: u32,
    /// Upcoming-section offset0–100000; omitted on the initial full-day request.
    pub subscribe_offset: Option<u32>,
    /// Opaque upstream session, at most1024 control-free bytes.
    pub session_id: Option<String>,
}
/// Validated new-release request with a fixed destination and no account input.
#[derive(Debug, Clone)]
pub struct NewSeriesQuery {
    offset: u32,
    params: BTreeMap<String, String>,
}
/// Validated calendar request with independent released/upcoming continuation.
#[derive(Debug, Clone)]
pub struct CalendarQuery {
    offset: u32,
    subscribe_offset: Option<u32>,
    params: BTreeMap<String, String>,
}
fn session(value: &str) -> bool {
    value.len() <= 1024 && !value.chars().any(char::is_control)
}
fn date(value: &str) -> bool {
    if value.len() != 8 || !value.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let year: u32 = value[..4].parse().unwrap_or(0);
    let month: u32 = value[4..6].parse().unwrap_or(0);
    let day: u32 = value[6..].parse().unwrap_or(0);
    let days = match month {
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days
}
impl NewSeriesQuery {
    /// Validate before signing/networking, preserving exact session and service offset.
    pub fn new(input: NewSeriesParams) -> Result<Self, CatalogError> {
        let gender = input.gender.unwrap_or_else(|| "2".into());
        let session = input.session_id.unwrap_or_default();
        if !["0", "1", "2"].contains(&gender.as_str())
            || input.offset > 100_000
            || !self::session(&session)
        {
            return Err(CatalogError::InvalidInput);
        }
        let mut params: BTreeMap<String, String> = [
            ("change_type", "1"),
            ("selected_items", "firstonlinetime_new"),
            ("client_req_type", "1"),
            ("cell_id", "7431550523368554558"),
            ("limit", "20"),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
        params.extend([
            ("cell_gender".into(), gender),
            ("offset".into(), input.offset.to_string()),
            ("session_id".into(), session),
        ]);
        Ok(Self {
            offset: input.offset,
            params,
        })
    }
    pub(crate) fn params(&self) -> &BTreeMap<String, String> {
        &self.params
    }
}
impl CalendarQuery {
    /// Validate both cursor dimensions and a real date without adding a false audience filter.
    pub fn new(input: CalendarParams) -> Result<Self, CatalogError> {
        let session = input.session_id.unwrap_or_default();
        if input.offset > 100_000
            || input.subscribe_offset.is_some_and(|n| n > 100_000)
            || !self::session(&session)
            || input.date.as_deref().is_some_and(|s| !date(s))
        {
            return Err(CatalogError::InvalidInput);
        }
        let mut params: BTreeMap<String, String> = [
            ("tab_type", "5"),
            ("tab_style", "2"),
            ("active_panel", "6"),
            ("gender_type", "2"),
            ("need_calendar_schema", "true"),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
        params.insert("offset".into(), input.offset.to_string());
        params.insert("session_id".into(), session);
        if let Some(date) = input.date {
            params.insert("target_date".into(), date);
        }
        if let Some(offset) = input.subscribe_offset {
            params.insert("subscribe_offset".into(), offset.to_string());
        }
        Ok(Self {
            offset: input.offset,
            subscribe_offset: input.subscribe_offset,
            params,
        })
    }
    pub(crate) fn params(&self) -> &BTreeMap<String, String> {
        &self.params
    }
}

/// One new-release page with raw service continuation, not a visible-card offset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct NewSeriesResult {
    /// Ordered unique supported drama summaries; no episode lists.
    pub items: Vec<Drama>,
    /// Whether an advancing continuation exists.
    pub has_more: bool,
    /// Exact upstream next offset.
    pub next_offset: u32,
    /// Opaque session, retaining the request value if omitted in the response.
    pub session_id: String,
}
/// Upstream public dates, without generated local clock assumptions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CalendarSchema {
    /// Ordered unique real dates in YYYYMMDD format.
    pub dates: Vec<String>,
    /// Upstream default date.
    pub default_date: String,
    /// Upstream current date.
    pub current_date: String,
}
/// Mutually exclusive released media summary and nonplayable upcoming announcement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CalendarEntry {
    /// A genuinely released supported drama; use existing detail/play flows.
    Released {
        /// Public drama summary without episodes.
        drama: Drama,
    },
    /// Announcement metadata; its reservation identity is not a playable series ID.
    Upcoming {
        /// Bounded announcement title.
        title: String,
        /// Public image under the existing catalog image policy, or empty.
        cover: String,
        /// JPEG alternative when applicable.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(nullable = false)]
        cover_fallback: Option<String>,
        /// Bounded announcement description.
        intro: String,
        /// Explicit nested series identity when supplied, never inferred from item_id.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(nullable = false)]
        series_id: Option<String>,
    },
}
/// Public release metadata with media and reservation identities kept separate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CalendarItem {
    /// Released drama or upcoming announcement.
    pub entry: CalendarEntry,
    /// Exact public reservation item ID when nonzero; never use as a playable series ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reservation_id: Option<String>,
    /// Positive Unix seconds, if supplied; no fabricated local scheduling.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub publish_time: Option<u64>,
    /// Bounded upstream release label, if supplied.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub publish_text: Option<String>,
    /// At most eight public category labels.
    pub tags: Vec<String>,
}
/// A full-day page spanning released and upcoming sections independently.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CalendarResult {
    /// Ordered unique public entries, without account subscription state or episodes.
    pub items: Vec<CalendarItem>,
    /// True while either released or upcoming section continues with progress.
    pub has_more: bool,
    /// Exact released-section offset; can move backward at the subscription phase transition.
    pub next_offset: u32,
    /// Upcoming offset, absent until introduced; retains the requested value when not repeated.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub next_subscribe_offset: Option<u32>,
    /// Opaque session, retaining the request value if not repeated.
    pub session_id: String,
    /// Optional upstream date schema; continuation may omit it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub calendar: Option<CalendarSchema>,
}
fn number(v: &Value) -> Option<u64> {
    match v {
        Value::Number(n) => n.as_u64(),
        Value::String(s) if s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit()) => {
            s.parse().ok()
        }
        _ => None,
    }
}
fn boolean(v: &Value) -> Option<bool> {
    v.as_bool().or_else(|| match number(v) {
        Some(0) => Some(false),
        Some(1) => Some(true),
        _ => None,
    })
}
fn text(v: &Value, limit: usize) -> Option<String> {
    let s = v.as_str()?;
    (!s.trim().is_empty()
        && s.len() <= limit * 4
        && !s.chars().any(char::is_control)
        && s.chars().count() <= limit)
        .then(|| s.trim().into())
}
fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn rows(v: &Value) -> Result<&[Value], CatalogError> {
    let rows = v.as_array().ok_or(CatalogError::InvalidData)?;
    if rows.len() > 128 {
        return Err(CatalogError::TooLarge);
    }
    Ok(rows)
}
fn envelope(body: &[u8]) -> Result<Value, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if number(&root["code"]) != Some(0)
        || !root["data"].is_object()
        || [&root, &root["data"]]
            .into_iter()
            .any(|v| v.get("error_code").is_some_and(|v| number(v) != Some(0)))
    {
        return Err(CatalogError::InvalidData);
    }
    Ok(root)
}
fn cursor(v: Option<&Value>, more: bool) -> Result<u32, CatalogError> {
    match v {
        None if !more => Ok(0),
        Some(v) => number(v)
            .filter(|n| *n <= 100_000)
            .map(|n| n as u32)
            .ok_or(CatalogError::InvalidData),
        _ => Err(CatalogError::InvalidData),
    }
}
fn response_session(data: &Value, prior: &str) -> Result<String, CatalogError> {
    let s = match data.get("session_id") {
        None => prior,
        Some(v) => v.as_str().ok_or(CatalogError::InvalidData)?,
    };
    if !session(s) {
        return Err(CatalogError::InvalidData);
    }
    Ok(s.into())
}
/// Parse one fixed new-release page with raw service cursor and bounded summaries.
pub fn parse_new_series(
    body: &[u8],
    query: &NewSeriesQuery,
) -> Result<NewSeriesResult, CatalogError> {
    let root = envelope(body)?;
    let data = &root["data"];
    let has_more = boolean(&data["has_more"]).ok_or(CatalogError::InvalidData)?;
    let next_offset = cursor(data.get("next_offset"), has_more)?;
    if has_more && next_offset <= query.offset {
        return Err(CatalogError::InvalidData);
    }
    let mut seen = HashSet::new();
    let items = rows(&data["cell_view"]["video_data"])?
        .iter()
        .filter(|v| {
            !v.get("disable_play")
                .is_some_and(|v| boolean(v) != Some(false))
        })
        .filter_map(super::actor_works::summary)
        .filter(|d| seen.insert(d.series_id.clone()))
        .collect();
    Ok(NewSeriesResult {
        items,
        has_more,
        next_offset,
        session_id: response_session(data, &query.params["session_id"])?,
    })
}
fn schema(v: &Value) -> Result<CalendarSchema, CatalogError> {
    if !v.is_object() {
        return Err(CatalogError::InvalidData);
    }
    let raw = v["date_list"].as_array().ok_or(CatalogError::InvalidData)?;
    if raw.len() > 366 {
        return Err(CatalogError::TooLarge);
    }
    let mut seen = HashSet::new();
    let mut dates = Vec::new();
    for v in raw {
        let s = scalar(v)
            .filter(|s| date(s))
            .ok_or(CatalogError::InvalidData)?;
        if seen.insert(s.clone()) {
            dates.push(s);
        }
    }
    let default_date = scalar(&v["default_date"])
        .filter(|s| date(s))
        .ok_or(CatalogError::InvalidData)?;
    let current_date = scalar(&v["current_date"])
        .filter(|s| date(s))
        .ok_or(CatalogError::InvalidData)?;
    Ok(CalendarSchema {
        dates,
        default_date,
        current_date,
    })
}
fn calendar_item(row: &Value) -> Result<Option<CalendarItem>, CatalogError> {
    if !row.is_object() {
        return Err(CatalogError::InvalidData);
    }
    let Some(online) = boolean(&row["is_online"]) else {
        return Ok(None);
    };
    let reservation_id = scalar(&row["item_id"]).filter(|s| valid_id(s));
    let drama = super::actor_works::summary(&row["subscribe_data"]);
    let entry = if online {
        let Some(drama) = drama else { return Ok(None) };
        CalendarEntry::Released { drama }
    } else {
        if reservation_id.is_none() {
            return Ok(None);
        }
        let title = drama
            .as_ref()
            .map(|d| d.title.clone())
            .or_else(|| text(&row["name"], 100));
        let Some(title) = title else { return Ok(None) };
        let cover = drama
            .as_ref()
            .map(|d| d.cover.clone())
            .unwrap_or_else(|| super::parse::public_cover(row));
        CalendarEntry::Upcoming {
            title,
            cover_fallback: super::parse::cover_fallback(&cover),
            cover,
            intro: drama
                .as_ref()
                .map(|d| d.intro.clone())
                .or_else(|| text(&row["item_desc"], 1024))
                .unwrap_or_default(),
            series_id: drama.map(|d| d.series_id),
        }
    };
    let mut publish_time = None;
    for key in ["schedule_publish_time", "expected_publish_time"] {
        if let Some(v) = row.get(key) {
            let n = number(v)
                .filter(|n| *n <= 253_402_300_799)
                .ok_or(CatalogError::InvalidData)?;
            if n > 0 {
                publish_time = Some(n);
                break;
            }
        }
    }
    let mut tags = Vec::new();
    if let Some(v) = row.get("categories") {
        tags = rows(v)?
            .iter()
            .filter_map(|v| text(v, 24))
            .take(8)
            .collect();
    }
    if tags.is_empty()
        && let Some(v) = row.get("sub_title_list")
    {
        tags = rows(v)?
            .iter()
            .filter_map(|v| text(&v["content"], 24))
            .take(8)
            .collect();
    }
    Ok(Some(CalendarItem {
        entry,
        reservation_id,
        publish_time,
        publish_text: text(&row["sub_info"], 100).or_else(|| text(&row["expected_rec_text"], 100)),
        tags,
    }))
}
/// Parse the complete calendar phase pair, including upcoming-only empty advancing pages.
pub fn parse_calendar(body: &[u8], query: &CalendarQuery) -> Result<CalendarResult, CatalogError> {
    let root = envelope(body)?;
    let data = &root["data"];
    let released_more = boolean(&data["has_more"]).ok_or(CatalogError::InvalidData)?;
    let loc = &data["calendar_loc_info"];
    if !loc.is_null() && !loc.is_object() {
        return Err(CatalogError::InvalidData);
    }
    let upcoming_more = match loc.get("down_has_more") {
        None => false,
        Some(v) => boolean(v).ok_or(CatalogError::InvalidData)?,
    };
    let has_more = released_more || upcoming_more;
    let next_offset = cursor(data.get("next_offset"), released_more)?;
    let next_subscribe_offset = match loc.get("subscribe_offset") {
        None => query.subscribe_offset,
        Some(v) => Some(cursor(Some(v), false)?),
    };
    let advances = next_offset > query.offset
        || next_subscribe_offset.is_some_and(|n| query.subscribe_offset.is_none_or(|old| n > old));
    if has_more && !advances {
        return Err(CatalogError::InvalidData);
    }
    let calendar = data.get("calendar_schema").map(schema).transpose()?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for row in rows(&data["subscribe_items"])? {
        if let Some(item) = calendar_item(row)? {
            let key = match &item.entry {
                CalendarEntry::Released { drama } => format!("released:{}", drama.series_id),
                CalendarEntry::Upcoming { .. } => format!(
                    "upcoming:{}",
                    item.reservation_id.as_deref().unwrap_or_default()
                ),
            };
            if seen.insert(key) {
                items.push(item);
            }
        }
    }
    Ok(CalendarResult {
        items,
        has_more,
        next_offset,
        next_subscribe_offset,
        session_id: response_session(data, &query.params["session_id"])?,
        calendar,
    })
}

#[cfg(test)]
mod tests;
