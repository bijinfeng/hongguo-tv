## Purpose

Provide faithful shared category browsing with real selector identities, isolated continuation context and retained navigation so users can find dramas without confusing keyword search with local filtering.

## ADDED Requirements

### Requirement: Honest approved category controls

Category browsing SHALL use desktop labeled choice rows and TV compact selectors for type, topic and ordering. All MUST send explicit empty selections. Topic and type choices MUST use supported service IDs; latest and popularity MUST map to online_time and hot_score. General ordering MUST omit a specific sort choice, never relabel collection count as popularity.

#### Scenario: Select a topic

- **WHEN** a user selects a supported topic or changes type
- **THEN** a fresh category page is requested with the exact ID, pagination resets, and a type change clears the prior topic.

### Requirement: Owned reads and faithful continuation

Category reads SHALL stop on hiding, backgrounding or disposal and ignore late completions. Continuation SHALL retain ordered unique summaries, service session and advancing offset, with at most 128 shown IDs. Errors MUST preserve completed pages and retry the same cursor. Empty advancing pages MUST allow continuation; omitted continuation filters MUST preserve loaded choices.

#### Scenario: Change while loading more

- **WHEN** a user changes selection during continuation and the old request later resolves
- **THEN** only the new selection can publish results and the prior page cannot replace it.

### Requirement: Separate searchable landing and retained sources

Find-drama navigation SHALL open category browsing while keyword search, recent searches, discovery and typed suggestions remain reachable. Category filters MUST NOT pretend to filter keyword results. Returning from detail or search MUST retain the exact category selection, loaded pages, list anchor and focus unless newer input supersedes restoration.

#### Scenario: Browse and return

- **WHEN** a user opens a later category card, returns, searches and returns to find dramas
- **THEN** the original category list and selection remain available without an unrelated result or focus jump.

### Requirement: Verified shared presentation

New controls SHALL reuse shared themes, motion and semantic keyboard behavior. Loading, failure, empty, long options and retry MUST remain usable in both appearances and supported host sizes. Headless regression and visible host evidence MUST be reported separately, with independent functional and UI review before a focused local commit.

#### Scenario: Failed page retry

- **WHEN** a page fails in a visible host
- **THEN** the existing cards remain actionable, a named retry works by keyboard, and successful retry retains prior order and source identity.
