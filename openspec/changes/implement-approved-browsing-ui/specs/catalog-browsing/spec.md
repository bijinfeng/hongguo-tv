# Spec Delta

## Purpose

Let desktop and television users find a drama, inspect its actual details and choose an available episode using their intended input method. Preserve query context, reliable failure recovery and explicit episode availability throughout the browsing flow.

## ADDED Requirements

### Requirement: Search preserves user intent and results

The application SHALL submit nonempty trimmed queries to the configured catalog service, distinguish loading, empty and failed outcomes, and retain the current query and usable results after failure. Superseded responses MUST NOT replace the latest query's results. Empty input MUST NOT issue a search request.

#### Scenario: Retry a failed query

- **WHEN** a submitted search fails and the user retries
- **THEN** the same query is retried without retyping
- **AND** available prior results remain usable until replacement results arrive

#### Scenario: A slow response is superseded

- **WHEN** the user submits a new query while an earlier query is pending
- **THEN** only the newest query can update the displayed results

#### Scenario: The service has more results than this milestone displays

- **WHEN** the response indicates additional results without a supported next-page action
- **THEN** the interface does not claim the displayed batch is the complete catalog
- **AND** it does not present a nonworking load-more action

### Requirement: Catalog presentation fits its input target

The application SHALL present search results as an adaptive poster collection for Web/desktop and a remote-operable content collection for TV. Long collections MUST preserve item identity, visible position and valid focus while scrolling or recycling. Each drama SHALL remain identifiable if its image fails to load.

#### Scenario: A focused result is recycled off screen

- **WHEN** the user moves through a result collection beyond the initially visible items
- **THEN** focus follows the intended drama without inheriting selection or state from another item
- **AND** returning to a previously visited region restores the expected content position

#### Scenario: A cover image is unavailable

- **WHEN** a drama cover cannot be loaded
- **THEN** the user can still identify and open that drama by title and available metadata

### Requirement: Episode navigation is segmented and accurate

Details SHALL display the selected drama's actual description and episodes. Desktop SHALL offer segments of at most 24 episodes and TV at most 12, with adaptive columns. Segment selection MUST preserve episode identity and MUST NOT invent season relationships absent from the service response.

#### Scenario: Choosing an episode in a long drama

- **WHEN** the user opens a drama with more episodes than one segment and changes segment
- **THEN** only that segment's correctly numbered episodes are selectable
- **AND** a saved episode outside the initial segment can be located without traversing every preceding episode

#### Scenario: An episode is locked

- **WHEN** the details response marks an episode unavailable
- **THEN** the episode visibly communicates unavailability and cannot start playback
- **AND** focus, saved progress and availability have distinguishable meanings

### Requirement: Detail failures preserve a recovery path

The application SHALL distinguish pending details from failed details, retain known drama identity and provide retry and return actions. A playback-info failure MUST NOT be presented as successful playback or cause browsing-only history writes.

#### Scenario: Detail loading fails

- **WHEN** loading details fails after opening a result
- **THEN** the drama title remains identifiable and the user can retry or return to the originating collection

#### Scenario: Playback service is not yet implemented

- **WHEN** the user selects an available episode and the service rejects playback
- **THEN** the interface presents a recoverable playback failure
- **AND** no new viewing history is created merely by entering the player
