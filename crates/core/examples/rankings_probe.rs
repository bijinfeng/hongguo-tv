//! Explicit read-only ranking smoke; aggregate output only, never part of offline tests.
use hongguo_core::catalog::{CatalogClient, RankEntry, RankParams, RankQuery};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--anonymous-live"] {
        return Err("Explicit --anonymous-live is required".into());
    }
    let client = CatalogClient::new()?;
    for (rank, sub) in [
        ("all", "ranklist_hot_play_sc"),
        ("ranklist_celebrity", "ranklist_actor_fans"),
        ("series_album", "series_album_new_rank"),
    ] {
        let mut params = RankParams {
            rank: Some(rank.into()),
            rank_sub: Some(sub.into()),
            ..Default::default()
        };
        for phase in 0..2 {
            let page = client.rankings(&RankQuery::new(params)?).await?;
            let actors = page
                .items
                .iter()
                .filter(|i| matches!(i.entry, RankEntry::Actor { .. }))
                .count();
            println!(
                "anonymous_rankings rank={rank} phase={phase} items={} actors={actors} selectors={} more={} next={}",
                page.items.len(),
                page.ranks.len(),
                page.has_more,
                page.next_offset
            );
            if !page.has_more {
                break;
            }
            params = RankParams {
                rank: Some(rank.into()),
                rank_sub: Some(sub.into()),
                offset: page.next_offset,
                session_id: Some(page.session_id),
                shown: Some(
                    page.items
                        .iter()
                        .rev()
                        .take(128)
                        .rev()
                        .map(|i| match &i.entry {
                            RankEntry::Drama { drama } => drama.series_id.as_str(),
                            RankEntry::Actor { actor, .. } => actor.id.as_str(),
                        })
                        .collect::<Vec<_>>()
                        .join(","),
                ),
                ..Default::default()
            };
        }
    }
    Ok(())
}
