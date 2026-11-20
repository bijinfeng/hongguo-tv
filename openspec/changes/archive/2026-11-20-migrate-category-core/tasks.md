## 1. Core category

- [x] 1.1 Implement validated category selection, bounded summaries/selectors/cursors and synthetic fixtures with provenance; unit tests prove explicit-all, allowlists, large IDs, malformed/oversized/stalled pages and reference status normalization.
- [x] 1.2 Implement body-bound anonymous Passport request and bounded empty200 retries; pinned signing and loopback tests prove payload/context, fresh identity, privacy, error/deadline/drop cancellation. Document the explicit count-only probe and run it without account state.

## 2. Shared contracts

- [x] 2.1 Add the same strict read-only HTTP/native category route and generated OpenAPI/TS aliases; parity and cancellation/session-close tests prove valid results, rejected inputs/bodies, sanitized failure and no history writes; codegen:check passes.

## 3. Integration and local commit

- [x] 3.1 Complete independent functional/UI-scope reviews and fixes, full verify/clippy and strict OpenSpec; update validation/ledger/roadmap with evidence and limitations, preserve parallel changes and make one focused local commit without push/archive.
