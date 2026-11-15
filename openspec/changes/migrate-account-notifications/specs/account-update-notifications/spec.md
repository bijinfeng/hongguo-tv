# Account Update Notifications

## ADDED Requirements

### Requirement: Notifications are account scoped and locally owned

The system SHALL store update notifications and their source baselines in Rust-owned local storage bound to the verified account UID. Guest sessions and accounts without valid credentials SHALL receive a login-required result and SHALL NOT create synthetic notifications. Account A, account B, logout, and restart SHALL never expose each other's notification items or unread counts.

#### Scenario: Reopen restores only the signed-in account

- **WHEN** a signed-in account is reopened after the application restarts
- **THEN** its committed notification items, read flags, checked time, and baseline are restored
- **AND** no credentials or notifications from another UID are read

#### Scenario: Guest cannot create notifications

- **WHEN** a guest requests a notification refresh or mark-read operation
- **THEN** the service returns the standard login-required error
- **AND** the local notification store remains unchanged

### Requirement: Refresh compares complete real source snapshots

The system SHALL refresh only from a foreground explicit request and SHALL compare complete real follow and reservation snapshots from the existing account-scoped services. Events SHALL use stable source identities and SHALL not be inferred from incomplete data.

#### Scenario: First check establishes a baseline

- **WHEN** an account performs its first successful refresh
- **THEN** the complete follow and reservation baselines are saved
- **AND** no historical item is emitted as a new notification

#### Scenario: Follow update creates an item

- **WHEN** a later complete follow snapshot changes the real episode count or update time for the same series
- **THEN** one stable follow-update event is stored with the available real drama summary
- **AND** the item does not contain a guessed video ID, episode list, or playback URL

#### Scenario: Reservation becomes online

- **WHEN** the same reservation identity changes from offline/upcoming to online in a complete reservation refresh
- **THEN** one reservation-online event is stored
- **AND** a changed identity or partial reservation response does not create an event

### Requirement: Bounded durable item behavior

The system SHALL retain at most 200 deduplicated notification items per account, preserve explicit read flags, and expose items in newest-first order with a stable event ID. Automatic retention SHALL remove only the oldest items beyond the cap. The store SHALL commit item and baseline updates atomically.

#### Scenario: Duplicate refresh is idempotent

- **WHEN** the same source snapshots are refreshed repeatedly
- **THEN** no duplicate event ID is added
- **AND** the unread count remains unchanged

#### Scenario: Retention caps the store

- **WHEN** more than 200 distinct events are committed
- **THEN** only the newest 200 remain
- **AND** their read state and stable IDs remain valid

### Requirement: Stale and partial failure are explicit

If any required source read fails, times out, is cancelled, or is incomplete, the system SHALL preserve the last committed items and source baseline for that source, return `stale=true` with a safe error, and SHALL NOT advance a partial baseline. A successful refresh SHALL return the actual `checked_at` and `unread_count` from the committed local snapshot.

#### Scenario: Refresh failure preserves old data

- **WHEN** a follow or reservation source cannot be read completely
- **THEN** the previous items and baseline remain available
- **AND** the response is marked stale and does not claim a new event

### Requirement: Read operations are explicit and idempotent

The system SHALL support marking one stable item ID read and marking all current items read. Repeating either operation SHALL be idempotent. The API SHALL not expose clear/delete notifications or automatic repeated writes after an unknown acknowledgement.

#### Scenario: Mark one item read

- **WHEN** a valid item ID is submitted for mark-read
- **THEN** only that item is committed as read and the returned unread count decreases accordingly

#### Scenario: Mark all read

- **WHEN** the all-read command is submitted
- **THEN** every current item is committed as read
- **AND** no item or baseline is deleted

### Requirement: Shared quiet UI

The app SHALL provide one shared update-notifications controller and page for Web, Desktop, and TV. The page SHALL show loading, empty, populated, stale/error-with-retry, and pending/unknown read states. The unread badge SHALL appear only when it comes from a successful real notification snapshot. The page SHALL be reachable from the account activity tabs, keep focus/keyboard/DPAD semantics, and SHALL not fetch while playback is active, the app is backgrounded, or a modal is open.

#### Scenario: Read failure keeps the list

- **WHEN** a refresh fails after a previous snapshot exists
- **THEN** the previous rows remain visible with a retry affordance and stale indication
- **AND** the list does not replay an entrance animation

#### Scenario: TV and Desktop use the same semantics

- **WHEN** the user opens update notifications on Desktop or TV
- **THEN** the same item actions and state labels are used
- **AND** only density, pointer hover, and DPAD focus layout differ
