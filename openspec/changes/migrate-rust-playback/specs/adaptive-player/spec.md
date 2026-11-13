# Spec Delta

## Purpose

Let desktop and television users watch an available episode, control playback and resume their own progress using the approved platform layouts. Preserve the video host, navigation context and meaningful failure recovery throughout control and episode changes.

## ADDED Requirements

### Requirement: Player follows the approved target layout

Desktop SHALL present a video stage and episode sidebar using the approved prototype. TV SHALL present an aspect-preserving cinema stage with its control layer and episode panel. Shared controls MUST use the application's theme and target sizes; unavailable interaction services MUST NOT show fabricated success.

#### Scenario: Watching portrait media

- **WHEN** a portrait episode plays on desktop or TV
- **THEN** it preserves its aspect ratio, keeps the picture unobstructed by inactive controls and provides the target's reachable controls and episode selection

#### Scenario: Interface state changes

- **WHEN** controls, pause, progress or panels change within the same episode
- **THEN** the current video host and media position remain intact

### Requirement: Playback exposes real and recoverable states

The player SHALL distinguish preparation, buffering, playing, paused, completed and failed states. Failed preparation or decoding SHALL provide retry and return actions. Controls requiring loaded media MUST remain disabled until usable; retry MUST NOT allow an earlier result to replace the current episode.

#### Scenario: Preparation fails

- **WHEN** playback resolution fails
- **THEN** no simulated video is substituted and retry and return remain reachable
- **AND** the selected drama and episode remain identifiable

#### Scenario: Decoder fails after loading

- **WHEN** the host reports a playback error
- **THEN** loading ends, the error is visible and recovery preserves the selected episode

### Requirement: Controls remain operable on each input target

Available controls SHALL support play/pause, clamped seeking, next available episode, volume, supported rate and quality selection. Keyboard and remote focus MUST remain visible. Fullscreen entry and exit SHALL preserve the active media host, position and controls; unavailable host capabilities MUST be represented honestly.

#### Scenario: User changes playback options

- **WHEN** a supported volume or rate control changes
- **THEN** the host applies that value without recreating the current video

#### Scenario: User changes quality

- **WHEN** the user selects another available quality for the current episode
- **THEN** playback preserves a valid position and only the newest representation can become active

#### Scenario: Last episode is reached

- **WHEN** the current episode has no next available episode
- **THEN** the next action is disabled and completion does not start a locked or unrelated episode

### Requirement: Television owns its control and seek states

With TV controls hidden, Confirm SHALL reveal them and Left/Right SHALL open a clamped seek preview. Confirm SHALL commit that preview and Back SHALL cancel it. Back SHALL close the topmost panel, then cancel a preview or hide controls, before leaving the player. Focus MUST return to valid visible controls.

#### Scenario: Canceling a seek preview

- **WHEN** the user presses Back during an uncommitted TV seek preview
- **THEN** the preview closes without seeking or leaving playback

#### Scenario: Closing an episode panel

- **WHEN** the user presses Back with the episode panel open
- **THEN** only the panel closes and focus returns to its trigger without remounting the video

#### Scenario: Input owns its keys

- **WHEN** a text editor or input-method composition owns keyboard input
- **THEN** player shortcuts do not intercept its editing or composition keys

### Requirement: Episodes and return context remain stable

Episode selection SHALL retain the approved 24-item desktop and 12-item TV segments, display locked states and preserve episode identity. Returning from playback SHALL restore the originating detail segment and the original browse context, including a valid source focus and list anchor.

#### Scenario: Selecting a late episode

- **WHEN** the user selects an available episode from a later segment and returns from playback
- **THEN** that segment and source episode remain selected and reachable

#### Scenario: Leaving a player flow

- **WHEN** the player returns through details to the originating search or history collection
- **THEN** query, list position and source identity remain consistent with the browsing flow

### Requirement: Resume and persistence reflect actual viewing

Progress SHALL be written only after actual playback and only for the selected drama, episode and current owner. Completed status, serial writes, retry and compact history records MUST remain effective. Backgrounding SHALL pause and checkpoint actual viewing without automatic restart; stale media events MUST NOT update another session.

#### Scenario: Saved episode resumes after service restart

- **WHEN** the user restarts the service and resumes an unfinished available saved episode
- **THEN** it restores that episode and its valid saved position from Rust history

#### Scenario: User exits before playback

- **WHEN** the user returns before the host has actually played media
- **THEN** no new history is written and existing progress is unchanged

#### Scenario: Completed episode closes

- **WHEN** completion is followed by cleanup or a delayed progress callback
- **THEN** the completed checkpoint is not overwritten by an unfinished value

### Requirement: Appearance and motion retain control usability

Player controls SHALL remain readable and operable in both appearances, at supported desktop sizes and TV system font scaling. Reduced motion SHALL remove nonessential movement while preserving focus and immediate state feedback. Unsupported narrow layouts MUST NOT be introduced.

#### Scenario: Large text and reduced motion

- **WHEN** the user operates the player with a supported increased system text size and reduced motion
- **THEN** available controls remain identifiable, reachable and within the visible player area without unnecessary animation
