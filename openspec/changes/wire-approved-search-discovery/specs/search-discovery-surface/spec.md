# Spec Delta

## Purpose

Provide real anonymous suggestions and trending video cards in the approved shared search surface, with equivalent navigation, cancellation and recovery behavior across desktop, web and television.

## ADDED Requirements

### Requirement: Discovery reads belong to the empty search surface

The system SHALL read public discovery only while the search surface is active and no submitted term exists. It MUST cancel work on leaving this state, ignore stale completion and keep search and local history functional when discovery is empty or unavailable. Requests MUST contain no local search terms or history.

#### Scenario: Leave a pending discovery read

- **WHEN** a user submits a query, opens another route or leaves search while discovery is pending
- **THEN** the owned read is cancelled and its late success or failure cannot replace current content or steal focus

### Requirement: Suggestions and cards retain their meaning

The system SHALL execute keyword suggestions through normal submitted search, preserving the existing recent-search rules. Only cards with exact playable series identities SHALL open detail. Returning from detail MUST restore the source card and reading position without progress writes.

#### Scenario: Keyword-only suggestion

- **WHEN** a user activates a public term without a playable series identity
- **THEN** the term becomes a normal search and no inferred tag identity is used to open detail

#### Scenario: Return to a public card

- **WHEN** a user opens an exact-identity discovery card and returns
- **THEN** the same source card and reading position are restored without recording a viewing event

### Requirement: Approved layouts have honest states

The system SHALL reuse the approved desktop chips/poster grid and television shelf, preserve short/comic meaning and keyboard/remote access, and use existing shared controls, theme and motion. Loading, empty and failed reads MUST remain distinguishable; failed reads SHALL offer retry. No placeholder content or invented ranking/score SHALL fill missing data.

#### Scenario: Optional empty or failed content

- **WHEN** discovery returns no public content or fails
- **THEN** recent searches and manual search remain usable, empty content has no invented cards and failures offer an explicit retry
