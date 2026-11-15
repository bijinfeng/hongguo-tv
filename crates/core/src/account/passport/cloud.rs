//! Fixed account-library wire protocol. Only a complete pull may reach reconciliation.
//!
//! These crate-private records deliberately retain incomplete remote progress and season
//! metadata. They are not the strict persisted library DTOs and never contain credentials.
use super::{
    PassportClient, PassportError,
    client::{API, MAX_BODY, UA, cookie_pair, http_error, json, number, text},
    header_value, now_millis, sign, valid_id,
};
use crate::catalog::Drama;
use reqwest::{Method, Url, header::HeaderValue};
use serde_json::{Number, Value, json as value};
use std::collections::{BTreeMap, BTreeSet, HashSet};

const MAX_HISTORY_PAGES: usize = 200;
const MAX_SAFE_MILLIS: u64 = 9_007_199_254_740_991;

/// Bounded protocol categories; upstream messages and bodies never leave this module.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CloudError {
    Passport(PassportError),
    Rejected,
    IncompleteHistory,
    IncompleteFollow,
    MetadataIdentity,
}
impl CloudError {
    pub(crate) fn code(self) -> &'static str {
        match self {
            Self::Passport(error) => error.code(),
            Self::Rejected => "ACCOUNT_CLOUD_REJECTED",
            Self::IncompleteHistory => "ACCOUNT_CLOUD_HISTORY_INCOMPLETE",
            Self::IncompleteFollow => "ACCOUNT_FOLLOW_INCOMPLETE",
            Self::MetadataIdentity => "ACCOUNT_CLOUD_METADATA_IDENTITY",
        }
    }
}
impl std::fmt::Display for CloudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code())
    }
}
impl std::error::Error for CloudError {}
impl From<PassportError> for CloudError {
    fn from(error: PassportError) -> Self {
        Self::Passport(error)
    }
}

/// A compact remote card plus metadata that the current public Drama does not yet own.
#[derive(Clone, Default, PartialEq)]
pub(crate) struct CloudCard {
    pub(crate) drama: Drama,
    pub(crate) season_index: u32,
    pub(crate) multi_season: bool,
    pub(crate) metadata_pending: bool,
}
/// An observed remote viewing event. Missing VID must never become a fabricated checkpoint.
#[derive(Clone, PartialEq)]
pub(crate) struct CloudHistory {
    pub(crate) card: CloudCard,
    pub(crate) episode: u32,
    pub(crate) video_id: Option<String>,
    pub(crate) position: f64,
    pub(crate) duration: f64,
    pub(crate) completed: bool,
    pub(crate) last_played_at: i64,
}
/// Membership alone carries no viewing progress.
#[derive(Clone, PartialEq)]
pub(crate) struct CloudFavorite {
    pub(crate) card: CloudCard,
    pub(crate) favorite_at: i64,
}
/// Only returned after all required membership and progress requests have been validated.
#[derive(Clone, Default, PartialEq)]
pub(crate) struct CloudLibrary {
    pub(crate) owner_id: String,
    pub(crate) history: Vec<CloudHistory>,
    pub(crate) favorites: Vec<CloudFavorite>,
}

#[derive(Clone, Copy)]
pub(super) enum Endpoint {
    History,
    Favorites,
    Progress,
    Metadata,
    UploadHistory,
    UploadProgress,
    SetFavorite,
    FollowList,
    SetFollow,
}
impl Endpoint {
    fn path(self) -> &'static str {
        match self {
            Self::History => "/reading/bookapi/read_history/list/v",
            Self::Favorites => "/reading/bookapi/bookshelf/video/list/v",
            Self::Progress => "/reading/bookapi/read_progress/get/v",
            Self::Metadata => "/novel/player/multi_video_detail/preload/v1",
            Self::UploadHistory => "/reading/bookapi/read_history/update/v",
            Self::UploadProgress => "/reading/bookapi/read_progress/upload/v",
            Self::SetFavorite => "/reading/bookapi/bookshelf/video/update/v",
            Self::FollowList => "/reading/user/subscribe/list/v1/",
            Self::SetFollow => "/reading/user/subscribe/delete/v",
        }
    }
    fn method(self) -> Method {
        match self {
            Self::History | Self::Favorites | Self::FollowList => Method::GET,
            _ => Method::POST,
        }
    }
}

impl PassportClient {
    /// This transport has no caller-selectable URL, signature mode or arbitrary headers.
    pub(super) async fn cloud_request(
        &mut self,
        endpoint: Endpoint,
        params: BTreeMap<String, String>,
        payload: Option<Value>,
    ) -> Result<Value, CloudError> {
        let uid = self
            .session
            .uid
            .clone()
            .ok_or(PassportError::MissingCredentials)?;
        self.session.validate_for_uid(&uid)?;
        let body = payload
            .as_ref()
            .map(serde_json::to_vec)
            .transpose()
            .map_err(|_| PassportError::InvalidInput)?
            .unwrap_or_default();
        if body.len() > MAX_BODY {
            return Err(PassportError::InvalidInput.into());
        }
        let mut query = self.query();
        query.extend(params);
        let (query, mut headers) =
            sign::sign(query, &body, now_millis()?, &self.session.device_id, false)?;
        for (name, value) in [
            ("user-agent", UA),
            ("accept", "application/json"),
            ("x-xs-from-web", "0"),
            ("sdk-version", "2"),
            ("passport-sdk-version", "6031190"),
            ("x-ss-dp", "8662"),
            ("x-tt-store-region-src", "did"),
        ] {
            headers.insert(name, HeaderValue::from_static(value));
        }
        headers.insert(
            "x-tt-store-region",
            HeaderValue::from_str(
                self.session
                    .cookies
                    .get("store-region")
                    .map_or("cn", String::as_str),
            )
            .map_err(|_| PassportError::InvalidResponse)?,
        );
        if payload.is_some() {
            headers.insert(
                "content-type",
                HeaderValue::from_static("application/json; charset=utf-8"),
            );
        }
        if !self.session.token.is_empty() {
            headers.insert(
                "x-tt-token",
                HeaderValue::from_str(&self.session.token)
                    .map_err(|_| PassportError::InvalidResponse)?,
            );
        }
        let cookies = self
            .session
            .cookies
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("; ");
        if !cookies.is_empty() {
            headers.insert(
                "cookie",
                HeaderValue::from_str(&cookies).map_err(|_| PassportError::InvalidResponse)?,
            );
        }
        let url = Url::parse(&format!("{API}{}?{query}", endpoint.path()))
            .map_err(|_| PassportError::Configuration)?;
        let response = self
            .send(url, endpoint.method(), headers, body, MAX_BODY)
            .await?;
        if response.status != 200 {
            return Err(http_error(&response).into());
        }
        let payload = json(&response.body)?;
        validate_envelope(&payload)?;
        if endpoint.method() == Method::GET && !payload.get("data").is_some_and(Value::is_object) {
            return Err(PassportError::InvalidResponse.into());
        }
        // Keep refreshes private to this client. The coordinator must fence their persistence.
        let mut next = self.session.clone();
        for cookie in response.headers.get_all("set-cookie") {
            if let Ok(cookie) = cookie.to_str()
                && let Some((name, value, deleted)) = cookie_pair(cookie)
            {
                if deleted {
                    next.cookies.remove(&name);
                } else {
                    next.cookies.insert(name, value);
                }
            }
        }
        if let Some(token) = response.headers.get("x-tt-token") {
            let token = token.to_str().map_err(|_| PassportError::InvalidResponse)?;
            if token.len() > 16384 || !header_value(token) {
                return Err(PassportError::InvalidResponse.into());
            }
            next.token = token.into();
        }
        next.validate_for_uid(&uid)?;
        self.session = next;
        Ok(payload)
    }

    /// Pull all membership before exposing a result; metadata outages retain retryable cards.
    /// The local snapshot must belong to the same validated session UID.
    pub(crate) async fn pull_library(
        &mut self,
        uid: &str,
        local: &CloudLibrary,
    ) -> Result<CloudLibrary, CloudError> {
        self.session.validate_for_uid(uid)?;
        if local.owner_id != uid {
            return Err(PassportError::InvalidIdentity.into());
        }
        let mut saved = BTreeMap::new();
        for card in local
            .history
            .iter()
            .map(|row| &row.card)
            .chain(local.favorites.iter().map(|row| &row.card))
        {
            if !valid_id(&card.drama.series_id) {
                return Err(PassportError::InvalidInput.into());
            }
            saved
                .entry(card.drama.series_id.clone())
                .or_insert_with(|| card.clone());
        }
        let mut history: BTreeMap<String, CloudHistory> = BTreeMap::new();
        let saved_progress: BTreeMap<_, _> = local
            .history
            .iter()
            .map(|entry| (entry.card.drama.series_id.as_str(), entry))
            .collect();
        let mut offset = 0u64;
        let mut seen = HashSet::new();
        for page in 0..MAX_HISTORY_PAGES {
            let params = BTreeMap::from([
                ("limit".into(), "0".into()),
                ("offset".into(), offset.to_string()),
                ("book_type".into(), "2".into()),
                ("full_field".into(), "false".into()),
                ("query_soft_deleted".into(), "false".into()),
                ("last_min_read_timestamp_ms".into(), "0".into()),
                ("is_first_load".into(), (offset == 0).to_string()),
            ]);
            let payload = self.cloud_request(Endpoint::History, params, None).await?;
            let data = object_data(&payload)?;
            let rows = data
                .get("data_list")
                .and_then(Value::as_array)
                .ok_or(PassportError::InvalidResponse)?;
            if !rows.is_empty() {
                let bytes = serde_json::to_vec(rows).map_err(|_| PassportError::InvalidResponse)?;
                let digest = ring::digest::digest(&ring::digest::SHA256, &bytes);
                if !seen.insert(digest.as_ref().to_vec()) {
                    return Err(CloudError::IncompleteHistory);
                }
            }
            for row in rows {
                if let Some(mut row) = history_row(row, &saved)? {
                    let id = row.card.drama.series_id.clone();
                    if row.duration == 0.0
                        && let Some(old) = saved_progress.get(id.as_str())
                        && old.episode == row.episode
                    {
                        row.duration = old.duration;
                    }
                    if history
                        .get(&id)
                        .is_none_or(|old| row.last_played_at > old.last_played_at)
                    {
                        history.insert(id, row);
                    }
                }
            }
            let more = wire_bool(data.get("has_more").ok_or(PassportError::InvalidResponse)?)?;
            if !more {
                break;
            }
            if rows.is_empty() || page + 1 == MAX_HISTORY_PAGES {
                return Err(CloudError::IncompleteHistory);
            }
            let next = optional_number(data.get("next_offset"))?;
            offset = if next > offset {
                next
            } else {
                offset
                    .checked_add(500)
                    .ok_or(CloudError::IncompleteHistory)?
            };
        }
        let payload = self
            .cloud_request(
                Endpoint::Favorites,
                BTreeMap::from([("target_user_id".into(), uid.into())]),
                None,
            )
            .await?;
        let data = object_data(&payload)?;
        let rows = data
            .get("video_shelf_info")
            .and_then(Value::as_array)
            .ok_or(PassportError::InvalidResponse)?;
        if data
            .get("has_more")
            .map(wire_bool)
            .transpose()?
            .unwrap_or(false)
        {
            return Err(PassportError::InvalidResponse.into());
        }
        let now = now_millis()?;
        let mut favorites: BTreeMap<String, CloudFavorite> = BTreeMap::new();
        for (index, row) in rows.iter().enumerate() {
            let row = row.as_object().ok_or(PassportError::InvalidResponse)?;
            let id = wire_id(row.get("series_id"))?;
            let card = history
                .get(&id)
                .map(|entry| &entry.card)
                .or_else(|| saved.get(&id))
                .cloned()
                .unwrap_or_else(|| CloudCard {
                    drama: Drama {
                        series_id: id.clone(),
                        ..Drama::default()
                    },
                    ..CloudCard::default()
                });
            let stamp =
                epoch(row.get("collect_time"))?.unwrap_or_else(|| now.saturating_sub(index as u64));
            let favorite = CloudFavorite {
                card,
                favorite_at: i64::try_from(stamp).map_err(|_| PassportError::InvalidResponse)?,
            };
            if favorites
                .get(&id)
                .is_none_or(|old| favorite.favorite_at > old.favorite_at)
            {
                favorites.insert(id, favorite);
            }
        }
        let mut cards: BTreeMap<String, CloudCard> = history
            .iter()
            .map(|(id, row)| (id.clone(), row.card.clone()))
            .collect();
        for (id, row) in &favorites {
            cards.entry(id.clone()).or_insert_with(|| row.card.clone());
        }
        let missing: Vec<_> = cards
            .iter()
            .filter(|(_, card)| card.drama.title.trim().is_empty() || card.metadata_pending)
            .map(|(id, _)| id.clone())
            .collect();
        for batch in missing.chunks(20) {
            let metadata = match self.library_metadata(batch).await {
                Ok(cards) => cards,
                Err(CloudError::MetadataIdentity) => return Err(CloudError::MetadataIdentity),
                // A cancelled round drops this future; only optional metadata failures are tolerated.
                Err(_) => BTreeMap::new(),
            };
            for id in batch {
                let old = cards.get_mut(id).ok_or(PassportError::InvalidResponse)?;
                if let Some(card) = metadata.get(id) {
                    let mut card = card.clone();
                    if card.season_index == 0 {
                        card.season_index = old.season_index;
                    }
                    card.multi_season |= old.multi_season;
                    *old = card;
                } else {
                    old.metadata_pending = true;
                    if old.drama.title.trim().is_empty() {
                        old.drama.title = "剧集信息暂未加载".into();
                    }
                }
            }
        }
        let ids: Vec<_> = cards.keys().cloned().collect();
        for batch in ids.chunks(200) {
            let numeric: Vec<_> = batch
                .iter()
                .map(|id| numeric_id(id))
                .collect::<Result<_, _>>()?;
            let payload = self
                .cloud_request(
                    Endpoint::Progress,
                    BTreeMap::new(),
                    Some(value!({"book_ids":{"2":numeric}})),
                )
                .await?;
            let rows = payload
                .get("video_data")
                .and_then(Value::as_array)
                .or_else(|| {
                    payload
                        .get("data")
                        .and_then(|data| data.get("video_data"))
                        .and_then(Value::as_array)
                })
                .ok_or(PassportError::InvalidResponse)?;
            let expected: BTreeSet<_> = batch.iter().map(String::as_str).collect();
            for row in rows {
                let row = row.as_object().ok_or(PassportError::InvalidResponse)?;
                let id = wire_id(row.get("series_id"))?;
                if !expected.contains(id.as_str()) {
                    return Err(PassportError::InvalidResponse.into());
                }
                let card = cards.get_mut(&id).ok_or(PassportError::InvalidResponse)?;
                let count = bounded_u32(row.get("episode_count"), 10000)?;
                if count > card.drama.episode_count.unwrap_or(0) {
                    card.drama.episode_count = Some(count);
                }
                let index = bounded_u32(row.get("vid_index"), 10000)?;
                let stamp = epoch(row.get("last_watch_time"))?.unwrap_or(0) as i64;
                if index == 0 || stamp <= 0 {
                    continue;
                }
                match history.get_mut(&id) {
                    Some(old) if stamp > old.last_played_at => {
                        if index != old.episode {
                            old.video_id = None;
                            old.position = 0.0;
                            old.duration = 0.0;
                            old.completed = false;
                        }
                        old.episode = index;
                        old.last_played_at = stamp;
                    }
                    None => {
                        history.insert(
                            id,
                            CloudHistory {
                                card: card.clone(),
                                episode: index,
                                video_id: None,
                                position: 0.0,
                                duration: 0.0,
                                completed: false,
                                last_played_at: stamp,
                            },
                        );
                    }
                    _ => {}
                }
            }
        }
        for (id, row) in &mut history {
            row.card = cards.get(id).ok_or(PassportError::InvalidResponse)?.clone();
        }
        for (id, row) in &mut favorites {
            row.card = cards.get(id).ok_or(PassportError::InvalidResponse)?.clone();
        }
        Ok(CloudLibrary {
            owner_id: uid.into(),
            history: history.into_values().collect(),
            favorites: favorites.into_values().collect(),
        })
    }

    async fn library_metadata(
        &mut self,
        ids: &[String],
    ) -> Result<BTreeMap<String, CloudCard>, CloudError> {
        if ids.is_empty() || ids.len() > 20 || ids.iter().any(|id| !valid_id(id)) {
            return Err(PassportError::InvalidInput.into());
        }
        let payload = self.cloud_request(Endpoint::Metadata, BTreeMap::new(), Some(value!({
            "dr_scene":"preload", "series_id":ids.join(","),
            "biz_param":{"detail_page_version":0,"disable_digg_stat":false,"disable_video_relate_book":false,
                "need_all_video_definition":false,"need_mp4_align":false,"source":7,"use_os_player":false,"use_server_dns":false}
        }))).await?;
        let data = object_data(&payload)?;
        let mut cards = BTreeMap::new();
        for id in ids {
            let Some(item) = data.get(id).filter(|item| !item.is_null()) else {
                continue;
            };
            let item = item.as_object().ok_or(PassportError::InvalidResponse)?;
            let Some(raw) = item.get("video_data").filter(|item| !item.is_null()) else {
                continue;
            };
            let raw = raw.as_object().ok_or(PassportError::InvalidResponse)?;
            if raw.is_empty() {
                continue;
            }
            let mut identities = ["series_id_str", "series_id", "book_id", "id"]
                .iter()
                .filter_map(|key| raw.get(*key));
            let first = identities.next().ok_or(CloudError::MetadataIdentity)?;
            if text(first).as_deref() != Some(id)
                || identities.any(|value| text(value).as_deref() != Some(id))
            {
                return Err(CloudError::MetadataIdentity);
            }
            let title = optional_text(raw.get("series_title"), 256)?;
            if title.is_empty() {
                continue;
            }
            let content_type = optional_text(raw.get("content_type"), 32)?;
            if content_type == "1003" {
                return Err(PassportError::InvalidResponse.into());
            }
            let cover = optional_text(
                raw.get("series_cover")
                    .or_else(|| raw.get("cover"))
                    .or_else(|| raw.get("cover_url")),
                4096,
            )?;
            let intro = match raw
                .get("series_intro")
                .or_else(|| raw.get("video_desc"))
                .or_else(|| raw.get("description"))
            {
                None | Some(Value::Null) => String::new(),
                Some(raw) => text(raw)
                    .ok_or(PassportError::InvalidResponse)?
                    .chars()
                    .take(1000)
                    .collect(),
            };
            let count = bounded_u32(raw.get("episode_cnt"), 10000)?;
            let count = if count == 0 {
                bounded_u32(raw.get("episode_total_cnt"), 10000)?
            } else {
                count
            };
            let tags = raw
                .get("tags")
                .and_then(Value::as_array)
                .map(|tags| {
                    tags.iter()
                        .take(8)
                        .filter_map(Value::as_str)
                        .map(|tag| tag.chars().take(80).collect())
                        .collect::<Vec<String>>()
                })
                .filter(|tags| !tags.is_empty());
            cards.insert(
                id.clone(),
                CloudCard {
                    drama: Drama {
                        series_id: id.clone(),
                        title,
                        cover,
                        cover_fallback: None,
                        intro,
                        episode_count: (count > 0).then_some(count),
                        series_status: crate::catalog::series_status(&Value::Object(raw.clone())),
                        content_type: (!content_type.is_empty()).then_some(content_type),
                        episodes: None,
                        tags,
                    },
                    season_index: bounded_u32(raw.get("season_index"), 10000)?,
                    multi_season: raw
                        .get("is_multi_season")
                        .map(wire_bool)
                        .transpose()?
                        .unwrap_or(false),
                    metadata_pending: false,
                },
            );
        }
        Ok(cards)
    }

    /// Success confirms both wire writes only. Partial success is not rollback or an ACK;
    /// the owning outbox must retry and acknowledge the exact sequence after this returns.
    pub(crate) async fn upload_progress(&mut self, entry: &CloudHistory) -> Result<(), CloudError> {
        let id = numeric_id(&entry.card.drama.series_id)?;
        let vid = entry
            .video_id
            .as_deref()
            .ok_or(PassportError::InvalidInput)?;
        let numeric_vid = numeric_id(vid)?;
        if !(1..=10000).contains(&entry.episode)
            || entry.last_played_at <= 0
            || entry.last_played_at as u64 > MAX_SAFE_MILLIS
            || entry.card.season_index > 10000
            || entry.card.drama.episode_count.unwrap_or(0) > 10000
        {
            return Err(PassportError::InvalidInput.into());
        }
        let position = millis(entry.position)?;
        let duration = millis(entry.duration)?;
        let history = value!({"update_datas":[{
            "book_id":id,"book_type":2,"vid":numeric_vid,"vid_index":entry.episode,"chapter_index":0,
            "current_play_position":position,"player_accumulate_total_time":position,
            "read_timestamp_ms":entry.last_played_at,"update_timestamp_ms":entry.last_played_at,
            "is_delete":false,"is_interactive_game":false,"is_listen_mode":false,
            "is_multi_season":u8::from(entry.card.multi_season),"season_index":entry.card.season_index,
            "duration":duration,"episode_cnt":entry.card.drama.episode_count.unwrap_or(0),
            "digged_count":0,"user_digg":false,"origin_novel_book_id":0,"recent_reads":0,
            "retain_video_play_time":0,"series_play_cnt":0,"tone_id":0,"use_soft_delete":false,
            "meet_guide_comment_tag":false,"user_playlet_comment_flag":false
        }]});
        self.cloud_request(Endpoint::UploadHistory, BTreeMap::new(), Some(history))
            .await?;
        let progress = value!({"books":[{
            "book_id":entry.card.drama.series_id,"book_type":2,"item_id":vid,"vid_index":entry.episode,
            "current_play_time":position,"player_cumulative_total_duration":position,
            "read_timestamp_ms":entry.last_played_at,"progress_type":0,"channel_id":0,"cur_channel_id":0,
            "check_timestamp":false,"is_listen_mode":false,"is_local_book":false,"listen_and_read":false,
            "page_index":0,"page_progress_rate":0,"paragraph_offset":0,"tone_id":0
        }]});
        self.cloud_request(Endpoint::UploadProgress, BTreeMap::new(), Some(progress))
            .await?;
        Ok(())
    }

    /// Explicit desired membership, never a toggle. A lost response remains an outbox concern.
    pub(crate) async fn set_favorite(
        &mut self,
        series_id: &str,
        desired: bool,
    ) -> Result<(), CloudError> {
        if !valid_id(series_id) {
            return Err(PassportError::InvalidInput.into());
        }
        let payload = value!({
            "is_cancelled":false,
            "shark_extra":{"enter_from":"0","previous_page":"0","page_list":"0","is_active_behavior":"1","inactive_type":"0"},
            "update_bookshelf_video_list":[{"book_id":series_id,"book_type":2,"modify_time":now_millis()?,"video_shelf_operate_type":if desired {0} else {1}}]
        });
        self.cloud_request(Endpoint::SetFavorite, BTreeMap::new(), Some(payload))
            .await?;
        Ok(())
    }
}

fn validate_envelope(payload: &Value) -> Result<(), CloudError> {
    let code = payload.get("code").ok_or(PassportError::InvalidResponse)?;
    if number(code).ok_or(PassportError::InvalidResponse)? != 0 {
        return Err(CloudError::Rejected);
    }
    for code in [
        payload.get("error_code"),
        payload.get("data").and_then(|data| data.get("error_code")),
    ]
    .into_iter()
    .flatten()
    {
        if number(code).ok_or(PassportError::InvalidResponse)? != 0 {
            return Err(CloudError::Rejected);
        }
    }
    Ok(())
}
fn object_data(payload: &Value) -> Result<&serde_json::Map<String, Value>, PassportError> {
    payload
        .get("data")
        .and_then(Value::as_object)
        .ok_or(PassportError::InvalidResponse)
}
fn optional_number(value: Option<&Value>) -> Result<u64, PassportError> {
    match value {
        None | Some(Value::Null) => Ok(0),
        Some(value) => number(value).ok_or(PassportError::InvalidResponse),
    }
}
fn bounded_u32(value: Option<&Value>, maximum: u32) -> Result<u32, PassportError> {
    let value = optional_number(value)?;
    if value > u64::from(maximum) {
        return Err(PassportError::InvalidResponse);
    }
    Ok(value as u32)
}
fn wire_bool(value: &Value) -> Result<bool, PassportError> {
    match value {
        Value::Bool(value) => Ok(*value),
        _ => match text(value).as_deref() {
            Some("0" | "false") => Ok(false),
            Some("1" | "true") => Ok(true),
            _ => Err(PassportError::InvalidResponse),
        },
    }
}
fn wire_id(value: Option<&Value>) -> Result<String, PassportError> {
    value
        .and_then(text)
        .filter(|id| valid_id(id))
        .ok_or(PassportError::InvalidResponse)
}
fn optional_text(value: Option<&Value>, limit: usize) -> Result<String, PassportError> {
    match value {
        None | Some(Value::Null) => Ok(String::new()),
        Some(value) => text(value)
            .filter(|text| text.chars().count() <= limit)
            .map(|s| s.trim().into())
            .ok_or(PassportError::InvalidResponse),
    }
}
fn epoch(value: Option<&Value>) -> Result<Option<u64>, PassportError> {
    let mut stamp = optional_number(value)?;
    if stamp == 0 {
        return Ok(None);
    }
    if stamp < 100_000_000_000 {
        stamp = stamp
            .checked_mul(1000)
            .ok_or(PassportError::InvalidResponse)?;
    }
    if stamp > MAX_SAFE_MILLIS {
        return Err(PassportError::InvalidResponse);
    }
    Ok(Some(stamp))
}
fn numeric_id(id: &str) -> Result<Number, PassportError> {
    if !valid_id(id) || (id.len() > 1 && id.starts_with('0')) {
        return Err(PassportError::InvalidInput);
    }
    id.parse().map_err(|_| PassportError::InvalidInput)
}
fn millis(seconds: f64) -> Result<i64, PassportError> {
    if !seconds.is_finite() || !(0.0..=86400.0).contains(&seconds) {
        return Err(PassportError::InvalidInput);
    }
    Ok((seconds * 1000.0) as i64)
}
fn wire_seconds(value: Option<&Value>) -> Result<f64, PassportError> {
    let millis = match value {
        None | Some(Value::Null) => 0.0,
        Some(Value::Number(number)) => number.as_f64().ok_or(PassportError::InvalidResponse)?,
        Some(Value::String(number)) => {
            number.parse().map_err(|_| PassportError::InvalidResponse)?
        }
        _ => return Err(PassportError::InvalidResponse),
    };
    if !millis.is_finite() || !(0.0..=86_400_000.0).contains(&millis) {
        return Err(PassportError::InvalidResponse);
    }
    Ok(millis / 1000.0)
}
fn history_row(
    row: &Value,
    saved: &BTreeMap<String, CloudCard>,
) -> Result<Option<CloudHistory>, CloudError> {
    let row = row.as_object().ok_or(PassportError::InvalidResponse)?;
    let id = wire_id(row.get("book_id_str"))?;
    if row
        .get("is_delete")
        .map(wire_bool)
        .transpose()?
        .unwrap_or(false)
    {
        return Ok(None);
    }
    let episode = bounded_u32(row.get("vid_index"), 10000)?;
    let stamp = optional_number(row.get("read_timestamp_ms"))?;
    if episode == 0 || stamp == 0 {
        return Ok(None);
    }
    if stamp > MAX_SAFE_MILLIS {
        return Err(PassportError::InvalidResponse.into());
    }
    let title = optional_text(row.get("book_name"), 256)?;
    let season = bounded_u32(row.get("season_index"), 10000)?;
    let multi = row
        .get("is_multi_season")
        .map(wire_bool)
        .transpose()?
        .unwrap_or(false);
    let mut card = CloudCard {
        drama: Drama {
            series_id: id.clone(),
            title,
            cover: optional_text(row.get("thumb_url"), 4096)?,
            episode_count: Some(bounded_u32(row.get("episode_cnt"), 10000)?),
            ..Drama::default()
        },
        season_index: season,
        multi_season: multi,
        metadata_pending: false,
    };
    if let Some(old) = saved.get(&id) {
        if card.drama.title.is_empty() {
            card.drama = old.drama.clone();
            card.metadata_pending = old.metadata_pending;
        }
        if card.season_index == 0 {
            card.season_index = old.season_index;
        }
        card.multi_season |= old.multi_season;
    }
    let video_id = match row.get("vid").filter(|value| !value.is_null()) {
        Some(value) => {
            let id = text(value).ok_or(PassportError::InvalidResponse)?;
            if id.is_empty() || id == "0" {
                None
            } else if valid_id(&id) {
                Some(id)
            } else {
                return Err(PassportError::InvalidResponse.into());
            }
        }
        None => None,
    };
    Ok(Some(CloudHistory {
        card,
        episode,
        video_id,
        position: wire_seconds(row.get("current_play_position"))?,
        duration: wire_seconds(row.get("duration"))?,
        completed: false,
        last_played_at: stamp as i64,
    }))
}

#[cfg(test)]
mod tests;
