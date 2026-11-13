//! Explicit anonymous live preparation smoke, separate from offline tests and host decoding.
use hongguo_core::{
    catalog::{CatalogClient, SearchQuery},
    playback::{PlaybackRequest, PlaybackService},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("--live") {
        return Err(
            "usage: playback_probe --live <search term> <app-owned test state directory>".into(),
        );
    }
    let term = args.next().ok_or("search term required")?;
    let directory = args.next().ok_or("test state directory required")?;
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }
    let catalog = CatalogClient::new()?;
    let search = catalog.search(&SearchQuery::new(&term, 0, None)?).await?;
    println!("stage=search items={}", search.items.len());
    let drama = search.items.first().ok_or("no search results")?;
    let drama = catalog
        .detail(&drama.series_id, drama.content_type.as_deref())
        .await?;
    println!(
        "stage=detail available={}",
        drama
            .episodes
            .as_ref()
            .map_or(0, |episodes| episodes.iter().filter(|e| !e.locked).count())
    );
    let episode = drama
        .episodes
        .as_ref()
        .and_then(|episodes| episodes.iter().find(|e| !e.locked))
        .ok_or("no available episode")?;
    let service = PlaybackService::new(std::path::Path::new(&directory))?;
    let selected = PlaybackRequest::new(
        &drama.series_id,
        &episode.video_id,
        drama.content_type.as_deref().unwrap_or(""),
        "",
        "default",
    )?;
    let result = async {
        println!("stage=prepare");
        let info = service.resolve(&selected).await?;
        let token = info.path.rsplit('/').next().ok_or("invalid local path")?;
        let lease = service.lease(token)?;
        let length = lease.length();
        let first = lease.chunk(0, 15).await?;
        let tail = lease.chunk(length.saturating_sub(16), length - 1).await?;
        println!(
            "prepared codec={} quality={} bytes={} first={} tail={}; host decoding not tested",
            info.video_codec,
            info.quality,
            length,
            first.len(),
            tail.len()
        );
        service.release(token)?;
        Ok::<_, Box<dyn std::error::Error>>(())
    }
    .await;
    service.close();
    result
}
