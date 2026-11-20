# Spec Delta

## Purpose

Viewers can continue an anonymous website search without losing usable results, their reading position or the selected drama. Continuations retain one query and source, and failures remain recoverable without introducing duplicates or stale data.

## ADDED Requirements

### Requirement: Website results can continue in order

The application SHALL offer continuation only for a ready search with more results and an advancing website cursor. It MUST retain the query and source, append distinct drama identities in response order, and allow only one continuation at a time.

#### Scenario: Append the next website page

- **WHEN** a viewer requests more results from a ready website search
- **THEN** the request uses the consumed-page offset and website source
- **AND** existing results remain in place, duplicate identities are omitted and newly encountered dramas follow them

#### Scenario: Terminal or invalid continuation

- **WHEN** the source reports no further page or a cursor fails to advance
- **THEN** no automatic request loop occurs and a nonadvancing cursor is surfaced as an explicit failure without replacing usable results

### Requirement: Failed continuation preserves usable results

The application SHALL retain existing results, cursor and reading position while continuation is pending or fails. A visible retry MUST request the same page; a failed page MUST NOT be counted as consumed.

#### Scenario: Retry a failed page

- **WHEN** a continuation fails and the viewer retries
- **THEN** the existing results remain usable and the same source and cursor are requested once again

### Requirement: Continuations belong to their search lifetime

Changing query, explicitly refreshing the search or removing the application MUST cancel its pending continuation. Late responses MUST NOT mutate another query, refreshed result set or mounted application.

#### Scenario: Change query while a page is pending

- **WHEN** a viewer submits a different query before the previous continuation finishes
- **THEN** only the new query's results and continuation state are visible even if the old transport ignores cancellation

### Requirement: Appended results preserve approved browsing interaction

Continuation SHALL reuse the approved shared controls and desktop grid or TV shelf. Appending and returning from details MUST preserve stable drama identity, usable keyboard or remote focus, and reading position. Loading and error states MUST remain accessible without adding explanatory labels unrelated to the task.

#### Scenario: Open and return to an appended drama

- **WHEN** a viewer opens an appended drama and returns to search
- **THEN** the same result remains selected and the visible source position and focus are restored
