# Design

## Context

See proposal.md. Fixed series_seasons.go uses plan/v scene10/from single_col_same_ip_series for the complete selector, while seasons.go uses from series_short_play_info for numeric reciprocal relations. Existing catalog owns bounded summaries and shared anonymous signed requests. The current detail and Player do not consume season relationships.

## Goals / Non-Goals

Read and verify relationships without preparing media or persisting browsing state. Do not add UI, automatic navigation, account subscriptions, creator-album playback or an alternate signing stack. A future UI slice must consume this contract with source/selection fences and preserve explicit reservation confirmation.

## Decisions

- One strict SeriesQuery validates exact nonzero decimal ID <=32 bytes before networking; HTTP/native share it and reject unknown fields/body. Fixed destinations and request fields prevent endpoint/account injection.
- SeriesSeason wraps the existing Drama summary with explicit season metadata and readiness. The upcoming flag overrides trailer VID whenever subscribe_item is an object; only valid positive episode count and VID permit released readiness, disable_play additionally prevents playback. Upcoming/disabled records have no playable VID. Reservation identity is the season series_id only when a valid subscribe item indicates eligibility; no anonymous reserved state is reported.
- Full selector preserves upstream order and the first identical ID. Numeric next-season rows require an explicit numeric season_index, reject conflicting duplicate IDs within and across both response pages, and sort only for successor choice. Current identity must occur locally or in one lowest-playable sibling's reciprocal relation; unknown is never season1. Ambiguous equal-number successors fail instead of choosing an arbitrary story.
- Reuse existing public drama/image normalization and anonymous signed transport with a fixed12s per read and overall20s next-relation budget. Parsing bounds4MiB,128 blocks,128 rows per block,1024 total rows and128 public labels per row. Empty valid data is distinct from malformed data. All failures remain sanitized.

## Risks / Trade-offs

- Upstream omits current season -> one reciprocal lookup, error if still unknown.
- Upcoming trailers have usable VIDs -> subscribe presence makes them unplayable and removes VID.
- Anonymous reads cannot confirm account reservation -> expose eligibility only, leave account state toE.
- Creator albums have a separate identity family -> existing summary filter remains; full support remains tracked inMVP.

## Migration Plan

Implement fixtures, parser and selection invariants; wire shared transport and strict adapters, generate contracts and compare success/error/cancellation. Run targeted checks, then independent functional/UI-scope review and parent full verify before the focused local commit. No push/archive or storage migration.
