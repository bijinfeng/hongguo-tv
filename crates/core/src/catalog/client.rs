use super::{
    CatalogError, Drama, SearchQuery, SearchResult, parse_detail, parse_search, validate_detail,
};
use reqwest::{Client, Url, header};
use std::{net::IpAddr, time::Duration};
use tokio::time::{sleep, timeout};

const WEBSITE: &str = "https://hongguoduanju.com";
const SEARCH_LIMIT: usize = 4 * 1024 * 1024;
const DETAIL_LIMIT: usize = 12 * 1024 * 1024;

/// Anonymous catalog service, reusable across HTTP and native adapters.
#[derive(Clone)]
pub struct CatalogClient {
    http: Client,
    discovery: super::discovery::Discovery,
    origin: Url,
    attempt_timeout: Duration,
    total_timeout: Duration,
    retry_delay: Duration,
}
impl CatalogClient {
    /// Build a client pinned to the production website. Initialization errors are fatal to readiness.
    pub fn new() -> Result<Self, CatalogError> {
        Self::build(Url::parse(WEBSITE).map_err(|_| CatalogError::Configuration)?)
    }

    /// Explicit fixture-only origin injection; accepts bare HTTP loopback IP origins only.
    /// Never derive this value from an API request or product configuration.
    pub fn for_loopback_tests(origin: &str) -> Result<Self, CatalogError> {
        let url = Url::parse(origin).map_err(|_| CatalogError::Configuration)?;
        let loopback = url
            .host_str()
            .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if url.scheme() != "http"
            || !loopback
            || url.port_or_known_default() == Some(0)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(CatalogError::Configuration);
        }
        Self::build(url)
    }

    fn build(origin: Url) -> Result<Self, CatalogError> {
        let http = crate::http::client_builder()
            .http1_only()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .retry(reqwest::retry::never())
            .user_agent("Mozilla/5.0 (Android TV; HongguoTV)")
            .timeout(Duration::from_secs(5))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| CatalogError::Configuration)?;
        let discovery =
            super::discovery::Discovery::new((origin.scheme() == "http").then(|| origin.as_str()))?;
        Ok(Self {
            http,
            discovery,
            origin,
            attempt_timeout: Duration::from_secs(5),
            total_timeout: Duration::from_secs(12),
            retry_delay: Duration::from_millis(200),
        })
    }

    /// Read the independent anonymous public search-page snapshot.
    pub async fn search_discovery(&self) -> Result<super::SearchDiscovery, CatalogError> {
        self.discovery.get().await
    }

    /// Anonymous current-term suggestions. Dropping the future cancels reads and retries.
    pub async fn suggestions(
        &self,
        query: &super::SuggestionQuery,
    ) -> Result<super::SearchSuggestions, CatalogError> {
        if query.term().is_empty() {
            return Ok(super::SearchSuggestions::default());
        }
        let mut url = self
            .origin
            .join("/incent_resource/suggestion")
            .map_err(|_| CatalogError::Configuration)?;
        url.query_pairs_mut()
            .append_pair("app_id", "8662")
            .append_pair("query", query.term())
            .append_pair("count", "10");
        let body = self
            .fetch(url, "application/json", super::suggestions::BODY_LIMIT)
            .await?;
        super::parse_suggestions(&body)
    }

    /// Read the exact anonymous actor page; dropping the future cancels pending reads and retries.
    pub async fn actor_works(
        &self,
        query: &super::ActorQuery,
    ) -> Result<super::ActorWorksResult, CatalogError> {
        let url = self
            .origin
            .join(&format!("/character/{}", query.id()))
            .map_err(|_| CatalogError::Configuration)?;
        let body = self
            .fetch(url, "text/html", super::actor_works::BODY_LIMIT)
            .await?;
        super::parse_actor_works(&body, query)
    }

    /// Query one validated website page. Dropping the future cancels pending work and retries.
    pub async fn search(&self, query: &SearchQuery) -> Result<SearchResult, CatalogError> {
        let mut url = self
            .origin
            .join("/api/search/result")
            .map_err(|_| CatalogError::Configuration)?;
        url.query_pairs_mut().append_pair("query", query.term());
        if query.page() > 1 {
            url.query_pairs_mut()
                .append_pair("page", &query.page().to_string());
        }
        let body = self.fetch(url, "application/json", SEARCH_LIMIT).await?;
        parse_search(&body, query.page())
    }

    /// Read ordinary drama detail; unsupported families and invalid IDs fail before networking.
    pub async fn detail(
        &self,
        series_id: &str,
        content_type: Option<&str>,
    ) -> Result<Drama, CatalogError> {
        validate_detail(series_id, content_type)?;
        let mut url = self
            .origin
            .join("/detail")
            .map_err(|_| CatalogError::Configuration)?;
        url.query_pairs_mut().append_pair("series_id", series_id);
        let body = self.fetch(url, "text/html", DETAIL_LIMIT).await?;
        parse_detail(&body, series_id)
    }

    async fn fetch(&self, url: Url, accept: &str, limit: usize) -> Result<Vec<u8>, CatalogError> {
        timeout(self.total_timeout, async {
            for attempt in 0..2 {
                let result = timeout(self.attempt_timeout, self.read(&url, accept, limit))
                    .await
                    .unwrap_or(Err(CatalogError::Timeout));
                let retry = matches!(
                    result,
                    Err(CatalogError::Timeout
                        | CatalogError::Transport
                        | CatalogError::UpstreamStatus(500..=599))
                );
                if attempt == 1 || !retry {
                    return result;
                }
                sleep(self.retry_delay).await;
            }
            unreachable!("bounded attempt loop returns on its final iteration")
        })
        .await
        .unwrap_or(Err(CatalogError::Timeout))
    }

    async fn read(&self, url: &Url, accept: &str, limit: usize) -> Result<Vec<u8>, CatalogError> {
        let mut response = self
            .http
            .get(url.clone())
            .header(header::ACCEPT, accept)
            .header(header::REFERER, self.origin.as_str())
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status();
        if response
            .content_length()
            .is_some_and(|size| size > limit as u64)
        {
            return Err(CatalogError::TooLarge);
        }
        let html = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.to_ascii_lowercase().contains("text/html"));
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(network_error)? {
            if chunk.len() > limit - body.len() {
                return Err(CatalogError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        if status.as_u16() == 403
            && serde_json::from_slice::<serde_json::Value>(&body)
                .is_ok_and(|data| data["code"] == "search_verification_required")
        {
            return Err(CatalogError::VerificationRequired);
        }
        if status.as_u16() != 200 {
            return Err(CatalogError::UpstreamStatus(status.as_u16()));
        }
        if accept == "application/json" && html {
            return Err(CatalogError::InvalidData);
        }
        Ok(body)
    }
}
fn network_error(error: reqwest::Error) -> CatalogError {
    if error.is_timeout() {
        CatalogError::Timeout
    } else {
        CatalogError::Transport
    }
}

#[cfg(test)]
mod tests;
