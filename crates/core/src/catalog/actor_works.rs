use super::{CatalogError, Drama, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use utoipa::ToSchema;

pub(super) const BODY_LIMIT: usize = 12 * 1024 * 1024;
const WORKS_LIMIT: usize = 2048;

/// Validated exact actor identity, independent of series and suggestion keys.
#[derive(Debug, Clone)]
pub struct ActorQuery(String);
impl ActorQuery {
    /// Trim and validate a nonzero ASCII decimal identity of at most 32 digits.
    pub fn new(actor_id: &str) -> Result<Self, CatalogError> {
        let actor_id = actor_id.trim();
        if !valid_id(actor_id) {
            return Err(CatalogError::InvalidInput);
        }
        Ok(Self(actor_id.into()))
    }
    /// Exact requested actor identity.
    pub fn id(&self) -> &str {
        &self.0
    }
}

/// Public actor identity and bounded display fields, without account state.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ActorSummary {
    /// Exact actor identity; never use this as a series ID.
    pub id: String,
    /// Display name, with a neutral fallback when unavailable.
    pub name: String,
    /// Approved public HTTPS image, when available.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub avatar: Option<String>,
    /// Plain bounded description, when available.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub description: Option<String>,
}

/// Complete supported works from the selected public character page; never silently truncated.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ActorWorksResult {
    /// Actor whose identity was checked against the requested ID.
    pub actor: ActorSummary,
    /// Unique ordered drama summaries without episode details.
    pub items: Vec<Drama>,
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
        Value::Number(value) => {
            let value = value.to_string();
            (value.len() <= 100).then_some(value)
        }
        _ => text(value, 100),
    }
}
fn first(row: &Value, keys: &[&str], limit: usize) -> Option<String> {
    keys.iter().find_map(|key| text(&row[*key], limit))
}
fn count(row: &Value) -> Option<u32> {
    [
        &row["episode_cnt"],
        &row["episode_total_cnt"],
        &row["series_episode_info"]["episode_cnt"],
        &row["series_episode_info"]["episode_total_cnt"],
    ]
    .into_iter()
    .filter_map(|value| scalar(value)?.parse::<u32>().ok())
    .find(|n| *n > 0)
    .or_else(|| {
        row.get("vid_list")
            .or_else(|| row.get("episodeVids"))?
            .as_array()
            .map(|vids| {
                vids.iter()
                    .filter_map(scalar)
                    .filter(|v| valid_id(v))
                    .count()
            })
            .and_then(|n| u32::try_from(n).ok())
            .filter(|n| *n > 0)
    })
}
pub(super) fn summary(row: &Value) -> Option<Drama> {
    let row = row.get("video_data").unwrap_or(row);
    let id = ["series_id_str", "series_id", "seriesId", "book_id", "id"]
        .iter()
        .find_map(|key| scalar(&row[*key]))?;
    if !valid_id(&id) {
        return None;
    }
    let content_type = match row.get("content_type").or_else(|| row.get("contentType")) {
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
    let tags: Vec<_> = row["tags"]
        .as_array()
        .into_iter()
        .flatten()
        .take(16)
        .filter_map(|value| text(value, 24))
        .take(3)
        .collect();
    Some(Drama {
        series_id: id,
        title: first(row, &["series_title", "series_name", "title"], 100)
            .unwrap_or_else(|| "未命名短剧".into()),
        cover_fallback: super::parse::cover_fallback(&cover),
        cover,
        intro: first(row, &["series_intro", "video_desc", "description"], 1024).unwrap_or_default(),
        episode_count: count(row),
        content_type,
        tags: (!tags.is_empty()).then_some(tags),
        episodes: None,
    })
}

/// Parse only the exact character page, without evaluating scripts or searching unrelated loaders.
pub fn parse_actor_works(
    body: &[u8],
    query: &ActorQuery,
) -> Result<ActorWorksResult, CatalogError> {
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let router = super::parse::router_json(body)?;
    let page = &router["loaderData"]["character_(id)/page"];
    let user = page["userInfo"]
        .as_object()
        .ok_or(CatalogError::InvalidData)?;
    let mut matched = false;
    for key in ["actor_id", "actor_id_str", "person_id"] {
        if let Some(value) = user.get(key) {
            if scalar(value).as_deref() != Some(query.id()) {
                return Err(CatalogError::InvalidData);
            }
            matched = true;
        }
    }
    if !matched {
        return Err(CatalogError::InvalidData);
    }
    let rows = page["videoList"]
        .as_array()
        .ok_or(CatalogError::InvalidData)?;
    if rows.len() > WORKS_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let avatar = super::parse::public_cover(&serde_json::json!({
        "series_cover": page["userInfo"]["user_avatar"], "cover": page["userInfo"]["avatar"]
    }));
    let mut seen = HashSet::new();
    Ok(ActorWorksResult {
        actor: ActorSummary {
            id: query.id().into(),
            name: first(&page["userInfo"], &["user_name", "name"], 100)
                .unwrap_or_else(|| "未知演员".into()),
            avatar: (!avatar.is_empty()).then_some(avatar),
            description: first(&page["userInfo"], &["description", "intro"], 1024),
        },
        items: rows
            .iter()
            .filter_map(summary)
            .filter(|drama| seen.insert(drama.series_id.clone()))
            .collect(),
    })
}

#[cfg(test)]
mod tests;
