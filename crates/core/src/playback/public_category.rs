//! The fixed anonymous category POST; no registration, account or identity cache.
use super::PlaybackClient;
use crate::catalog::{CatalogError, CategoryQuery, CategoryResult, parse_category};
use std::{collections::BTreeMap, time::Duration};
const ENDPOINT: &str =
    "https://api5-normal-sinfonlineb.fqnovel.com/reading/distribution/category/landpage/v/";
impl PlaybackClient {
    pub(crate) async fn public_category(
        &self,
        query: &CategoryQuery,
    ) -> Result<CategoryResult, CatalogError> {
        self.category_with_deadline(query, Duration::from_secs(12), Duration::from_secs(5))
            .await
    }
    async fn category_with_deadline(
        &self,
        query: &CategoryQuery,
        total: Duration,
        attempt: Duration,
    ) -> Result<CategoryResult, CatalogError> {
        let body = serde_json::to_vec(query.payload()).map_err(|_| CatalogError::Configuration)?;
        let bytes = self
            .anonymous_catalog(ENDPOINT, &BTreeMap::new(), Some(&body), total, attempt)
            .await?;
        parse_category(&bytes, query)
    }
}
#[cfg(test)]
mod tests;
