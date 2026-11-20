# Design

## Context

See proposal.md. Rust already exports complete season summaries and a next-season relationship endpoint. Detail currently reads one drama; Player and Feed own separate media and checkpoint lifetimes. NSH retains hidden pages. All implementation and acceptance input belongs to the primary workspace.

## Goals / Non-Goals

**Goals:** keep public selection, browse cache, actual playback and persisted history independently identified, while sharing one picker and the approved desktop/TV layout.

**Non-Goals:** add account reservation writes, social features, new transport/DTO or inferred season numbers. Existing private worktrees are read-only references, not implementation sources of truth.

## Decisions

- Keep createSeasons as the relation/selection owner and createSeasonDetail as the bounded identity/content-type browsing cache. Detail and Player compose the same SeasonPicker. Pages do not duplicate UI styles. A single combined playback/browsing object was rejected because changing a tab must not switch media.
- Browse reads allow visible inactive windows, but automatic continuation requires active foreground at every boundary. Abort plus revisions guard both adapters even when cancellation is ignored. Cached completed details survive temporary hiding; upcoming/unavailable choices expose summaries only.
- Automatic continuation follows fixed upstream ui/app.js continueFromSeason and next-season-hint.js: the complete selector is authoritative, season_index=current+1 must be unique. Upcoming/unavailable stops; a missing adjacent row with a higher row is incomplete. Only a missing current season number uses the relationship endpoint; its nearest-higher-playable `next` is not an autoplay authorization. Using the endpoint result directly was rejected because it can skip unreleased seasons.
- Confirm episode membership and selected drama identity before switching. Player keeps its original props as actual media ownership; Feed stores an override per original recommendation and includes actual series/video in media and checkpoint keys. Cleanup retains captured old identities.
- Playback continuation has a separate intent revision. Manual season/episode choice, seek/preview/replay/refresh, leaving, inactive/background and disposal invalidate it. Safe errors and real terminal/upcoming statuses remain visible without fabricated account actions.
- Root DESIGN documents motion before edits: shared fast-token season states, bounded horizontal reveal, existing episode panel entry/exit, in-place loading/error updates, no new decorative motion or sound. Reduced-motion paths retain existing controls.

## Risks / Trade-offs

- Browse responses can outlive selection → validate exact requested identity/content type and revision before cache or visible writes; test late relation and detail separately.
- A final playable row may not be the actual final episode → require complete indexed episode identities and true final index, not absence of an unlocked successor.
- UI samples can overstate functionality → real history/playing IDs only; no reservation success, counts, inferred series totals or social placeholders.
- Shared player changes can break unrelated input → preserve existing lease/session mechanics and run decoder, settings, nested Select and return regressions alongside season-specific hosts.

## Migration Plan

Integrate in the primary checkout, complete deterministic and real-host checks, then commit this feature separately from existing component conformance work. No dependency/DTO migration or data reset is required. Reverting the feature leaves existing single-season playback and Rust state intact.
