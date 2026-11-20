# Spec Delta

## Purpose

Let viewers browse real anonymous recommendations by channel and move to the next story while preserving their place, playback, recovery path and privacy across desktop, web and Android TV.

## ADDED Requirements

### Requirement: Independent anonymous channels
The app SHALL expose 推荐16, 真人剧39 and 漫剧36 as independent read-only sessions. 关注 SHALL show a login gate without anonymous substitution or fabricated success.

#### Scenario: Switch away and return
- **WHEN** a viewer switches channel after moving to another story
- **THEN** returning restores that channel's current story and continuation context without mixing responses.

### Requirement: Reliable next story
The app SHALL preserve order, deduplicate IDs and carry exact session/cell/plan/offset/shown context. A tab-to-cell continuation at offset0 SHALL be accepted, while an active cell page must advance. Failure SHALL retain the current story and retry the same request.

#### Scenario: Empty advancing continuation
- **WHEN** a continuation contains no new stories but advances its cursor
- **THEN** the current story remains and the next explicit request uses the advanced cursor.

### Requirement: Shared playback and truthful history
Desktop SHALL embed the existing player; TV SHALL preview the story and enter the existing full-screen player explicitly. Episode controls, media release, background pause and actual-playback-only history SHALL retain their existing behavior.

#### Scenario: Browse without watching
- **WHEN** a viewer loads channels or details and moves between TV previews
- **THEN** no viewing history is written and no TV media is prepared until explicit play.

#### Scenario: Return from details
- **WHEN** a desktop viewer opens details from the current story and returns
- **THEN** the same story and episode remain, playback is paused at its retained position, and focus returns to its source unless newer input wins.

### Requirement: Bounded lifetime and usable controls
Hidden, background and disposed sessions SHALL cancel pending work and reject late completion. Navigation, channel selection and next/play/detail controls SHALL be keyboard or remote reachable with visible focus in both themes and at larger TV text sizes.

#### Scenario: Late result after hiding
- **WHEN** a pending channel is hidden or disposed before its response completes
- **THEN** its result cannot replace the current visible content or start media.
