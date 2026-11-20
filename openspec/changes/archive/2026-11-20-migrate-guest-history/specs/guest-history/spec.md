# Spec Delta

## Purpose

Provide durable guest watch history and resume positions through the shared Rust core and existing library API, independently of visual design, legacy runtimes, live accounts and playback resolution.

## ADDED Requirements

### Requirement: Durable guest progress

The system SHALL persist explicit progress updates, keep one entry per exact series ID and return entries ordered by latest committed viewing time. Reads and media resolution SHALL NOT create history. New data SHALL survive process restart in an explicitly configured private data directory.

#### Scenario: Resume after restart

- **WHEN** valid progress is saved twice for a series and the process restarts
- **THEN** the latest episode, video ID, position, duration and completion state are restored as one entry

#### Scenario: No premature history

- **WHEN** a user searches, opens details or resolves playback without actual viewing
- **THEN** no history entry is written by those operations or the shared playback session

### Requirement: Validated compact records

The system SHALL validate exact decimal IDs of 1–32 digits, episode numbers 1–10000 and finite time values 0–86400 seconds. Persisted drama summaries SHALL omit full episode data, retain at most 1000 description characters and 8 tags. Invalid actions, top-level unknown fields and wrong field types SHALL fail without modifying records.

#### Scenario: Compact large detail

- **WHEN** progress includes full episode details, a long description and many tags
- **THEN** only the compact drama summary and current video identity are persisted

#### Scenario: Invalid update

- **WHEN** an update has invalid IDs, episode/time values or unsupported fields/actions
- **THEN** the request fails with a sanitized stable error and previous history remains intact

### Requirement: Transactional mutation and scoped deletion

The system SHALL expose a new snapshot only after its mutation commits. It SHALL support idempotent removal of one history item and clearing guest history. Database failure SHALL preserve the previous committed state and return an actionable error.

#### Scenario: Failed write and concurrent writers

- **WHEN** a write fails or independent clients write concurrently
- **THEN** failed writes expose no partial state and successful writes do not lose unrelated committed entries

#### Scenario: Remove or clear

- **WHEN** a caller removes an existing or missing series, or clears history
- **THEN** only the selected guest history is removed and repeating the operation succeeds

### Requirement: Safe initialization and guest identity

The system SHALL refuse corrupt, foreign or newer-schema databases without resetting them, initialize storage before readiness and never read legacy client files. Guest library calls with nonempty owner identity SHALL fail. Account, cloud synchronization, favorites and likes SHALL remain unavailable.

#### Scenario: Incompatible storage

- **WHEN** the configured database is corrupt, belongs to another application or has a newer version
- **THEN** startup fails before publishing ready and existing data is preserved

#### Scenario: Owner mismatch

- **WHEN** a caller supplies a nonempty owner_id to the guest library
- **THEN** it receives a conflict error and no guest records change

### Requirement: Compatible transport and generated contracts

Library GET/POST SHALL use generated Rust DTOs and the existing envelope. Exact Host/Origin checks, JSON requirements and the 32 KiB request limit SHALL remain enforced. Responses SHALL disable caching and capability reporting SHALL distinguish available guest history from unavailable account/playback.

#### Scenario: Shared clients and offline verification

- **WHEN** Web, desktop and TV run their shared behavior tests with local data
- **THEN** existing history semantics remain compatible, generated contracts have no drift, and tests need neither Go nor live accounts
