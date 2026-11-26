# Tasks

## 1. Core storage and playback accounting

- [x] 1.1 Implement owner-scoped, versioned local statistics storage with daily totals, type/genre buckets, 366-day pruning and atomic writes; verify restart, corruption, retention and history isolation with Rust tests.
- [x] 1.2 Implement bounded idempotent batches, reset revision fencing and actual advancing playback collector across pause, buffering, seeking, background and owner changes; verify duplicate, lost-response and lifecycle tests.

## 2. Contracts and transports

- [x] 2.1 Add strict statistics DTOs and GET/POST/DELETE HTTP and native routes with owner/epoch validation and sanitized errors; regenerate OpenAPI/TypeScript and verify `codegen:check` plus parity tests.
- [x] 2.2 Add core-client validation and an explicit batch recovery API that never infers duration from history or silently reposts an uncertain batch; verify malformed dates, integers, genres, scope and reset responses.

## 3. Shared app and UI

- [x] 3.1 Connect the real Player activity stream to the statistics controller while preserving the existing history writer and shutdown drain; verify no progress-only, paused, background or seek-only samples count.
- [x] 3.2 Add the shared History statistics entry/page with summary periods, type/genre data, loading/empty/error/retry states and reset confirmation; verify desktop/TV shared semantics, focus restoration, light/dark and large text constraints.

## 4. Review and delivery

- [x] 4.1 Complete functional and UI source review, fix confirmed issues, run targeted checks and frozen full `pnpm verify`; retain any real-data or host gaps.
- [ ] 4.2 Use the formal harness/Desktop/TV entries with real playback to observe accumulation, restart recovery and reset without deleting history; retain de-identified evidence and leave unsupported hosts unchecked.
- [x] 4.3 Update feature ledger, VALIDATION and history evidence, run hooks, stage only this batch and create a focused local commit without pushing.
