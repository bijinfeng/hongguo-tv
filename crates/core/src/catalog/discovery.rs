//! Optional anonymous search-page data, bounded independently of the website search cursor.
use super::{CatalogError, Drama, valid_id};
use crate::playback::PlaybackClient;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio::{
    sync::Mutex,
    time::{Instant, timeout_at},
};
use utoipa::ToSchema;

/// A display summary or an explicitly nonplayable keyword-only suggestion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct DiscoveryItem {
    /// Summary fields; series_id is empty for a keyword-only suggestion.
    #[serde(flatten)]
    pub drama: Drama,
    /// Search term only, never an inferred playable ID from a tag.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub query: Option<String>,
    /// Original one-based position before filtering and deduplication.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub position: Option<u32>,
    /// Bounded official popularity display text.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub search_score: Option<String>,
}
/// The only accepted public video-board families.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryBoardKind {
    /// Ordinary short dramas.
    Short,
    /// Comic dramas.
    Comic,
}
/// One nonempty public board.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct DiscoveryBoard {
    /// Stable content family.
    pub id: DiscoveryBoardKind,
    /// At most six unique playable summaries.
    pub items: Vec<DiscoveryItem>,
}
/// Public search-page snapshot; empty arrays are a valid optional result.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SearchDiscovery {
    /// At most four public suggestions; keyword-only rows have query and no series identity.
    pub guesses: Vec<DiscoveryItem>,
    /// Nonempty boards in short, comic order.
    pub boards: Vec<DiscoveryBoard>,
}
type Snapshot = Option<(Result<SearchDiscovery, CatalogError>, Instant)>;
#[derive(Clone)]
pub(super) struct Discovery {
    transport: PlaybackClient,
    snapshot: Arc<Mutex<Snapshot>>,
    deadline: Duration,
    populated_ttl: Duration,
    empty_ttl: Duration,
}
impl Discovery {
    pub(super) fn new(origin: Option<&str>) -> Result<Self, CatalogError> {
        let transport = match origin {
            Some(origin) => PlaybackClient::for_loopback_tests(origin),
            None => PlaybackClient::new(),
        }
        .map_err(|_| CatalogError::Configuration)?;
        Ok(Self {
            transport,
            snapshot: Arc::new(Mutex::new(None)),
            deadline: Duration::from_secs(6),
            populated_ttl: Duration::from_secs(600),
            empty_ttl: Duration::from_secs(60),
        })
    }
    pub(super) async fn get(&self) -> Result<SearchDiscovery, CatalogError> {
        // One deadline includes contention; dropping the owner writes no cancellation snapshot.
        let deadline = Instant::now() + self.deadline;
        let mut cache = timeout_at(deadline, self.snapshot.lock())
            .await
            .map_err(|_| CatalogError::Timeout)?;
        if let Some((data, until)) = &*cache
            && Instant::now() < *until
        {
            return data.clone();
        }
        if Instant::now() >= deadline {
            return Err(CatalogError::Timeout);
        }
        let data = timeout_at(deadline, async {
            self.transport
                .public_search_plan()
                .await
                .and_then(|bytes| parse_discovery(&bytes))
        })
        .await
        .unwrap_or(Err(CatalogError::Timeout));
        let populated = data.as_ref().is_ok_and(|data| {
            !data.guesses.is_empty() || data.boards.iter().any(|b| !b.items.is_empty())
        });
        let ttl = if populated {
            self.populated_ttl
        } else {
            self.empty_ttl
        };
        *cache = Some((data.clone(), Instant::now() + ttl));
        data
    }
}
fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(s) if s.len() <= 4096 => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn title(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    if text.len() > 400 {
        return None;
    }
    crate::library::normalize_keyword(text).ok()
}
fn cover(row: &Value) -> String {
    for key in ["series_cover", "cover", "cover_url"] {
        let Some(text) = row[key].as_str().filter(|s| s.len() <= 2048) else {
            continue;
        };
        let Ok(url) = reqwest::Url::parse(text) else {
            continue;
        };
        if url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url
                .host_str()
                .is_some_and(|h| h.ends_with(".byteimg.com") || h.ends_with(".fqnovelpic.com"))
        {
            return text.into();
        }
    }
    String::new()
}
fn item(
    row: &Value,
    index: usize,
    board: Option<DiscoveryBoardKind>,
    mixed: bool,
) -> Option<DiscoveryItem> {
    let title = title(&row["title"])?;
    let kind = scalar(&row["content_type"]).filter(|s| !s.is_empty());
    if kind
        .as_deref()
        .is_some_and(|s| !["1", "7", "1004"].contains(&s))
        || (mixed && kind.is_none())
    {
        return None;
    }
    if let Some(board) = board
        && kind
            .as_deref()
            .is_some_and(|k| (k == "1004") != (board == DiscoveryBoardKind::Comic))
    {
        return None;
    }
    let id = scalar(&row["series_id_str"])
        .or_else(|| scalar(&row["series_id"]))
        .filter(|id| valid_id(id));
    let Some(series_id) = id else {
        if board.is_some() || mixed {
            return None;
        }
        return Some(DiscoveryItem {
            drama: Drama {
                title: title.clone(),
                ..Drama::default()
            },
            query: Some(title),
            position: None,
            search_score: None,
        });
    };
    let cover = cover(row);
    let episode_count = ["episode_cnt", "episode_total_cnt"]
        .into_iter()
        .filter_map(|key| scalar(&row[key]).and_then(|s| s.parse::<u32>().ok()))
        .find(|n| *n > 0);
    let score = ["card_tips", "rec_text"]
        .into_iter()
        .find_map(|key| {
            row[key]
                .as_str()
                .filter(|s| s.chars().count() <= 80 && !s.chars().any(char::is_control))
                .map(str::to_owned)
        })
        .filter(|s| !s.is_empty());
    Some(DiscoveryItem {
        drama: Drama {
            series_id,
            title,
            cover_fallback: super::parse::cover_fallback(&cover),
            cover,
            intro: String::new(),
            content_type: Some(kind.unwrap_or_else(|| {
                if board == Some(DiscoveryBoardKind::Comic) {
                    "1004"
                } else {
                    "1"
                }
                .into()
            })),
            episode_count,
            ..Drama::default()
        },
        query: None,
        position: Some((index + 1) as u32),
        search_score: score,
    })
}
struct Parser {
    guesses: Vec<DiscoveryItem>,
    short: Vec<DiscoveryItem>,
    comic: Vec<DiscoveryItem>,
    visits: usize,
    strings: usize,
}
impl Parser {
    fn rows(&mut self, rows: &Value, board: Option<DiscoveryBoardKind>, mixed: bool) {
        let Some(rows) = rows.as_array() else {
            return;
        };
        for (i, row) in rows.iter().take(128).enumerate() {
            if self.visits >= 1024 {
                return;
            }
            self.visits += 1;
            let Some(item) = item(row, i, board, mixed) else {
                continue;
            };
            let items = if mixed {
                if item.drama.content_type.as_deref() == Some("1004") {
                    &mut self.comic
                } else {
                    &mut self.short
                }
            } else {
                match board {
                    Some(DiscoveryBoardKind::Short) => &mut self.short,
                    Some(DiscoveryBoardKind::Comic) => &mut self.comic,
                    None => &mut self.guesses,
                }
            };
            let limit = if board.is_some() || mixed { 6 } else { 4 };
            if items.len() < limit
                && !items.iter().any(|v| {
                    if item.drama.series_id.is_empty() {
                        v.query == item.query
                    } else {
                        v.drama.series_id == item.drama.series_id
                    }
                })
            {
                items.push(item);
            }
        }
    }
    fn visit(&mut self, value: &Value, depth: usize) {
        if depth > 8 || self.visits >= 1024 {
            return;
        }
        self.visits += 1;
        match value {
            Value::String(raw) => {
                if raw.len() > 2 * 1024 * 1024 - self.strings {
                    return;
                }
                self.strings += raw.len();
                if let Ok(decoded) = serde_json::from_str::<Value>(raw) {
                    self.visit(&decoded, depth + 1);
                }
            }
            Value::Array(values) => {
                for cell in values.iter().take(128) {
                    self.visit(cell, depth + 1);
                }
            }
            Value::Object(_) => {
                match value["cell_name"].as_str() {
                    Some("猜你想搜") if self.guesses.is_empty() => {
                        self.rows(&value["video_data"], None, false);
                        if self.guesses.is_empty()
                            && let Some(tags) = value["search_tag_data"].as_array()
                        {
                            for tag in tags.iter().take(128) {
                                if self.visits >= 1024 || self.guesses.len() >= 4 {
                                    break;
                                }
                                self.visits += 1;
                                if let Some(title) = title(&tag["tag_title"])
                                    && !self
                                        .guesses
                                        .iter()
                                        .any(|v| v.query.as_ref() == Some(&title))
                                {
                                    self.guesses.push(DiscoveryItem {
                                        drama: Drama {
                                            title: title.clone(),
                                            ..Drama::default()
                                        },
                                        query: Some(title),
                                        position: None,
                                        search_score: None,
                                    });
                                }
                            }
                        }
                    }
                    Some("短剧热搜榜") => {
                        self.rows(&value["video_data"], Some(DiscoveryBoardKind::Short), false)
                    }
                    Some("漫剧热搜榜") => {
                        self.rows(&value["video_data"], Some(DiscoveryBoardKind::Comic), false)
                    }
                    Some("热搜榜") => self.rows(&value["video_data"], None, true),
                    _ => {}
                }
                for key in ["lynx_data", "cell_data"] {
                    if let Some(child) = value.get(key) {
                        self.visit(child, depth + 1);
                    }
                }
            }
            _ => {}
        }
    }
}
/// Parse only known public search cells. Exact numeric IDs are never converted through floats.
pub fn parse_discovery(bytes: &[u8]) -> Result<SearchDiscovery, CatalogError> {
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(CatalogError::TooLarge);
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| CatalogError::InvalidData)?;
    if scalar(&value["code"]).as_deref() != Some("0") || value.get("data").is_none() {
        return Err(CatalogError::InvalidData);
    }
    // Business failures can accompany an outer code=0; never cache them as an empty success.
    for envelope in [&value, &value["data"]] {
        if let Some(code) = envelope.get("error_code")
            && scalar(code).as_deref() != Some("0")
        {
            return Err(CatalogError::InvalidData);
        }
    }
    let mut parser = Parser {
        guesses: Vec::new(),
        short: Vec::new(),
        comic: Vec::new(),
        visits: 0,
        strings: 0,
    };
    parser.visit(&value["data"], 0);
    let mut boards = Vec::new();
    for (id, items) in [
        (DiscoveryBoardKind::Short, parser.short),
        (DiscoveryBoardKind::Comic, parser.comic),
    ] {
        if !items.is_empty() {
            boards.push(DiscoveryBoard { id, items });
        }
    }
    Ok(SearchDiscovery {
        guesses: parser.guesses,
        boards,
    })
}

#[cfg(test)]
mod tests;
