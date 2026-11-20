# Design

## Context

See proposal.md. The fixed Go reference registers GET /api/v1/radar separately from catalog. Production currently has official dynamic rankings only. The approved prototype has four snapshot categories, stable growth sorting, eight-column tables and independent branch failure/cache states. UI and data ownership remain shared across hosts; existing component conformance edits are unrelated.

## Goals / Non-Goals

**Goals:** deliver the complete read/cache/transport/browse/detail-return slice in the primary workspace and record actual functional and visual evidence.

**Non-Goals:** infer cover/episodes, convert growth to per-day values, add scores/social/account writes, use legacy cache or modify upstream. Formal release and physical TV acceptance remain separately owned.

## Decisions

- Add a separate core RadarService rather than reuse the private official CatalogClient. Production sources are fixed; a clearly named fixture constructor accepts bare HTTP loopback origins only. Reuse the existing TLS builder, disable redirects and implicit retries, bound both declared and streamed size, and join independently timed branches under one deadline.
- Public DTO follows the fixed source shape but uses optional fields and exact decimal strings for i64 metrics. ID stays an ASCII nonzero decimal string of at most 32 digits. Source rank is optional rather than fabricated from array index. Growth type is a closed enum. Ignore raw likes/watch/score fields; cache only normalized DTOs.
- Store radar-v1.json in this product's injected private data directory. Validate bounded versioned input without deleting corrupt files. Serialize refresh/commit ownership and atomically write a private same-directory file; expose cache_write_failed when fresh network data cannot be saved. File commit has a defined uncancellable boundary and is not falsely included in a strict network timeout guarantee.
- Preserve existing router constructors and add an optional radar-aware constructor. Web API and native Session open the same service with their own data directory. HTTP/native enforce GET, empty body/query, existing origin/length limits and no-store; cancellation remains session-owned.
- createRadar owns snapshots, branch/filter selection, stable exact metric ordering, loading and selected detail requests. rankingView gates the official and radar controllers independently. Click uses exact ID detail, verifies identity and only then calls existing store.open; no placeholder Drama or media/history action.
- One ui RadarTable owns column geometry, typography, horizontal/vertical scrolling and focus, using the same Scroll/List composition and shared title buttons on all hosts. The first DataTable implementation rendered on Android but its zero-size absolute body ancestor hid title actions from accessibility and remote traversal; its public styling slots do not expose that ancestor. Use the existing native List instead of modifying NSH or weakening host assertions. Per-source dates remain independent after ID joins. Missing metrics display an em dash; source increments are never divided by gap.
- DESIGN.md records motion before UI edits: common tabs/choices and fast feedback, first arrival only, stable refresh and identity-bound return, reduced-motion paths, no sound. Both source/date and failure feedback remain concise.

## Risks / Trade-offs

- New table input can diverge on TV → real production Java adapter acceptance, exact later-row return and large-text checks before completing the slice.
- Cancelled requests can race disk work → serialize owned commit and explicitly test no older write can replace a newer snapshot; preserve previous file on failure.
- Data includes exact int64 and independent dates → wire strings, stable comparator and no fabricated joins; deterministic tests include missing/zero/negative/extreme values.
- Parallel work can mix dirty UI → isolate file ownership, check source manifests in the main repository, stage only feature hunks and commit locally without push.

## Migration Plan

Add an independent versioned cache and additive endpoint; generate OpenAPI/TS from Rust. Implement shared UI, run unit/contract/full engineering and real-host checks, inspect screenshots and independent review, update ledger, then make one feature-local commit. Rollback removes only the new integration and leaves existing library/history and official rankings untouched.
