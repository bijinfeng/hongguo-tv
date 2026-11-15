//! Third-party radar snapshots, with independent validated private persistence.
mod cache;
mod parse;
#[cfg(test)]
mod tests;
mod time;

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::{net::IpAddr, path::Path, sync::Arc, time::Duration};
use tokio::{
    sync::Mutex,
    time::{Instant, timeout, timeout_at},
};
use utoipa::ToSchema;

const PRIMARY: &str = "https://ghfast.top/https://raw.githubusercontent.com/2252399314-cyber/hongguo-radar/main/data/derived/";
const RAW: &str =
    "https://raw.githubusercontent.com/2252399314-cyber/hongguo-radar/main/data/derived/";
const BODY_LIMIT: usize = 5 << 20;

/// Safe transport-facing failure categories; upstream response bodies are never exposed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RadarError {
    /// Client initialization or fixed origin validation failed.
    Configuration,
    /// Private cache storage is inaccessible.
    Storage,
    /// Existing cache is malformed or has an unsupported version.
    InvalidCache,
    /// Neither a fresh nor a durable source branch is available.
    Unavailable,
    /// The network deadline expired while waiting for the service lock.
    Timeout,
}
impl RadarError {
    /// HTTP status used by every transport.
    pub fn status(self) -> u16 {
        match self {
            Self::Unavailable => 502,
            Self::Timeout => 504,
            _ => 500,
        }
    }
    /// Stable machine-readable transport code.
    pub fn code(self) -> &'static str {
        match self {
            Self::Configuration => "RADAR_CONFIGURATION",
            Self::Storage => "RADAR_STORAGE",
            Self::InvalidCache => "RADAR_CACHE_INVALID",
            Self::Unavailable => "RADAR_UNAVAILABLE",
            Self::Timeout => "RADAR_TIMEOUT",
        }
    }
    /// Safe localized message, without upstream data.
    pub fn message(self) -> &'static str {
        match self {
            Self::Configuration => "榜单雷达初始化失败",
            Self::Storage => "榜单雷达缓存无法访问",
            Self::InvalidCache => "榜单雷达缓存无效，已保留原文件",
            Self::Unavailable => "榜单雷达暂时无法获取，请稍后重试",
            Self::Timeout => "榜单雷达读取超时，请重试",
        }
    }
}
impl std::fmt::Display for RadarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}
impl std::error::Error for RadarError {}

/// Independent ranking and growth branches, including source freshness and commit outcome.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Validated ranking document, absent until one source succeeds.
    pub ranks: Option<RadarRanks>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Validated growth document, absent until one source succeeds.
    pub growth: Option<RadarGrowth>,
    /// The ranking refresh failed or exceeded the network deadline.
    pub ranks_stale: bool,
    /// The growth refresh failed or exceeded the network deadline.
    pub growth_stale: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// UTC RFC3339 time of the last successful ranking fetch.
    pub ranks_fetched_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// UTC RFC3339 time of the last successful growth fetch.
    pub growth_fetched_at: Option<String>,
    /// Fresh response data could not be committed; a later offline request uses the last durable snapshot.
    pub cache_write_failed: bool,
}
/// All four required ranking buckets from one source document.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarRanks {
    /// Overall heat ranking bucket.
    pub hot: RadarRankBucket,
    /// Live action ranking bucket.
    pub real: RadarRankBucket,
    /// AI ranking bucket.
    pub ai: RadarRankBucket,
    /// Comic ranking bucket.
    pub comic: RadarRankBucket,
}
/// One ranking category at a source sampling date.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarRankBucket {
    /// Source ranking date in YYYY-MM-DD.
    pub rank_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Previous source ranking date, when provided.
    pub prev_rank_date: Option<String>,
    /// Validated rows in source order, or stable descending d_hot order for growth.
    pub items: Vec<RadarRankItem>,
}
/// A validated identity and optional ranking measurements.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarRankItem {
    /// Exact nonzero decimal catalog identity, at most 32 digits.
    pub id: String,
    /// Trimmed display title, at most 400 Unicode characters.
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Positive source rank; missing or nonpositive ranks are absent.
    pub rank: Option<i32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    /// Up to eight source status tags, each at most 80 characters.
    pub status_tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Signed source rank movement, when provided.
    pub delta: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Optional source badge, at most 80 characters.
    pub badge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Nonnegative source streak, when provided.
    pub streak: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Positive best source rank, when provided.
    pub best_rank: Option<i32>,
}
/// Growth measurements at their actual source sampling interval.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarGrowth {
    /// Source sampling date in YYYY-MM-DD.
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Previous source sampling date, when provided.
    pub prev_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Positive source sampling interval; no daily normalization is synthesized.
    pub gap: Option<i32>,
    /// Validated rows in source order, or stable descending d_hot order for growth.
    pub items: Vec<RadarGrowthItem>,
}
/// The source content classification whitelist.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RadarKind {
    /// Live action.
    Real,
    /// AI content.
    Ai,
    /// Comic content.
    Comic,
    /// Explicit source unknown classification.
    Unknown,
}
/// Growth measurements; signed 64-bit counters use canonical decimal strings for JavaScript.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RadarGrowthItem {
    /// Exact nonzero decimal catalog identity, at most 32 digits.
    pub id: String,
    /// Trimmed display title, at most 400 Unicode characters.
    pub title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    /// Up to eight source tags, each at most 80 characters.
    pub tags: Vec<String>,
    /// Validated source content classification.
    pub r#type: RadarKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source heat counter as a canonical signed decimal string.
    pub hot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source favorite counter as a canonical signed decimal string.
    pub fav: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Positive source sampling interval; no daily normalization is synthesized.
    pub gap: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source heat delta as a canonical signed decimal string.
    pub d_hot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source favorite delta as a canonical signed decimal string.
    pub d_fav: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Finite source heat change ratio, when provided.
    pub r_hot: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source seven-day heat delta as a canonical signed decimal string.
    pub d7_hot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Source seven-day favorite delta as a canonical signed decimal string.
    pub d7_fav: Option<String>,
}

/// Shared by web and native hosts. Calls serialize refreshes across clones.
#[derive(Clone)]
pub struct RadarService {
    http: Client,
    origins: [Url; 2],
    state: Arc<Mutex<cache::Cache>>,
    path: Arc<std::path::PathBuf>,
    attempt_timeout: Duration,
    total_timeout: Duration,
}
impl RadarService {
    /// Open only radar-v1.json. Malformed or unsupported caches remain intact and fail startup.
    pub fn open(data_dir: &Path) -> Result<Self, RadarError> {
        let origins = [
            Url::parse(PRIMARY).map_err(|_| RadarError::Configuration)?,
            Url::parse(RAW).map_err(|_| RadarError::Configuration)?,
        ];
        Self::build(data_dir, origins)
    }
    /// Explicit fixture constructor; only bare HTTP loopback IP origins are accepted.
    pub fn for_loopback_tests(
        data_dir: &Path,
        primary_origin: &str,
        raw_origin: &str,
    ) -> Result<Self, RadarError> {
        let validate = |origin: &str| {
            let u = Url::parse(origin).map_err(|_| RadarError::Configuration)?;
            let loopback = u
                .host_str()
                .and_then(|h| h.trim_matches(['[', ']']).parse::<IpAddr>().ok())
                .is_some_and(|i| i.is_loopback());
            if u.scheme() != "http"
                || !loopback
                || u.port_or_known_default() == Some(0)
                || !u.username().is_empty()
                || u.password().is_some()
                || u.path() != "/"
                || u.query().is_some()
                || u.fragment().is_some()
            {
                return Err(RadarError::Configuration);
            }
            Ok(u)
        };
        Self::build(data_dir, [validate(primary_origin)?, validate(raw_origin)?])
    }
    fn build(data_dir: &Path, origins: [Url; 2]) -> Result<Self, RadarError> {
        let (path, state) = cache::open(data_dir)?;
        let http = crate::http::client_builder()
            .http1_only()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .retry(reqwest::retry::never())
            .user_agent("HongguoTV-Radar/1.0")
            .build()
            .map_err(|_| RadarError::Configuration)?;
        Ok(Self {
            http,
            origins,
            state: Arc::new(Mutex::new(state)),
            path: Arc::new(path),
            attempt_timeout: Duration::from_secs(6),
            total_timeout: Duration::from_secs(13),
        })
    }
    /// Refresh both branches independently, falling back to each last durable branch.
    /// The network deadline includes lock waiting. Dropping before commit cancels network work.
    /// Once filesystem commit starts it may finish after cancellation or the network deadline;
    /// the owned lock remains held until that commit finishes, preventing out-of-order writes.
    pub async fn snapshot(&self) -> Result<RadarSnapshot, RadarError> {
        let deadline = Instant::now() + self.total_timeout;
        let guard = timeout_at(deadline, self.state.clone().lock_owned())
            .await
            .map_err(|_| RadarError::Timeout)?;
        let (ranks, growth) = tokio::join!(
            timeout_at(deadline, self.fetch("ranks_latest.json", parse::ranks)),
            timeout_at(deadline, self.fetch("growth_latest.json", parse::growth))
        );
        let mut next = guard.clone();
        let ranks_fresh = if let Ok(Ok((value, at))) = ranks {
            next.ranks = Some(value);
            next.ranks_fetched_at = Some(at);
            true
        } else {
            false
        };
        let growth_fresh = if let Ok(Ok((value, at))) = growth {
            next.growth = Some(value);
            next.growth_fetched_at = Some(at);
            true
        } else {
            false
        };
        if next.ranks.is_none() && next.growth.is_none() {
            return Err(RadarError::Unavailable);
        }

        if !ranks_fresh && !growth_fresh {
            return Ok(next.snapshot(true, true, false));
        }
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || {
            let mut guard = guard;
            let failed = cache::write(&path, &next).is_err();
            let response = next.snapshot(!ranks_fresh, !growth_fresh, failed);
            if !failed {
                *guard = next;
            }
            response
        })
        .await
        .map_err(|_| RadarError::Storage)
    }
    async fn fetch<T>(
        &self,
        filename: &str,
        parse: fn(&[u8]) -> Result<T, RadarError>,
    ) -> Result<(T, String), RadarError> {
        for origin in &self.origins {
            let attempt = async {
                let url = origin
                    .join(filename)
                    .map_err(|_| RadarError::Configuration)?;
                let mut response = self
                    .http
                    .get(url)
                    .header(reqwest::header::ACCEPT, "application/json")
                    .send()
                    .await
                    .map_err(|_| RadarError::Unavailable)?;
                if response.status() != reqwest::StatusCode::OK
                    || response
                        .content_length()
                        .is_some_and(|n| n > BODY_LIMIT as u64)
                {
                    return Err(RadarError::Unavailable);
                }
                let mut body = Vec::new();
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|_| RadarError::Unavailable)?
                {
                    if chunk.len() > BODY_LIMIT - body.len() {
                        return Err(RadarError::Unavailable);
                    }
                    body.extend_from_slice(&chunk);
                }
                Ok((parse(&body)?, time::now()?))
            };
            if let Ok(Ok(value)) = timeout(self.attempt_timeout, attempt).await {
                return Ok(value);
            }
        }
        Err(RadarError::Unavailable)
    }
}
