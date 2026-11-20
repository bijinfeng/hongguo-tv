# Design

## Context

See proposal.md. Fixed lists.go has NewSeries, reservationDrama and SubscriptionList(calendar=true); existing Rust anonymous_catalog provides bounded signed GET and ephemeral identity. The reference calendar has separate released offset and upcoming subscribe_offset, omits the latter initially, and always uses gender_type2. No NSH new-release/calendar page exists.

## Goals / Non-Goals

Provide stateless Rust reads and generated public DTOs before composing the approved UI. No database, credentials, account reservation list/write, false audience filtering, visible controls, media preparation or new dependency.

## Decisions

- NewSeriesQuery validates gender0/1/2 (default2), offset0..100000 and control-free session<=1024. CalendarQuery validates real Gregorian YYYYMMDD when supplied, offset and optional subscribe_offset independently, and preserves omission versus explicit0. The date can be absent for the upstream current-day default.
- Reuse anonymous_catalog with fixed endpoints and 12s total/5s attempt budgets. Calendar gender is fixed2 because the reference contract has no effective audience filtering; reject unknown gender instead of offering a false filter.
- Released entries reuse existing Drama summaries. Upcoming entries have announcement metadata and optional explicit series identity, never a fabricated playable Drama. Common publication metadata and exact optional reservation ID remain separate; anonymous has_subscribed is deliberately excluded.
- Cursor progression uses the pair. New subscription cursor counts as phase progress even when released offset regresses; down_has_more extends continuation. Continuing nonprogress fails. Terminal cursor values remain unchanged, and no offset is inferred from filtered visible counts.
- Bound4MiB/raw128records and366date schema values; validate cursor/schema container shape. First valid occurrence wins by released-series or upcoming-reservation namespace. Shared summary/image normalization avoids a second playback path.

## Risks / Trade-offs

- Anonymous availability may differ from authenticated legacy probes -> explicit aggregate-only anonymous smoke, no credentials fallback.
- Invalid/unsupported content -> filter bounded records without claiming playability; malformed envelopes/cursors fail whole page.
- API omits state on continuation -> preserve requested session and subscription cursor when absent, while retaining optional schema.
- Future UI needs account reservations -> keep E boundary, no automatic write replay after login.

## Migration Plan

Add fixtures/parser/query/transport tests; wire HTTP/native and parity/cancellation, generate contracts. Parent runs full verify and independent functional/UI-scope reviews before focused local commit; no push/archive/release. Rollback is a slice revert without persistent migrations.
