# Spec Delta

## Purpose

Keep an authenticated user's history and playback progress consistent across local storage and the reference cloud service, without losing offline changes or crossing account boundaries. Preserve existing data and expose honest pending, failed and completed synchronization states.

## ADDED Requirements

### Requirement: Existing library data survives upgrade

The system SHALL upgrade existing guest v2 and account v3 libraries without losing history, recent searches or owner identity. Invalid, foreign-owner, corrupt or unsupported databases MUST remain preserved and fail closed.

#### Scenario: Upgrade populated libraries

- **WHEN** existing guest and account libraries are upgraded and reopened
- **THEN** their original records, timestamps, search order and distinct ownership remain intact
- **AND** failed migration publishes no partial schema or empty replacement library

### Requirement: Cloud access uses the active verified account

The system SHALL use only credentials bound to the active verified UID. Credentials, private responses and signing material MUST remain inside the core; a caller-supplied owner MUST NOT select credentials or another account's library.

#### Scenario: Missing credentials or wrong owner

- **WHEN** synchronization is requested without valid credentials or for a stale owner scope
- **THEN** it fails before network access without changing records or pending work

### Requirement: Pull completes before reconciliation and upload

The system SHALL validate complete history and favorite membership snapshots before reconciliation and upload. Incomplete or repeated pagination and malformed membership MUST NOT erase records, acknowledge work or report a successful sync.

#### Scenario: Partial history or missing favorites

- **WHEN** a later history page fails or the favorites response omits its required list
- **THEN** the previous library, pending operations and successful-sync timestamp remain unchanged

#### Scenario: Card metadata is unavailable

- **WHEN** membership is complete but optional card metadata is temporarily unavailable
- **THEN** membership remains available with existing data or a retryable placeholder
- **AND** metadata with a conflicting identity fails reconciliation

### Requirement: Durable outbox acknowledges exact work

Account progress and favorite changes SHALL persist with their pending cloud operation atomically. Replacement of the same kind and series SHALL receive a new identity. Only confirmed success for the exact operation SHALL remove it; history and progress uploads both MUST succeed before progress acknowledgement.

#### Scenario: Old upload finishes after replacement

- **WHEN** a newer local operation replaces an operation whose upload is still running
- **THEN** the old acknowledgement cannot remove the replacement

#### Scenario: Partial upload or failed acknowledgement

- **WHEN** history upload succeeds but progress upload fails, or acknowledgement cannot be persisted
- **THEN** pending work survives restart and can be retried without reporting full success

### Requirement: Progress conflicts use original viewing time

Reconciliation SHALL prefer strictly newer viewing timestamps and supersede only matching stale progress operations. Equal or older remote progress MUST NOT replace local progress; favorite operations MUST remain independent.

#### Scenario: Newer remote viewing conflicts with offline progress

- **WHEN** remote viewing is newer than a pending local checkpoint
- **THEN** remote progress replaces that checkpoint and only its stale progress operation is removed
- **AND** a newer local checkpoint committed during the pull remains protected

### Requirement: Local hiding is not remote deletion

History removal and clearing SHALL hide records locally without requesting remote history deletion. Local hidden records MUST NOT return on the next pull; genuine new viewing SHALL allow new history normally.

#### Scenario: Pull after removing history

- **WHEN** cloud history still contains a locally removed record
- **THEN** it stays hidden locally and no remote deletion is sent
- **AND** later actual viewing can create a fresh record

### Requirement: Cancellation and owner epochs fence synchronization

Synchronization SHALL be bounded and serialized per account scope. Logout, owner transition or host shutdown SHALL cancel network work; late results MUST NOT merge, acknowledge, update credentials or publish status in a replacement scope, including A-to-B-to-A transitions.

#### Scenario: Old sync returns after switching accounts

- **WHEN** a previous account's response arrives after logout or a new owner epoch
- **THEN** it cannot change the active account, library, credentials or sync status

### Requirement: Formal sync states and real acceptance

The account page SHALL expose local, pending, syncing, failed and successful-sync information with explicit retry, retaining readable records on failure. Real cloud writes during agent acceptance MUST require explicit user authorization for the account and operations; fixtures SHALL count only as boundary evidence.

#### Scenario: Unauthorized or failed real acceptance

- **WHEN** real-write authorization is absent or a real cloud step fails
- **THEN** no unapproved cloud write is attempted and the missing or failed acceptance remains recorded
- **AND** passing offline tests cannot mark the real flow accepted
