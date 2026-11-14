//! Official anonymous rankings; actors and dramas never share a playable identity.
use super::{ActorSummary, CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
use utoipa::{IntoParams, ToSchema};

pub(crate) const ENDPOINT: &str =
    "https://api5-normal-lq.fqnovel.com/reading/bookapi/bookmall/cell/change/v";
const BODY_LIMIT: usize = 4 * 1024 * 1024;

/// Identical strict decoding for HTTP and native official-ranking reads.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct RankParams {
    /// Exact dynamic top-level selector, at most256 control-free bytes; absent means upstream default.
    pub rank: Option<String>,
    /// Exact dynamic subrank, at most256 control-free bytes.
    pub rank_sub: Option<String>,
    /// Exact dynamic panel selection, at most256 control-free bytes.
    pub rank_panel: Option<String>,
    /// Consumed upstream offset, 0–100000, independent of visible record count.
    #[serde(default)]
    pub offset: u32,
    /// Opaque session, at most1024 control-free bytes.
    pub session_id: Option<String>,
    /// Up to128 comma-separated exact decimal series or actor IDs.
    pub shown: Option<String>,
}
/// Validated stateless official-ranking selection, with no account or destination input.
#[derive(Debug, Clone)]
pub struct RankQuery {
    offset: u32,
    params: BTreeMap<String, String>,
}
fn opaque(value: &str, limit: usize) -> bool {
    value.len() <= limit && !value.chars().any(char::is_control)
}
impl RankQuery {
    /// Validate all fields before signing or networking; dynamic selector IDs are never rewritten.
    pub fn new(input: RankParams) -> Result<Self, CatalogError> {
        let rank = input.rank.unwrap_or_default();
        let sub = input.rank_sub.unwrap_or_default();
        let panel = input.rank_panel.unwrap_or_default();
        let session = input.session_id.unwrap_or_default();
        let shown = input.shown.unwrap_or_default();
        if input.offset > 100_000
            || [&rank, &sub, &panel].iter().any(|s| !opaque(s, 256))
            || !opaque(&session, 1024)
            || (!shown.is_empty()
                && (shown.split(',').count() > 128 || !shown.split(',').all(valid_id)))
        {
            return Err(CatalogError::InvalidInput);
        }
        let mut params: BTreeMap<String, String> = [
            ("tab_type", if input.offset == 0 { "26" } else { "18" }),
            ("client_req_type", "2"),
            ("client_template", "2"),
            ("background_selected_items", ""),
            ("category_id", "0"),
            ("limit", "20"),
            ("cell_sub_id", "0"),
            ("gender", "2"),
            ("cell_id", "7470092475068071998"),
            ("unlimited_selector_change_type", "0"),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect();
        params.extend([
            ("selected_items".into(), rank),
            ("sub_selected_items".into(), sub),
            ("panel_selected_items".into(), panel),
            ("offset".into(), input.offset.to_string()),
            ("session_id".into(), session),
            ("filter_ids".into(), shown),
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

/// One exact server-provided selector, without navigation schemas or styling.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RankOption {
    /// Opaque dynamic selector identity; an empty value can represent the upstream default.
    pub id: String,
    /// Bounded public display label.
    pub label: String,
    /// Upstream default selection; page owners keep explicit user selection separately.
    pub selected: bool,
    /// Nested selector options in upstream order.
    #[schema(no_recursion)]
    pub children: Vec<RankOption>,
    /// Additional upstream panel groups.
    pub panels: Vec<RankPanel>,
}
/// A dynamic panel dimension attached to a ranking option.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RankPanel {
    /// Exact bounded upstream dimension.
    pub r#type: String,
    /// Public group label.
    pub label: String,
    /// Ordered unique panel choices; no fabricated All option.
    #[schema(no_recursion)]
    pub options: Vec<RankOption>,
}
/// Tagged content prevents actor IDs being passed to drama playback.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RankEntry {
    /// Supported drama summary, with no episode list.
    Drama {
        /// Existing public drama summary.
        drama: Drama,
    },
    /// Public actor profile; open its existing works endpoint.
    Actor {
        /// Existing public actor summary.
        actor: ActorSummary,
        /// Bounded public actor labels, without navigation or account state.
        tags: Vec<String>,
    },
}
/// A ranked entry with only public, explicitly supplied ranking labels.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RankItem {
    /// Mutually exclusive drama or actor data.
    pub entry: RankEntry,
    /// Positive upstream rank, if supplied; never inferred from filtered rows.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub rank: Option<u32>,
    /// Bounded upstream heat/recommendation text, when available.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub heat: Option<String>,
    /// Explicit ranking label only; no heat-only tags or remote styling.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub badge: Option<String>,
}
/// One official ranking page, with service continuation independent of filtered entries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RankResult {
    /// Ordered unique supported summaries.
    pub items: Vec<RankItem>,
    /// Whether an advancing continuation exists.
    pub has_more: bool,
    /// Exact service offset; not computed from visible item count.
    pub next_offset: u32,
    /// Opaque upstream session, or the requested session if not repeated.
    pub session_id: String,
    /// Dynamic selector tree; empty when not supplied on continuation.
    pub ranks: Vec<RankOption>,
}
fn number(v: &Value) -> Option<u32> {
    match v {
        Value::Number(n) => n.to_string().parse().ok(),
        Value::String(s) if s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit()) => {
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
    (s.len() <= limit * 4
        && opaque(s, limit * 4)
        && s.chars().count() <= limit
        && !s.trim().is_empty())
    .then(|| s.trim().into())
}
fn id(v: &Value) -> Option<String> {
    let s = match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => return None,
    };
    opaque(&s, 256).then_some(s)
}
fn rows(v: &Value) -> Result<&[Value], CatalogError> {
    match v {
        Value::Null => Ok(&[]),
        Value::Array(rows) if rows.len() <= 128 => Ok(rows),
        Value::Array(_) => Err(CatalogError::TooLarge),
        _ => Err(CatalogError::InvalidData),
    }
}
fn budget(count: &mut usize, limit: usize) -> Result<(), CatalogError> {
    *count += 1;
    if *count > limit {
        Err(CatalogError::TooLarge)
    } else {
        Ok(())
    }
}
fn selectors(v: &Value, depth: usize, count: &mut usize) -> Result<Vec<RankOption>, CatalogError> {
    if v.is_null() {
        return Ok(vec![]);
    }
    if !v.is_object() {
        return Err(CatalogError::InvalidData);
    }
    if !v["outer_row"].is_null() && !v["outer_row"].is_object() {
        return Err(CatalogError::InvalidData);
    }
    options(&v["outer_row"]["items"], depth, count)
}
fn options(v: &Value, depth: usize, count: &mut usize) -> Result<Vec<RankOption>, CatalogError> {
    if depth > 8 {
        return Err(CatalogError::TooLarge);
    }
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for row in rows(v)? {
        budget(count, 2048)?;
        if !row.is_object() {
            return Err(CatalogError::InvalidData);
        }
        let children = selectors(&row["sub_cell_selector"], depth + 1, count)?;
        let mut panels = Vec::new();
        if !row["panel_selector"].is_null() && !row["panel_selector"].is_object() {
            return Err(CatalogError::InvalidData);
        }
        let groups = rows(&row["panel_selector"]["inner_rows"])?;
        if groups.len() > 32 {
            return Err(CatalogError::TooLarge);
        }
        for group in groups {
            if !group.is_object() {
                return Err(CatalogError::InvalidData);
            }
            budget(count, 2048)?;
            let choices = options(&group["items"], depth + 1, count)?;
            if let (Some(kind), Some(label)) = (id(&group["type"]), text(&group["row_name"], 80)) {
                panels.push(RankPanel {
                    r#type: kind,
                    label,
                    options: choices,
                });
            }
        }
        let (Some(id), Some(label)) = (id(&row["selector_item_id"]), text(&row["show_name"], 80))
        else {
            continue;
        };
        let selected = match row.get("is_selected") {
            None => false,
            Some(v) => boolean(v).ok_or(CatalogError::InvalidData)?,
        };
        if seen.insert(id.clone()) {
            result.push(RankOption {
                id,
                label,
                selected,
                children,
                panels,
            });
        }
    }
    Ok(result)
}
fn badge(row: &Value) -> Option<String> {
    row["rec_tags"].as_array()?.iter().take(128).find_map(|v| {
        let s = text(&v["content"], 80)?;
        (number(&v["rec_type"]) == Some(9)
            && s.contains('榜')
            && !s.contains(['<', '>', '/', '\\']))
        .then_some(s)
    })
}
fn item(entry: RankEntry, row: &Value, heat: Option<String>) -> RankItem {
    RankItem {
        entry,
        rank: number(&row["rank"]).filter(|n| *n > 0),
        heat,
        badge: badge(row),
    }
}

/// Parse the fixed official-ranking envelope with bounded raw records and selector nesting.
pub fn parse_rankings(body: &[u8], query: &RankQuery) -> Result<RankResult, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if number(&root["code"]) != Some(0)
        || [&root, &root["data"]]
            .into_iter()
            .any(|v| v.get("error_code").is_some_and(|v| number(v) != Some(0)))
    {
        return Err(CatalogError::InvalidData);
    }
    let data = &root["data"];
    let cell = &data["cell_view"];
    if !cell.is_object() || !cell["cell_data"].is_array() {
        return Err(CatalogError::InvalidData);
    }
    // The reference switches the entire cursor source when data.next_offset is absent.
    let page = if data.get("next_offset").is_some() {
        data
    } else {
        cell
    };
    let has_more = boolean(&page["has_more"]).ok_or(CatalogError::InvalidData)?;
    let next_offset = match page.get("next_offset") {
        None if !has_more => 0,
        Some(v) => number(v).ok_or(CatalogError::InvalidData)?,
        _ => return Err(CatalogError::InvalidData),
    };
    if next_offset > 100_000 || (has_more && next_offset <= query.offset) {
        return Err(CatalogError::InvalidData);
    }
    let session = match page.get("session_id") {
        None => query.params["session_id"].as_str(),
        Some(v) => v.as_str().ok_or(CatalogError::InvalidData)?,
    };
    if !opaque(session, 1024) {
        return Err(CatalogError::InvalidData);
    }
    let ranks = selectors(&cell["cell_selector"], 0, &mut 0)?;
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    let mut count = 0;
    for cell in rows(&cell["cell_data"])? {
        budget(&mut count, 1024)?;
        if !cell.is_object() {
            return Err(CatalogError::InvalidData);
        }
        let videos = match &cell["video_data"] {
            Value::Object(_) => std::slice::from_ref(&cell["video_data"]),
            v => rows(v)?,
        };
        for row in videos {
            budget(&mut count, 1024)?;
            if row
                .get("disable_play")
                .is_some_and(|v| boolean(v) != Some(false))
            {
                continue;
            }
            if let Some(drama) = super::actor_works::summary(row)
                && seen.insert(format!("drama:{}", drama.series_id))
            {
                items.push(item(
                    RankEntry::Drama { drama },
                    row,
                    text(&row["heatText"], 100),
                ));
            }
        }
        for row in rows(&cell["ugc_user_data"])? {
            budget(&mut count, 1024)?;
            let base = &row["user_info"]["base_info"];
            let Some(id) = id(&base["actor_id_str"]).filter(|s| valid_id(s)) else {
                continue;
            };
            if !seen.insert(format!("actor:{id}")) {
                continue;
            }
            let avatar = super::parse::public_cover(&json!({"cover": base["user_avatar"]}));
            let actor = ActorSummary {
                id,
                name: text(&base["user_name"], 100).unwrap_or_else(|| "未知演员".into()),
                avatar: (!avatar.is_empty()).then_some(avatar),
                description: text(&row["intro"], 1024),
            };
            let tags = rows(&row["sub_title_list"])?
                .iter()
                .filter_map(|v| text(&v["content"], 24))
                .take(8)
                .collect();
            items.push(item(
                RankEntry::Actor { actor, tags },
                row,
                text(&row["rec_text_item"]["RecommendText"], 100),
            ));
        }
    }
    Ok(RankResult {
        items,
        has_more,
        next_offset,
        session_id: session.into(),
        ranks,
    })
}

#[cfg(test)]
mod tests;
