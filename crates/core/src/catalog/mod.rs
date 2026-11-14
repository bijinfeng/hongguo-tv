//! Anonymous website catalog with bounded, cancellable requests and stable wire DTOs.
mod actor_works;
mod category;
mod client;
mod discovery;
mod feed;
mod parse;
mod suggestions;
pub use discovery::{
    DiscoveryBoard, DiscoveryBoardKind, DiscoveryItem, SearchDiscovery, parse_discovery,
};
pub use suggestions::{
    SearchSuggestion, SearchSuggestions, SuggestionKind, SuggestionQuery, parse_suggestions,
};

pub use actor_works::{ActorQuery, ActorSummary, ActorWorksResult, parse_actor_works};
pub use category::{
    CategoryFilterOption, CategoryFilterRow, CategoryParams, CategoryQuery, CategoryResult,
    parse_category,
};
pub use client::CatalogClient;
pub use feed::{FeedChannel, FeedDiagnostics, FeedParams, FeedQuery, FeedResult, parse_feed};

pub use parse::{parse_detail, parse_search};
use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};
use utoipa::ToSchema;

/// Episode identity and access state; indexes are one-based.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Episode {
    /// One-based episode number.
    pub index: u32,
    /// Exact upstream video identifier, never a floating-point number.
    pub video_id: String,
    /// Optional display title.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub title: Option<String>,
    /// Whether the episode is outside the website's accessible range.
    pub locked: bool,
}

/// Shared drama summary; detail adds ordered episodes without leaking upstream payloads.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Drama {
    /// Exact series identifier.
    pub series_id: String,
    /// Display title.
    pub title: String,
    /// Original cover address.
    pub cover: String,
    /// Website JPEG alternative for supported HEIC covers.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub cover_fallback: Option<String>,
    /// Plain description.
    pub intro: String,
    /// Reported episode count.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub episode_count: Option<u32>,
    /// Content family; creator albums are outside this service.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub content_type: Option<String>,
    /// Ordered detail episodes; absent in search summaries.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub episodes: Option<Vec<Episode>>,
    /// Genre labels.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub tags: Option<Vec<String>>,
}

/// Website page result; continuation offsets count pages already consumed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SearchResult {
    /// Unique drama summaries, including an empty array for no matches.
    pub items: Vec<Drama>,
    /// Whether a further website page is available.
    pub has_more: bool,
    /// Consumed website page number; send as the next offset.
    pub next_offset: u32,
    /// Catalog source. Optional for legacy fixture compatibility; this service always emits web.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub source: Option<String>,
}

/// Validated search input shared by all transports.
#[derive(Debug, Clone)]
pub struct SearchQuery {
    term: String,
    page: u32,
}
impl SearchQuery {
    /// Validate a term, zero-based consumed-page offset, and optional website source.
    pub fn new(term: &str, offset: u32, source: Option<&str>) -> Result<Self, CatalogError> {
        let term = term.trim();
        if term.is_empty() || term.chars().count() > 80 || offset > 100_000 {
            return Err(CatalogError::InvalidInput);
        }
        if source.is_some_and(|s| !s.is_empty() && s != "web") {
            return Err(CatalogError::UnsupportedSource);
        }
        Ok(Self {
            term: term.into(),
            page: offset + 1,
        })
    }
    /// Trimmed term.
    pub fn term(&self) -> &str {
        &self.term
    }
    /// One-based website page.
    pub fn page(&self) -> u32 {
        self.page
    }
}

/// Validate series identity and reject the reference project's creator-album family.
pub fn validate_detail(series_id: &str, content_type: Option<&str>) -> Result<(), CatalogError> {
    if !valid_id(series_id) {
        return Err(CatalogError::InvalidInput);
    }
    if content_type == Some("1003") {
        return Err(CatalogError::UnsupportedContent);
    }
    Ok(())
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value.bytes().all(|c| c.is_ascii_digit())
        && value.bytes().any(|c| c != b'0')
}

/// Sanitized failure categories independent of HTTP or native bridge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogError {
    /// Invalid term, offset or series identifier.
    InvalidInput,
    /// Only website search is migrated.
    UnsupportedSource,
    /// Creator album detail needs a separate account-aware implementation.
    UnsupportedContent,
    /// Missing, malformed or mismatched upstream data.
    InvalidData,
    /// Response exceeded its hard byte limit.
    TooLarge,
    /// Request deadline expired.
    Timeout,
    /// Network or truncated response failure.
    Transport,
    /// Website requires verification; it must not be bypassed.
    VerificationRequired,
    /// Non-success upstream status, without its body or URL.
    UpstreamStatus(u16),
    /// Invalid origin or TLS initialization failure.
    Configuration,
}
impl CatalogError {
    /// Stable cross-transport machine code.
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "INVALID_CATALOG_QUERY",
            Self::UnsupportedSource => "UNSUPPORTED_SEARCH_SOURCE",
            Self::UnsupportedContent => "UNSUPPORTED_CONTENT_TYPE",
            Self::InvalidData => "UPSTREAM_INVALID_DATA",
            Self::TooLarge => "UPSTREAM_BODY_TOO_LARGE",
            Self::Timeout => "UPSTREAM_TIMEOUT",
            Self::Transport => "UPSTREAM_UNAVAILABLE",
            Self::VerificationRequired => "SEARCH_VERIFICATION_REQUIRED",
            Self::UpstreamStatus(_) => "UPSTREAM_HTTP_ERROR",
            Self::Configuration => "CATALOG_CONFIGURATION_ERROR",
        }
    }
}
impl fmt::Display for CatalogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidInput => "搜索或剧集参数无效",
            Self::UnsupportedSource => "暂不支持此搜索来源",
            Self::UnsupportedContent => "此内容类型尚未开放",
            Self::InvalidData => "官网返回的数据无效，请稍后重试",
            Self::TooLarge => "官网响应超过大小限制",
            Self::Timeout => "官网连接超时，请重试",
            Self::Transport => "官网连接失败，请重试",
            Self::VerificationRequired => "官网搜索需要验证，请稍后重试",
            Self::UpstreamStatus(_) => "官网服务暂时不可用，请稍后重试",
            Self::Configuration => "目录服务初始化失败",
        })
    }
}
impl Error for CatalogError {}
