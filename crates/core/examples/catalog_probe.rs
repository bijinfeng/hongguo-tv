//! Opt-in anonymous live search/detail smoke; never part of default offline tests.
use hongguo_core::catalog::{CatalogClient, SearchQuery};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let term = std::env::args().nth(1).unwrap_or_else(|| "重生".into());
    let client = CatalogClient::new()?;
    let results = client.search(&SearchQuery::new(&term, 0, None)?).await?;
    println!(
        "source=web items={} has_more={}",
        results.items.len(),
        results.has_more
    );
    if let Some(first) = results.items.first() {
        let detail = client
            .detail(&first.series_id, first.content_type.as_deref())
            .await?;
        println!(
            "series_id={} episodes={}",
            detail.series_id,
            detail.episodes.unwrap_or_default().len()
        );
    }
    Ok(())
}
