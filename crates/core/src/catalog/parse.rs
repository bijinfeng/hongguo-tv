use super::{CatalogError, Drama, Episode, SearchResult, valid_id};
use serde_json::Value;
use std::collections::HashSet;

/// Normalize one website search page, rejecting mismatched pagination and trailing data.
pub fn parse_search(body: &[u8], page: u32) -> Result<SearchResult, CatalogError> {
    let data: Value = serde_json::from_slice(body).map_err(|_| CatalogError::InvalidData)?;
    let rows = data["searchList"]
        .as_array()
        .ok_or(CatalogError::InvalidData)?;
    let more = data["hasMore"].as_bool().ok_or(CatalogError::InvalidData)?;
    let total = number(&data["totalPages"]).ok_or(CatalogError::InvalidData)?;
    if page == 0 || number(&data["pageNum"]) != Some(page) {
        return Err(CatalogError::InvalidData);
    }
    let mut seen = HashSet::new();
    let items = rows
        .iter()
        .filter_map(|row| normalize(&row["video_data"]))
        .filter(|drama| seen.insert(drama.series_id.clone()))
        .collect();
    Ok(SearchResult {
        items,
        has_more: more && !rows.is_empty() && (total == 0 || page < total),
        next_offset: page,
        source: Some("web".into()),
    })
}

/// Read JSON from router data without executing scripts, and check requested identity.
pub fn parse_detail(body: &[u8], series_id: &str) -> Result<Drama, CatalogError> {
    super::validate_detail(series_id, None)?;
    let html = std::str::from_utf8(body).map_err(|_| CatalogError::InvalidData)?;
    let (_, suffix) = html
        .split_once("_ROUTER_DATA")
        .ok_or(CatalogError::InvalidData)?;
    let json = suffix
        .trim_start()
        .strip_prefix('=')
        .ok_or(CatalogError::InvalidData)?
        .trim_start();
    // The stream consumes exactly one JSON value; surrounding scripts are never evaluated.
    let router = serde_json::Deserializer::from_str(json)
        .into_iter::<Value>()
        .next()
        .ok_or(CatalogError::InvalidData)?
        .map_err(|_| CatalogError::InvalidData)?;
    let data = find_object(&router, "seriesDetail").ok_or(CatalogError::InvalidData)?;
    let mut drama = normalize(data).ok_or(CatalogError::InvalidData)?;
    if drama.series_id != series_id {
        return Err(CatalogError::InvalidData);
    }
    let vids = strings(data.get("vid_list").or_else(|| data.get("episodeVids")));
    let count = u32::try_from(vids.len()).map_err(|_| CatalogError::InvalidData)?;
    if drama.episode_count.unwrap_or(0) == 0 {
        drama.episode_count = Some(count);
    }
    let accessible = number(&data["accessible_episode_cnt"])
        .filter(|n| *n > 0 && *n <= count)
        .unwrap_or(count);
    drama.episodes = Some(
        vids.into_iter()
            .zip(1..)
            .map(|(video_id, index)| Episode {
                index,
                video_id,
                title: Some(format!("第{index}集")),
                locked: index > accessible,
            })
            .collect(),
    );
    Ok(drama)
}

fn find_object<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Some(found) = value.get(key).filter(|v| v.is_object()) {
        return Some(found);
    }
    match value {
        Value::Object(fields) => fields.values().find_map(|v| find_object(v, key)),
        Value::Array(values) => values.iter().find_map(|v| find_object(v, key)),
        _ => None,
    }
}
fn text(value: &Value) -> Option<String> {
    let value = match value {
        Value::String(value) => value.trim().to_owned(),
        Value::Number(value) => value.to_string(),
        _ => return None,
    };
    (!value.is_empty()).then_some(value)
}
fn first(data: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| text(&data[*key]))
}
fn number(value: &Value) -> Option<u32> {
    text(value)?.parse().ok()
}
fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(text).collect())
        .unwrap_or_default()
}
fn normalize(data: &Value) -> Option<Drama> {
    let series_id = first(
        data,
        &["series_id_str", "series_id", "seriesId", "book_id", "id"],
    )?;
    if !valid_id(&series_id) {
        return None;
    }
    let content_type = first(data, &["content_type", "contentType"]);
    if content_type.as_deref() == Some("1003") {
        return None;
    }
    let vids = strings(data.get("vid_list").or_else(|| data.get("episodeVids")));
    let episode_count = ["episode_cnt", "episode_total_cnt"]
        .iter()
        .filter_map(|key| number(&data[*key]))
        .find(|n| *n > 0)
        .or_else(|| number(&data["series_episode_info"]["episode_cnt"]).filter(|n| *n > 0))
        .or_else(|| (!vids.is_empty()).then_some(vids.len() as u32));
    let cover = first(data, &["series_cover", "cover", "cover_url"]).unwrap_or_default();
    let tags = strings(data.get("tags"));
    Some(Drama {
        series_id,
        title: first(data, &["series_title", "series_name", "title"])
            .unwrap_or_else(|| "未命名短剧".into()),
        cover_fallback: cover_fallback(&cover),
        cover,
        intro: first(data, &["series_intro", "video_desc", "description"]).unwrap_or_default(),
        episode_count,
        content_type,
        tags: (!tags.is_empty()).then_some(tags),
        episodes: None,
    })
}
pub(super) fn cover_fallback(cover: &str) -> Option<String> {
    let url = reqwest::Url::parse(cover).ok()?;
    let host = url.host_str()?;
    let path = url.path();
    if !(host.ends_with(".fqnovelpic.com") || host.ends_with(".byteimg.com"))
        || !path.to_ascii_lowercase().ends_with(".heic")
        || !path.starts_with("/novel-pic/")
    {
        return None;
    }
    let (object, _) = path.split_once('~')?;
    Some(format!(
        "https://p3-novel.byteimg.com{object}~tplv-shrink:640:0.image"
    ))
}
