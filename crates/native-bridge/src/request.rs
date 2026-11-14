use axum::{extract::Query, http::Uri};
use hongguo_core::{
    CoreStatus,
    catalog::{CatalogClient, CatalogError, SearchQuery, SuggestionQuery},
    library::{HistoryChange, LibraryError, LibraryStore, SearchHistoryChange, SearchHistoryError},
    playback::{PlaybackError, PlaybackRequest, PlaybackService},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

#[derive(Clone)]
pub(crate) struct Services {
    pub catalog: CatalogClient,
    pub library: LibraryStore,
    pub playback: PlaybackService,
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

pub(crate) enum Request {
    Status,
    Search(SearchQuery),
    Discovery,
    Suggestions(SuggestionQuery),
    Detail(String, Option<String>),
    Play(PlaybackRequest),
    Library,
    Change(HistoryChange),
    SearchHistory,
    ChangeSearchHistory(SearchHistoryChange),
    Release(String),
    Unavailable,
}
fn query<T: DeserializeOwned>(uri: &Uri) -> Result<T, ()> {
    Query::<T>::try_from_uri(uri).map(|q| q.0).map_err(|_| ())
}
impl Request {
    pub fn parse(path: &str, body: Option<&str>) -> Result<Self, Reply> {
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
        match (uri.path(), body) {
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
                if p.owner_id.is_some_and(|s| !s.is_empty()) {
                    return Err(library_error(LibraryError::OwnerChanged));
                }
                Ok(Self::Library)
            }
            ("/api/v1/library", Some(body)) => Ok(Self::Change(
                serde_json::from_str(body)
                    .map_err(|_| library_error(LibraryError::InvalidInput))?,
            )),
            ("/api/v1/play/release", Some(body)) => {
                let p: Release = serde_json::from_str(body)
                    .map_err(|_| playback_error(PlaybackError::InvalidInput))?;
                Ok(Self::Release(
                    token(&p.path)
                        .ok_or_else(|| playback_error(PlaybackError::InvalidInput))?
                        .to_owned(),
                ))
            }
            ("/api/v1/account", None) => Ok(Self::Unavailable),
            (path, _)
                if path
                    .strip_prefix("/api/v1/account/qr/")
                    .is_some_and(|action| !action.is_empty() && !action.contains('/')) =>
            {
                Ok(Self::Unavailable)
            }
            (
                "/api/v1/status"
                | "/api/v1/search"
                | "/api/v1/search/discovery"
                | "/api/v1/search/suggestions"
                | "/api/v1/series/detail"
                | "/api/v1/play/info"
                | "/api/v1/play/release"
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
            Self::Status => {
                let mut status = CoreStatus::default();
                status.capabilities.history = true;
                status.capabilities.playback = true;
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
            Self::Search(q) => services
                .catalog
                .search(&q)
                .await
                .map(Reply::success)
                .map_err(catalog_error),
            Self::Detail(id, content) => services
                .catalog
                .detail(&id, content.as_deref())
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
            Self::Library => services
                .library
                .snapshot()
                .await
                .map(Reply::success)
                .map_err(library_error),
            Self::Change(change) => services
                .library
                .apply(change)
                .await
                .map(Reply::success)
                .map_err(library_error),
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
        LibraryError::OwnerChanged => 409,
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
