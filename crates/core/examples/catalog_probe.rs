//! Opt-in anonymous live search/continuation/detail smoke; never part of offline tests.
use hongguo_core::catalog::{CatalogClient, SearchQuery};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let term = std::env::args().nth(1).unwrap_or_else(|| "重生".into());
    let client = CatalogClient::new()?;
    let results = client.search(&SearchQuery::new(&term, 0, None)?).await?;
    println!(
        "source=web offset=0 items={} has_more={} next_offset={}",
        results.items.len(),
        results.has_more,
        results.next_offset,
    );
    if results.has_more {
        let offset = results.next_offset;
        let next = client
            .search(&SearchQuery::new(&term, offset, Some("web"))?)
            .await?;
        if next.next_offset <= offset || next.source != results.source {
            return Err("Continuation changed source or failed to advance".into());
        }
        let distinct = next
            .items
            .iter()
            .filter(|item| {
                !results
                    .items
                    .iter()
                    .any(|old| old.series_id == item.series_id)
            })
            .count();
        println!(
            "source=web offset={offset} items={} distinct={distinct} has_more={} next_offset={}",
            next.items.len(),
            next.has_more,
            next.next_offset,
        );
    }
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
