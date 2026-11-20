# Tasks

## 1. Core rankings

- [x] 1.1 Implement strict query, typed summaries, dynamic bounded selectors and exact cursors; parser/query tests and fixture README prove order, actor separation, limits and empty/stalled continuation.
- [x] 1.2 Reuse the signed anonymous transport; offline requests prove tab26/18, exact selectors/session/shown, no credentials/register/history and bounded failures/retry/cancellation; add aggregate-only explicit live probe.

## 2. Shared contract

- [x] 2.1 Register strict HTTP/native ranking reads and generated OpenAPI/TS; parity, rejection, sanitized errors and cancellation/session-close tests plus codegen:check pass.

## 3. Integration and review

- [x] 3.1 Complete full verify, strict OpenSpec and independent functional/UI-scope review; record exact live/offline evidence and remaining UI/radar/MVP gates, update ledger and route, and make a focused local commit preserving parallel changes without push/archive.
