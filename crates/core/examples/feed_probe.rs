//! Explicit read-only anonymous feed smoke; aggregate output only, never run by offline tests.
use hongguo_core::catalog::{CatalogClient, FeedParams, FeedQuery};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--anonymous-live"] {
        return Err("Explicit --anonymous-live is required".into());
    }
    let client = CatalogClient::new()?;
    for channel in ["16", "36", "39"] {
        let first = client
            .feed(&FeedQuery::new(FeedParams {
                channel: Some(channel.into()),
                ..Default::default()
            })?)
            .await?;
        println!(
            "anonymous_feed channel={channel} first={} more={} next={} parsed={} filtered={} episodes={}",
            first.items.len(),
            first.has_more,
            first.next_offset,
            first.diagnostics.parsed,
            first.diagnostics.filtered,
            first.items.iter().filter(|d| d.episodes.is_some()).count()
        );
        if first.has_more {
            let next = client
                .feed(&FeedQuery::new(FeedParams {
                    channel: Some(channel.into()),
                    offset: first.next_offset,
                    feed_cell: Some(first.feed_cell),
                    feed_plan: Some(first.feed_plan),
                    session_id: Some(first.session_id),
                    shown: Some(
                        first
                            .items
                            .iter()
                            .skip(first.items.len().saturating_sub(128))
                            .map(|d| d.series_id.as_str())
                            .collect::<Vec<_>>()
                            .join(","),
                    ),
                })?)
                .await?;
            println!(
                "anonymous_feed channel={channel} continuation={} more={} next={} episodes={}",
                next.items.len(),
                next.has_more,
                next.next_offset,
                next.items.iter().filter(|d| d.episodes.is_some()).count()
            );
        }
    }
    Ok(())
}
