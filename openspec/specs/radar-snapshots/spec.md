# radar-snapshots Specification

## Purpose
Let viewers browse the source-backed third-party rank and growth snapshots independently of official dynamic rankings, preserving exact identities and honest freshness, failure and missing-value states across supported hosts.

## Requirements

### Requirement: Fixed bounded snapshot sources

The system SHALL read only the fixed upstream mirror and raw GitHub rank/growth files, with a 5 MiB per-response limit, 6-second request timeout and a shared 13-second network deadline including queue time. Each branch SHALL independently fall back on transport, status, size or parse failure. It MUST NOT expose arbitrary URL fetching or social fields.

#### Scenario: One source fails

- **WHEN** the mirror returns invalid rank data while growth succeeds
- **THEN** ranks tries the fixed raw source independently and growth is retained

#### Scenario: Caller cancels

- **WHEN** a read is cancelled before cache commit
- **THEN** no detached fetch or fallback continues and no late caller result is delivered

### Requirement: Exact normalized source values

The system SHALL preserve exact decimal series IDs, valid source dates, optional numeric absence, explicit zero and negative increments. Int64 metrics MUST cross JavaScript boundaries as decimal strings. It SHALL reject malformed or oversized data, deduplicate by exact ID, retain source rank without inventing a rank, and exclude likes, watch flags and scores.

#### Scenario: Missing and large metrics

- **WHEN** source rows include missing metrics, zero, negative growth and an int64 beyond the JavaScript safe range
- **THEN** each remains distinct without numeric rounding or daily normalization

### Requirement: Independent durable fallback

The system SHALL persist normalized rank/growth branches and their independent fetch times in a versioned product-owned cache. Failed branches retain prior data/time as stale; any valid branch remains usable. Corrupt or incompatible files MUST be preserved and reported. Failed atomic writes MUST preserve the prior file and expose a cache-save failure rather than claim durable success.

#### Scenario: Partial refresh after restart

- **WHEN** only ranks refreshes after opening a valid persisted cache
- **THEN** fresh ranks and the prior stale growth are returned with their own original dates and times

#### Scenario: Both branches unavailable

- **WHEN** both sources fail and there is no valid cached branch
- **THEN** a sanitized recoverable error is returned

### Requirement: Shared truthful radar browsing

The system SHALL retain official rankings and provide separate snapshot/growth views with category, type and stable metric sorting. Snapshot metrics SHALL join growth by exact ID and expose differing branch dates. Zero, negatives and missing values SHALL remain visible, and stale/absent branches SHALL be reported independently. The interface SHALL use the shared component package and approved desktop/TV layout.

#### Scenario: Growth is missing

- **WHEN** rank snapshots are available without growth
- **THEN** ranks remain browsable and missing joined metrics display a dash instead of fabricated zero

### Requirement: Identity-bound detail navigation

Activating a row SHALL fetch the exact series ID and validate the returned identity before navigating. Selection MUST NOT prepare media or write history. Hidden/background/disposed state and newer intent SHALL reject late navigation. Returning SHALL restore the exact row while preserving newer user focus intent.

#### Scenario: Wrong or late identity

- **WHEN** detail returns another ID or an earlier selection completes after a newer selection
- **THEN** the stale or mismatched result cannot navigate or change playback/history

### Requirement: Transport and host parity

HTTP and native SHALL expose the same strictly read-only snapshot contract, sanitized failures, cancellation and close behavior. Verification SHALL include generated contracts, checks and builds for all three targets, deterministic behavior and real graphical keyboard/TV input observations. Unverified accessibility and release boundaries MUST remain explicit, and physical-device gaps MUST be recorded as platform limits rather than MVP blockers.

#### Scenario: Unsupported input

- **WHEN** a caller supplies a query, body or unsupported method to the snapshot endpoint
- **THEN** it is rejected consistently without fetching an alternate source

#### Scenario: MVP acceptance hosts

- **WHEN** graphical keyboard or DPAD input exercises the snapshot views
- **THEN** the observation may be taken on macOS or on the fixed API34 arm64 emulator and counts as this capability's host acceptance
- **AND** missing physical-device decoding, 4K and viewing-distance coverage is recorded as a platform limit, not as an open MVP blocker
