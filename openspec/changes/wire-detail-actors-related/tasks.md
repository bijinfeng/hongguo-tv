# Tasks

## 1. Complete detail contract and parsing

- [x] 1.1 Implement bounded inline/deferred actor and related parsing with independent SeriesDetail DTO, compatible minimal APIs, shared HTTP/native routing and generated exports; verify parser/client/transport regression tests and codegen:check, and document the wire boundary.

## 2. Shared detail ownership and composition

- [x] 2.1 Distinguish complete metadata from episodes-only input, preserve current usable episodes, fence cache writes and expose retry; verify complete-empty, episodes-only, invalid, source/season, lifecycle and late-read state regressions.
- [x] 2.2 Compose actor names/actions and virtualized related works after episodes using shared UI; verify every valid item, hidden empty sections, long labels and guarded exact source return, and document layout/motion inventory.

## 3. Integration acceptance and delivery

- [x] 3.1 Exercise shared production pages with explicit HTTP fixtures in Web/macOS and the TV input adapter, covering actor and related layered return, later items, empty/long data and season changes in light/dark and large text; record actual screenshots and limitations with independent functionality and visual review.
- [ ] 3.2 Run strict OpenSpec validation and full project verification, reconcile ledger/roadmap/validation with final evidence, and create scoped local commits while preserving unrelated edits; verify clean task diff and report push state.
