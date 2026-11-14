# Spec Delta

## Purpose

Provide bounded anonymous suggestions for a typed search term, preserving the distinct meanings of drama, actor and keyword results and exposing one cancellable contract to native and HTTP clients without leaking private history or upstream payloads.

## ADDED Requirements

### Requirement: Anonymous bounded suggestion reads

The system SHALL accept a trimmed term of at most 100 Unicode characters, return an empty list without networking for an empty term, and reject invalid control characters or unsupported request inputs before networking. Nonempty reads MUST use only the fixed public website endpoint and parameters, omit account/history/device registration data, and have bounded response size, retries and deadlines.

#### Scenario: Private current term

- **WHEN** a valid nonempty term is requested
- **THEN** only that term and fixed public suggestion parameters are sent, with no cookies, authorization, local history or discovery registration

#### Scenario: Invalid or empty input

- **WHEN** a read has an empty term, an overlong/control-containing term, duplicate or unknown parameters, a nonempty GET body or an unsupported method
- **THEN** empty terms return no suggestions locally and invalid inputs fail before an upstream call

### Requirement: Suggestions preserve identity and bounded meaning

The system SHALL return at most ten deduplicated suggestions in upstream order, with typed drama/actor/keyword kinds, bounded plain text and exact decimal IDs. Only a valid drama-name entry with explicit supported video_data SHALL contain a drama summary. Actors and keywords MUST NOT acquire playable series identities; unknown kinds SHALL degrade to keyword search. Missing/malformed envelopes or explicit business failures MUST NOT become empty success.

#### Scenario: Mixed suggestions

- **WHEN** the upstream returns drama, actor, keyword, duplicate and malformed rows
- **THEN** valid rows preserve their distinct meanings, fallback display words and drama titles while invalid rows are omitted and output remains bounded

#### Scenario: Untrusted identity or optional metadata

- **WHEN** a keyword resembles a series ID, video_data is unsupported, or cover/metadata is unsafe
- **THEN** no series identity is inferred from the keyword and unsafe optional data is removed without inventing content

### Requirement: Common transport and cancellation semantics

HTTP and native suggestion reads SHALL expose the same generated success/error contract and input validation. Cancellation or native owner closure MUST terminate pending owned work and prevent retries or persistent writes. Errors MUST be sanitized, and untrusted redirects MUST not be followed.

#### Scenario: Cancel pending read

- **WHEN** the owning request is dropped, cancelled or its native session closes while a response is pending
- **THEN** pending work is cancelled, no retry follows and no history, registration or cache state is committed

#### Scenario: Equivalent failures

- **WHEN** the website fails, times out, returns malformed data or requires verification
- **THEN** HTTP and native return the same structured error category without exposing upstream bodies, URLs or credentials
