use axum::{extract::Query, http::Uri};
use hongguo_core::{
    CoreStatus,
    account::{
        AccountCommandRequest, AccountError, AccountService, FollowMutationRequest, FollowQuery,
        NotificationMarkReadRequest, NotificationQuery, ReservationMutationRequest,
        ReservationQuery,
    },
    catalog::{
        ActorQuery, CatalogClient, CatalogError, CategoryParams, CategoryQuery, FeedParams,
        FeedQuery, SearchQuery, SuggestionQuery,
    },
    library::{
        HistoryChange, LibraryError, LibraryOperationIdentity, LibraryStore,
        LibraryWriteSessionRequest, SearchHistoryChange, SearchHistoryError,
    },
    playback::{PlaybackError, PlaybackRequest, PlaybackService},
    radar::{RadarError, RadarService},
    watch_statistics::{WatchStatisticsBatch, WatchStatisticsError},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

#[derive(Clone)]
pub(crate) struct Services {
    pub catalog: CatalogClient,
    pub library: LibraryStore,
    pub playback: PlaybackService,
    pub radar: Option<RadarService>,
    pub account: Option<AccountService>,
}

#[derive(Clone, Serialize)]
pub(crate) struct Reply {
    pub status: u16,
    pub body: Value,
    #[serde(skip)]
    pub media: Option<String>,
}
impl Reply {
    pub fn failure(status: u16, code: &str, message: &str) -> Self {
        Self {
            status,
            body: json!({"ok":false,"code":code,"error":message}),
            media: None,
        }
    }
    fn success(value: impl Serialize) -> Self {
        Self {
            status: 200,
            body: json!({"ok":true,"data":value}),
            media: None,
        }
    }
    pub fn closed() -> Self {
        Self::failure(410, "CORE_CLOSED", "核心已关闭，请重新打开应用")
    }
    pub fn cancelled() -> Self {
        Self::failure(499, "CORE_CANCELLED", "请求已取消")
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Search {
    q: String,
    #[serde(default)]
    offset: u32,
    source: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Suggestions {
    q: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Actor {
    actor_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Detail {
    series_id: String,
    content_type: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Play {
    series_id: String,
    vid: String,
    content_type: Option<String>,
    quality: Option<String>,
    codec_mode: Option<String>,
    mode: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Library {
    owner_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoParams {}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Release {
    path: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WatchStatisticsParams {
    owner_id: String,
    owner_epoch: String,
    day: String,
}

pub(crate) enum Request {
    Status,
    Radar,
    Search(SearchQuery),
    Discovery,
    Suggestions(SuggestionQuery),
    ActorWorks(ActorQuery),
    Category(CategoryQuery),
    Feed(FeedQuery),
    SeriesSeasons(hongguo_core::catalog::SeriesQuery),
    NextSeason(hongguo_core::catalog::SeriesQuery),
    NewSeries(hongguo_core::catalog::NewSeriesQuery),
    Calendar(hongguo_core::catalog::CalendarQuery),
    Rankings(hongguo_core::catalog::RankQuery),
    Detail(String, Option<String>),
    Play(PlaybackRequest),
    Library(Option<String>),
    Account,
    AccountState,
    AccountCommand(AccountCommandRequest),
    Follow(FollowQuery),
    SetFollow(FollowMutationRequest),
    Reservations(ReservationQuery),
    SetReservation(ReservationMutationRequest),
    Notifications(NotificationQuery),
    MarkNotificationsRead(NotificationMarkReadRequest),
    Change(HistoryChange),
    LibraryWriteSession(LibraryWriteSessionRequest),
    LibraryOperation(LibraryOperationIdentity, HistoryChange),
    SearchHistory,
    ChangeSearchHistory(SearchHistoryChange),
    Release(String),
    WatchStatistics(WatchStatisticsParams),
    AppendWatchStatistics(WatchStatisticsParams, WatchStatisticsBatch),
    ResetWatchStatistics(WatchStatisticsParams),
    Unavailable,
}
fn query<T: DeserializeOwned>(uri: &Uri) -> Result<T, ()> {
    Query::<T>::try_from_uri(uri).map(|q| q.0).map_err(|_| ())
}
fn statistics_params(uri: &Uri) -> Result<WatchStatisticsParams, Reply> {
    let value = query::<WatchStatisticsParams>(uri)
        .map_err(|_| statistics_error(WatchStatisticsError::InvalidInput))?;
    let owner_valid = (value.owner_id.is_empty()
        || (value.owner_id.len() <= 32
            && value.owner_id.bytes().all(|byte| byte.is_ascii_digit())
            && value.owner_id.bytes().any(|byte| byte != b'0')))
        && !value.owner_epoch.is_empty()
        && value.owner_epoch.len() <= 128
        && value
            .owner_epoch
            .bytes()
            .all(|byte| byte.is_ascii() && !byte.is_ascii_control());
    if owner_valid {
        Ok(value)
    } else {
        Err(statistics_error(WatchStatisticsError::InvalidInput))
    }
}
impl Request {
    #[cfg(test)]
    pub fn parse(path: &str, body: Option<&str>) -> Result<Self, Reply> {
        Self::parse_with_method(path, body, None)
    }
    pub fn parse_with_method(
        path: &str,
        body: Option<&str>,
        method: Option<&str>,
    ) -> Result<Self, Reply> {
        if path.len() > 8192 || body.is_some_and(|s| s.len() > 32 * 1024) {
            return Err(Reply::failure(
                413,
                "BODY_TOO_LARGE",
                "Request exceeds limit",
            ));
        }
        let uri: Uri = path
            .parse()
            .map_err(|_| Reply::failure(400, "CORE_REQUEST_INVALID", "请求地址无效"))?;
        if uri.scheme().is_some()
            || uri.authority().is_some()
            || !path.starts_with('/')
            || path.starts_with("//")
            || path.contains('#')
        {
            return Err(Reply::failure(400, "CORE_REQUEST_INVALID", "请求地址无效"));
        }
        if let Some(method) = method {
            if method.eq_ignore_ascii_case("DELETE") {
                if body.is_some() {
                    return Err(Reply::failure(
                        400,
                        "STATISTICS_REQUEST_INVALID",
                        "统计请求无效",
                    ));
                }
                if uri.path() != "/api/v1/watch-statistics" {
                    return Err(Reply::failure(
                        405,
                        "METHOD_NOT_ALLOWED",
                        "Method not allowed",
                    ));
                }
                let params = statistics_params(&uri)?;
                return Ok(Self::ResetWatchStatistics(params));
            }
            if !method.eq_ignore_ascii_case(if body.is_some() { "POST" } else { "GET" }) {
                return Err(Reply::failure(
                    405,
                    "METHOD_NOT_ALLOWED",
                    "Method not allowed",
                ));
            }
        }
        match (uri.path(), body) {
            ("/api/v1/watch-statistics", None) => {
                Ok(Self::WatchStatistics(statistics_params(&uri)?))
            }
            ("/api/v1/watch-statistics", Some(body)) => Ok(Self::AppendWatchStatistics(
                statistics_params(&uri)?,
                serde_json::from_str(body)
                    .map_err(|_| statistics_error(WatchStatisticsError::InvalidInput))?,
            )),
            ("/api/v1/radar", None) => {
                if uri.query().is_some_and(|q| !q.is_empty()) {
                    return Err(Reply::failure(400, "RADAR_INVALID_INPUT", "榜单请求无效"));
                }
                Ok(Self::Radar)
            }
            ("/api/v1/series/seasons" | "/api/v1/series/next-season", None) => {
                let params = query::<hongguo_core::catalog::SeriesParams>(&uri)
                    .map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                let query = hongguo_core::catalog::SeriesQuery::new(&params.series_id)
                    .map_err(catalog_error)?;
                Ok(if uri.path() == "/api/v1/series/seasons" {
                    Self::SeriesSeasons(query)
                } else {
                    Self::NextSeason(query)
                })
            }
            ("/api/v1/lists/new", None) => {
                let params = query::<hongguo_core::catalog::NewSeriesParams>(&uri)
                    .map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::NewSeries(
                    hongguo_core::catalog::NewSeriesQuery::new(params).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/lists/calendar", None) => {
                let params = query::<hongguo_core::catalog::CalendarParams>(&uri)
                    .map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Calendar(
                    hongguo_core::catalog::CalendarQuery::new(params).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/lists/rank", None) => {
                let params = query::<hongguo_core::catalog::RankParams>(&uri)
                    .map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Rankings(
                    hongguo_core::catalog::RankQuery::new(params).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/lists/recommend", None) => {
                let params: FeedParams =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Feed(FeedQuery::new(params).map_err(catalog_error)?))
            }
            ("/api/v1/category", None) => {
                let params: CategoryParams =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Category(
                    CategoryQuery::new(params).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/status", None) => Ok(Self::Status),
            ("/api/v1/search/discovery", None) => {
                if uri.query().is_some_and(|q| !q.is_empty()) {
                    return Err(catalog_error(CatalogError::InvalidInput));
                }
                Ok(Self::Discovery)
            }
            ("/api/v1/search", None) => {
                let p: Search =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Search(
                    SearchQuery::new(&p.q, p.offset, p.source.as_deref()).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/search/suggestions", None) => {
                let p: Suggestions =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::Suggestions(
                    SuggestionQuery::new(&p.q).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/actors/works", None) => {
                let p: Actor =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                Ok(Self::ActorWorks(
                    ActorQuery::new(&p.actor_id).map_err(catalog_error)?,
                ))
            }
            ("/api/v1/series/detail", None) => {
                let p: Detail =
                    query(&uri).map_err(|_| catalog_error(CatalogError::InvalidInput))?;
                hongguo_core::catalog::validate_detail(&p.series_id, p.content_type.as_deref())
                    .map_err(catalog_error)?;
                Ok(Self::Detail(p.series_id, p.content_type))
            }
            ("/api/v1/play/info", None) => {
                let p: Play =
                    query(&uri).map_err(|_| playback_error(PlaybackError::InvalidInput))?;
                if p.mode
                    .as_deref()
                    .is_some_and(|m| !m.is_empty() && m != "range")
                {
                    return Err(playback_error(PlaybackError::InvalidInput));
                }
                Ok(Self::Play(
                    PlaybackRequest::new(
                        &p.series_id,
                        &p.vid,
                        p.content_type.as_deref().unwrap_or(""),
                        p.quality.as_deref().unwrap_or(""),
                        p.codec_mode.as_deref().unwrap_or(""),
                    )
                    .map_err(playback_error)?,
                ))
            }
            ("/api/v1/search/history", body) => {
                let _: NoParams = query(&uri)
                    .map_err(|_| search_history_error(SearchHistoryError::invalid_input()))?;
                match body {
                    None => Ok(Self::SearchHistory),
                    Some(body) => Ok(Self::ChangeSearchHistory(
                        serde_json::from_str(body).map_err(|_| {
                            search_history_error(SearchHistoryError::invalid_input())
                        })?,
                    )),
                }
            }
            ("/api/v1/library", None) => {
                let p: Library =
                    query(&uri).map_err(|_| library_error(LibraryError::InvalidInput))?;
                Ok(Self::Library(p.owner_id))
            }
            ("/api/v1/library", Some(body)) => Ok(Self::Change(
                serde_json::from_str(body)
                    .map_err(|_| library_error(LibraryError::InvalidInput))?,
            )),
            ("/api/v1/library/session", Some(body)) => {
                let _: NoParams =
                    query(&uri).map_err(|_| library_error(LibraryError::InvalidInput))?;
                Ok(Self::LibraryWriteSession(
                    serde_json::from_str(body)
                        .map_err(|_| library_error(LibraryError::InvalidInput))?,
                ))
            }
            ("/api/v1/library/operation", Some(body)) => {
                let identity =
                    query(&uri).map_err(|_| library_error(LibraryError::InvalidInput))?;
                let change = serde_json::from_str(body)
                    .map_err(|_| library_error(LibraryError::InvalidInput))?;
                Ok(Self::LibraryOperation(identity, change))
            }
            ("/api/v1/play/release", Some(body)) => {
                let p: Release = serde_json::from_str(body)
                    .map_err(|_| playback_error(PlaybackError::InvalidInput))?;
                Ok(Self::Release(
                    token(&p.path)
                        .ok_or_else(|| playback_error(PlaybackError::InvalidInput))?
                        .to_owned(),
                ))
            }
            ("/api/v1/reservations", None) => Ok(Self::Reservations(
                query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?,
            )),
            ("/api/v1/reservations", Some(body)) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::SetReservation(
                    serde_json::from_str(body)
                        .map_err(|_| account_error(AccountError::InvalidInput))?,
                ))
            }
            ("/api/v1/notifications", None) => Ok(Self::Notifications(
                query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?,
            )),
            ("/api/v1/notifications", Some(body)) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::MarkNotificationsRead(
                    serde_json::from_str(body)
                        .map_err(|_| account_error(AccountError::InvalidInput))?,
                ))
            }
            ("/api/v1/follow", None) => Ok(Self::Follow(
                query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?,
            )),
            ("/api/v1/follow", Some(body)) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::SetFollow(
                    serde_json::from_str(body)
                        .map_err(|_| account_error(AccountError::InvalidInput))?,
                ))
            }
            ("/api/v1/account", None) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::Account)
            }
            ("/api/v1/account/state", None) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::AccountState)
            }
            ("/api/v1/account/command", Some(body)) => {
                let _: NoParams =
                    query(&uri).map_err(|_| account_error(AccountError::InvalidInput))?;
                Ok(Self::AccountCommand(
                    serde_json::from_str(body)
                        .map_err(|_| account_error(AccountError::InvalidInput))?,
                ))
            }
            (path, _)
                if path
                    .strip_prefix("/api/v1/account/qr/")
                    .is_some_and(|action| !action.is_empty() && !action.contains('/')) =>
            {
                Ok(Self::Unavailable)
            }
            (
                "/api/v1/status"
                | "/api/v1/account/state"
                | "/api/v1/account/command"
                | "/api/v1/radar"
                | "/api/v1/search"
                | "/api/v1/search/discovery"
                | "/api/v1/search/suggestions"
                | "/api/v1/actors/works"
                | "/api/v1/series/seasons"
                | "/api/v1/series/next-season"
                | "/api/v1/lists/rank"
                | "/api/v1/lists/recommend"
                | "/api/v1/lists/new"
                | "/api/v1/lists/calendar"
                | "/api/v1/category"
                | "/api/v1/series/detail"
                | "/api/v1/play/info"
                | "/api/v1/play/release"
                | "/api/v1/library/session"
                | "/api/v1/library/operation"
                | "/api/v1/account",
                _,
            ) => Err(Reply::failure(
                405,
                "METHOD_NOT_ALLOWED",
                "Method not allowed",
            )),
            _ => Err(Reply::failure(404, "NOT_FOUND", "Unknown route")),
        }
    }
    pub async fn execute(self, services: &Services) -> Reply {
        let result = match self {
            Self::Radar => match &services.radar {
                Some(radar) => radar
                    .snapshot()
                    .await
                    .map(Reply::success)
                    .map_err(radar_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::SeriesSeasons(query) => services
                .catalog
                .series_seasons(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::NextSeason(query) => services
                .catalog
                .next_season(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::NewSeries(query) => services
                .catalog
                .new_series(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Calendar(query) => services
                .catalog
                .calendar(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Rankings(query) => services
                .catalog
                .rankings(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Feed(query) => services
                .catalog
                .feed(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Category(query) => services
                .catalog
                .category(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Status => {
                let mut status = CoreStatus::default();
                status.capabilities.history = true;
                status.capabilities.playback = true;
                status.capabilities.account = services.account.is_some();
                Ok(Reply::success(status))
            }
            Self::Discovery => services
                .catalog
                .search_discovery()
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Suggestions(query) => services
                .catalog
                .suggestions(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::ActorWorks(query) => services
                .catalog
                .actor_works(&query)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Search(q) => services
                .catalog
                .search(&q)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Detail(id, content) => services
                .catalog
                .series_detail(&id, content.as_deref())
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::SearchHistory => services
                .library
                .search_history()
                .await
                .map(Reply::success)
                .map_err(search_history_error),
            Self::ChangeSearchHistory(change) => services
                .library
                .change_search_history(change)
                .await
                .map(Reply::success)
                .map_err(search_history_error),
            Self::Library(owner) => match &services.account {
                Some(account) => account.library_snapshot(owner.as_deref()).await,
                None if owner.as_ref().is_some_and(|id| !id.is_empty()) => {
                    Err(LibraryError::OwnerChanged)
                }
                None => services.library.snapshot().await,
            }
            .map(Reply::success)
            .map_err(library_error),
            Self::Change(change) => if !change.is_history() {
                Err(LibraryError::InvalidInput)
            } else {
                match &services.account {
                    Some(account) => account.apply_history(change).await,
                    None => services.library.apply(change).await,
                }
            }
            .map(Reply::success)
            .map_err(library_error),
            Self::LibraryWriteSession(request) => match &services.account {
                Some(account) => account.write_session(request).await,
                None => services.library.write_session(request).await,
            }
            .map(Reply::success)
            .map_err(library_error),
            Self::LibraryOperation(identity, change) => match &services.account {
                Some(account) => account.apply_operation(identity, change).await,
                None => services.library.apply_operation(identity, change).await,
            }
            .map(Reply::success)
            .map_err(library_error),
            Self::Account => match &services.account {
                Some(account) => Ok(Reply::success(account.snapshot().await)),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::Reservations(query) => match &services.account {
                Some(account) => account
                    .reservation_snapshot(query)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::SetReservation(request) => match &services.account {
                Some(account) => account
                    .set_reservation(request)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::Notifications(query) => match &services.account {
                Some(account) => account
                    .notification_snapshot(query)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::MarkNotificationsRead(request) => match &services.account {
                Some(account) => account
                    .mark_notifications_read(request)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::Follow(query) => match &services.account {
                Some(account) => account
                    .follow_snapshot(query)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::SetFollow(request) => match &services.account {
                Some(account) => account
                    .set_follow(request)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::AccountState => match &services.account {
                Some(account) => account
                    .state()
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::AccountCommand(request) => match &services.account {
                Some(account) => account
                    .command(request)
                    .await
                    .map(Reply::success)
                    .map_err(account_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::Play(request) => services
                .playback
                .resolve(&request)
                .await
                .map(|info| {
                    let media = Some(info.path.clone());
                    Reply {
                        media,
                        ..Reply::success(info)
                    }
                })
                .map_err(playback_error),
            Self::Release(token) => services
                .playback
                .release(&token)
                .map(|()| Reply::success(json!({"released":true})))
                .map_err(playback_error),
            Self::WatchStatistics(params) => match &services.account {
                Some(account) => account
                    .watch_statistics_snapshot(&params.owner_id, &params.owner_epoch, &params.day)
                    .await
                    .map(Reply::success)
                    .map_err(statistics_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::AppendWatchStatistics(params, batch) => match &services.account {
                Some(account) => {
                    if batch.owner_id != params.owner_id || batch.owner_epoch != params.owner_epoch
                    {
                        Err(statistics_error(WatchStatisticsError::InvalidInput))
                    } else {
                        account
                            .append_watch_statistics(
                                &params.owner_id,
                                &params.owner_epoch,
                                &params.day,
                                batch,
                            )
                            .await
                            .map(Reply::success)
                            .map_err(statistics_error)
                    }
                }
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::ResetWatchStatistics(params) => match &services.account {
                Some(account) => account
                    .reset_watch_statistics(&params.owner_id, &params.owner_epoch, &params.day)
                    .await
                    .map(Reply::success)
                    .map_err(statistics_error),
                None => Err(Reply::failure(
                    501,
                    "CORE_NOT_IMPLEMENTED",
                    "此功能尚未开放",
                )),
            },
            Self::Unavailable => Err(Reply::failure(
                501,
                "CORE_NOT_IMPLEMENTED",
                "此功能尚未开放",
            )),
        };
        result.unwrap_or_else(|reply| reply)
    }
}
pub(crate) fn token(path: &str) -> Option<&str> {
    path.strip_prefix("/minireel-proxy/media/").filter(|t| {
        t.len() == 64
            && t.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
pub(crate) fn catalog_error(error: CatalogError) -> Reply {
    let status = match error {
        CatalogError::InvalidInput
        | CatalogError::UnsupportedSource
        | CatalogError::UnsupportedContent => 400,
        CatalogError::Timeout => 504,
        _ => 502,
    };
    Reply::failure(status, error.code(), &error.to_string())
}
pub(crate) fn library_error(error: LibraryError) -> Reply {
    let status = match error {
        LibraryError::InvalidInput => 400,
        LibraryError::NotImplemented => 501,
        LibraryError::OwnerChanged
        | LibraryError::SyncQueueFull
        | LibraryError::SessionExpired
        | LibraryError::OperationConflict
        | LibraryError::OperationSequence
        | LibraryError::OperationPending => 409,
        _ => 500,
    };
    Reply::failure(status, error.code(), &error.to_string())
}
pub(crate) fn playback_error(error: PlaybackError) -> Reply {
    let status = match error {
        PlaybackError::InvalidInput | PlaybackError::UnsupportedContent => 400,
        PlaybackError::AccessDenied => 403,
        PlaybackError::IdentityMismatch => 409,
        PlaybackError::Expired => 410,
        PlaybackError::QualityUnavailable
        | PlaybackError::UnsupportedMedia
        | PlaybackError::MediaTooLarge => 422,
        PlaybackError::Capacity => 503,
        PlaybackError::Timeout => 504,
        PlaybackError::Configuration | PlaybackError::Storage => 500,
        _ => 502,
    };
    Reply::failure(status, error.code(), &error.to_string())
}

pub(crate) fn search_history_error(error: SearchHistoryError) -> Reply {
    Reply::failure(
        if error.is_invalid_input() { 400 } else { 500 },
        error.code(),
        &error.to_string(),
    )
}

pub(crate) fn radar_error(error: RadarError) -> Reply {
    Reply::failure(error.status(), error.code(), error.message())
}

pub(crate) fn account_error(error: AccountError) -> Reply {
    let status = match error {
        AccountError::InvalidInput => 400,
        AccountError::NotImplemented => 501,
        AccountError::AttemptExpired
        | AccountError::Busy
        | AccountError::OwnerChanged
        | AccountError::LibrarySyncQueueFull
        | AccountError::FollowBusy
        | AccountError::ReservationBusy => 409,
        AccountError::FollowLoginRequired
        | AccountError::ReservationLoginRequired
        | AccountError::NotificationLoginRequired => 401,
        AccountError::Limited => 429,
        AccountError::Storage | AccountError::InvalidSession | AccountError::Library => 500,
        AccountError::Upstream
        | AccountError::IdentityMismatch
        | AccountError::FollowIncomplete
        | AccountError::FollowRejected
        | AccountError::FollowUnavailable
        | AccountError::FollowUncertain
        | AccountError::ReservationIncomplete
        | AccountError::ReservationRejected
        | AccountError::ReservationUnavailable
        | AccountError::ReservationUncertain
        | AccountError::NotificationIncomplete
        | AccountError::NotificationUnavailable => 502,
        AccountError::NotificationInvalidRead => 400,
    };
    Reply::failure(status, error.code(), &error.to_string())
}

pub(crate) fn statistics_error(error: WatchStatisticsError) -> Reply {
    let (status, code) = match error {
        WatchStatisticsError::InvalidInput => (400, "STATISTICS_REQUEST_INVALID"),
        WatchStatisticsError::OwnerChanged => (409, "ACCOUNT_OWNER_CHANGED"),
        WatchStatisticsError::RevisionChanged => (409, "STATISTICS_RESET"),
        WatchStatisticsError::BatchConflict => (409, "STATISTICS_BATCH_CONFLICT"),
        WatchStatisticsError::InvalidDatabase | WatchStatisticsError::Storage => {
            (503, "STATISTICS_STORAGE_UNAVAILABLE")
        }
        WatchStatisticsError::DailyLimit => (400, "STATISTICS_REQUEST_INVALID"),
    };
    Reply::failure(status, code, &error.to_string())
}

#[cfg(test)]
mod tests {
    use super::Request;

    #[test]
    fn notification_routes_share_strict_query_and_body_parsing() {
        assert!(matches!(
            Request::parse("/api/v1/notifications?owner_id=1&owner_epoch=epoch", None),
            Ok(Request::Notifications(_))
        ));
        assert!(matches!(
            Request::parse(
                "/api/v1/notifications",
                Some(r#"{"owner_id":"1","owner_epoch":"epoch","all":true}"#)
            ),
            Ok(Request::MarkNotificationsRead(_))
        ));
        assert!(Request::parse("/api/v1/notifications?unexpected=1", None).is_err());
        assert!(
            Request::parse(
                "/api/v1/notifications?owner_id=1&owner_epoch=epoch",
                Some("{}")
            )
            .is_err()
        );
    }
}
