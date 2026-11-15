//! Explicit anonymous full-detail probe; output contains counts, never upstream payloads.
use hongguo_core::catalog::{CatalogClient, validate_detail};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 || args[0] != "--anonymous-live" {
        return Err("Expected --anonymous-live <public-series-id>".into());
    }
    validate_detail(&args[1], None)?;
    let detail = CatalogClient::new()?.series_detail(&args[1], None).await?;
    println!(
        "{}",
        serde_json::json!({
            "identity_verified": true,
            "actors": detail.actors.len(),
            "actors_with_identity": detail.actors.iter().filter(|actor| actor.actor_id.is_some()).count(),
            "related": detail.related.len(),
            "episodes": detail.drama.episodes.as_ref().map_or(0, Vec::len),
        })
    );
    Ok(())
}
