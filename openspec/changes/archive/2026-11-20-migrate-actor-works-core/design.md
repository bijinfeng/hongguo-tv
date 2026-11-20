## Context

See proposal.md. Fixed legacy ActorWorks parses the exact character page; typed suggestion actor IDs now exist independently of series IDs. CatalogClient already owns anonymous networking and native session cancellation.

## Goals / Non-Goals

Goals: cross-host typed read-only actor lookup with explicit identity, size and cancellation guarantees. Non-goals: visible UI, new cache or persistence, login, creator albums, changes to 80-character search / 100-UTF16 recent search validation.

## Decisions

- Add actor_works.rs under core catalog. ActorQuery owns a trimmed validated ID. ActorSummary and ActorWorksResult are exported wire records; reuse Drama summaries without episodes.
- Extract the existing inert router JSON reader from parse_detail and share it. Select only loaderData["character_(id)/page"], require object userInfo, a present matching ID and agreement among every present actor_id / actor_id_str / person_id alias.
- Pin /character/<validated ASCII ID>, HTML limit 12 MiB, maximum 2048 raw rows; reject whole page on limits. Do not invent pagination or silently crop a complete page.
- Normalize direct or video_data-wrapped rows with supported content types absent/1/7/1004. Text caps: names/titles 100 Unicode scalar values, descriptions 1024, up to three 24-character tags. Invalid optional fields are omitted; invalid names use existing neutral fallbacks. IDs preserve exact numeric strings, never floating-point values. Only existing HTTPS byteimg/fqnovelpic image policy is used for covers and avatars.
- Reuse CatalogClient fetch and strict serde query parsing in each adapter. Axum HEAD and global OPTIONS keep existing framework semantics; do not claim every non-GET is rejected. No dependencies, durable writes or discoverable playback registration.

## Risks / Trade-offs

- Upstream schema drift → exact path and identity fail visibly; fixtures and an explicit optional counts-only anonymous probe detect drift.
- A large catalogue can exceed bounds → clear failure rather than misleading all-works truncation; pagination would require a separately verified upstream protocol.
- No visible UI in this slice → product review checks data meaning and scope; host screenshots are required when the following shared UI slice changes screens.

## Migration Plan

Add core and fixtures, adapters and generated contract, then targeted and full verification, independent function/product review and a local commit. Revert the slice to roll back; no schema/data migration is needed.
