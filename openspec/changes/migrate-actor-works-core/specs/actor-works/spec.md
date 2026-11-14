## Purpose

Provide anonymous, identity-bound actor summaries and ordered drama works from the fixed public website, so every host can open actor results without treating names or opaque suggestion keys as series identities.

## ADDED Requirements

### Requirement: Exact actor identity
The service SHALL accept only one trimmed nonzero ASCII decimal actor_id of at most 32 digits and SHALL fetch the fixed character page. It MUST require the exact character page userInfo identity to match the request; missing, invalid or conflicting identities fail.

#### Scenario: Invalid or mismatched identity
- **WHEN** actor_id is malformed, duplicated, missing or differs from any supplied userInfo identity alias
- **THEN** invalid input fails before networking or upstream mismatch returns a sanitized data failure.

### Requirement: Bounded complete page summaries
The service SHALL select loaderData character_(id)/page without recursive fallback, return a bounded actor summary and unique ordered supported drama summaries, and omit episode details. Missing/non-array videoList fails; an empty array succeeds. HTML over 12 MiB or more than 2048 raw works MUST fail rather than silently truncate the page.

#### Scenario: Mixed page
- **WHEN** the selected page contains valid, duplicate, malformed and unsupported works alongside a layout videoList
- **THEN** only supported valid works from the selected page are returned in order, with exact IDs, bounded text and approved public image URLs.

#### Scenario: Page limit
- **WHEN** the selected page exceeds either hard response or row limit
- **THEN** the entire request fails without presenting partial results as all works.

### Requirement: Shared read-only transports
HTTP and native SHALL expose the same typed success/error contract at /api/v1/actors/works with only actor_id, reject unknown/duplicate inputs and nonempty GET bodies, and reject native request bodies. Ordinary POST is unsupported. Generated OpenAPI and TS types MUST describe the contract.

#### Scenario: Host parity
- **WHEN** both transports consume the same fixture, malformed input or upstream failure
- **THEN** their data and stable error codes match without leaking upstream content.

### Requirement: Anonymous bounded cancellable request
The service SHALL reuse catalog transport bounds of two attempts, five seconds per attempt and twelve seconds total, without cookies, authorization, redirect following, history writes or discovery registration. Dropping work or cancelling/closing a native session MUST prevent later result delivery and retries.

#### Scenario: Cancelled lookup
- **WHEN** an actor lookup is cancelled while awaiting upstream data
- **THEN** pending work is released, no retry occurs and no persistent history is created.
