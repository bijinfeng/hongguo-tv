# Design

## Context

See proposal.md for motivation. The fixed Go reference supplies actors and inline or deferred recommendations. Rust currently returns Drama with episodes; createSeasonDetail treats supplied episodes as a complete read. The approved desktop and TV prototypes place actor buttons and related posters after episodes. Existing actor works, navigation restoration and virtualized poster collections are shared.

## Goals / Non-Goals

**Goals:** Preserve exact identity, bounded parsing, current-season ownership and existing playback while completing detail discovery through the same production page.

**Non-Goals:** Account actions, reviews, recommendation paging, upstream changes, new UI dependencies, platform-specific duplicate screens.

## Decisions

1. Introduce SeriesDetail with flattened Drama plus required actors and related arrays. SeriesActor has an optional validated actor_id, name and avatar. Keep ActorSummary's mandatory identity and the existing Rust minimal detail API; HTTP/native use a new complete detail method. Expanding general Drama was rejected because it invites extension data into summaries and history.
2. Parse router detail, actor aliases and inline related arrays using the fixed reference. Parse eligible deferred script attributes only as JSON when inline recommendations are empty. Add byte, item and text limits, exact integer preservation and sanitized failures. Never evaluate JavaScript.
3. Cache only completed metadata by series/content family; valid supplied episodes remain a playable fallback during a metadata read. Explicit complete empty arrays suppress redundant reads. A selected summary without arrays must not bypass metadata. Old fixture responses without extension arrays normalize to empty after a successful detail read. Identity/lifecycle cancellation retains the existing revision fence.
4. Compose DetailExtras from public UI controls, heading text and a virtualized related collection using the parent detail Scroll viewport. Recycle complete rows with fixed-width column slots; narrow desktop windows use two columns and wide windows/TV use four. Actors have names as buttons only with a valid ID; unlinked names remain text. TV explicitly exposes unlinked text as a named reading region so directional navigation can reveal it; Enter has no action. No mock data enters production. Keep all actors reachable, and return callbacks capture collection and exact member identity under the store focus guard, including regrouping after a viewport change. Sections use current selected detail, never the original route's extras.

## Risks / Trade-offs

- [Nested scroll and TV focus] → Explicit collection viewport and safe insets; test later entries and layered return on actual hosts.
- [Supplied episodes hide missing metadata] → Separate complete metadata predicate and add episodes-only / complete-empty regressions.
- [Remote payload variability] → Fixed upstream-grounded aliases, bounded pure JSON parser and synthetic inline/deferred/invalid fixtures.
- [Host-only checks overstate completion] → Record actual Web/macOS/TV adapter scope and keep physical TV, screen reader and live-network limits explicit.

## Migration Plan

Add compatible Rust APIs and generated schema, then update the shared controller/page and explicit test fixtures. Verify codegen, Rust/NSH check/build/tests, real host workflows and independent functionality/visual review before local commits. No persistence migration is needed; no push or release is included.

## Acceptance update · 2026-11-15

Real current anonymous data through the formal entry is the primary acceptance evidence. Synthetic HTTP/state/TV datasets only supplement boundary regressions and cannot establish feature completion. Reopen task 3.1 until the real flows are covered; record absent cast and unavailable services without fabricated replacements. The macOS graphical run of the Web App is separate from browser Web, native Desktop and TV. The opt-in live runner owns a temporary real database, preserves request evidence and restores configuration and processes on completion or interruption.
