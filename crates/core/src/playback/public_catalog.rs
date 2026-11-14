//! Fixed anonymous catalog reads, with ephemeral identity and no account or playback cache.
use super::{
    PlaybackClient,
    identity::{Profile, device_query, timestamp},
    protocol, public_sign,
};
use crate::catalog::{CatalogError, FeedQuery, FeedResult, parse_feed};
use reqwest::{Url, header};
use std::{collections::BTreeMap, time::Duration};
use tokio::time::{sleep, timeout};
const UA: &str = "com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)";
impl PlaybackClient {
    pub(crate) async fn public_feed(&self, query: &FeedQuery) -> Result<FeedResult, CatalogError> {
        let bytes = self
            .anonymous_catalog(
                query.endpoint(),
                &query.params(),
                None,
                Duration::from_secs(12),
                Duration::from_secs(5),
            )
            .await?;
        parse_feed(&bytes, query)
    }
    pub(super) async fn anonymous_catalog(
        &self,
        endpoint: &str,
        params: &BTreeMap<String, String>,
        body: Option<&[u8]>,
        total: Duration,
        attempt: Duration,
    ) -> Result<Vec<u8>, CatalogError> {
        timeout(total, async {
            for index in 0..3 {
                let response = timeout(
                    attempt,
                    self.anonymous_catalog_attempt(endpoint, params, body),
                )
                .await
                .unwrap_or(Err(CatalogError::Timeout))?;
                if !response.is_empty() {
                    return Ok(response);
                }
                if index < 2 {
                    sleep(Duration::from_millis(100)).await;
                }
            }
            Err(CatalogError::InvalidData)
        })
        .await
        .unwrap_or(Err(CatalogError::Timeout))
    }
    async fn anonymous_catalog_attempt(
        &self,
        endpoint: &str,
        params: &BTreeMap<String, String>,
        body: Option<&[u8]>,
    ) -> Result<Vec<u8>, CatalogError> {
        let random_id = || {
            protocol::random::<8>()
                .map(|b| {
                    (u64::from_be_bytes(b) % 8_000_000_000_000_000_000 + 1_000_000_000_000_000_000)
                        .to_string()
                })
                .map_err(|_| CatalogError::Configuration)
        };
        let device = random_id()?;
        let mut q = device_query(Profile::Legacy, "", "");
        q.remove("cdid");
        q.remove("openudid");
        q.insert("device_id".into(), device.clone());
        q.insert("iid".into(), random_id()?);
        q.extend(params.clone());
        let (raw, headers) = public_sign::sign(
            q,
            body.unwrap_or_default(),
            timestamp().map_err(|_| CatalogError::Configuration)?,
            &device,
        )
        .map_err(|_| CatalogError::Configuration)?;
        let mut url = Url::parse(endpoint).map_err(|_| CatalogError::Configuration)?;
        if let Some(origin) = &self.fixture {
            url = origin
                .join(url.path())
                .map_err(|_| CatalogError::Configuration)?;
        }
        url.set_query(Some(&raw));
        let mut request = self
            .http
            .request(
                if body.is_some() {
                    reqwest::Method::POST
                } else {
                    reqwest::Method::GET
                },
                url,
            )
            .headers(headers);
        if let Some(body) = body {
            request = request
                .body(body.to_vec())
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8");
        }
        let mut response = request
            .header(header::USER_AGENT, UA)
            .header(header::ACCEPT, "application/json")
            .header("X-XS-From-Web", "0")
            .header("Sdk-Version", "2")
            .header("Passport-Sdk-Version", "6031190")
            .header("X-SS-DP", "8662")
            .header("X-Tt-Store-Region", "cn")
            .header("X-Tt-Store-Region-Src", "did")
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status().as_u16();
        if matches!(status, 401 | 403) {
            return Err(CatalogError::VerificationRequired);
        }
        if status != 200 {
            return Err(CatalogError::UpstreamStatus(status));
        }
        const LIMIT: usize = 4 * 1024 * 1024;
        if response.content_length().is_some_and(|n| n > LIMIT as u64) {
            return Err(CatalogError::TooLarge);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(network_error)? {
            if chunk.len() > LIMIT - bytes.len() {
                return Err(CatalogError::TooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
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
