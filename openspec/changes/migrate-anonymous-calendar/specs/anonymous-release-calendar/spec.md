# Spec Delta

## Purpose

Provide anonymous new-release and full-day calendar discovery across HTTP and native hosts, preserving real release status and independent released/upcoming cursors without account, history or media side effects.

## ADDED Requirements

### Requirement: Strict anonymous release reads

The service SHALL validate bounded dates, offsets, audience selection and session fields identically across HTTP/native before networking. It SHALL use only the fixed anonymous endpoints and SHALL reject unknown fields or bodies without reading credentials or old client data.

#### Scenario: New releases by audience

- **WHEN** a caller chooses a supported new-release audience and continuation
- **THEN** the fixed request preserves that audience, service offset and session exactly.

### Requirement: Full-day calendar continuation

The service SHALL omit subscribe_offset on the initial calendar request unless explicitly supplied. It SHALL preserve independent released/upcoming cursors and treat down_has_more as continuing even when has_more is false. Malformed or stalled continuing pages SHALL fail rather than fabricate an end.

#### Scenario: Transition to upcoming section

- **WHEN** a page introduces a subscription cursor while its released cursor moves backward
- **THEN** both exact cursors are retained and the newly introduced subscription phase remains continuing.

#### Scenario: Empty advancing upcoming page

- **WHEN** no visible records exist but down_has_more and the subscription cursor advance
- **THEN** the page stays empty and continuing with the exact cursor.

### Requirement: Distinct release identities

The service SHALL return ordered deduplicated bounded summaries with released dramas distinct from upcoming announcements. A reservation item ID SHALL NOT become a playable series ID; episode details, raw tracking and account subscription state SHALL NOT appear in anonymous output.

#### Scenario: Upcoming without a playable drama

- **WHEN** an offline record contains only a reservation item and announcement metadata
- **THEN** it is returned as upcoming without a playable drama or fabricated reservation success.

### Requirement: Bounded cancellable privacy

Reads SHALL bound response bytes and raw record/schema counts, reuse existing signed anonymous transport and sanitize failures identically. Cancellation or session close SHALL stop owned reads/retries without late output or history writes.

#### Scenario: Cancel pending calendar

- **WHEN** a native read is cancelled or its session closes while the upstream is pending
- **THEN** it completes cancelled without subsequent retry, history or search-history mutation.
