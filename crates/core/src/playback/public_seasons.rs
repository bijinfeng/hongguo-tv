//! Stateless anonymous series reads, sharing the established signed transport.
use super::PlaybackClient;
use crate::catalog::{CatalogError, NextSeasonResult, SeriesQuery, SeriesSeasonsResult, seasons};
use std::time::Duration;
use tokio::time::timeout;
impl PlaybackClient {
    pub(crate) async fn public_series_seasons(
        &self,
        query: &SeriesQuery,
    ) -> Result<SeriesSeasonsResult, CatalogError> {
        let bytes = self
            .anonymous_catalog(
                seasons::ENDPOINT,
                &query.params(false),
                None,
                Duration::from_secs(12),
                Duration::from_secs(5),
            )
            .await?;
        seasons::parse_series_seasons(&bytes)
    }
    pub(crate) async fn public_next_season(
        &self,
        query: &SeriesQuery,
    ) -> Result<NextSeasonResult, CatalogError> {
        timeout(Duration::from_secs(20), async {
            let rows = self.season_relations(query).await?.items;
            let reciprocal = match seasons::reciprocal_series(query, &rows) {
                Some(id) => Some(self.season_relations(&SeriesQuery::new(id)?).await?.items),
                None => None,
            };
            seasons::select_next_season(query, rows, reciprocal)
        })
        .await
        .unwrap_or(Err(CatalogError::Timeout))
    }
    async fn season_relations(
        &self,
        query: &SeriesQuery,
    ) -> Result<SeriesSeasonsResult, CatalogError> {
        let bytes = self
            .anonymous_catalog(
                seasons::ENDPOINT,
                &query.params(true),
                None,
                Duration::from_secs(12),
                Duration::from_secs(5),
            )
            .await?;
        seasons::parse_season_relations(&bytes)
    }
}
