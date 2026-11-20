# release-calendar-browsing Specification

## Purpose
Let viewers browse real release dates and new dramas with honest upcoming metadata, recoverable pagination, and preserved selection and return position across desktop and television input methods.

## Requirements

### Requirement: Real release choices

The page SHALL default to calendar mode, offer an independent new-drama mode, and expose only valid dates supplied by the service. Mode, date and new-drama audience changes SHALL preserve completed independent pages and discard superseded pending reads.

#### Scenario: Select a date

- **WHEN** the viewer selects an advertised date
- **THEN** the request uses its exact YYYYMMDD value and omits subscribe_offset on the first page.

### Requirement: Honest typed content

Released entries SHALL open existing drama details. Upcoming entries SHALL remain announcements with no playable action or fabricated series identity. Unavailable reservation writes SHALL have visible truthful feedback and never appear successful.

#### Scenario: Upcoming entry

- **WHEN** a viewer activates an upcoming announcement
- **THEN** its public release information is shown and no detail, playback, reservation write or history mutation occurs.

### Requirement: Recoverable continuation

Pagination SHALL preserve official order, separate released/upcoming identities and both raw cursors, accept empty advancing pages, retain completed content on failure, and retry the exact failed continuation. Continuing stalled cursors SHALL fail.

#### Scenario: Subscription phase transition

- **WHEN** released offset45 changes to24 and subscribe23 is introduced
- **THEN** the page accepts progress and subsequent requests retain both cursor dimensions.

### Requirement: Lifecycle and navigation ownership

Hidden, background and disposed owners SHALL cancel pending work and reject late writes. Returning from details SHALL retain completed pages, position and exact focus source without overriding newer navigation intent.

#### Scenario: Leave during request

- **WHEN** a pending page is covered or hidden
- **THEN** completion cannot replace the newer visible selection or write history.
