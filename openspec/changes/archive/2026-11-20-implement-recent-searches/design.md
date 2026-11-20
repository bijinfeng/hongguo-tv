# Design

## Context

See proposal.md. The current native/HTTP services already share LibraryStore with one serialized SQLite connection and guest.sqlite3. SearchForm delegates submission to a mounted store which captures transport; Search owns virtualized results and anchors. Prototype desktop discovery and TV search both include recent keyword chips and clear. Fixed legacy search_history.go normalizes whitespace, caps ten entries and uses a 100 UTF-16-unit bound; current Rust website search separately accepts at most80 scalar characters.

## Goals / Non-Goals

**Goals:** Deliver durable device keywords through one existing persistence/service lifetime, with ordered mutations and approved shared UI.

**Non-Goals:** Hot searches, autocomplete, recommendations, account sync, importing old files, relaxing website search limits or redesigning the find page. Those remain in D/E.

## Decisions

1. Add a bounded recent_searches table to the existing host-owned SQLite database and transactional v1→v2 migration. Reuse LibraryStore serialization rather than create another storage owner/connection. Keyword validation retains both the existing website80-character bound and the legacy100-UTF-16 bound, avoiding saved terms that cannot be executed. Separate methods and generated SearchHistory/SearchHistoryChange DTOs keep keyword data independent of viewing entries. Validate old history before committing migration; reject unknown versions, preserve original data on failure, and retain corruption/permission failures explicitly.
2. Use GET /api/v1/search/history and POST tagged add/clear on both adapters, matching current generic transport semantics. HTTP no-store and strict JSON/query validation remain; native media-only listener never gains business routes. Return committed snapshots. Expose generated types, run codegen/check.
3. Capture transport per store and serialize keyword writes. Load recent keywords on the discovery page, cancel stale loads and fence responses across writes/disposal; failed writes retain committed snapshot and exact retry action. Search starts immediately, saving is independent and cannot delay/erase its results. shutdown drains both write queues before native close; completed old writes cannot update a removed mount.
4. Compose recent term buttons in a wrapping Controls group with existing quiet/secondary Button variants, heading and clear aligned to the approved prototype. TV gets its own tvUnit spacing and remote targets. Only discovery shows the group; results offer clear query to return without clearing storage. Keep full search card/grid/pagination layout. Empty uses concise existing Notice/text and no fake content. Write motion inventory before implementation; reuse tokens, no per-chip entrance.

## Risks / Trade-offs

- Old binary cannot open v2 → fail safely rather than downgrade; backup/rollback requires the original v1 database, never automatically drop the keyword table.
- Read races with add/clear → cancel/fence the read before a queued mutation and publish only latest committed snapshots; queue order preserves actual intent. Retry cannot replay an earlier failed action after a newer action supersedes it.
- Persistence failure while search succeeds → show an independent saving error and retry; do not label a successful search failed or auto-repeat its network request.
- Clearing the last visible chip removes the focused action → focus the existing search input on explicit clear/clear-query where the public API supports it, then inspect keyboard and TV remote in actual hosts. No asynchronous completion may steal focus moved during pending.
- Mac/physical availability → record limitations and keep C3.2/A/B/security open; fixture host success cannot imply native business or physical acceptance.

## Migration Plan

Run isolated database v1 migration/restart/concurrency/failure tests before changing adapters/UI. Regenerate contracts, extend deterministic NSH and existing explicit Web/TV fixtures, run three-target check/build and full verify. Obtain independent UI/function review and commit this slice locally. No push/archive/publish; preserve concurrent brand/layout docs. Runtime migration is transactional and does not read legacy files.
