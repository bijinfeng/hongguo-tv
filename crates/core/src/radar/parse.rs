use super::*;
use serde_json::{Map, Value};
use std::collections::HashSet;

type Object = Map<String, Value>;
const MAX_ROWS: usize = 10_000;
fn invalid<T>() -> Result<T, RadarError> {
    Err(RadarError::Unavailable)
}
fn object(value: &Value) -> Result<&Object, RadarError> {
    value.as_object().ok_or(RadarError::Unavailable)
}
fn text(value: Option<&Value>, max: usize) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.chars().count() <= max && !s.chars().any(char::is_control))
        .map(str::to_owned)
}
fn identity(obj: &Object) -> Option<(String, String)> {
    let id = obj.get("id")?.as_str()?;
    if id.is_empty()
        || id.len() > 32
        || !id.bytes().all(|b| b.is_ascii_digit())
        || !id.bytes().any(|b| b != b'0')
    {
        return None;
    }
    Some((id.to_owned(), text(obj.get("title"), 400)?))
}
fn rows(obj: &Object) -> Result<&[Value], RadarError> {
    let values = obj
        .get("items")
        .and_then(Value::as_array)
        .ok_or(RadarError::Unavailable)?;
    if values.is_empty() || values.len() > MAX_ROWS {
        return invalid();
    }
    Ok(values)
}
fn tags(obj: &Object, key: &str) -> Result<Vec<String>, RadarError> {
    match obj.get(key) {
        None | Some(Value::Null) => Ok(vec![]),
        Some(Value::Array(values)) => Ok(values
            .iter()
            .filter_map(|v| text(Some(v), 80))
            .take(8)
            .collect()),
        _ => invalid(),
    }
}
fn int(obj: &Object, key: &str) -> Result<Option<i32>, RadarError> {
    match obj.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => Ok(Some(
            v.as_i64()
                .and_then(|n| i32::try_from(n).ok())
                .ok_or(RadarError::Unavailable)?,
        )),
    }
}
fn positive(obj: &Object, key: &str) -> Result<Option<i32>, RadarError> {
    Ok(int(obj, key)?.filter(|n| *n > 0))
}
fn gap(obj: &Object) -> Result<Option<i32>, RadarError> {
    let value = int(obj, "gap")?;
    if value.is_some_and(|n| n <= 0) {
        return invalid();
    }
    Ok(value)
}
fn date(obj: &Object, key: &str, required: bool) -> Result<Option<String>, RadarError> {
    match obj.get(key) {
        None | Some(Value::Null) if !required => Ok(None),
        Some(Value::String(s)) if s.trim().is_empty() && !required => Ok(None),
        Some(Value::String(s)) if time::valid_date(s) => Ok(Some(s.clone())),
        _ => invalid(),
    }
}
fn metric(obj: &Object, key: &str, cached: bool) -> Result<Option<String>, RadarError> {
    match obj.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if cached => {
            let n = s.parse::<i64>().map_err(|_| RadarError::Unavailable)?;
            if n.to_string() != *s {
                return invalid();
            }
            Ok(Some(s.clone()))
        }
        Some(v) if !cached => Ok(Some(v.as_i64().ok_or(RadarError::Unavailable)?.to_string())),
        _ => invalid(),
    }
}
fn bucket(value: &Value) -> Result<RadarRankBucket, RadarError> {
    let obj = object(value)?;
    let rank_date = date(obj, "rank_date", true)?.ok_or(RadarError::Unavailable)?;
    let prev_rank_date = date(obj, "prev_rank_date", false)?;
    if prev_rank_date.as_ref().is_some_and(|d| d >= &rank_date) {
        return invalid();
    }
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for value in rows(obj)? {
        let Some(obj) = value.as_object() else {
            continue;
        };
        let Some((id, title)) = identity(obj) else {
            continue;
        };
        if !seen.insert(id.clone()) {
            continue;
        }
        items.push(RadarRankItem {
            id,
            title,
            rank: positive(obj, "rank")?,
            status_tags: tags(obj, "status_tags")?,
            delta: int(obj, "delta")?,
            badge: text(obj.get("badge"), 80),
            streak: int(obj, "streak")?.filter(|n| *n >= 0),
            best_rank: positive(obj, "best_rank")?,
        });
    }
    if items.is_empty() {
        return invalid();
    }
    Ok(RadarRankBucket {
        rank_date,
        prev_rank_date,
        items,
    })
}
pub(super) fn ranks(body: &[u8]) -> Result<RadarRanks, RadarError> {
    let v: Value = serde_json::from_slice(body).map_err(|_| RadarError::Unavailable)?;
    ranks_value(&v)
}
pub(super) fn ranks_value(v: &Value) -> Result<RadarRanks, RadarError> {
    let obj = object(v)?;
    Ok(RadarRanks {
        hot: bucket(obj.get("hot").ok_or(RadarError::Unavailable)?)?,
        real: bucket(obj.get("real").ok_or(RadarError::Unavailable)?)?,
        ai: bucket(obj.get("ai").ok_or(RadarError::Unavailable)?)?,
        comic: bucket(obj.get("comic").ok_or(RadarError::Unavailable)?)?,
    })
}
pub(super) fn growth(body: &[u8]) -> Result<RadarGrowth, RadarError> {
    let v: Value = serde_json::from_slice(body).map_err(|_| RadarError::Unavailable)?;
    growth_value(&v, false)
}
pub(super) fn growth_value(v: &Value, cached: bool) -> Result<RadarGrowth, RadarError> {
    let obj = object(v)?;
    let date = date(obj, "date", true)?.ok_or(RadarError::Unavailable)?;
    let prev_date = self::date(obj, "prev_date", false)?;
    if prev_date.as_ref().is_some_and(|d| d >= &date) {
        return invalid();
    }
    let source_gap = gap(obj)?;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for v in rows(obj)? {
        let Some(obj) = v.as_object() else {
            continue;
        };
        let Some((id, title)) = identity(obj) else {
            continue;
        };
        let kind = match obj.get("type").and_then(Value::as_str) {
            Some("real") => RadarKind::Real,
            Some("ai") => RadarKind::Ai,
            Some("comic") => RadarKind::Comic,
            Some("unknown") => RadarKind::Unknown,
            _ => continue,
        };
        if !seen.insert(id.clone()) {
            continue;
        }
        let r_hot = match obj.get("r_hot") {
            None | Some(Value::Null) => None,
            Some(v) => Some(
                v.as_f64()
                    .filter(|n| n.is_finite())
                    .ok_or(RadarError::Unavailable)?,
            ),
        };
        items.push(RadarGrowthItem {
            id,
            title,
            tags: tags(obj, "tags")?,
            r#type: kind,
            hot: metric(obj, "hot", cached)?,
            fav: metric(obj, "fav", cached)?,
            gap: gap(obj)?,
            d_hot: metric(obj, "d_hot", cached)?,
            d_fav: metric(obj, "d_fav", cached)?,
            r_hot,
            d7_hot: metric(obj, "d7_hot", cached)?,
            d7_fav: metric(obj, "d7_fav", cached)?,
        });
    }
    if items.is_empty() {
        return invalid();
    }
    // Stable sorting preserves source order for ties and keeps missing deltas after measured values.
    items.sort_by(|a, b| {
        let value = |s: &Option<String>| s.as_ref().and_then(|s| s.parse::<i64>().ok());
        value(&b.d_hot).cmp(&value(&a.d_hot))
    });
    Ok(RadarGrowth {
        date,
        prev_date,
        gap: source_gap,
        items,
    })
}
