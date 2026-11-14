## Context

Fixed reference hongguo_client.go Category/categorySelection/normalizeCategoryFilters uses POST /reading/distribution/category/landpage/v/ on api5-normal-sinfonlineb. It uses fresh unregistered passport IDs and retries only empty200. Existing public_sign already validates pinned nonempty-body vectors but its production wrapper passes an empty body. Search and discovery cursors differ from category. See proposal.md for motivation.

## Goals / Non-Goals

Expose strict reusable category data before shared filter UI. No account, registration, cookies, persistence, new dependency, search-result filtering, feed/rank/calendar implementation or visible UI change. Existing full MVP scope remains.

## Decisions

- Core owns one deny_unknown_fields CategoryParams decoder and validated CategoryQuery, reused by both transports. Closed category paths include real/comic-drama/ai-drama/comic with default short_play/hot_score; eight filters follow the fixed reference. Offset0–100000, opaque session <=1024 bytes without controls, shown <=128 exact decimal IDs. selectors is absent/0/1. Preserve explicit empty values. Core builds the fixed limit15, client_req_type3, selector default/only_content body.
- Extend only crate-private public Passport sign with body bytes and X-SS-STUB; preserve the existing empty-body plan behavior and pinned vectors. A separate anonymous category transport reuses the same HTTP/signing primitives, never playback identity slots. Three fresh one-shot IDs only on empty200,100ms delays,5-second attempts and12-second total including parsing. Fixed production origin and fixture-only bare loopback injection; no configurable upstream.
- Parse exact code0/data/video_data shape; require has_more bool or0/1, reject nonzero error_code, body>4MiB, rows>128, selectors>32 or options>128 each. Preserve arbitrary-precision IDs. Reuse bounded summary normalization from actor works rather than unbounded website parser; no episodes. Selector labels use stable reference names, allowed string/numeric IDs and bounded upstream option text; duplicate rows/options first wins. Complete the reference status row, before online_time when absent. No fabricated non-status options.
- Preserve explicit service next_offset and session. For has_more with missing/zero cursor only, apply the reference offset+normalized item count fallback; reject nonadvancing or out-of-range continuation. Empty filtered pages with an advancing service cursor remain valid. No fallback pagination invented from visible cards when a service cursor exists.
- GET /api/v1/category shares the params decoder with native None-body requests; reject HTTP body/native Some body. Keep Axum HEAD/OPTIONS behavior. Add generated response/selector aliases, no legacy DTO rewrite.

## Risks / Trade-offs

- Signature body drift → pinned independent nonempty-body vectors and loopback request/header assertions; hash exact serialized bytes.
- Public endpoint may deny ephemeral identity → sanitized failure and explicit probe; do not borrow account/device state or bypass verification.
- Cursor/selector drift → bounded failures with tests; avoid silent truncation or endless has_more.

## Migration Plan

Implement core fixtures/transport, generated HTTP/native contract and parity/cancellation tests; full verify/clippy and independent function/UI-scope review; record actual probe and limits, focused local commit. Revert the slice to rollback; no storage migration. Existing discovery timeout regression uses a2-second test-only deadline with the server gate still forcing expiry. This allows signing/registration under parallel CPU load without changing the production deadline or dropping timeout/cache/cancellation assertions. Follow with approved shared UI in a separate slice. UI must distinguish omitted default short_play from explicit All, resolve prototype topic to dynamic category_dim_theme IDs rather than wire genre, and map sorting by supported selector semantics rather than option position. This endpoint has no q and does not claim query-result filtering.
