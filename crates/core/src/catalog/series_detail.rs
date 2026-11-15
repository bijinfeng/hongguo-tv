use super::{CatalogError, Drama, actor_works, parse, valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use utoipa::ToSchema;

const BODY_LIMIT: usize = 12 * 1024 * 1024;
const ROW_LIMIT: usize = 2048;
const JSON_LIMIT: usize = 8 * 1024 * 1024;
const SERIES_IDS: &[&str] = &["series_id_str", "series_id", "seriesId", "book_id", "id"];

/// Displayable cast member; a missing or conflicting identity never becomes a works link.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SeriesActor {
    /// Exact actor identity, only when every supplied alias is valid and agrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(
        nullable = false,
        min_length = 1,
        max_length = 32,
        pattern = "^[0-9]*[1-9][0-9]*$"
    )]
    pub actor_id: Option<String>,
    /// Nonempty bounded public name.
    #[schema(min_length = 1, max_length = 100)]
    pub name: String,
    /// Approved public HTTPS avatar, or an empty string for the neutral fallback.
    #[schema(max_length = 2048)]
    pub avatar: String,
}

/// Full anonymous detail. Extensions are separate from summaries and persistent history.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SeriesDetail {
    /// Compatible flat drama fields and ordered episodes.
    #[serde(flatten)]
    pub drama: Drama,
    /// Cast in source order; an empty list means no supported public cast was supplied.
    #[schema(max_items = 2048)]
    pub actors: Vec<SeriesActor>,
    /// Unique source-ordered summaries, excluding the requested drama and episode payloads.
    #[schema(max_items = 2048)]
    pub related: Vec<Drama>,
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if value.len() <= 128 => Some(value.trim().to_owned()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn identity(row: &Value, aliases: &[&str]) -> Option<String> {
    let mut id = None;
    for key in aliases {
        let Some(value) = row.get(*key).filter(|v| !v.is_null()) else {
            continue;
        };
        let value = scalar(value)?;
        if !valid_id(&value) || id.as_ref().is_some_and(|prior| prior != &value) {
            return None;
        }
        id = Some(value);
    }
    id
}

fn text(row: &Value, aliases: &[&str], limit: usize) -> Option<String> {
    aliases.iter().find_map(|key| {
        let value = row[*key].as_str()?;
        if value.len() > limit * 4 || value.chars().any(char::is_control) {
            return None;
        }
        let value = value.trim();
        (!value.is_empty() && value.chars().count() <= limit).then(|| value.to_owned())
    })
}

fn cast(row: &Value) -> Result<Vec<SeriesActor>, CatalogError> {
    let rows = ["celebrities", "celebrity_list", "actors", "actor_list"]
        .iter()
        .find_map(|key| row[*key].as_array());
    let Some(rows) = rows else { return Ok(vec![]) };
    if rows.len() > ROW_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let mut seen = HashSet::new();
    let mut actors = Vec::new();
    for row in rows {
        let row = row
            .get("user_info")
            .filter(|v| v.is_object())
            .unwrap_or(row);
        let row = row
            .get("base_info")
            .filter(|v| v.is_object())
            .unwrap_or(row);
        let Some(name) = text(
            row,
            &[
                "nickname",
                "user_name",
                "celebrity_name",
                "actor_name",
                "name",
            ],
            100,
        ) else {
            continue;
        };
        let actor_id = identity(
            row,
            &["celebrity_id", "actor_id", "actor_id_str", "person_id"],
        );
        if !seen.insert((
            actor_id.is_some(),
            actor_id.clone().unwrap_or_else(|| name.clone()),
        )) {
            continue;
        }
        let avatar = ["user_avatar", "avatar", "avatar_url", "cover_url"]
            .iter()
            .filter_map(|key| row[*key].as_str())
            .filter(|value| value.len() <= 2048 && !value.chars().any(char::is_control))
            .map(|value| parse::public_cover(&serde_json::json!({"cover": value.trim()})))
            .find(|value| !value.is_empty())
            .unwrap_or_default();
        actors.push(SeriesActor {
            actor_id,
            name,
            avatar,
        });
    }
    Ok(actors)
}

fn array<'a>(
    value: &'a Value,
    key: &str,
    depth: usize,
) -> Result<Option<&'a Vec<Value>>, CatalogError> {
    if depth > 32 {
        return Err(CatalogError::TooLarge);
    }
    if let Some(rows) = value.get(key).and_then(Value::as_array) {
        return Ok(Some(rows));
    }
    match value {
        Value::Object(fields) => {
            for value in fields.values() {
                if let Some(rows) = array(value, key, depth + 1)? {
                    return Ok(Some(rows));
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                if let Some(rows) = array(value, key, depth + 1)? {
                    return Ok(Some(rows));
                }
            }
        }
        _ => {}
    }
    Ok(None)
}

fn related(page: &Value, current: &str) -> Result<Vec<Drama>, CatalogError> {
    let mut count = 0usize;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for key in [
        "related_list",
        "videoList",
        "related",
        "detail_page_more_related",
        "related_video",
        "rawRelatedVideo",
    ] {
        let Some(rows) = array(page, key, 0)? else {
            continue;
        };
        count += rows.len();
        if count > ROW_LIMIT {
            return Err(CatalogError::TooLarge);
        }
        for row in rows {
            let row = row.get("model").filter(|v| v.is_object()).unwrap_or(row);
            let model = row.get("video_data").unwrap_or(row);
            let Some(id) = identity(model, SERIES_IDS) else {
                continue;
            };
            if id == current || seen.contains(&id) {
                continue;
            }
            if let Some(mut drama) = actor_works::summary(row) {
                if drama.episode_count.is_some_and(|count| count > 10000) {
                    return Err(CatalogError::TooLarge);
                }
                if drama.cover.chars().any(char::is_control) {
                    drama.cover.clear();
                    drama.cover_fallback = None;
                }
                seen.insert(id);
                items.push(drama);
            }
        }
    }
    Ok(items)
}

fn tag_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut quote = None;
    for (index, byte) in bytes.iter().copied().enumerate().skip(start) {
        if quote == Some(byte) {
            quote = None;
        } else if quote.is_none() {
            if byte == b'\'' || byte == b'"' {
                quote = Some(byte);
            } else if byte == b'>' {
                return Some(index);
            }
        }
    }
    None
}

fn entities(value: &str) -> Option<String> {
    let mut decoded = String::new();
    let mut rest = value;
    while let Some(start) = rest.find('&') {
        decoded.push_str(&rest[..start]);
        let end = rest[start..].find(';')? + start;
        let entity = &rest[start + 1..end];
        let character = match entity {
            "quot" => '"',
            "apos" => '\'',
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            value if value.starts_with("#x") || value.starts_with("#X") => {
                char::from_u32(u32::from_str_radix(&value[2..], 16).ok()?)?
            }
            value if value.starts_with('#') => char::from_u32(value[1..].parse().ok()?)?,
            _ => return None,
        };
        decoded.push(character);
        rest = &rest[end + 1..];
    }
    decoded.push_str(rest);
    Some(decoded)
}

fn attributes(tag: &str) -> Result<Option<HashMap<String, String>>, CatalogError> {
    let bytes = tag.as_bytes();
    let mut cursor = 0;
    let mut attrs = HashMap::new();
    let mut count = 0;
    while cursor < bytes.len() {
        while cursor < bytes.len() && (bytes[cursor].is_ascii_whitespace() || bytes[cursor] == b'/')
        {
            cursor += 1;
        }
        if cursor == bytes.len() {
            break;
        }
        let start = cursor;
        while cursor < bytes.len()
            && (bytes[cursor].is_ascii_alphanumeric()
                || matches!(bytes[cursor], b'-' | b'_' | b':'))
        {
            cursor += 1;
        }
        if cursor == start {
            return Ok(None);
        }
        let name = tag[start..cursor].to_ascii_lowercase();
        count += 1;
        if count > 64 {
            return Err(CatalogError::TooLarge);
        }
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if bytes.get(cursor) != Some(&b'=') {
            continue;
        }
        cursor += 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        let Some(quote @ (b'\'' | b'"')) = bytes.get(cursor).copied() else {
            return Ok(None);
        };
        cursor += 1;
        let start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            cursor += 1;
        }
        if cursor == bytes.len() {
            return Ok(None);
        }
        let Some(value) = entities(&tag[start..cursor]) else {
            return Ok(None);
        };
        cursor += 1;
        if value.len() > JSON_LIMIT {
            return Err(CatalogError::TooLarge);
        }
        if attrs.insert(name, value).is_some() {
            return Ok(None);
        }
    }
    Ok(Some(attrs))
}

fn deferred(html: &str) -> Result<Option<Value>, CatalogError> {
    let bytes = html.as_bytes();
    let mut cursor = 0;
    let mut scripts = 0;
    while let Some(relative) = html[cursor..].find('<') {
        let start = cursor + relative;
        if html[start..].starts_with("<!--") {
            let Some(end) = html[start + 4..].find("-->") else {
                break;
            };
            cursor = start + 4 + end + 3;
            continue;
        }
        cursor = start + 1;
        if !bytes
            .get(start + 1..start + 7)
            .is_some_and(|name| name.eq_ignore_ascii_case(b"script"))
            || !bytes
                .get(start + 7)
                .is_some_and(|byte| byte.is_ascii_whitespace() || *byte == b'>')
        {
            continue;
        }
        scripts += 1;
        if scripts > ROW_LIMIT {
            return Err(CatalogError::TooLarge);
        }
        let Some(end) = tag_end(bytes, start + 7) else {
            break;
        };
        // Skip script contents entirely, including apparent tags inside JavaScript strings.
        let closing = bytes[end + 1..]
            .windows(8)
            .position(|part| part.eq_ignore_ascii_case(b"</script"));
        cursor = closing
            .map(|offset| end + 1 + offset + 8)
            .unwrap_or(bytes.len());
        let Some(attrs) = attributes(&html[start + 7..end])? else {
            continue;
        };
        if attrs.get("data-fn-name").map(String::as_str) != Some("mergeLoaderData") {
            continue;
        }
        let Some(encoded) = attrs.get("data-fn-args") else {
            continue;
        };
        let Ok(args) = serde_json::from_str::<Value>(encoded) else {
            continue;
        };
        if args[0] != "detail_page" {
            continue;
        }
        let Some(entries) = args[1].as_array() else {
            continue;
        };
        if entries.len() > ROW_LIMIT {
            return Err(CatalogError::TooLarge);
        }
        for entry in entries {
            if entry["key"] != "recommendations" || entry["routerDataFnName"] != "p" {
                continue;
            }
            let Some(encoded) = entry["routerDataFnArgs"][0].as_str() else {
                continue;
            };
            if encoded.len() > JSON_LIMIT {
                return Err(CatalogError::TooLarge);
            }
            if let Ok(value @ Value::Object(_)) = serde_json::from_str::<Value>(encoded) {
                return Ok(Some(value));
            }
        }
    }
    Ok(None)
}

/// Parse the requested detail loader and its inert deferred recommendations, never script code.
pub fn parse_series_detail(body: &[u8], series_id: &str) -> Result<SeriesDetail, CatalogError> {
    super::validate_detail(series_id, None)?;
    if body.len() > BODY_LIMIT {
        return Err(CatalogError::TooLarge);
    }
    let router = parse::router_json(body)?;
    let page = router
        .get("loaderData")
        .and_then(|loaders| loaders.get("detail_page"))
        .or_else(|| router.get("detail_page"))
        .unwrap_or(&router);
    let data = page
        .get("seriesDetail")
        .filter(|value| value.is_object())
        .ok_or(CatalogError::InvalidData)?;
    if identity(data, SERIES_IDS).as_deref() != Some(series_id) {
        return Err(CatalogError::InvalidData);
    }
    for value in [
        data.get("episode_cnt"),
        data.get("episode_total_cnt"),
        data.get("series_episode_info")
            .and_then(|info| info.get("episode_cnt")),
    ]
    .into_iter()
    .flatten()
    .filter(|value| !value.is_null())
    {
        let count = scalar(value)
            .and_then(|value| value.parse::<u64>().ok())
            .ok_or(CatalogError::InvalidData)?;
        if count > 10000 {
            return Err(CatalogError::TooLarge);
        }
    }
    for (keys, limit) in [
        (&["series_title", "series_name", "title"][..], 100),
        (&["series_intro", "video_desc", "description"][..], 1024),
    ] {
        for key in keys {
            if let Some(value) = data.get(*key).filter(|v| !v.is_null()) {
                let Some(value) = value.as_str() else {
                    return Err(CatalogError::InvalidData);
                };
                if value.len() > limit * 4
                    || value.chars().count() > limit
                    || value
                        .chars()
                        .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
                {
                    return Err(CatalogError::TooLarge);
                }
            }
        }
    }
    let mut seen = HashSet::new();
    for key in ["series_cover", "cover", "cover_url"] {
        if data
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|value| value.len() > 2048)
        {
            return Err(CatalogError::TooLarge);
        }
    }
    if let Some(tags) = data.get("tags").filter(|value| !value.is_null()) {
        let tags = tags.as_array().ok_or(CatalogError::InvalidData)?;
        if tags.len() > 16
            || tags.iter().any(|tag| {
                tag.as_str().is_none_or(|tag| {
                    tag.len() > 96 || tag.chars().count() > 24 || tag.chars().any(char::is_control)
                })
            })
        {
            return Err(CatalogError::TooLarge);
        }
    }
    if let Some(value) = data.get("vid_list").or_else(|| data.get("episodeVids")) {
        let rows = value.as_array().ok_or(CatalogError::InvalidData)?;
        if rows.len() > 10000 {
            return Err(CatalogError::TooLarge);
        }
        for row in rows {
            let id = scalar(row)
                .filter(|id| valid_id(id))
                .ok_or(CatalogError::InvalidData)?;
            if !seen.insert(id) {
                return Err(CatalogError::InvalidData);
            }
        }
    }
    let drama = parse::detail_data(data, series_id)?;
    if drama.episode_count.is_some_and(|count| count > 10000) {
        return Err(CatalogError::TooLarge);
    }
    let mut actors = cast(data)?;
    if actors.is_empty() {
        actors = cast(page)?;
    }
    let mut related = related(page, series_id)?;
    if related.is_empty()
        && let Some(value) =
            deferred(std::str::from_utf8(body).map_err(|_| CatalogError::InvalidData)?)?
    {
        related = self::related(&value, series_id)?;
    }
    Ok(SeriesDetail {
        drama,
        actors,
        related,
    })
}

#[cfg(test)]
mod tests;
