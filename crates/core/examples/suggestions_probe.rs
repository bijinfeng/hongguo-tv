//! Explicit anonymous website suggestion smoke; never part of offline validation.
use hongguo_core::catalog::{CatalogClient, SuggestionKind, SuggestionQuery};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).as_deref() != Some("--anonymous-live") {
        return Err("Explicit --anonymous-live is required".into());
    }
    let result = CatalogClient::new()?
        .suggestions(&SuggestionQuery::new("重生")?)
        .await?;
    println!(
        "anonymous_suggestions items={} drama={} actor={} keyword={} exact_series={}",
        result.items.len(),
        result
            .items
            .iter()
            .filter(|item| item.kind == SuggestionKind::ShortPlayName)
            .count(),
        result
            .items
            .iter()
            .filter(|item| item.kind == SuggestionKind::ShortPlayActor)
            .count(),
        result
            .items
            .iter()
            .filter(|item| item.kind == SuggestionKind::CommonQuery)
            .count(),
        result
            .items
            .iter()
            .filter(|item| item.drama.is_some())
            .count(),
    );
    Ok(())
}
