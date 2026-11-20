# Spec Delta

## Purpose

Provide one anonymous read-only source of public search suggestions and short/comic trending dramas across HTTP and native clients, without exposing account state or local search history to the upstream service.

## ADDED Requirements

### Requirement: Discovery is private and anonymous

The system SHALL use a fixed upstream public plan endpoint and an independent ephemeral anonymous identity. It MUST NOT send account credentials, local search history or a caller's query, persist identity, accept caller-selected destinations, or mutate playback and account state.

#### Scenario: Read with local history present

- **WHEN** a client reads discovery while local searches or playback identities exist
- **THEN** only the independent anonymous device parameters and fixed public search-page parameters are sent upstream

### Requirement: Known search cells become bounded typed results

The system SHALL return at most four suggestions and at most six entries in each short/comic board, preserve exact IDs and official positions, deduplicate entries, and accept only known search cells and allowed video kinds. A keyword-only suggestion MUST remain a query without a playable series identity. Unknown and malformed optional cells MUST NOT invent content.

#### Scenario: Mixed plan response

- **WHEN** a successful plan contains wrapped JSON, duplicate dramas, keyword tags, books and unknown cells
- **THEN** only bounded valid suggestions and short/comic entries are returned, keeping keyword tags nonplayable

### Requirement: Bounded cancellation and instance caching

The system SHALL cap response bytes, nesting, traversal and request time, reject non-success and verification responses, and share only bounded instance-local cached public results. Dropping pending work MUST cancel its owned network work and MUST NOT cache a navigation cancellation as a failure.

#### Scenario: Cancelled read followed by retry

- **WHEN** a pending reader is cancelled and another reader requests discovery
- **THEN** the new reader can retry without waiting for a poisoned cache and no detached request is retained

### Requirement: Equivalent read-only transports

The system SHALL expose the same typed result and sanitized errors via HTTP and native `/api/v1/search/discovery`, reject query parameters and mutation bodies, and generate the shared OpenAPI/client contract. Existing search, history and playback behavior MUST remain intact.

#### Scenario: Extra parameters or writes

- **WHEN** a client adds a query, account selector, upstream address or mutation body to discovery
- **THEN** the request is rejected before any upstream call
