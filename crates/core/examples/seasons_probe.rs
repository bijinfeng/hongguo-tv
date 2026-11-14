//! Explicit read-only anonymous series probe; aggregates only, never default tests.
use hongguo_core::catalog::{CatalogClient, SeriesQuery};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--anonymous-live"] {
        return Err("Explicit --anonymous-live is required".into());
    }
    let client = CatalogClient::new()?;
    let q = SeriesQuery::new("7690163276214176792")?;
    let selector = client.series_seasons(&q).await?;
    println!(
        "anonymous_series selector={} playable={} upcoming={} eligible={} episodes={}",
        selector.items.len(),
        selector.items.iter().filter(|s| s.playable).count(),
        selector.items.iter().filter(|s| s.upcoming).count(),
        selector
            .items
            .iter()
            .filter(|s| s.reservation_id.is_some())
            .count(),
        selector
            .items
            .iter()
            .filter(|s| s.drama.episodes.is_some())
            .count()
    );
    let next = client.next_season(&q).await?;
    println!(
        "anonymous_series current_confirmed={} successor={}",
        next.current_season > 0,
        next.next.is_some()
    );
    Ok(())
}
