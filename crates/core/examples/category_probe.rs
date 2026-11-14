//! Explicit anonymous category smoke; prints counts only and never runs in offline tests.
use hongguo_core::catalog::{CatalogClient, CategoryParams, CategoryQuery};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--anonymous-live"] {
        return Err("Explicit --anonymous-live is required".into());
    }
    let client = CatalogClient::new()?;
    let result = client
        .category(&CategoryQuery::new(CategoryParams {
            selectors: Some("1".into()),
            ..Default::default()
        })?)
        .await?;
    println!(
        "anonymous_category items={} filters={} has_more={} advancing={} episode_details={}",
        result.items.len(),
        result.filters.as_ref().map_or(0, Vec::len),
        result.has_more,
        result.next_offset > 0,
        result
            .items
            .iter()
            .filter(|item| item.episodes.is_some())
            .count()
    );
    Ok(())
}
