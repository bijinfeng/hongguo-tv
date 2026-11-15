//! Contract and unavailable-feature boundaries; no cloud requests or real-account acceptance.
use hongguo_core::{
    account::{
        AccountCommand, AccountCommandRequest, AccountError, AccountService, AccountSyncState,
        AccountSyncStatus, GuestHistoryImportResult, GuestHistoryStatus,
    },
    library::{
        FavoriteEntry, HistoryChange, HistoryKind, Library, LibraryChange, LibraryError,
        LibraryKind, LibraryOperationIdentity, LibraryStore, LibraryWriteSessionRequest,
    },
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "hongguo-library-contract-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn drama() -> Value {
    json!({"series_id":"9999999999999999999","title":"Synthetic contract","cover":"","intro":""})
}
fn favorite(owner: &str, value: bool) -> Value {
    json!({"action":"favorite","owner_id":owner,"drama":drama(),"value":value})
}

#[test]
fn favorite_contract_is_independent_of_history_and_compatibility_names_are_aliases() {
    for value in [true, false] {
        let wire = favorite("01", value);
        let canonical: LibraryChange = serde_json::from_value(wire.clone()).unwrap();
        let alias: HistoryChange = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(serde_json::to_value(canonical).unwrap(), wire);
        assert_eq!(serde_json::to_value(alias).unwrap(), wire);
    }
    let kind: HistoryKind = LibraryKind::Favorites;
    assert_eq!(serde_json::to_value(kind).unwrap(), "favorites");
    let old: Library = serde_json::from_value(json!({"entries":[],"owner_id":""})).unwrap();
    assert_eq!(serde_json::to_value(old).unwrap()["favorites"], json!([]));
    let snapshot: Library = serde_json::from_value(json!({"entries":[],"owner_id":"01",
        "favorites":[{"drama":drama(),"favorite_at":1700000000123_i64}]}))
    .unwrap();
    assert!(snapshot.entries.is_empty());
    assert_eq!(snapshot.favorites[0].drama.series_id, "9999999999999999999");
    let entry = serde_json::to_value(&snapshot.favorites[0]).unwrap();
    assert_eq!(entry.as_object().unwrap().len(), 2);
    assert!(entry.get("episode").is_none());
    assert!(entry.get("position").is_none());
    let mut invalid = entry;
    invalid["episode"] = json!(1);
    assert!(serde_json::from_value::<FavoriteEntry>(invalid).is_err());

    for invalid in [
        {
            let mut v = favorite("", true);
            v["value"] = json!("true");
            v
        },
        {
            let mut v = favorite("", true);
            v["unexpected"] = json!(true);
            v
        },
        json!({"action":"favorite","owner_id":"","drama":drama()}),
        json!({"action":"clear","kind":"favorites","unexpected":true}),
        json!({"action":"favorite","owner_id":"","drama":drama(),"value":true,"position":12}),
    ] {
        assert!(serde_json::from_value::<LibraryChange>(invalid).is_err());
    }
}

#[test]
fn sync_and_import_wire_states_are_strict_and_do_not_invent_original_result_counts() {
    for (state, wire) in [
        (AccountSyncState::Local, "local"),
        (AccountSyncState::Idle, "idle"),
        (AccountSyncState::Pending, "pending"),
        (AccountSyncState::Syncing, "syncing"),
        (AccountSyncState::Error, "error"),
    ] {
        let status = AccountSyncStatus {
            state,
            pending: 2,
            last_sync: Some(1700000000123),
            error: None,
        };
        let encoded = serde_json::to_value(status).unwrap();
        assert_eq!(encoded["state"], wire);
        assert!(encoded.get("error").is_none());
        assert_eq!(
            serde_json::from_value::<AccountSyncStatus>(encoded)
                .unwrap()
                .state,
            state
        );
    }
    assert_eq!(
        serde_json::to_value(AccountSyncStatus::default()).unwrap(),
        json!({"state":"local","pending":0})
    );
    assert_eq!(
        serde_json::to_value(GuestHistoryStatus {
            total: 2501,
            available: 2100
        })
        .unwrap(),
        json!({"total":2501,"available":2100})
    );
    assert_eq!(
        serde_json::to_value(GuestHistoryImportResult {
            imported: 3,
            remaining: 2001
        })
        .unwrap(),
        json!({"imported":3,"remaining":2001})
    );
    assert!(
        serde_json::from_value::<GuestHistoryStatus>(
            json!({"total":3,"available":2,"owner_id":"1"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<GuestHistoryImportResult>(
            json!({"imported":3,"remaining":0,"success":true})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<AccountSyncStatus>(json!({"state":"synced","pending":0})).is_err()
    );
    assert!(
        serde_json::from_value::<AccountSyncStatus>(
            json!({"state":"local","pending":0,"token":"private"})
        )
        .is_err()
    );
    for action in ["sync", "import_guest_history"] {
        let command: AccountCommand = serde_json::from_value(json!({"action":action})).unwrap();
        assert_eq!(
            serde_json::to_value(command).unwrap(),
            json!({"action":action})
        );
        assert!(
            serde_json::from_value::<AccountCommand>(json!({"action":action,"unexpected":true}))
                .is_err()
        );
        assert!(
            serde_json::from_value::<AccountCommandRequest>(
                json!({"owner_id":"1","command":{"action":action}})
            )
            .is_err()
        );
    }
    assert_eq!(
        LibraryError::SyncQueueFull.code(),
        "LIBRARY_SYNC_QUEUE_FULL"
    );
    assert_eq!(
        LibraryError::NotImplemented.code(),
        "LIBRARY_NOT_IMPLEMENTED"
    );
    assert_eq!(
        AccountError::NotImplemented.code(),
        "ACCOUNT_NOT_IMPLEMENTED"
    );
}

#[tokio::test]
async fn registered_favorites_commit_and_invalid_owner_does_not_consume_an_operation() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let session = store
        .write_session(LibraryWriteSessionRequest::default())
        .await
        .unwrap();
    let identity = LibraryOperationIdentity {
        session_id: session.session_id,
        operation_id: "1".into(),
    };
    for (index, wire) in [
        favorite("", true),
        favorite("", false),
        json!({"action":"clear","kind":"favorites"}),
        json!({"action":"remove","kind":"favorites","series_id":"123"}),
    ]
    .into_iter()
    .enumerate()
    {
        let change: LibraryChange = serde_json::from_value(wire).unwrap();
        assert!(!change.is_history());
        let operation = LibraryOperationIdentity {
            operation_id: (index + 1).to_string(),
            ..identity.clone()
        };
        let result = store
            .apply_operation(operation.clone(), change.clone())
            .await
            .unwrap();
        assert!(matches!(
            result.outcome,
            hongguo_core::library::LibraryOperationOutcome::Committed { .. }
        ));
        let replay = store.apply_operation(operation, change).await.unwrap();
        assert_eq!(result.outcome, replay.outcome);
        assert!(store.snapshot().await.unwrap().entries.is_empty());
    }
    let wrong: LibraryChange = serde_json::from_value(favorite("1", true)).unwrap();
    assert_eq!(
        store.apply(wrong).await.err(),
        Some(LibraryError::OwnerChanged)
    );
    let mut invalid = favorite("", true);
    invalid["drama"]["series_id"] = json!("invalid");
    assert_eq!(
        store
            .apply(serde_json::from_value(invalid).unwrap())
            .await
            .err(),
        Some(LibraryError::InvalidInput)
    );
    let history = serde_json::from_value(json!({"action":"clear","kind":"history"})).unwrap();
    let result = store
        .apply_operation(
            LibraryOperationIdentity {
                operation_id: "5".into(),
                ..identity
            },
            history,
        )
        .await
        .unwrap();
    assert!(matches!(
        result.outcome,
        hongguo_core::library::LibraryOperationOutcome::Committed { .. }
    ));
}

#[tokio::test]
async fn account_library_commands_reject_guest_or_stale_scope_without_publishing_counts() {
    let tmp = Temp::new();
    let store = LibraryStore::open(tmp.0.join("guest.sqlite3"))
        .await
        .unwrap();
    let service = AccountService::open(&tmp.0, store).await.unwrap();
    let before = service.state().await.unwrap();
    let wire = serde_json::to_value(&before).unwrap();
    assert!(wire["account"].get("guest_history").is_none());
    assert!(wire.get("import_history").is_none());
    assert_eq!(
        wire["account"]["sync"],
        json!({"state":"local","pending":0})
    );
    for command in [
        AccountCommand::Sync {},
        AccountCommand::ImportGuestHistory {},
    ] {
        for (owner, epoch, expected) in [
            (
                "1",
                before.account.owner_epoch.as_str(),
                AccountError::OwnerChanged,
            ),
            ("", "stale", AccountError::OwnerChanged),
            (
                "",
                before.account.owner_epoch.as_str(),
                AccountError::IdentityMismatch,
            ),
        ] {
            assert_eq!(
                service
                    .command(AccountCommandRequest {
                        owner_id: owner.into(),
                        owner_epoch: epoch.into(),
                        command: command.clone()
                    })
                    .await
                    .err(),
                Some(expected)
            );
            assert_eq!(service.state().await.unwrap(), before);
        }
    }
}
