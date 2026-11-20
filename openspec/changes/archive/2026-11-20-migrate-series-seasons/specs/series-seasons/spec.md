# Spec Delta

## Purpose

Provide verified public season relationships to all hosts so viewers can choose a related season and continue watching without mistaking trailers, unconfirmed identities or malformed results for playable successors.

## ADDED Requirements

### Requirement: Complete public season selector

The service SHALL return bounded ordered supported season summaries with exact identities, official labels and explicit playback/upcoming status. Upcoming trailers SHALL not expose a playable video, and reservation eligibility SHALL use the season series identity without claiming an anonymous account has reserved it.

#### Scenario: Upcoming trailer has a video ID

- **WHEN** a row has a subscribe item and trailer video/episode fields
- **THEN** it is upcoming and unplayable, its playable video is absent, and a valid reservation item enables only the season identity.

### Requirement: Confirmed nearest successor

The next-season service SHALL confirm the requested current season locally or through one reciprocal sibling read before choosing the nearest higher playable season. Unknown, conflicting or ambiguous relationships SHALL fail instead of inferring a current season or selecting arbitrary content.

#### Scenario: Current season is omitted

- **WHEN** a relation page omits the requested series but has playable siblings
- **THEN** one reciprocal page confirms the requested identity and season number before any next result is returned.

### Requirement: Shared bounded anonymous reads

HTTP and native SHALL share strict identity validation, sanitized failure categories and read-only semantics. Requests SHALL use fixed official endpoints, finite response/time/raw-row bounds, no credentials/history/media side effects, and cancellation SHALL stop pending reads and retries.

#### Scenario: Cancel a pending relation

- **WHEN** a call is cancelled or its native session closes during either relation read
- **THEN** it terminates cancelled without late output or additional history/media writes.
