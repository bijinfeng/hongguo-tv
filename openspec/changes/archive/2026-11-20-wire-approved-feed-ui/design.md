# Design

## Context

See proposal.md. FeedResult is already strict across HTTP/native. Browse retains hidden sections; Player owns a lease, progress session and control overlays. Approved desktopPlayer(true) embeds the cinema with channels above and title/next below; tvFeed previews a StoryFeature before explicit full-screen play.

## Goals / Non-Goals

Reuse the incumbent UI and one media implementation. Anonymous state remains ephemeral TSX; no account writes, alternate player, persistence, DTO or dependency changes. Existing disabled interaction controls remain as in the player until E/F.

## Decisions

- Page-owned channel session manager uses captured transport, bounded shown128, revision+abort fencing and explicit retries. Per-channel retained pages/current index permit immediate switches; only one request runs for the visible channel. No unbounded rendering: show one story at a time, retain summaries only for this page lifetime.
- Feed page owns selected episode and synchronous checkpoints keyed by channel/story/video. Player gains an optional embedded composition contract; existing standalone callers retain their behavior. A keyed player remount handles story/episode changes, while a covered same story remains mounted and releases media through active=false.
- Desktop adds the approved sidebar feed destination; TV reaches feed through home/discover actions under 精选. The same channel controls use ui-owned CardControls roving behavior and existing Button styling. Details return uses existing store sources and focus-intent fence.
- Exact tab->cell0 is valid only before a prior pair; cell context thereafter requires cursor advancement and same cell/plan. Failed or malformed pages preserve cursor/current story. Empty advancing pages remain explicitly navigable, avoiding an unbounded request loop.
- Feed detail loads through the captured store transport, cancels while hidden and accepts only current story identity. TV preview never owns a media lease; full-screen uses the existing route.

## Risks / Trade-offs

Embedded player can steal global keys from channels -> key engagement on shell navigation and active-only handler registration, host tests for arrows/Space/fullscreen/back. Rapid switches can save into a new story -> synchronous checkpoints capture stable channel/story/video keys. New sidebar row shifts roving navigation -> rerun existing browse/player acceptance. Live recommendations vary -> fixtures for deterministic behavior and separate explicit live evidence.

## Migration Plan

Implement state and deterministic races/cursor tests; add ui composition and player integration; run full checks and independent functional/UI review with actual Web/macOS and pinned TV fixture captures, preserving device state. Commit only this slice and document remaining MVP gates; no push/archive. Rollback is a slice revert without storage migration.
