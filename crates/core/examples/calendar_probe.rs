//! Explicit read-only anonymous smoke; prints aggregate counts, never sessions or identifiers.
use hongguo_core::catalog::{
    CalendarEntry, CalendarParams, CalendarQuery, CatalogClient, NewSeriesParams, NewSeriesQuery,
};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().skip(1).collect::<Vec<_>>() != ["--anonymous-live"] {
        return Err("Explicit --anonymous-live is required".into());
    }
    let client = CatalogClient::new()?;
    let mut new = NewSeriesParams::default();
    for page in 0..2 {
        let result = client.new_series(&NewSeriesQuery::new(new)?).await?;
        println!(
            "anonymous_new page={} items={} has_more={} episode_details={}",
            page,
            result.items.len(),
            result.has_more,
            result.items.iter().filter(|d| d.episodes.is_some()).count()
        );
        if !result.has_more {
            break;
        }
        new = NewSeriesParams {
            offset: result.next_offset,
            session_id: Some(result.session_id),
            ..Default::default()
        };
    }
    let mut params = CalendarParams::default();
    for page in 0..4 {
        let result = client.calendar(&CalendarQuery::new(params)?).await?;
        println!(
            "anonymous_calendar page={} released={} upcoming={} dates={} has_more={} upcoming_cursor={}",
            page,
            result
                .items
                .iter()
                .filter(|i| matches!(i.entry, CalendarEntry::Released { .. }))
                .count(),
            result
                .items
                .iter()
                .filter(|i| matches!(i.entry, CalendarEntry::Upcoming { .. }))
                .count(),
            result.calendar.as_ref().map_or(0, |s| s.dates.len()),
            result.has_more,
            result.next_subscribe_offset.is_some()
        );
        if !result.has_more {
            break;
        }
        params = CalendarParams {
            offset: result.next_offset,
            subscribe_offset: result.next_subscribe_offset,
            session_id: Some(result.session_id),
            ..Default::default()
        };
    }
    let upcoming = client
        .calendar(&CalendarQuery::new(CalendarParams {
            subscribe_offset: Some(0),
            ..Default::default()
        })?)
        .await?;
    println!(
        "anonymous_calendar_explicit_zero released={} upcoming={} has_more={}",
        upcoming
            .items
            .iter()
            .filter(|i| matches!(i.entry, CalendarEntry::Released { .. }))
            .count(),
        upcoming
            .items
            .iter()
            .filter(|i| matches!(i.entry, CalendarEntry::Upcoming { .. }))
            .count(),
        upcoming.has_more
    );
    Ok(())
}
