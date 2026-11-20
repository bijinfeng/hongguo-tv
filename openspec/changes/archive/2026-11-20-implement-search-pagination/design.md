# Design

## Context

See proposal.md for motivation. CatalogClient and SearchQuery already implement website page=offset+1 and emit source=web. SearchResult is generated and carried unchanged through both HTTP and native adapters. packages/app currently holds a first-page NSH resource; Search uses a recycled four-column desktop grid or one-item horizontal TV shelf with identity-based scroll/focus restoration. The footer is currently informational only. The pinned legacy reference search_web.go distinguishes website pages from app cursors; this slice never falls back to an app source.

## Goals / Non-Goals

**Goals:** Add one owned continuation request to the existing search lifetime, preserve snapshots on failure, and reuse the current list and controls.

**Non-Goals:** New protocol, account cursor search, filters, auto-infinite loading, a pagination framework, persistence of search history, or replacement of A/B UI and C3 validation boundaries.

## Decisions

1. Keep the first-page resource and its existing loading/error semantics. Track only the appended aggregate, pending flag and continuation error in the mounted store. Bind all search requests to that store's captured transport, as current queued writes already do. A query/refetch lifetime revision plus AbortController rejects old results even when a transport ignores abort; disposal clears owned requests.
2. Request the next offset only from a ready result with source web and a finite valid consumed-page cursor. Validate that a successful page advances the cursor and retains source before merging; preserve first-seen identities with a Set. No recursive fetch or timer and no loading at the end of scrolling: the viewer chooses the next batch explicitly.
3. Replace the current first-batch text footer with existing Button and Notice variants. Pending exposes its state on the same focusable action while the store rejects repeat requests, failure offers retry while the list remains usable, exhausted results remove continuation. Retain the existing List and stable IDs; after returning from an appended detail, the existing source callback restores its anchor and button focus. Avoid an extra count/description that repeats the layout.
4. Write the narrow motion inventory in DESIGN before UI code. Loading label/disabled feedback and existing button state transitions reuse ui tokens; list append retains its reading anchor and respects reduced motion, with no new entrance animation.

## Risks / Trade-offs

- Mutable query or host transport during an await → capture request/query/revision, abort on reset/dispose, then recheck ownership before every write.
- Duplicate-only pages or malformed cursor → deduplicate without changing order; accept a valid advancing empty page once, but never automatically chase another page; reject invalid/nonadvancing continuation and preserve the retry cursor.
- Recycling focus after append or disappearing terminal button → cover appended-drama return and keyboard/DPAD movement in actual host acceptance, keep IDs stable, verify native focus movement when the continuation action disappears, without an asynchronous focus request that can override the viewer.
- Real website availability and Mac lock → deterministic multi-page/error fixtures plus explicit real website smoke; actual Web and TV views reviewed separately from unavailable Mac checks.

## Migration Plan

No DTO, database, dependency or release change. Add store behavior and tests, then compose the shared footer and extend current host fixtures; run three-target check/build and full verify. Record independent UI/function review and commit locally. Rollback only this slice's code; no data migration or archive is required.
