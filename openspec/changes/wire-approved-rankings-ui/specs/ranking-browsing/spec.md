# Spec Delta

## Purpose

Provide anonymous ranking browsing that preserves the official selector identities, page continuation and distinct actor/drama destinations, while adapting the approved desktop and television layouts without fabricating metrics or account state.

## ADDED Requirements

### Requirement: Dynamic ranking choices

The system SHALL display server-provided ranking, nested subranking and panel labels and opaque values. Explicit choices SHALL win over later default hints. Empty IDs SHALL remain legitimate options without a fabricated All label.

#### Scenario: Choose another ranking

- **WHEN** a user selects a server-provided ranking or subranking
- **THEN** its exact ID is sent, dependent choices and page continuation reset, and the selected option remains identified independently of keyboard focus

#### Scenario: Continuation omits selectors

- **WHEN** a continuation returns an empty selector tree
- **THEN** the existing choices and explicit selection remain available

### Requirement: Exact read-only continuation

The system SHALL use the service offset/session and at most 128 unique decimal shown IDs, preserve ordered entries using kind:id identity, and reject nonadvancing has-more cursors. Empty advancing pages SHALL remain continuable. Failure SHALL retain completed entries and retry the same request.

#### Scenario: Actor and drama share an ID

- **WHEN** a page contains an actor and drama with the same decimal ID and duplicates of either
- **THEN** both distinct entries appear once, while shown IDs remain unique and decimal

#### Scenario: Empty page and retry

- **WHEN** an empty advancing continuation is followed by a request failure
- **THEN** completed rows remain and retry uses the same selection, offset, session and shown values

### Requirement: Lifecycle ownership

The system SHALL cancel pending work when hidden, backgrounded or disposed and reject late writes even if transport ignores abort. Completed pages SHALL survive temporary hiding without automatic refetch.

#### Scenario: A stale response arrives

- **WHEN** a cancelled old selection or hidden page response resolves
- **THEN** it cannot replace current rows, choices, loading or error state

### Requirement: Approved layout and precise return

The system SHALL present desktop ranked media rows and a TV two-column ranked list, route dramas to detail and actors to works, and restore the exact source identity and scroll position unless newer user intent takes priority. Only explicit rank, badge and heat labels SHALL be displayed.

#### Scenario: Return from a later actor

- **WHEN** an actor on a later page is opened and the user returns
- **THEN** completed pages, chosen selectors, scroll anchor and actor source focus are retained without opening a same-ID drama

#### Scenario: Missing rank

- **WHEN** an item lacks an explicit rank
- **THEN** the system does not infer rank from row index

#### Scenario: Prototype demonstration has no real capability

- **WHEN** a prototype presents a five-axis rating without supporting upstream behavior or real data
- **THEN** the rating is cancelled rather than rendered, synthesized from heat or tracked as a missing MVP protocol; the fixed upstream radar.go third-party ranking snapshots and growth lists remain a separate migration limited to their existing behavior and fields

#### Scenario: Dense valid selectors retain access to content

- **WHEN** a ranking supplies 32 named panels and eight nested child levels
- **THEN** all selector groups remain reachable in a bounded scrolling region while results, errors and continuation actions retain usable space at the supported desktop size and TV text scale

#### Scenario: Selector IDs overlap across dimensions

- **WHEN** a direct subranking shares its opaque ID with an option in a preceding subranking's panel
- **THEN** choosing the direct subranking keeps that subranking selected rather than following the panel ancestor

#### Scenario: Explicit selection is in a nested panel

- **WHEN** a selected panel option owns another panel whose option is explicitly chosen
- **THEN** every panel ancestor and the chosen descendant group remain available with their exact IDs
