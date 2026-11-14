use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use utoipa::ToSchema;

pub(super) const BODY_LIMIT: usize = 256 * 1024;

/// Validated current input; no history, page, account or upstream URL is accepted.
#[derive(Debug, Clone)]
pub struct SuggestionQuery(String);
impl SuggestionQuery {
    /// Trim the current term, allow empty, and reject more than 100 characters or controls.
    pub fn new(term: &str) -> Result<Self, CatalogError> {
        let term = term.trim();
        if term.chars().count() > 100 || term.chars().any(char::is_control) {
            return Err(CatalogError::InvalidInput);
        }
        Ok(Self(term.into()))
    }
    /// Trimmed term; an empty term must not issue an upstream request.
    pub fn term(&self) -> &str {
        &self.0
    }
}

/// Closed suggestion meanings; unknown upstream kinds become ordinary keyword search.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SuggestionKind {
    /// A drama name, optionally carrying an explicit supported series summary.
    ShortPlayName,
    /// Actor name; actor identity is never a playable series identity.
    ShortPlayActor,
    /// A keyword that must be submitted as ordinary search.
    CommonQuery,
}

/// One bounded display/action summary, without arbitrary upstream objects or detail episodes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SearchSuggestion {
    /// Distinct action meaning; only a drama-name item can carry drama.
    pub kind: SuggestionKind,
    /// Bounded upstream key, falling back to name; never infer a series ID from this field.
    pub key: String,
    /// Plain display name and the term for ordinary keyword search.
    pub name: String,
    /// Exact nonzero decimal actor ID, if supplied for an actor item.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub actor_id: Option<String>,
    /// Bounded upstream categories, heat label and episode count, without invented popularity.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub meta: Option<String>,
    /// Present only for a supported, explicitly identified drama-name result.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub drama: Option<Drama>,
}

/// At most ten unique suggestions, preserving upstream order.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SearchSuggestions {
    /// Empty when the current term is empty or the upstream has no valid suggestions.
    pub items: Vec<SearchSuggestion>,
}

fn text(value: &Value, limit: usize) -> Option<String> {
    let value = value.as_str()?;
    if value.len() > limit * 4 || value.chars().any(char::is_control) {
        return None;
    }
    let value = value.trim();
    (!value.is_empty() && value.chars().count() <= limit).then(|| value.to_owned())
}
fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::Number(n) => {
            let value = n.to_string();
            (value.len() <= 100).then_some(value)
        }
        _ => text(value, 100),
    }
}
fn first(row: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| scalar(&row[*key]))
}
fn count(row: &Value) -> Option<u32> {
    ["episode_cnt", "episode_total_cnt"]
        .iter()
        .filter_map(|key| scalar(&row[*key])?.parse::<u32>().ok())
        .find(|n| *n > 0)
}
fn summary(row: &Value, name: &str) -> Option<Drama> {
    let id = first(
        row,
        &["series_id_str", "series_id", "seriesId", "book_id", "id"],
    )?;
    if !valid_id(&id) {
        return None;
    }
    let raw_type = row.get("content_type").or_else(|| row.get("contentType"));
    let content_type = match raw_type {
        None | Some(Value::Null) => None,
        Some(value) => Some(scalar(value)?),
    };
    if content_type
        .as_deref()
        .is_some_and(|kind| !["1", "7", "1004"].contains(&kind))
    {
        return None;
    }
    let cover = super::parse::public_cover(row);
    Some(Drama {
        series_id: id,
        title: ["series_title", "series_name", "title"]
            .iter()
            .find_map(|key| text(&row[*key], 100))
            .unwrap_or_else(|| name.into()),
        cover_fallback: super::parse::cover_fallback(&cover),
        cover,
        episode_count: count(row),
        content_type,
        ..Drama::default()
    })
}
fn metadata(row: &Value) -> Option<String> {
    let mut parts: Vec<String> = row["category_list"]
        .as_array()
        .into_iter()
        .flatten()
        .take(16)
        .filter_map(|category| text(&category["name"], 24))
        .take(3)
        .collect();
    if let Some(heat) = text(&row["hot_score_data"]["text"], 80) {
        parts.push(heat);
    }
    if let Some(count) = count(row) {
        parts.push(format!("全{count}集"));
    }
    (!parts.is_empty()).then(|| parts.join(" · "))
}

/// Normalize the direct website envelope; never search recursively through unknown payloads.
pub fn parse_suggestions(body: &[u8]) -> Result<SearchSuggestions, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let data: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    if data
        .get("code")
        .is_some_and(|code| scalar(code).as_deref() != Some("0"))
    {
        return Err(CatalogError::InvalidData);
    }
    let rows = data["suggest_list"]
        .as_array()
        .ok_or(CatalogError::InvalidData)?;
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    for row in rows.iter().take(128) {
        let Some(name) = text(&row["name"], 100).or_else(|| {
            row["display_words"]
                .as_array()?
                .iter()
                .take(10)
                .find_map(|word| text(word, 100))
        }) else {
            continue;
        };
        let kind = match row["word_type"].as_str() {
            Some("short_play_name") => SuggestionKind::ShortPlayName,
            Some("short_play_actor") => SuggestionKind::ShortPlayActor,
            _ => SuggestionKind::CommonQuery,
        };
        let key = scalar(&row["keyword"]).unwrap_or_else(|| name.clone());
        let actor_id =
            (kind == SuggestionKind::ShortPlayActor && valid_id(&key)).then(|| key.clone());
        let drama = (kind == SuggestionKind::ShortPlayName)
            .then(|| summary(&row["video_data"], &name))
            .flatten();
        let identity = drama
            .as_ref()
            .map(|drama| drama.series_id.as_str())
            .or(actor_id.as_deref())
            .unwrap_or(&name);
        if !seen.insert((kind, identity.to_owned())) {
            continue;
        }
        let meta = drama.as_ref().and_then(|_| metadata(&row["video_data"]));
        items.push(SearchSuggestion {
            kind,
            key,
            name,
            actor_id,
            meta,
            drama,
        });
        if items.len() == 10 {
            break;
        }
    }
    Ok(SearchSuggestions { items })
}

#[cfg(test)]
mod tests;
