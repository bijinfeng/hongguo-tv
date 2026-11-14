## 1. Anonymous core

- [x] 1.1 Implement strict channel/context query and bounded feed parser with vector fixtures; tests cover exact IDs, phase switch, disabled/unsupported/duplicate records, empty advancing pages and malformed/oversized data.
- [x] 1.2 Reuse anonymous signing transport for category/feed, add cancellable fixed endpoint service and explicit counts-only probe; offline tests prove query/signature/privacy/retry/deadline/cancellation and category compatibility, document probe outcome.

## 2. Shared contract

- [x] 2.1 Add read-only HTTP/native route and generated contracts; codegen/check and parity tests verify strict input, no-store, sanitized failure, no media exposure, cancellation/session close and no history writes.

## 3. Integration

- [x] 3.1 Complete independent functional and UI-boundary reviews, full verify/strict OpenSpec; record exact evidence and remaining UI/platform scope, update ledger/roadmap and make a focused local commit preserving parallel changes without push/archive.
