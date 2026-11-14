//! Anonymous channel feeds have a tab → cell phase, independent of category/search cursors.
use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use utoipa::{IntoParams, ToSchema};

const DEFAULT_CELL: &str = "7294257141911650341";
const DEFAULT_PLAN: &str = "7294257258253254693";
pub(crate) const BODY_LIMIT: usize = 4 * 1024 * 1024;

/// The migrated anonymous channels; followed content remains account-owned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum FeedChannel {
    /// General recommendation stream.
    #[serde(rename = "16")]
    Recommend,
    /// Comic dramas.
    #[serde(rename = "36")]
    Comic,
    /// Live-action dramas.
    #[serde(rename = "39")]
    Real,
}
impl FeedChannel {
    fn id(self) -> &'static str {
        match self {
            Self::Recommend => "16",
            Self::Comic => "36",
            Self::Real => "39",
        }
    }
}
/// Shared strict HTTP/native feed parameters. Cell and plan must be supplied together.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct FeedParams {
    /// Anonymous channel16 (default),36 or39. Channel45 requires a separate account service.
    pub channel: Option<String>,
    /// Consumed upstream cell offset, 0–100000; not a drama count.
    #[serde(default)]
    pub offset: u32,
    /// Paired exact nonzero decimal cell identity, at most30 digits.
    pub feed_cell: Option<String>,
    /// Paired exact nonzero decimal plan identity, at most30 digits.
    pub feed_plan: Option<String>,
    /// Upstream opaque session, at most1024 control-free bytes.
    pub session_id: Option<String>,
    /// At most128 comma-separated exact decimal series IDs.
    pub shown: Option<String>,
}
/// Validated feed request; tab first pages and cell continuations remain distinct.
#[derive(Debug, Clone)]
pub struct FeedQuery {
    channel: FeedChannel,
    offset: u32,
    cell: String,
    plan: String,
    session: String,
    shown: String,
}
fn feed_id(s: &str) -> bool {
    s.len() <= 30 && valid_id(s)
}
fn session(s: &str) -> bool {
    s.len() <= 1024 && !s.chars().any(char::is_control)
}
impl FeedQuery {
    /// Validate all caller-controlled data before any network request.
    pub fn new(params: FeedParams) -> Result<Self, CatalogError> {
        let channel = match params.channel.as_deref().unwrap_or("16") {
            "16" => FeedChannel::Recommend,
            "36" => FeedChannel::Comic,
            "39" => FeedChannel::Real,
            _ => return Err(CatalogError::InvalidInput),
        };
        let mut cell = params.feed_cell.unwrap_or_default();
        let mut plan = params.feed_plan.unwrap_or_default();
        let session = params.session_id.unwrap_or_default();
        let shown = params.shown.unwrap_or_default();
        if params.offset > 100_000
            || !self::session(&session)
            || (!shown.is_empty()
                && (shown.split(',').count() > 128 || !shown.split(',').all(valid_id)))
            || cell.is_empty() != plan.is_empty()
            || (!cell.is_empty() && (!feed_id(&cell) || !feed_id(&plan)))
        {
            return Err(CatalogError::InvalidInput);
        }
        if channel == FeedChannel::Recommend {
            if !cell.is_empty() && (cell != DEFAULT_CELL || plan != DEFAULT_PLAN) {
                return Err(CatalogError::InvalidInput);
            }
            cell = DEFAULT_CELL.into();
            plan = DEFAULT_PLAN.into();
        } else if cell.is_empty()
            && (params.offset != 0 || !session.is_empty() || !shown.is_empty())
        {
            return Err(CatalogError::InvalidInput);
        }
        Ok(Self {
            channel,
            offset: params.offset,
            cell,
            plan,
            session,
            shown,
        })
    }
    /// True only for a nondefault channel first page, before cell context is known.
    pub fn is_tab(&self) -> bool {
        self.cell.is_empty()
    }
    pub(crate) fn endpoint(&self) -> &'static str {
        if self.is_tab() {
            "https://api5-normal-lq.fqnovel.com/reading/bookapi/bookmall/tab/v"
        } else {
            "https://api5-normal-lq.fqnovel.com/reading/bookapi/bookmall/cell/change/v"
        }
    }
    pub(crate) fn params(&self) -> BTreeMap<String, String> {
        let base = if self.is_tab() {
            vec![
                ("landing_bottom_tab_type", "7"),
                ("device_level", "3"),
                ("screen_width_px", "1078"),
                ("is_horizontal_screen", "false"),
                ("disable_digg_stat", "false"),
                ("auth_aweme", "true"),
                ("auth_backward", "true"),
                ("has_video_cache", "false"),
                ("last_tab_type", "0"),
                ("last_tab_index", "0"),
                ("tab_index", "0"),
                ("req_rank_category_id", "0"),
                ("client_req_type", "1"),
            ]
        } else {
            vec![
                ("client_req_type", "2"),
                ("client_template", "7"),
                ("change_type", "0"),
                ("category_id", "0"),
                ("cell_sub_id", "0"),
                ("limit", "0"),
                ("cell_id", &self.cell),
                ("plan_id", &self.plan),
                ("filter_ids", &self.shown),
            ]
        };
        let mut params: BTreeMap<String, String> = base
            .into_iter()
            .map(|(k, v)| (k.into(), v.into()))
            .collect();
        for (k, v) in [
            ("bottom_tab_type", "7"),
            ("need_personal_recommend", "1"),
            ("video_type_preferences_str", "[]"),
            ("tab_type", self.channel.id()),
            ("session_id", &self.session),
        ] {
            params.insert(k.into(), v.into());
        }
        params.insert("offset".into(), self.offset.to_string());
        params
    }
}
/// Aggregate parse counts only; never contain titles, identity or account data.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FeedDiagnostics {
    /// Total visited cells, including nonvideo cells.
    pub cells_seen: u32,
    /// Direct and nested video records considered.
    pub records_seen: u32,
    /// Valid playable records before identity deduplication.
    pub parsed: u32,
    /// Disabled, malformed or unsupported records.
    pub filtered: u32,
}
/// One anonymous feed page; offset0 with a cell/plan pair is valid after a tab first page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FeedResult {
    /// Requested anonymous channel.
    pub channel: FeedChannel,
    /// Unique ordered summaries without episode details.
    pub items: Vec<Drama>,
    /// Whether a valid next phase/page exists.
    pub has_more: bool,
    /// Exact upstream cell offset; zero on a tab→cell transition.
    pub next_offset: u32,
    /// Opaque continuation session.
    pub session_id: String,
    /// Exact cell identity; empty only for a terminal tab without a cell.
    pub feed_cell: String,
    /// Exact plan identity; empty only for a terminal tab without a plan.
    pub feed_plan: String,
    /// Aggregate diagnostics, independent of cursor advancement.
    pub diagnostics: FeedDiagnostics,
}
fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn number(v: &Value) -> Option<u32> {
    scalar(v)
        .filter(|s| s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit()))?
        .parse()
        .ok()
}
fn boolean(v: &Value) -> Option<bool> {
    v.as_bool().or_else(|| match number(v) {
        Some(0) => Some(false),
        Some(1) => Some(true),
        _ => None,
    })
}
fn disabled(row: &Value) -> bool {
    // An explicit malformed access flag must never grant playback.
    row.get("disable_play")
        .is_some_and(|value| boolean(value).unwrap_or(true))
}
fn rows(v: &Value) -> Result<&[Value], CatalogError> {
    let rows = v.as_array().ok_or(CatalogError::InvalidData)?;
    if rows.len() > 128 {
        return Err(CatalogError::TooLarge);
    }
    Ok(rows)
}
struct Parser {
    items: Vec<Drama>,
    seen: HashSet<String>,
    diagnostics: FeedDiagnostics,
}
impl Parser {
    fn record(&mut self, detail: Option<&Value>, disabled: bool) -> Result<(), CatalogError> {
        self.diagnostics.records_seen += 1;
        self.budget()?;
        let drama = detail
            .filter(|_| !disabled)
            .and_then(super::actor_works::summary)
            .filter(|d| d.episode_count.is_some_and(|n| n > 0));
        if let Some(drama) = drama {
            self.diagnostics.parsed += 1;
            if self.seen.insert(drama.series_id.clone()) {
                self.items.push(drama);
            }
        } else {
            self.diagnostics.filtered += 1;
        }
        Ok(())
    }
    fn budget(&self) -> Result<(), CatalogError> {
        if self.diagnostics.cells_seen + self.diagnostics.records_seen > 1024 {
            Err(CatalogError::TooLarge)
        } else {
            Ok(())
        }
    }
    fn walk(&mut self, cells: &[Value], depth: usize) -> Result<(), CatalogError> {
        if depth > 8 {
            return Err(CatalogError::TooLarge);
        }
        for cell in cells {
            if !cell.is_object() {
                return Err(CatalogError::InvalidData);
            }
            self.diagnostics.cells_seen += 1;
            self.budget()?;
            if let Some(detail) = cell.get("video_detail") {
                self.record(Some(detail), disabled(cell))?;
            }
            if let Some(videos) = cell.get("video_data") {
                for video in rows(videos)? {
                    self.record(video.get("video_detail"), disabled(video))?;
                }
            }
            if let Some(nested) = cell.get("cell_data") {
                self.walk(rows(nested)?, depth + 1)?;
            }
        }
        Ok(())
    }
}
/// Parse the exact requested channel/phase with finite raw-page budgets and service cursors.
pub fn parse_feed(body: &[u8], query: &FeedQuery) -> Result<FeedResult, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let root: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if number(&root["code"]) != Some(0)
        || [&root, &root["data"]]
            .into_iter()
            .any(|v| v.get("error_code").is_some_and(|c| number(c) != Some(0)))
    {
        return Err(CatalogError::InvalidData);
    }
    let data = &root["data"];
    let (page, cells, cell, plan, has_more, next) = if query.is_tab() {
        let mut matches = rows(&data["tab_item"])?
            .iter()
            .filter(|t| scalar(&t["tab_type"]).as_deref() == Some(query.channel.id()));
        let tab = matches.next().ok_or(CatalogError::InvalidData)?;
        if matches.next().is_some() {
            return Err(CatalogError::InvalidData);
        }
        let cells = rows(&tab["cell_data"])?;
        let cell = cells
            .iter()
            .find_map(|c| {
                c.get("cell_id_str")
                    .or_else(|| c.get("cell_id"))
                    .and_then(scalar)
                    .filter(|id| feed_id(id))
            })
            .unwrap_or_default();
        let plan = match tab.get("bookstore_id") {
            None => String::new(),
            Some(value) => scalar(value).ok_or(CatalogError::InvalidData)?,
        };
        let more = boolean(&tab["bottom_unlimited"]).ok_or(CatalogError::InvalidData)?;
        if (!plan.is_empty() && !feed_id(&plan))
            || cell.is_empty() != plan.is_empty()
            || (more && cell.is_empty())
        {
            return Err(CatalogError::InvalidData);
        }
        (tab, cells, cell, plan, more, 0)
    } else {
        let more = boolean(&data["has_more"]).ok_or(CatalogError::InvalidData)?;
        let next = match data.get("next_offset") {
            None if !more => 0,
            Some(v) => number(v).ok_or(CatalogError::InvalidData)?,
            _ => return Err(CatalogError::InvalidData),
        };
        if next > 100_000 || (more && next <= query.offset) {
            return Err(CatalogError::InvalidData);
        }
        (
            data,
            rows(&data["cell_view"]["cell_data"])?,
            query.cell.clone(),
            query.plan.clone(),
            more,
            next,
        )
    };
    let session = match page.get("session_id") {
        None => query.session.as_str(),
        Some(v) => v.as_str().ok_or(CatalogError::InvalidData)?,
    };
    if !self::session(session) {
        return Err(CatalogError::InvalidData);
    }
    let mut parser = Parser {
        items: Vec::new(),
        seen: HashSet::new(),
        diagnostics: FeedDiagnostics::default(),
    };
    parser.walk(cells, 0)?;
    Ok(FeedResult {
        channel: query.channel,
        items: parser.items,
        has_more,
        next_offset: next,
        session_id: session.into(),
        feed_cell: cell,
        feed_plan: plan,
        diagnostics: parser.diagnostics,
    })
}
#[cfg(test)]
mod tests;
