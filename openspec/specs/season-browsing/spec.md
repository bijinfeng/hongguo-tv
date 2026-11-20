# season-browsing Specification

## Purpose
Let viewers browse the complete public series and intentionally choose a playable episode without changing the current media, and continue only to a confirmed adjacent season after its actual final episode ends.

## Requirements

### Requirement: Shared complete season selection

The application SHALL show the service order, exact identities and labels in shared desktop and TV season controls. Focus SHALL remain independent of selection. Playing and resumable states SHALL reflect actual playback and history, independently of the browsed season.

#### Scenario: Browse another season during playback

- **WHEN** the viewer chooses a different season in the episode panel
- **THEN** its summary and episodes replace the browsing context while media and playback history retain the actual playing season until a valid episode is confirmed

### Requirement: Identity-bound browsing details

Details and cached episodes SHALL belong to the selected series identity and content type. Selection changes, hidden pages, real background and disposal SHALL cancel pending ownership and reject late responses. A visible inactive window SHALL retain browsing reads.

#### Scenario: An earlier season detail arrives late

- **WHEN** a viewer selects another season before an old detail request completes
- **THEN** the old result cannot change the visible summary, episodes, error or loading state, or start media or write history

### Requirement: Unplayable seasons remain browsable

Upcoming and unavailable seasons SHALL display their real summary and availability without fetching playable episodes, preparing media, writing history or claiming a reservation. A failed playable-season detail SHALL retain explicit safe retry without displaying another season's episodes.

#### Scenario: An upcoming season contains a trailer

- **WHEN** the viewer selects the upcoming season
- **THEN** its availability is visible and the current media remains unchanged, with no playable-episode, media or reservation request for that season

### Requirement: Adjacent automatic continuation

Only a fully identified actual final episode ending in the foreground SHALL authorize automatic continuation. The successor SHALL be the unique adjacent season in the complete selector, playable with a confirmed unlocked first episode. A relationship endpoint SHALL only resolve a missing current season number and SHALL NOT authorize skipping a season.

#### Scenario: Adjacent season is not yet released

- **WHEN** the adjacent season is upcoming but a later playable season exists
- **THEN** automatic playback stops with the real upcoming status and does not skip to the later season

#### Scenario: Adjacent season is missing

- **WHEN** the selector has a higher season but omits the adjacent season
- **THEN** continuation reports incomplete data and does not infer or start a successor

#### Scenario: A new action overtakes continuation

- **WHEN** selection, seeking, replay, navigation, background or disposal occurs while successor relation or detail is pending
- **THEN** the old response cannot replace media or write another season's history

### Requirement: Preserve recommendation and navigation sources

Cross-season playback SHALL retain the original detail or recommendation return source and bind checkpoints to the actual season and video. Next recommendation SHALL remain distinct from next season. Comments and likes SHALL have no player entry points.

#### Scenario: Continue a recommendation across seasons

- **WHEN** its adjacent season begins and the viewer later chooses the next recommendation
- **THEN** the original recommendation identity governs feed position while progress and media remain attached to their actual seasons, without stale outgoing callbacks changing the new recommendation
