## Purpose

Provide an anonymous recommendation source whose channel and continuation state remain faithful to the upstream feed, shared by HTTP and native callers without account data or fabricated catalog results.

## ADDED Requirements

### Requirement: Anonymous allowlisted channels

The service SHALL support recommendation16, comic36 and real-drama39 through fixed upstream feed endpoints. Unsupported channels, unknown or duplicate parameters, invalid IDs, excessive offsets, sessions or shown lists MUST fail before networking. No account credentials, local history or saved client identity SHALL be read or sent.

#### Scenario: Request followed content

- **WHEN** a caller requests channel45 or an arbitrary destination
- **THEN** the request fails before any upstream call; it never silently returns anonymous recommendations.

### Requirement: Faithful two-phase continuation

The service SHALL use the fixed default recommendation cell for16 and the matching tab first for36/39. Tab results MUST preserve exact cell, plan and session and allow an offset-zero cell transition. Cell continuation MUST use the supplied context and service cursor, never the number of retained dramas. Stalled or malformed active cursors MUST fail; advancing empty pages MUST remain pageable.

#### Scenario: Channel first page transitions

- **WHEN** a supported nondefault tab returns a pageable cell
- **THEN** the next request uses that exact cell, plan and session at offset0, independently of the number of visible items.

### Requirement: Bounded honest summaries

The service SHALL parse only direct or nested video_detail records, discard disabled, unsupported and nonplayable records, preserve exact series IDs and deduplicate in order. Responses MUST contain summaries without episodes or secrets. Malformed envelopes and resource limit violations MUST fail rather than truncate the page or substitute ranking/category data.

#### Scenario: Empty advancing page

- **WHEN** a cell contains only nonvideo records but has an advancing valid cursor
- **THEN** the returned items are empty and has_more remains true with the exact service offset.

### Requirement: Shared cancellable read-only transport

HTTP and native routes SHALL share validated inputs, DTOs and sanitized failures, with no-store HTTP responses and no exposure on the media listener. Requests MUST have finite time and byte limits, stop on cancellation and avoid persistent writes. Tests MUST be offline by default; live evidence requires an explicit anonymous probe.

#### Scenario: Cancel a pending page

- **WHEN** a native call is cancelled or its session closes while the feed read is pending
- **THEN** no result is published, no retry or persistent history mutation follows, and later independent calls remain usable.
