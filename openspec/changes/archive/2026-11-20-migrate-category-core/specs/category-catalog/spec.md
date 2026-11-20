## Purpose

Provide anonymous categorized drama discovery with validated explicit filters, bounded dynamic selectors and faithful pagination context, shared by HTTP and native clients without account state or viewing-history changes.

## ADDED Requirements

### Requirement: Validated category selection

The service SHALL accept only supported category scenes and eight allowlisted filter kinds. An omitted genre/sort SHALL retain the scene default; an explicit empty value SHALL mean all. Invalid, duplicate or unknown parameters, malformed shown IDs, oversized cursors and nonempty GET bodies MUST fail before upstream access.

#### Scenario: Explicit all and invalid filters

- **WHEN** a caller sends empty genre, a valid theme and gender, or an invalid filter/scene
- **THEN** valid empty selections remain empty in the request and invalid inputs issue no upstream request.

### Requirement: Anonymous bounded category transport

The service SHALL call the fixed anonymous category POST with body-bound Passport signing and ephemeral nonpersisted identity. Only a confirmed empty200 body SHALL retry, at most three fresh identities within one12-second deadline. Cancellation MUST stop work; redirects, verification, business/protocol failure and oversized bodies MUST remain sanitized errors without account/cookie/history input.

#### Scenario: Empty response and cancellation

- **WHEN** the upstream returns empty200 bodies or the owner cancels a pending read
- **THEN** at most three attempts occur for empty bodies, cancellation closes its read without later retries, and no identity or results are persisted.

### Requirement: Faithful bounded category results

The service SHALL return ordered unique supported summaries without episodes, service offset/session and validated dynamic selector rows. It MUST preserve precise decimal IDs, reject malformed envelopes and oversized collections, and keep the reference client's completed/ongoing status options. Has-more pages MUST advance using a service cursor or the reference fallback when valid items exist.

#### Scenario: Filtered rows and next page

- **WHEN** a page contains duplicates, unsupported content, dynamic selectors and continuation context
- **THEN** summaries and allowed options remain ordered, exact identities and service context survive, unsupported rows are omitted, and a stalled cursor is an error rather than an endless continuation.

### Requirement: Shared read-only contracts and honest review

HTTP and native SHALL expose the same category envelope and stable failure mapping through generated contracts. Offline tests MUST cover malformed input, body signing, finite retries, privacy, cancellation and transport parity. UI scope review MUST distinguish this core slice from visible filter UI and overall product acceptance.

#### Scenario: Cross-host consumption

- **WHEN** either transport requests the same validated category with a fixture upstream
- **THEN** status and result agree and no library/history writes occur; no passing core test is presented as real filter UI, physical TV or release acceptance.
