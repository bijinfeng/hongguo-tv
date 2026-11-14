# Design

## Context

See proposal.md. Fixed legacy behavior is in lists.go Recommendations/parseFeedDramas, discussion_test.go TestFeedChannelPhaseTransition and ui/app.js recommendationChannel/cursor. Existing Rust category already has anonymous body-bound signing, a bounded nonredirecting transport and identical HTTP/native query validation. Initial legacy anonymous sessions use random device/install IDs; these endpoints do not register a device.

## Goals / Non-Goals

Migrate a standalone read-only core source. No feed page, auto-play policy, account45, persistence, dependency or upstream changes; existing category remains compatible. UI and functional completion are distinct.

## Decisions

- FeedParams denies unknown/duplicate fields; validated FeedQuery allowlists16/36/39, offset<=100000, session<=1024 control-free bytes, shown<=128 decimal IDs, and paired <=30 digit cell/plan. Default16 pins legacy cell7294257141911650341/plan7294257258253254693; arbitrary replacements fail. Nondefault tab requests reject stray continuation context without a pair.
- FeedResult carries channel, ordered Drama summaries, has_more/next_offset/session_id/feed_cell/feed_plan and aggregate parse diagnostics. A tab->cell phase is determined by presence of valid pair, permitting next_offset0 only for tab output; cell has_more requires strict offset advancement. Returned session falls back to prior session if absent, preserving the reference UI continuation behavior.
- Extract the existing signed anonymous request transport for category/feed only; fresh ephemeral random IDs per attempt, no registration/cookies/account/history/cache, existing public_sign. Fixed GET tab/v or cell/change/v on api5-normal-lq.fqnovel.com; category POST and endpoint unchanged. One12s total/5s attempt deadline, max3 attempts only on confirmed empty200, 4MiB byte cap, no redirects.
- Parse only video_detail/video_data/cell_data, with depth8, each array128, total1024 cells/records. Oversized pages fail, not take/truncate. Nested series identity takes precedence over wrapper IDs; disabled records and positive episode_count govern playability. Reuse existing supported summary normalization and omit episode lists.
- Expose GET /api/v1/lists/recommend through strict HTTP/native adapters and generated OpenAPI/TS types. No media-listener business route.

## Risks / Trade-offs

- Live shape changes -> typed malformed response failure and explicit counts-only probe; offline vector fixtures remain deterministic.
- Cursor context is returned by upstream -> validate both request and response; no destination or URL injection.
- Shared transport extraction could regress category -> retain original category body-signature/privacy/retry/cancellation tests and full verify.

## Migration Plan

Implement parser/query fixtures, shared transport and service, HTTP/native contracts and parity/cancellation tests, codegen, explicit anonymous probe, independent functional and UI-boundary reviews, full verify and focused local commit. Revert slice for rollback; no database changes. Core completion does not close feed UI, full D/MVP or existing platform/security/release limitations.
