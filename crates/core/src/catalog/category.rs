use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
use utoipa::{IntoParams, ToSchema};

pub(crate) const BODY_LIMIT: usize = 4 * 1024 * 1024;
const FILTERS: [(&str, &str); 8] = [
    ("genre", "体裁"),
    ("category_dim_theme", "主题"),
    ("category_dim_role", "设定"),
    ("category_dim_epoch", "背景"),
    ("sort", "推荐"),
    ("gender", "受众"),
    ("online_time", "时间"),
    ("creation_status", "状态"),
];

/// Identical query decoding for HTTP and native; explicit empty filters mean all.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct CategoryParams {
    /// Supported /category/ path; defaults to /category/real-drama.
    pub path: Option<String>,
    /// Upstream consumed-item offset, 0–100000.
    #[serde(default)]
    pub offset: u32,
    /// Opaque upstream session, at most 1024 bytes without controls.
    pub session_id: Option<String>,
    /// Up to 128 comma-separated exact decimal series IDs.
    pub shown: Option<String>,
    /// Include selector rows: absent/0 or 1.
    pub selectors: Option<String>,
    /// short_play, comic_series, ai_series, or explicit empty for all.
    pub genre: Option<String>,
    /// cate_ followed by one to eight ASCII digits, or empty.
    pub category_dim_theme: Option<String>,
    /// cate_ followed by one to eight ASCII digits, or empty.
    pub category_dim_role: Option<String>,
    /// cate_ followed by one to eight ASCII digits, or empty.
    pub category_dim_epoch: Option<String>,
    /// hot_score, online_time, hot_collect, or empty.
    pub sort: Option<String>,
    /// 0, 1, or empty.
    pub gender: Option<String>,
    /// days_7, days_14, days_30, days_90, or empty.
    pub online_time: Option<String>,
    /// creation_status_0, creation_status_1, or empty.
    pub creation_status: Option<String>,
}

/// Validated anonymous category selection; never accepts an upstream destination or account.
#[derive(Debug, Clone)]
pub struct CategoryQuery {
    offset: u32,
    selectors: bool,
    payload: Value,
}
impl CategoryQuery {
    /// Validate the full input before networking, preserving omitted versus explicit-all values.
    pub fn new(params: CategoryParams) -> Result<Self, CatalogError> {
        let (scene, genre) = match params.path.as_deref().unwrap_or("/category/real-drama") {
            "/category/real-drama" => ("default", "short_play"),
            "/category/comic-drama" => ("comic_series", "comic_series"),
            "/category/ai-drama" => ("ai_series", "ai_series"),
            "/category/comic" => ("comic", "comic"),
            _ => return Err(CatalogError::InvalidInput),
        };
        let selectors = match params.selectors.as_deref() {
            None | Some("0") => false,
            Some("1") => true,
            _ => return Err(CatalogError::InvalidInput),
        };
        let session = params.session_id.unwrap_or_default();
        let shown = params.shown.unwrap_or_default();
        if params.offset > 100_000
            || !valid_session(&session)
            || (!shown.is_empty()
                && (shown.split(',').count() > 128 || !shown.split(',').all(valid_id)))
        {
            return Err(CatalogError::InvalidInput);
        }
        let mut selected: BTreeMap<String, Vec<String>> = FILTERS
            .iter()
            .map(|(kind, _)| ((*kind).into(), Vec::new()))
            .collect();
        selected.insert("genre".into(), vec![genre.into()]);
        selected.insert("sort".into(), vec!["hot_score".into()]);
        for ((kind, _), value) in FILTERS.iter().zip([
            params.genre,
            params.category_dim_theme,
            params.category_dim_role,
            params.category_dim_epoch,
            params.sort,
            params.gender,
            params.online_time,
            params.creation_status,
        ]) {
            if let Some(value) = value {
                if !valid_filter(kind, &value) {
                    return Err(CatalogError::InvalidInput);
                }
                selected.insert(
                    (*kind).into(),
                    if value.is_empty() {
                        vec![]
                    } else {
                        vec![value]
                    },
                );
            }
        }
        Ok(Self {
            offset: params.offset,
            selectors,
            payload: json!({
                "filter_ids": shown, "req_scene": scene, "offset": params.offset,
                "need_selector_panel": selectors, "limit": 15, "select_items": selected,
                "session_id": session, "req_type": if selectors { "default" } else { "only_content" },
                "client_req_type": 3,
            }),
        })
    }
    pub(crate) fn payload(&self) -> &Value {
        &self.payload
    }
}
fn valid_session(value: &str) -> bool {
    value.len() <= 1024 && !value.chars().any(char::is_control)
}
fn valid_filter(kind: &str, value: &str) -> bool {
    if value.is_empty() {
        return FILTERS.iter().any(|(key, _)| *key == kind);
    }
    match kind {
        "genre" => matches!(value, "short_play" | "comic_series" | "ai_series"),
        "sort" => matches!(value, "hot_score" | "online_time" | "hot_collect"),
        "gender" => matches!(value, "0" | "1"),
        "online_time" => matches!(value, "days_7" | "days_14" | "days_30" | "days_90"),
        "creation_status" => matches!(value, "creation_status_0" | "creation_status_1"),
        "category_dim_theme" | "category_dim_role" | "category_dim_epoch" => {
            value.strip_prefix("cate_").is_some_and(|id| {
                (1..=8).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
            })
        }
        _ => false,
    }
}

/// Validated upstream selector option; an empty selection is represented by the caller's All action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryFilterOption {
    /// Exact allowlisted protocol value.
    pub id: String,
    /// Bounded public display name.
    pub label: String,
}
/// One supported selector dimension in upstream order, with reference status normalization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryFilterRow {
    /// One of the eight supported protocol filter kinds.
    pub r#type: String,
    /// Stable reference-client Chinese label.
    pub label: String,
    /// Ordered unique nonempty supported options.
    pub options: Vec<CategoryFilterOption>,
}
/// One bounded category page; its cursor is independent of website search pagination.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryResult {
    /// Unique supported summaries, never episode details.
    pub items: Vec<Drama>,
    /// Whether another advancing upstream page exists.
    pub has_more: bool,
    /// Upstream offset, with the fixed reference fallback only when absent/zero.
    pub next_offset: u32,
    /// Opaque continuation context; empty when not supplied.
    pub session_id: String,
    /// Selector rows only when requested.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub filters: Option<Vec<CategoryFilterRow>>,
}
fn number(value: &Value) -> Option<u32> {
    match value {
        Value::Number(n) => n.to_string().parse().ok(),
        Value::String(s) if s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit()) => {
            s.parse().ok()
        }
        _ => None,
    }
}
fn label(value: &Value) -> Option<String> {
    let s = value.as_str()?;
    (!s.chars().any(char::is_control) && !s.trim().is_empty() && s.chars().count() <= 80)
        .then(|| s.trim().to_owned())
}
fn filters(value: Option<&Value>) -> Result<Vec<CategoryFilterRow>, CatalogError> {
    let rows = match value {
        None | Some(Value::Null) => &[][..],
        Some(Value::Array(rows)) if rows.len() <= 32 => rows.as_slice(),
        Some(Value::Array(_)) => return Err(CatalogError::TooLarge),
        _ => return Err(CatalogError::InvalidData),
    };
    let mut result = Vec::new();
    let mut kinds = HashSet::new();
    for row in rows {
        let Some(kind) = row["type"].as_str() else {
            continue;
        };
        let Some((_, name)) = FILTERS.iter().find(|(key, _)| *key == kind) else {
            continue;
        };
        let Some(items) = row["items"].as_array() else {
            return Err(CatalogError::InvalidData);
        };
        if items.len() > 128 {
            return Err(CatalogError::TooLarge);
        }
        if !kinds.insert(kind) {
            continue;
        }
        let mut seen = HashSet::new();
        let options = items
            .iter()
            .filter_map(|item| {
                let id = match &item["selector_item_id"] {
                    Value::String(s) if s.len() <= 32 => s.clone(),
                    Value::Number(n) => n.to_string(),
                    _ => return None,
                };
                let label = label(&item["show_name"])?;
                if id.is_empty() || !valid_filter(kind, &id) || !seen.insert(id.clone()) {
                    return None;
                }
                Some(CategoryFilterOption { id, label })
            })
            .collect::<Vec<_>>();
        if !options.is_empty() {
            result.push(CategoryFilterRow {
                r#type: kind.into(),
                label: (*name).into(),
                options,
            });
        }
    }
    let status = CategoryFilterRow {
        r#type: "creation_status".into(),
        label: "状态".into(),
        options: [
            ("creation_status_0", "已完结"),
            ("creation_status_1", "连载中"),
        ]
        .into_iter()
        .map(|(id, label)| CategoryFilterOption {
            id: id.into(),
            label: label.into(),
        })
        .collect(),
    };
    if let Some(index) = result
        .iter()
        .position(|row| row.r#type == "creation_status")
    {
        result[index] = status;
    } else {
        let index = result
            .iter()
            .position(|row| row.r#type == "online_time")
            .unwrap_or(result.len());
        result.insert(index, status);
    }
    Ok(result)
}

/// Parse the exact anonymous category envelope and preserve an advancing service cursor.
pub fn parse_category(body: &[u8], query: &CategoryQuery) -> Result<CategoryResult, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if number(&root["code"]) != Some(0)
        || [root.get("error_code"), root["data"].get("error_code")]
            .into_iter()
            .flatten()
            .any(|code| number(code) != Some(0))
    {
        return Err(CatalogError::InvalidData);
    }
    let data = &root["data"];
    let rows = data["video_data"]
        .as_array()
        .ok_or(CatalogError::InvalidData)?;
    if rows.len() > 128 {
        return Err(CatalogError::TooLarge);
    }
    let has_more = data["has_more"]
        .as_bool()
        .or_else(|| match number(&data["has_more"]) {
            Some(0) => Some(false),
            Some(1) => Some(true),
            _ => None,
        })
        .ok_or(CatalogError::InvalidData)?;
    let mut seen = HashSet::new();
    let items: Vec<_> = rows
        .iter()
        .filter_map(super::actor_works::summary)
        .filter(|drama| seen.insert(drama.series_id.clone()))
        .collect();
    let mut next = match data.get("next_offset") {
        None => 0,
        Some(value) => number(value).ok_or(CatalogError::InvalidData)?,
    };
    if has_more && next == 0 {
        next = query.offset + items.len() as u32;
    }
    if next > 100_000 || (has_more && next <= query.offset) {
        return Err(CatalogError::InvalidData);
    }
    let session = match data.get("session_id") {
        None => "",
        Some(value) => value.as_str().ok_or(CatalogError::InvalidData)?,
    };
    if !valid_session(session) {
        return Err(CatalogError::InvalidData);
    }
    Ok(CategoryResult {
        items,
        has_more,
        next_offset: next,
        session_id: session.into(),
        filters: query
            .selectors
            .then(|| filters(data.get("selector_rows")))
            .transpose()?,
    })
}

#[cfg(test)]
mod tests;
