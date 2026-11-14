# Design

## Context

See proposal.md. The fixed legacy `search_discovery.go` uses the public plan endpoint with passport's full Medusa signature, not playback's Argus signature. Rust has matching anonymous device registration, SM3/Gorgon/Helios primitives and strict loopback fixture transport, but no Medusa public-plan implementation. The approved prototype maps future UI to compact recent/suggested keywords and existing poster grids; this core slice does not add UI or placeholder success.

## Goals / Non-Goals

**Goals:** Preserve the exact known public request profile and bounded typed output, share one domain service across HTTP/native, test real protocol bytes and lifecycle, and isolate public cache/identity from playback.

**Non-Goals:** Account/session migration, reading old client files, Go execution, new dependencies, UI redesign, autocomplete-on-typing, other plan/recommendation channels, or closing C3.2/security/release gates. The next slice consumes this API in the shared approved UI.

## Decisions

1. Keep a crate-private public-plan signer next to the already migrated anonymous protocol primitives, reusing exact SM3/Gorgon/Helios helpers with restricted visibility. Port Medusa and its fixed tables from the pinned reference, validate independent stored vectors including all AESV3 branches. Preserve playback request profiles and headers; do not substitute Argus or share active playback identity/cache. A dedicated discovery service owned by CatalogClient owns its own existing anonymous transport instance, and directly performs one fresh registration only when the public-result cache needs fetching. Dropping that future cancels its registration HTTP request; it does not borrow playback’s ten-minute registration-failure cooldown or cached identities.
2. Fetch only fixed `https://api5-normal-lq.fqnovel.com/reading/bookapi/plan/v1/`, with public search-page parameters and install_id cookie only. No account/session input exists in the API. Use overall six-second timeout, no redirects/proxy/retries, 2 MiB body bound. A clone-shared async mutex caches one successful populated result for ten minutes and empty/error results for one minute; holding it across the bounded request coalesces concurrent reads without detached work. Dropping the fetching future releases the mutex and transport, without caching cancellation. Avoid account generation machinery because this service has no account identity.
3. Parse exact JSON numbers/strings, known cell wrappers only, depth at most eight, bounded arrays and total visits, and bounded strings. Keep query-only suggestions explicit, exact valid IDs, original one-based positions and board order short/comic. Reject malformed envelopes, status/verification failures; skip malformed optional rows rather than returning invented dramas. DTOs contain only display data and optional query/position/score, never raw upstream plan or identity.
4. HTTP and native accept no parameters/body, use one service/DTO and sanitized machine errors. CatalogClient construction initializes the service and fails readiness on initialization error; cloning shares its public cache. Existing HTTP/native CatalogClient injection carries it per-session, including the explicitly validated loopback fixture origin. Regenerate contracts and keep transport parity tests. No UI motion inventory changes because this slice changes no visible UI; review confirms this boundary and existing core behavior.

## Risks / Trade-offs

- Full Medusa differs from playback → pin and copy vectors with provenance, reuse only matching primitives, run existing playback tests and explicit anonymous Rust probe; preserve any real-service failure honestly.
- Optional API drift or huge nested cells → strict budget and allowlist, empty optional content remains empty; no account fallback.
- Serialized request lock → response deadline bounds waiting; cancellation unlocks and next reader retries; test concurrency/cancellation without detached tasks.
- Protocol code physically under playback → keep the only reuse crate-private and the discovery transport instance independent; a wider anonymous-module rename is outside this narrow migration.

## Migration Plan

Add core protocol/service fixtures, then wire typed HTTP/native and regenerate. Run targeted Rust, transport parity and full three-entry check/build/tests; obtain independent function review and a UI scope/no-regression review. Record exact evidence and any live read limitation. Commit only this slice locally, preserve parallel documents, no push/archive/publish. Rollback removes the new endpoint/service only and does not migrate persisted data.
