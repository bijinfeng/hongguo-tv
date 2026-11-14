# Design

## Context

See proposal.md. `Search` already owns one responsive result List, focus restoration and recent-search controls. `createStore` captures the mounted core transport and NSH resource supports keyed ownership/cancellation. Rust supplies bounded SearchDiscovery with separate guesses and short/comic boards; no new backend contract is required. The authoritative composition is prototype app.js discoverPage and tv.js tvSearch, not the legacy discovery layout.

## Goals / Non-Goals

**Goals:** Connect real optional discovery with one store resource and the existing cards/chips, retain result pagination and route focus, and verify pointer/keyboard/remote behavior in the shared implementation.

**Non-Goals:** Typed autocomplete, category/sort filters, recommendation feeds, account selectors, fake popularity, a second UI system or new persistent state. These remain tracked MVP capabilities.

## Decisions

1. Add a resource keyed by active search with empty submitted query, using the store's captured request and generated SearchDiscovery type. Resource owns cancellation and stale result isolation; a read-only last-success display snapshot survives source disabling so detail return can restore existing card refs before the refreshed response. This snapshot is local to the mounted store; Rust owns the timed public-result cache, with no custom client TTL or singleton. Preserve successful available data during retry and distinguish initial load/empty/error. Navigation, submit and disposal must cancel the owned work.
2. Keep recent chips unchanged; bounded public guesses use the same compact Controls/Button pattern, activating query or title as a normal submit. Do not turn a keyword/tag into a playable card or send history upstream. Reuse PosterCard for exact-ID board items and existing detail navigation/source focus. Deduplicate cross-board IDs for any combined TV shelf while preserving source ordering.
3. Reuse the existing Search List and its responsive four-column desktop / horizontal TV card sizing for discovery as well as query results, with a separate source key/anchor when needed. Desktop titles accurately name visible short/comic content; TV uses approved “试试这些故事”. Avoid adding rank badges or score labels not in the approved surface. Bounded arrays can use existing Each/Controls; results keep virtualization.
4. Record motion inventory before UI code, using existing Button/PosterCard focus/hover/press tokens and reduced-motion behavior. No mount animation that reorders focus; loaded content must not automatically focus a new card. Loading/error copy stays concise and uses existing Notice and retry semantics.
5. NSH Toolbar exposes no public way to choose a noncurrent roving stop before ref.focus. Use ui-owned CardControls for stable-slot Search rows only: one Tab stop, arrow/Home/End navigation scoped to real focus, pressed/ref target becomes current before navigation/focus, cleanup removes bindings and members. Preserve PosterCard's appearance and BaseButton fallback elsewhere. Registration order is navigation order; arbitrary member reorder is outside this narrow control's contract.
6. Public guesses belong below the existing discovery heading, grouping them with the poster content rather than local recent keywords. Shared navigation pages expose a public depth ID. Only after a depth decrease does Android's TvRemote keep reconciling the covered source on actual pre-draws, including when refetch replaces its native View; reconnect only by exact public testID in visible enabled targets, then consume the resurfaced layer once. User keys cancel pending restoration, including a key whose collection first notices the return. Unchanged reconciliation does not invalidate and create a render loop. Ordinary query replacement cannot reconnect by ID; no cross-View match by title or platform-specific business logic.

## Risks / Trade-offs

- Resource undefined/route transitions → test abort-ignoring transport and newer loads, submit/detail/navigation/disposal.
- Shared List can mix discovery/results anchors → preserve query pagination guards and use stable source identity in restoration tests.
- Multiple boards and long title chips can overcrowd 1180×780/TV large text → real host light/dark matrix and typography/spacing/focus review; no extra descriptions.
- Fixture addition changes all host traffic → update all existing offline fixture servers explicitly, retain malformed/failure states and native packaging restore checks.

## Migration Plan

Add state and tests, then shared UI and host scenarios. Run three-entry check/build/tests, Web and macOS 1180×780/1440×1000 light/dark, and TV fixture matrix with actual native APK/device restoration. Obtain independent functional/UI reviews, record exact limits and commit only this slice. No push/archive/publish; rollback removes this consumer without touching persisted history or core discovery.
