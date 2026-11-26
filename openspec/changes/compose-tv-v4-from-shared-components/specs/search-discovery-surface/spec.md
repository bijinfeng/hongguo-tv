# Search Discovery Surface Delta

## MODIFIED Requirements

### Requirement: Approved layouts have honest states

The system SHALL reuse the approved desktop chips/poster grid and television remote-input workspace with a text-adaptive content grid, preserve short/comic meaning and keyboard/remote access, and use existing shared controls, theme and motion. Loading, empty and failed reads MUST remain distinguishable; failed reads SHALL offer retry. No placeholder content or invented ranking/score SHALL fill missing data.

#### Scenario: Optional empty or failed content

- **WHEN** discovery returns no public content or fails
- **THEN** recent searches and manual search remain usable, empty content has no invented cards and failures offer an explicit retry

#### Scenario: Television input and results remain independently usable

- **WHEN** television text enlargement reduces available space in the search workspace
- **THEN** input remains reachable, keyboard and history content can scroll locally, and the result grid reduces columns and scrolls without displacing the query editor
