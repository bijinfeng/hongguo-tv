//! One fixed public search-page request; its transport instance is separate from playback.
use super::{
    PlaybackClient, PlaybackError,
    identity::{Profile, device_query, timestamp},
    public_sign,
};
use crate::catalog::CatalogError;
use reqwest::{Url, header};
const ENDPOINT: &str = "https://api5-normal-lq.fqnovel.com/reading/bookapi/plan/v1/";
const UA: &str = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";
impl PlaybackClient {
    /// Internal public plan only: fresh registration, no playback identity cache or cookie reuse.
    pub(crate) async fn public_search_plan(&self) -> Result<Vec<u8>, CatalogError> {
        let id = self.register(Profile::Legacy, 0).await.map_err(map_error)?;
        let mut q = device_query(Profile::Legacy, &id.cdid, &id.openudid);
        for (k, v) in [
            ("device_id", id.device_id.as_str()),
            ("iid", id.install_id.as_str()),
            ("user_is_login", "0"),
            ("bookstore_tab", "16"),
            ("bookstore_tab_type", "16"),
            ("scene", "10"),
            ("limit", "0"),
            ("tab_name", "feed"),
            ("from", "search_input_page"),
            ("query_history_removed", "false"),
            ("offset", "0"),
            ("search_middle_page_version", "4"),
            ("search_source", "1"),
            ("new_search_middle_page", "true"),
            ("hot_word_exchange", "false"),
        ] {
            q.insert(k.into(), v.into());
        }
        let (raw, headers) = public_sign::sign(q, timestamp().map_err(map_error)?, &id.device_id)
            .map_err(map_error)?;
        let mut url = Url::parse(ENDPOINT).map_err(|_| CatalogError::Configuration)?;
        if let Some(origin) = &self.fixture {
            url = origin
                .join(url.path())
                .map_err(|_| CatalogError::Configuration)?;
        }
        url.set_query(Some(&raw));
        let mut response = self
            .http
            .get(url)
            .headers(headers)
            .header(header::USER_AGENT, UA)
            .header(header::ACCEPT, "application/json")
            .header("X-XS-From-Web", "0")
            .header("Sdk-Version", "2")
            .header("Passport-Sdk-Version", "6031190")
            .header("X-SS-DP", "8662")
            .header("X-Tt-Store-Region", "cn")
            .header("X-Tt-Store-Region-Src", "did")
            .header(header::COOKIE, format!("install_id={}", id.install_id))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    CatalogError::Timeout
                } else {
                    CatalogError::Transport
                }
            })?;
        let status = response.status().as_u16();
        if matches!(status, 401 | 403) {
            return Err(CatalogError::VerificationRequired);
        }
        if status != 200 {
            return Err(CatalogError::UpstreamStatus(status));
        }
        const LIMIT: usize = 2 * 1024 * 1024;
        if response.content_length().is_some_and(|n| n > LIMIT as u64) {
            return Err(CatalogError::TooLarge);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| {
            if e.is_timeout() {
                CatalogError::Timeout
            } else {
                CatalogError::Transport
            }
        })? {
            if chunk.len() > LIMIT - body.len() {
                return Err(CatalogError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}
fn map_error(error: PlaybackError) -> CatalogError {
    match error {
        PlaybackError::Timeout => CatalogError::Timeout,
        PlaybackError::Configuration => CatalogError::Configuration,
        _ => CatalogError::Transport,
    }
}
