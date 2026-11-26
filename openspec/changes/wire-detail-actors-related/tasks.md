# Tasks

## 1. Complete detail contract and parsing

- [x] 1.1 Implement bounded inline/deferred actor and related parsing with independent SeriesDetail DTO, compatible minimal APIs, shared HTTP/native routing and generated exports; verify parser/client/transport regression tests and codegen:check, and document the wire boundary.

## 2. Shared detail ownership and composition

- [x] 2.1 Distinguish complete metadata from episodes-only input, preserve current usable episodes, fence cache writes and expose retry; verify complete-empty, episodes-only, invalid, source/season, lifecycle and late-read state regressions.
- [x] 2.2 Compose actor names/actions and virtualized related works after episodes using shared UI; verify every valid item, hidden empty sections, long labels and guarded exact source return, and document layout/motion inventory.

## 3. Integration acceptance and delivery

- [ ] 3.1 Accept shared production pages against current real anonymous data through the formal entry, then exercise boundary cases with explicit HTTP fixtures in the harness/macOS and the TV input adapter, covering actor and related layered return, later items, empty/long data and season changes in light/dark and large text; record actual screenshots and limitations with independent functionality and visual review.
- [x] 3.2 Run strict OpenSpec validation and full project verification, reconcile ledger/roadmap/validation with final evidence, and create scoped local commits while preserving unrelated edits; verify clean task diff and report push state.

2026-11-16：Web fixture 4/4 与 TV 输入适配 light 53/53、dark 53/53、large-text 54/54 通过；正式匿名 macOS 流程因锁屏停在首页，3.1 保持未勾选。验收脚本修复了隔离 Manifest 的 `app_name` 与 NSH 生成资源目录，见[详情演员与相关作品批次](../../../docs/history/2026-11-16/detail-actors-related.md)。
