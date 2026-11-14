//! Explicit anonymous actor-page smoke; never part of offline validation.
use hongguo_core::catalog::{ActorQuery, CatalogClient};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 || args[0] != "--anonymous-live" {
        return Err("Explicit --anonymous-live and a public actor ID are required".into());
    }
    let result = CatalogClient::new()?
        .actor_works(&ActorQuery::new(&args[1])?)
        .await?;
    println!(
        "anonymous_actor_works works={} avatar={} description={} exact_series={} with_episode_details={}",
        result.items.len(),
        usize::from(result.actor.avatar.is_some()),
        usize::from(result.actor.description.is_some()),
        result
            .items
            .iter()
            .filter(|item| !item.series_id.is_empty())
            .count(),
        result
            .items
            .iter()
            .filter(|item| item.episodes.is_some())
            .count(),
    );
    Ok(())
}
