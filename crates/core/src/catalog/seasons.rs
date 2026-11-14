//! Public same-IP selectors and explicitly confirmed next-season relationships.
use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use utoipa::{IntoParams, ToSchema};

pub(crate) const ENDPOINT: &str = "https://api5-normal-lq.fqnovel.com/reading/bookapi/plan/v";
const BODY_LIMIT: usize = 4 * 1024 * 1024;

/// Shared strict input for both public season endpoints.
#[derive(Debug, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct SeriesParams {
    /// Exact nonzero decimal series identity, 1–32 digits; no title inference.
    pub series_id: String,
}

/// Validated exact series identity, with no caller-controlled upstream destination.
#[derive(Debug, Clone)]
pub struct SeriesQuery(String);
impl SeriesQuery {
    /// Reject malformed identities before signing, registering or networking.
    pub fn new(series_id: &str) -> Result<Self, CatalogError> {
        if !valid_id(series_id) {
            return Err(CatalogError::InvalidInput);
        }
        Ok(Self(series_id.into()))
    }
    /// Exact requested series identity.
    pub fn id(&self) -> &str {
        &self.0
    }
    pub(crate) fn params(&self, relation: bool) -> BTreeMap<String, String> {
        [
            ("scene", "10"),
            (
                "from",
                if relation {
                    "series_short_play_info"
                } else {
                    "single_col_same_ip_series"
                },
            ),
            ("offset", "0"),
            ("limit", "0"),
            ("total_chapter_num", "0"),
            ("current_chapter_num", "0"),
            ("post_id", "0"),
            ("is_horizontal_screen", "false"),
            ("bookstore_tab", "0"),
            ("bookstore_tab_type", "0"),
            ("book_id", self.id()),
            ("filter_ids", self.id()),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v.into()))
        .collect()
    }
}

/// Public season metadata, separate from detail episodes and account reservation state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SeriesSeason {
    /// Existing supported drama summary; never includes episode details.
    pub drama: Drama,
    /// Explicit numeric season or parsed official 第N季 label, never inferred from title.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub season_index: Option<u32>,
    /// Official bounded public season label.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub label: Option<String>,
    /// Bounded public subtitle, without remote styling or navigation.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub subtitle: Option<String>,
    /// True only for a released row with a valid video/count and no disable flag.
    pub playable: bool,
    /// True for subscription/trailer rows or missing released video/count.
    pub upcoming: bool,
    /// First released video only when playable; a trailer never exposes this field.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub first_video_id: Option<String>,
    /// Eligible season series ID, never the nested reservation item ID; not a write result.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reservation_id: Option<String>,
}

/// Complete supported selector in official response order, not guessed season order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SeriesSeasonsResult {
    /// Unique ordered public seasons, including unavailable and upcoming entries.
    pub items: Vec<SeriesSeason>,
}

/// Verified successor selection without automatic navigation or media preparation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct NextSeasonResult {
    /// Confirmed current season; 0 only when no playable sibling exists to verify it.
    pub current_season: u32,
    /// Nearest confirmed higher playable season, or null when none is available.
    pub next: Option<SeriesSeason>,
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
fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if s.len() <= 100 => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn text(v: &Value, max: usize) -> Option<String> {
    let s = v.as_str()?;
    (s.len() <= max * 4
        && !s.trim().is_empty()
        && s.chars().count() <= max
        && !s.chars().any(char::is_control))
    .then(|| s.trim().into())
}
fn rows(v: &Value, optional: bool) -> Result<&[Value], CatalogError> {
    match v {
        Value::Null if optional => Ok(&[]),
        Value::Array(rows) if rows.len() <= 128 => Ok(rows),
        Value::Array(_) => Err(CatalogError::TooLarge),
        _ => Err(CatalogError::InvalidData),
    }
}
fn labels(v: &Value) -> Result<Vec<String>, CatalogError> {
    Ok(rows(v, true)?
        .iter()
        .filter_map(|v| text(&v["content"], 80))
        .collect())
}
fn disabled(v: Option<&Value>) -> Result<bool, CatalogError> {
    match v {
        None => Ok(false),
        Some(Value::Bool(v)) => Ok(*v),
        Some(v) => match number(v) {
            Some(0) => Ok(false),
            Some(1) => Ok(true),
            _ => Err(CatalogError::InvalidData),
        },
    }
}
fn season_number(v: &Value) -> Option<u32> {
    number(v).filter(|n| (1..=100_000).contains(n))
}

fn parse(body: &[u8], relation: bool) -> Result<SeriesSeasonsResult, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if number(&root["code"]) != Some(0)
        || root.get("error_code").is_some_and(|v| number(v) != Some(0))
    {
        return Err(CatalogError::InvalidData);
    }
    let mut items: Vec<SeriesSeason> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut count = 0;
    for block in rows(&root["data"], false)? {
        if !block.is_object() {
            return Err(CatalogError::InvalidData);
        }
        for row in rows(&block["video_data"], true)? {
            count += 1;
            if count > 1024 {
                return Err(CatalogError::TooLarge);
            }
            if !row.is_object() {
                return Err(CatalogError::InvalidData);
            }
            let Some(drama) = super::actor_works::summary(row) else {
                continue;
            };
            if !relation && text(&row["title"], 100).is_none() {
                continue;
            }
            let official = labels(&row["secondary_info_list"])?;
            let label = official
                .into_iter()
                .find(|s| s.starts_with('第') && s.ends_with('季'));
            let explicit = season_number(&row["season_index"]);
            let season_index = explicit.or_else(|| {
                if relation {
                    return None;
                }
                label
                    .as_deref()?
                    .strip_prefix('第')?
                    .strip_suffix('季')?
                    .parse::<u32>()
                    .ok()
                    .filter(|n| (1..=100_000).contains(n))
            });
            if relation && season_index.is_none() {
                continue;
            }
            if let Some(index) = seen.get(&drama.series_id) {
                if items[*index].season_index != season_index
                    && items[*index].season_index.is_some()
                    && season_index.is_some()
                {
                    return Err(CatalogError::InvalidData);
                }
                continue;
            }
            let label = label.or_else(|| season_index.map(|n| format!("第{n}季")));
            let subscribe = match row.get("subscribe_item") {
                None | Some(Value::Null) => None,
                Some(v) if v.is_object() => Some(v),
                _ => return Err(CatalogError::InvalidData),
            };
            let vid = scalar(&row["vid"])
                .or_else(|| scalar(&row["video_id"]))
                .or_else(|| scalar(&row["vid_list"][0]))
                .filter(|s| valid_id(s));
            let upcoming =
                subscribe.is_some() || vid.is_none() || !drama.episode_count.is_some_and(|n| n > 0);
            let disabled = disabled(row.get("disable_play"))?;
            let playable = !upcoming && !disabled;
            let reservation_id = subscribe
                .and_then(|s| scalar(&s["item_id"]))
                .filter(|s| valid_id(s))
                .map(|_| drama.series_id.clone());
            let mut subtitle = labels(&row["sub_title_list"])?;
            if !upcoming {
                subtitle.truncate(1);
            }
            let subtitle = (!subtitle.is_empty()).then(|| subtitle.join(" · "));
            seen.insert(drama.series_id.clone(), items.len());
            items.push(SeriesSeason {
                drama,
                season_index,
                label,
                subtitle,
                playable,
                upcoming,
                first_video_id: if playable { vid } else { None },
                reservation_id,
            });
        }
    }
    Ok(SeriesSeasonsResult { items })
}
/// Parse the complete official same-IP selector; no title-derived season numbers.
pub fn parse_series_seasons(body: &[u8]) -> Result<SeriesSeasonsResult, CatalogError> {
    parse(body, false)
}
pub(crate) fn parse_season_relations(body: &[u8]) -> Result<SeriesSeasonsResult, CatalogError> {
    parse(body, true)
}

/// Locate the lowest numbered playable sibling for at most one reciprocal verification read.
pub(crate) fn reciprocal_series<'a>(
    query: &SeriesQuery,
    rows: &'a [SeriesSeason],
) -> Option<&'a str> {
    if rows.iter().any(|r| r.drama.series_id == query.id()) {
        return None;
    }
    rows.iter()
        .filter(|r| r.playable && r.season_index.is_some())
        .min_by_key(|r| r.season_index)
        .map(|r| r.drama.series_id.as_str())
}
/// Select a verified nearest successor; missing/conflicting current identity never defaults to1.
pub(crate) fn select_next_season(
    query: &SeriesQuery,
    rows: Vec<SeriesSeason>,
    reciprocal: Option<Vec<SeriesSeason>>,
) -> Result<NextSeasonResult, CatalogError> {
    let known: HashMap<_, _> = rows
        .iter()
        .filter_map(|r| Some((r.drama.series_id.as_str(), r.season_index?)))
        .collect();
    for row in reciprocal.as_deref().unwrap_or_default() {
        if let (Some(index), Some(other)) =
            (row.season_index, known.get(row.drama.series_id.as_str()))
            && index != *other
        {
            return Err(CatalogError::InvalidData);
        }
    }
    let current = rows
        .iter()
        .find(|r| r.drama.series_id == query.id())
        .and_then(|r| r.season_index);
    let has_sibling = rows
        .iter()
        .any(|r| r.drama.series_id != query.id() && r.playable && r.season_index.is_some());
    let confirmed = reciprocal
        .as_ref()
        .and_then(|rows| rows.iter().find(|r| r.drama.series_id == query.id()))
        .and_then(|r| r.season_index);
    if current.is_some() && confirmed.is_some() && current != confirmed {
        return Err(CatalogError::InvalidData);
    }
    let current = current.or(confirmed);
    if has_sibling && current.is_none() {
        return Err(CatalogError::InvalidData);
    }
    let current_season = current.unwrap_or(0);
    let mut candidates = rows
        .into_iter()
        .filter(|r| {
            r.drama.series_id != query.id()
                && r.playable
                && r.season_index.is_some_and(|n| n > current_season)
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|r| r.season_index);
    if candidates.len() > 1 && candidates[0].season_index == candidates[1].season_index {
        return Err(CatalogError::InvalidData);
    }
    Ok(NextSeasonResult {
        current_season,
        next: candidates.into_iter().next(),
    })
}

#[cfg(test)]
mod tests;
