# Ranking Browsing Delta

## MODIFIED Requirements

### Requirement: Approved layout and precise return

The system SHALL present desktop ranked media rows and a TV selector sidebar with a text-adaptive ranked grid, route dramas to detail and actors to works, and restore the exact source identity and scroll position unless newer user intent takes priority. Only explicit rank, badge and heat labels SHALL be displayed.

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

#### Scenario: Television results reflow beside selectors

- **WHEN** television text enlargement or selector width reduces the results area
- **THEN** the grid reduces columns while preserving selected opaque values, loaded entries, continuation access and exact entity focus restoration
