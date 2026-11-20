## Context

The preceding typed suggestion and actor-core changes supply strict read-only HTTP/native DTOs. SearchForm currently unconditionally blurs and store.submit lacks local length validation. The approved prototype header has a native datalist; content pages use four-column posters or TV shelves. NSH Combobox lacks public composition/input-ref/free-submit callbacks needed by this task, so replacing the search input with it would lose existing behavior.

## Goals / Non-Goals

Preserve the established search and navigation while adding typed current-input actions. No new visual identity, dependencies, actor-specific persistence, invented pagination, or changes to core protocol limits. Other planned MVP work stays open.

## Decisions

- App owns a dedicated suggestion controller with captured transport, draft/revision,240ms debounce, composition and active interaction, latest-only cancellation, error/retry/dismissal. UI owns geometry/rows/keyboard/anchoring. Use NSH Input plus Overlay and semantic action rows, not an npm combobox or DOM. Extend existing stable-slot CardControls for vertical action rows and focus reporting; clear a response before replacing it so reordered suggestions do not reuse a stale registration order.
- Desktop's persistent header supports suggestions on browse sections; TV input only on active Search. Pending interaction cancels on loss of input/list ownership, navigation, background or removal. On return, reuse the same current response only if its draft and source still belong; never let async completion set focus.
- Android's thin adapter forwards public focus IDs and newer input intents. Shared UI marks nonmodal occluding collections with `focus-surface-*`; the host excludes covered page stops, including row gaps, without rebuilding UI. Return sources belong to a concrete public navigation-page View as well as depth and item ID, so a new page at the same depth cannot inherit an old source. Pointer/remote intent cancels late page and scroll restoration; programmatic focus does not create user intent.
- Three actions are resolved from kind and explicit valid ID only. Invalid/missing identities fall back to a visibly ordinary name search. Stable row identity combines action kind and semantic identity, never opaque upstream key. Only ordinary submission writes recent keywords; only actual playback writes viewing progress.
- Add actor route to the existing NavStack. Reuse approved back strip, title/optional summary and four-column poster grid or TV shelf, with List virtualization and exact identity anchors. Keep page-local snapshot during detail coverage; cancel reads when hidden. No new total/load-more promises.
- Search submission returns whether it committed. Use submitBehavior=submit to keep focus until validation succeeds; reject Unicode control categories consistently with Rust and apply whitespace normalization plus80scalar/100UTF16 bounds. Invalid names stay whole and editable with a short nearby error. Existing successful search/recent write semantics remain.
- Suggestion surface uses existing card/popover tokens, single radius, stable2-unit focus boundaries, at most10 rows and a bounded Scroll. Actor name is the page title; optional description is useful content, no redundant actor/works eyebrow or fabricated fallback biography. No modal for the long works collection.

## Motion inventory

Written before UI implementation; append this inventory to DESIGN.md without replacing parallel work. Popup appears with fast opacity using UI motion tokens, no shift; reduced motion instant. Hover/pressed/focus use existing stable geometry and color transitions. Suggestion rows update as a coherent response, with no per-row stagger or list-wide scroll jump. Actor navigation follows existing NavStack transitions and reduced-motion policy; data/status updates are immediate, cards preserve source position. Loading/error/validation labels swap in place with no delay. No drag/release or ambient/live animation or sound is added. Verify each affected group in real Web/macOS light/dark and TV light/dark/large-text hosts; record unverified assistive-tech and physical-device boundaries.

## Risks / Trade-offs

- Input blur can precede row focus → defer only the blur ownership decision by one animation frame and cancel it when input/list takes focus; test actual pointer, Tab and DPAD. Never delay navigation by the legacy Chromium83 workaround.
- Overlay and native focus differ → exact public APIs plus native tests; changes stay in shared UI, no runtime patch or broad key capture during composition.
- Long actor pages → virtualized rows, stable series identities and retained anchors, clear bounded failure from core, no silent all-works crop.

## Migration Plan

Implement validated submissions/controller and tests, styled picker and semantic activation, actor browsing/return, then real host matrix and independent reviews. Record evidence and make one focused local commit; rollback by reverting the slice, no database change.
