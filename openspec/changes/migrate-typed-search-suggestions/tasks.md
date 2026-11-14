# Tasks

## 1. Core protocol and bounded normalization

- [x] 1.1 Add typed suggestion input/results and bounded parser using pinned upstream behavior, with documented synthetic input/expected fixtures and tests for exact IDs, kinds, fallback, duplicates, unsupported content, metadata limits and malformed envelopes.
- [x] 1.2 Add the anonymous website read using existing client bounds and cancellation; prove empty/invalid input never networks, fixed URL/privacy, retries/verification/redirect/size/deadline limits and cancellation by targeted core tests.

## 2. Shared transport contract and delivery

- [x] 2.1 Expose strict only-q HTTP/native read routes, generate OpenAPI/TS aliases, and verify equivalent success/error/invalid-body/method/parameter behavior plus native cancellation and session closure without writes.
- [x] 2.2 Run full verify, clippy and strict/codegen/diff checks; obtain independent function and UI-scope reviews, append actual evidence/remaining UI and MVP gaps, preserve parallel documents and commit this slice locally without push/archive/publish.
