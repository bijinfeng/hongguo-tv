# Spec Delta

## Purpose

Let users manage their real guest watch history while preserving committed progress, honest failure recovery and exact navigation context. Deletion is local to guest history and remains compatible with later viewing, existing transports and the full product roadmap.

## ADDED Requirements

### Requirement: Guest management uses authoritative records

The system SHALL offer management for successfully loaded guest history, using exact series identities and the same committed records as home and resume. Unknown ownership or a nonempty account owner MUST NOT be treated as guest deletion permission. Loading and read failures MUST remain distinct from empty history.

#### Scenario: Loaded guest history

- **WHEN** a guest history snapshot contains watched dramas
- **THEN** the user can enter and finish management from viewing history
- **AND** ordinary browsing and resume continue to use those records without creating viewing progress

#### Scenario: Unavailable or different owner

- **WHEN** history has not loaded successfully or its owner is not the guest
- **THEN** guest destructive actions cannot submit
- **AND** existing readable records and an applicable recovery path are retained without fabricated empty success

### Requirement: Selection preserves exact membership

Management SHALL support individual selection, selecting all currently available records, clearing selection and a mixed state. Selection SHALL use exact series identities, survive virtual row recycling and exclude removed records. Finishing management SHALL clear its selection and restore ordinary browsing.

#### Scenario: Partial selection in a long list

- **WHEN** the user selects some records and scrolls away and back
- **THEN** precisely those records remain selected and the aggregate control indicates partial selection
- **AND** deleting selected records is unavailable when no record is selected

#### Scenario: Leaving management

- **WHEN** the user finishes management or leaves the history page before confirming an operation
- **THEN** selection is cleared and no deletion is submitted
- **AND** returning to ordinary history preserves a valid reading position

### Requirement: Destructive actions require explicit scoped confirmation

Single removal, selected removal and clearing SHALL require explicit confirmation of the exact guest-history scope and loss of saved viewing positions. The safe initial action SHALL be cancellation. Unconfirmed cancellation or Back MUST NOT write. Pending submission SHALL prevent duplicate commitment and MUST NOT close optimistically.

#### Scenario: Cancel a clear confirmation

- **WHEN** the user opens clear confirmation and cancels or presses Back before submission
- **THEN** no mutation is sent and all history remains
- **AND** focus returns to a surviving source

#### Scenario: Confirm only selected records

- **WHEN** the user confirms removal of a displayed selected set
- **THEN** only that confirmed set is submitted with guest ownership and the history category
- **AND** a second activation while that operation is pending does not create a duplicate job

### Requirement: Selected deletion reports sequential partial completion

Selected deletion SHALL submit the confirmed exact identities in their captured display order through existing single-item removal. It SHALL stop at the first failed or unconfirmed result, retain committed successes and preserve the failed and unattempted identities for explicit retry. It MUST NOT report the whole operation as atomic or complete while work remains.

#### Scenario: A middle removal fails

- **WHEN** the first two removals commit and the third fails in a confirmed four-record operation
- **THEN** the first two remain removed and the third and fourth remain recoverable as outstanding work
- **AND** retry submits only outstanding identities without restoring committed successes

#### Scenario: All selected removals complete

- **WHEN** every outstanding removal has a confirmed successful result
- **THEN** the operation reports completion, removes its selection and exposes the committed remaining history

### Requirement: History publication follows mutation order

Progress saves, destructive jobs and checkpoint retries SHALL observe one application mutation order. Each confirmed mutation SHALL publish its returned committed snapshot to history, home and resume. A read started before a newer mutation or for a superseded owner MUST NOT replace that committed state. Read failure SHALL preserve the last known snapshot.

#### Scenario: Old read finishes after deletion

- **WHEN** a read containing a drama completes after a newer successful removal of that drama
- **THEN** the old read cannot reintroduce it into history, home or resume

#### Scenario: Progress is queued before removal

- **WHEN** progress is already queued when removal is confirmed
- **THEN** that progress is ordered before removal and the final committed snapshot reflects removal
- **AND** unrelated progress and records are preserved

### Requirement: Deleted history cannot be revived by superseded checkpoints

A committed removal or clear SHALL supersede older failed checkpoints in its scope, including retries requested for shutdown or application update. An unresolved destructive result MUST NOT allow an old checkpoint to recreate potentially deleted history. Genuine new viewing after deletion SHALL remain able to create and update a record normally.

#### Scenario: Update retries an old failed save

- **WHEN** an earlier save failed, the user subsequently deletes its history and application update requests checkpoint retries
- **THEN** the old save is not sent again and the deleted record remains absent

#### Scenario: Viewing starts again after deletion

- **WHEN** the user genuinely starts a new viewing session after deletion and it produces valid progress
- **THEN** a new history record can be saved and later resumed
- **AND** browsing or merely preparing media still does not create it

### Requirement: Dismissal does not invent transaction rollback

Once deletion is confirmed, dismissing its presentation, backgrounding or leaving the page MUST NOT be reported as undoing committed or already dispatched work. Confirmed work SHALL retain an application owner and expose its eventual result without hidden-page focus changes. Ambiguous transport failure SHALL remain recoverable by reconciliation or idempotent explicit retry.

#### Scenario: Leave while removal is dispatched

- **WHEN** the user leaves history after confirmed removal has been dispatched
- **THEN** its result can update the authoritative history without navigating or stealing focus
- **AND** reopening history exposes the committed result or an honest unresolved failure

#### Scenario: Response is lost after storage commit

- **WHEN** storage may have committed but the client receives no confirmed response
- **THEN** the application does not claim rollback or blindly replay an older checkpoint
- **AND** a fresh authoritative read or idempotent explicit retry can resolve the operation only after the originally dispatched operation is proven terminal; request serialization, a single snapshot or idempotence alone is not that proof

### Requirement: Removal preserves navigable focus and reading position

History management SHALL remain reachable by keyboard and TV navigation across virtualized records. After a focused record is removed, focus SHALL move to the next surviving record at its former position, then the previous record, or an appropriate empty-state action. Restoration SHALL respect the current owner, page lifetime and newer user input.

#### Scenario: Remove a later focused record

- **WHEN** a later virtualized record is removed while its operation still owns focus
- **THEN** a surviving neighboring record is revealed with its complete focus boundary
- **AND** activation uses that record's current identity rather than a recycled slot's old identity

#### Scenario: Newer focus intent wins

- **WHEN** the user moves focus or changes page before delayed removal restoration finishes
- **THEN** the old restoration does not take focus back

#### Scenario: Clear to empty

- **WHEN** clearing removes the final available guest history records
- **THEN** management selection ends, the existing empty-state recovery action is reachable and removed rows retain no focus targets

### Requirement: Management preserves storage and product boundaries

Management SHALL use the existing generated library contract and durable guest store, with owner checks, exact identities, sanitized errors and idempotent removal. It MUST NOT read legacy data, issue account/cloud operations, alter recent searches or fabricate statistics. Restart SHALL preserve committed deletion; this slice MUST NOT imply completion of remaining MVP capabilities.

#### Scenario: Restart after removal or clear

- **WHEN** removal or clear commits through HTTP or native transport and the application restarts
- **THEN** the authoritative guest history still reflects that mutation and unrelated recent searches remain

#### Scenario: Scoped verification

- **WHEN** management is exercised using explicit local fixtures and real guest storage
- **THEN** only permitted library requests occur and no account, cloud, catalog or media side effects are attributed to management itself
- **AND** fixture success is reported separately from live accounts, physical TV, C3.2 and release acceptance
