//! Opt-in anonymous public discovery smoke; never part of offline tests.
use hongguo_core::catalog::CatalogClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).as_deref() != Some("--anonymous-live") {
        return Err("Explicit --anonymous-live is required".into());
    }
    let data = CatalogClient::new()?.search_discovery().await?;
    println!(
        "anonymous_discovery guesses={} boards={} short={} comic={}",
        data.guesses.len(),
        data.boards.len(),
        data.boards
            .iter()
            .filter(|b| b.id == hongguo_core::catalog::DiscoveryBoardKind::Short)
            .map(|b| b.items.len())
            .sum::<usize>(),
        data.boards
            .iter()
            .filter(|b| b.id == hongguo_core::catalog::DiscoveryBoardKind::Comic)
            .map(|b| b.items.len())
            .sum::<usize>()
    );
    Ok(())
}
