# Tasks

## 1. Source and durable core

- [x] 1.1 Implement fixed bounded dual-source RadarService, exact optional DTO/parser and versioned private atomic cache; verify fallback, deadlines, size/date/identity/metric bounds, partial/stale/restart/corruption/write-failure/cancel ordering with Rust tests and document cache ownership.

## 2. Shared transport

- [x] 2.1 Wire strict GET /api/v1/radar through HTTP, native and data-dir startup without changing existing constructors; generate OpenAPI/TS and verify input/error/no-store/cancel/close parity and corrupt-cache preservation with transport tests.

## 3. Shared product UI

- [x] 3.1 Deliver approved official/radar separation, shared table, exact-ID join/format/stable sort, independent dates/failures and truthful detail navigation/return; verify lifecycle/newer intent, missing/zero/negative/extreme metrics, wrong identity and read-only behavior in deterministic tests and update the prototype's unsupported daily-normalization copy.

## 4. Integration acceptance

- [x] 4.1 Run final three-target check and build, relevant regression tests, pnpm verify and strict OpenSpec validation; retain failure evidence and bind results to current main-workspace sources.
- [ ] 4.2 Inspect real Web/macOS and production-adapter TV input in light/dark/large text, review function and visual fidelity/completeness, record actual motion/accessibility/physical-device limits and restoration evidence, update ledger/roadmap/validation and make a feature-only local commit without push.
