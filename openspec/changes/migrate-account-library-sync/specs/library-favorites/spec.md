# Spec Delta

## Purpose

Let guests keep local favorites and authenticated users synchronize account favorites through the same formal product controls. Keep membership independent of viewing progress, preserve exact identities and expose durable local results separately from cloud confirmation.

## ADDED Requirements

### Requirement: Favorite membership is independent

The system SHALL persist favorite membership independently of history. Guest favorites SHALL stay local; account favorites SHALL belong only to the verified account. Favoriting, browsing and resolving a drama MUST NOT create playback progress.

#### Scenario: Favorite an unwatched drama

- **WHEN** a guest or account favorites a drama that has never been played
- **THEN** it appears in that owner's favorites after durable commit and restart
- **AND** it does not appear as watched history or alter another owner's records

### Requirement: Favorite changes use durable registered operations

Favorite add and cancel SHALL accept an explicit desired boolean state for an exact series and share the existing registered-operation ordering and terminal receipts. Ambiguous delivery MUST remain unresolved until the original operation is proven terminal.

#### Scenario: Favorite response is lost

- **WHEN** a local favorite transaction may have committed but its receipt was lost
- **THEN** the application reconciles the exact operation instead of blindly toggling or claiming rollback
- **AND** its receipt cannot overwrite a newer owner or mutation

### Requirement: Account favorites reconcile safely

Account favorite changes SHALL queue cloud writes while remaining available offline. A complete validated remote membership snapshot SHALL update unprotected membership; pending local favorite changes and local hidden markers MUST remain protected.

#### Scenario: Remote membership omits a favorite

- **WHEN** a complete valid cloud snapshot no longer contains a previously synchronized favorite
- **THEN** unprotected local membership is removed
- **AND** incomplete snapshots or pending local additions cannot erase it

### Requirement: Clear and cancel have different scope

Single-item account favorite cancellation SHALL queue remote cancellation. Clearing favorites SHALL hide them on this device only and MUST NOT create bulk remote cancellation. Confirmation copy SHALL state the applicable scope and clearing SHALL preserve viewing history.

#### Scenario: Clear account favorites locally

- **WHEN** the user confirms clearing this device's favorites
- **THEN** they stay hidden after later pulls without newly requested remote cancellations
- **AND** existing history and previously admitted cloud operations remain intact

#### Scenario: Cancel one account favorite

- **WHEN** the user explicitly cancels a favorite for one exact series
- **THEN** local membership and its remote-cancellation operation commit together
- **AND** failure to upload remains visible and retryable

### Requirement: Formal detail and library entrances

Shared detail and library entrances SHALL expose the active owner's favorite state, list and recovery actions. They SHALL preserve source navigation, existing history management and readable content on failures. Favorite, follow-update and reservation states MUST remain distinct.

#### Scenario: Open a favorite and return

- **WHEN** the user opens a favorite's detail and navigates back
- **THEN** the list restores the same surviving identity and reading position
- **AND** an unavailable drama remains a favorite with a recoverable metadata state

### Requirement: Accessible feedback preserves intent

Favorite controls and lists SHALL work with keyboard and TV navigation, light/dark themes, large text and reduced motion. Feedback SHALL distinguish local commitment from pending cloud work; recycling, synchronization and hidden pages MUST NOT steal focus or replay list entrance motion.

#### Scenario: Remove a focused favorite

- **WHEN** the focused favorite is removed from a virtualized list
- **THEN** focus moves to a revealed surviving neighbor or the empty-state action only while the operation still owns focus
- **AND** newer input, navigation, owner changes or backgrounding cancel delayed restoration
