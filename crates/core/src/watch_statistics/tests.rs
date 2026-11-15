use super::*;
use rusqlite::Connection;
use std::sync::atomic::{AtomicU64, Ordering};

struct Temp(std::path::PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-watch-statistics-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn db(&self) -> std::path::PathBuf {
        self.0.join("watch-statistics.sqlite3")
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn scope(owner: &str) -> WatchStatisticsScope {
    WatchStatisticsScope {
        owner_id: owner.into(),
        owner_epoch: "e".repeat(32),
    }
}
fn today() -> String {
    date_from_days(today_days().unwrap())
}
fn item(ms: u32) -> WatchStatisticsSegment {
    WatchStatisticsSegment {
        day: today(),
        ms,
        kind: WatchStatisticsContentType::Real,
        genre: Some("都市".into()),
    }
}
fn batch(revision: String, id: &str, ms: u32) -> WatchStatisticsBatch {
    WatchStatisticsBatch {
        owner_id: "123".into(),
        owner_epoch: "e".repeat(32),
        id: id.into(),
        revision,
        items: vec![item(ms)],
    }
}

#[tokio::test]
async fn append_is_idempotent_and_survives_restart() {
    let temp = Temp::new();
    let owner = scope("123");
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let first = service.snapshot(&owner, &today()).await.unwrap();
    let saved = service
        .append(
            &owner,
            &today(),
            batch(first.revision.clone(), "batch-001", 1200),
        )
        .await
        .unwrap();
    assert!(saved.applied);
    let duplicate = service
        .append(&owner, &today(), batch(first.revision, "batch-001", 1200))
        .await
        .unwrap();
    assert!(!duplicate.applied);
    assert_eq!(duplicate.snapshot.days[0].duration_ms, 1200);
    drop(service);
    let reopened = WatchStatisticsService::open(temp.db()).await.unwrap();
    let snapshot = reopened.snapshot(&owner, &today()).await.unwrap();
    assert_eq!(snapshot.days[0].duration_ms, 1200);
    assert_eq!(snapshot.days[0].genres[0].key, "都市");
}

#[tokio::test]
async fn reset_changes_revision_and_fences_late_batch_without_touching_other_owner() {
    let temp = Temp::new();
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let owner = scope("123");
    let other = scope("456");
    let before = service.snapshot(&owner, &today()).await.unwrap();
    service
        .append(
            &owner,
            &today(),
            batch(before.revision.clone(), "batch-001", 1000),
        )
        .await
        .unwrap();
    let other_before = service.snapshot(&other, &today()).await.unwrap();
    service
        .append(
            &other,
            &today(),
            WatchStatisticsBatch {
                owner_id: other.owner_id.clone(),
                owner_epoch: other.owner_epoch.clone(),
                id: "other-001".into(),
                revision: other_before.revision,
                items: vec![item(700)],
            },
        )
        .await
        .unwrap();
    let reset = service.reset(&owner, &today()).await.unwrap();
    assert!(reset.days.is_empty());
    assert_ne!(reset.revision, before.revision);
    assert_eq!(
        service
            .append(&owner, &today(), batch(before.revision, "late-001", 1000))
            .await
            .unwrap_err(),
        WatchStatisticsError::RevisionChanged
    );
    assert_eq!(
        service.snapshot(&other, &today()).await.unwrap().days[0].duration_ms,
        700
    );
}

#[tokio::test]
async fn malformed_and_overflowing_batches_are_rejected_atomically() {
    let temp = Temp::new();
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let owner = scope("123");
    let initial = service.snapshot(&owner, &today()).await.unwrap();
    let mut invalid = batch(initial.revision.clone(), "bad!001", 1000);
    assert_eq!(
        service
            .append(&owner, &today(), invalid.clone())
            .await
            .unwrap_err(),
        WatchStatisticsError::InvalidInput
    );
    invalid.id = "valid-001".into();
    invalid.items[0].ms = 60_001;
    assert_eq!(
        service.append(&owner, &today(), invalid).await.unwrap_err(),
        WatchStatisticsError::InvalidInput
    );
    assert!(
        service
            .snapshot(&owner, &today())
            .await
            .unwrap()
            .days
            .is_empty()
    );
    let mut conflict = batch(initial.revision, "valid-002", 1000);
    conflict.items.push(item(1000));
    conflict.items[0].genre = Some("/unsafe".into());
    assert_eq!(
        service
            .append(&owner, &today(), conflict)
            .await
            .unwrap_err(),
        WatchStatisticsError::InvalidInput
    );
}

#[tokio::test]
async fn daily_cap_rejects_without_partial_aggregation() {
    let temp = Temp::new();
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let owner = scope("123");
    let initial = service.snapshot(&owner, &today()).await.unwrap();
    drop(service);
    let connection = Connection::open(temp.db()).unwrap();
    connection
        .execute(
            "INSERT INTO daily(owner_id,day,duration_ms) VALUES (?1,?2,?3)",
            rusqlite::params![owner.owner_id, today(), 86_399_500_i64],
        )
        .unwrap();
    drop(connection);
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let result = service
        .append(&owner, &today(), batch(initial.revision, "cap-0001", 1000))
        .await;
    assert_eq!(result.unwrap_err(), WatchStatisticsError::DailyLimit);
    assert_eq!(
        service.snapshot(&owner, &today()).await.unwrap().days[0].duration_ms,
        86_399_500
    );
}

#[tokio::test]
async fn retention_prunes_old_days_and_corrupt_store_fails_closed() {
    let temp = Temp::new();
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    let owner = scope("123");
    let current = service.snapshot(&owner, &today()).await.unwrap();
    drop(service);
    let connection = Connection::open(temp.db()).unwrap();
    let old = date_from_days(today_days().unwrap() - RETENTION_DAYS);
    connection
        .execute(
            "INSERT INTO daily(owner_id,day,duration_ms) VALUES (?1,?2,?3)",
            rusqlite::params![owner.owner_id, old, 10_i64],
        )
        .unwrap();
    drop(connection);
    let service = WatchStatisticsService::open(temp.db()).await.unwrap();
    assert!(
        service
            .snapshot(&owner, &today())
            .await
            .unwrap()
            .days
            .is_empty()
    );
    drop(service);
    std::fs::write(temp.db(), b"corrupt").unwrap();
    assert!(WatchStatisticsService::open(temp.db()).await.is_err());
    let _ = current;
}
