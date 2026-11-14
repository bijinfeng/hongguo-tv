# Spec Delta

## Purpose

Provide one anonymous official-ranking contract to Web and native consumers, preserving dynamic selectors, exact continuation and distinct drama/actor identities without account, history or media side effects.

## ADDED Requirements

### Requirement: Anonymous ranking reads

The service SHALL read only the fixed official ranking endpoint with the reference first-page and continuation parameters. HTTP and native SHALL validate the same bounded selector, offset, session and shown inputs before networking and reject unknown fields or request bodies.

#### Scenario: Continue a selected ranking

- **WHEN** a caller passes the prior offset and opaque session with the selected rank, subrank, panel and shown identities
- **THEN** the service sends those exact values with tab18 rather than first-page tab26.

### Requirement: Typed bounded ranking content

The service SHALL return ordered, deduplicated supported summaries and bounded dynamic selector trees. Actor identities SHALL remain distinct from series identities. Summaries SHALL exclude episodes, credentials, raw navigation/tracking and untrusted styling.

#### Scenario: Mixed content and duplicate identities

- **WHEN** an upstream page contains duplicate dramas, actors and unsupported records
- **THEN** supported records retain first-occurrence order, actor IDs are never series IDs, and no media or viewing history is created.

### Requirement: Honest continuation and failures

The service SHALL preserve service offsets rather than infer them from visible item counts, accept empty advancing pages and reject malformed or stalled live cursors. It SHALL bound bytes, raw record count and selector nesting; cancellation SHALL stop reads and retries, and failures SHALL be sanitized identically across transports.

#### Scenario: Empty advancing page

- **WHEN** a valid page has no supported records but its service cursor advances
- **THEN** it remains a continuing empty page with that exact cursor.

#### Scenario: Request is cancelled

- **WHEN** the native call is cancelled or its session closes while the upstream is pending
- **THEN** it completes as cancelled without late output, retry, history or search-history writes.
