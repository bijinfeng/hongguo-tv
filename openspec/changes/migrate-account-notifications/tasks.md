# Tasks

## Contract and core

- [x] 1.1 Add account-scoped notification DTOs, bounded validation, stable event IDs, and safe errors in Rust core.
- [x] 1.2 Implement the dedicated versioned SQLite notification store with owner isolation, atomic baseline/item commits, read flags, and 200-item retention.
- [x] 1.3 Implement complete follow/reservation snapshot comparison, first-baseline behavior, deduplication, stale preservation, generation fencing, cancellation, and explicit mark-one/all commands.
- [x] 1.4 Add focused Rust regression tests for guest, owner switch, restart, first check, source transitions, partial failure, cap, idempotency, and late responses. Core and service boundaries cover first check, transitions, owner separation, durable restart state, read validation, stale preservation, retention, cancellation, and late-response fencing.

## Transport and client

- [x] 2.1 Add GET/POST HTTP routes and generated OpenAPI/TypeScript DTOs with strict body/method/error handling.
- [x] 2.2 Add native bridge parity and lifecycle/cancellation tests using the same core use case.
- [x] 2.3 Add `core-client` notification query/mutation wrappers with owner/generation fencing and unknown acknowledgement handling.

## Shared UI

- [x] 3.1 Add the shared `UpdateNotifications` controller and account activity tab state for loading, empty, populated, stale, error, pending, and unknown states.
- [x] 3.2 Add the shared notification page/list using existing NSH UI primitives and semantic tokens; use real detail navigation only.
- [x] 3.3 Adapt Desktop and TV density/focus/return behavior without duplicating controller or interaction semantics.
- [x] 3.4 Add state and UI regressions for no background/playback fetch, focus restoration, long text, reduced motion, and real badge gating.

## Review and delivery

- [x] 4.1 Run Rust, HTTP/native parity, core-client, and three-target NSH check/build/test; run strict OpenSpec and codegen checks.
- [x] 4.2 Perform independent functional and UI review against the spec, fixing findings before commit.
- [ ] 4.3 Run formal harness/Desktop/TV real-account acceptance for a real follow or reservation transition, mark-one/all read, restart, and owner isolation; record failures separately and do not substitute fixtures.
- [x] 4.4 Update feature ledger and current validation evidence, make a focused local commit preserving unrelated dirty prototype/docs files, and leave real acceptance gaps explicit.
