# Spec Delta

## MODIFIED Requirements

### Requirement: Transport and host parity

HTTP and native SHALL expose the same strictly read-only snapshot contract, sanitized failures, cancellation and close behavior. Verification SHALL include generated contracts, checks and builds for all three targets, deterministic behavior and real graphical keyboard/TV input observations. Unverified accessibility and release boundaries MUST remain explicit, and physical-device gaps MUST be recorded as platform limits rather than MVP blockers.

#### Scenario: Unsupported input

- **WHEN** a caller supplies a query, body or unsupported method to the snapshot endpoint
- **THEN** it is rejected consistently without fetching an alternate source

#### Scenario: MVP acceptance hosts

- **WHEN** graphical keyboard or DPAD input exercises the snapshot views
- **THEN** the observation may be taken on macOS or on the fixed API34 arm64 emulator and counts as this capability's host acceptance
- **AND** missing physical-device decoding, 4K and viewing-distance coverage is recorded as a platform limit, not as an open MVP blocker
