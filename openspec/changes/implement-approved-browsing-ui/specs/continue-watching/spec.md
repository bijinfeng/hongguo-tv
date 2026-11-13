# Spec Delta

## Purpose

Help users resume their own previously watched dramas from home or viewing history with consistent episode and progress information. Keep real viewing records authoritative and distinguish empty history, loading failures and completed episodes without using demonstration content.

## ADDED Requirements

### Requirement: Home and history show the same real records

Home SHALL show a compact continuation section derived from the configured history service, and viewing history SHALL show its full available records ordered by latest viewing time. Both SHALL agree on drama, episode, position and completion state. Empty history MUST NOT be filled with sample dramas.

#### Scenario: A saved record appears in both places

- **WHEN** the history service returns a previously watched drama
- **THEN** home and viewing history display consistent saved episode and progress information
- **AND** the user can open the same drama from either location

#### Scenario: A new installation has no history

- **WHEN** the history service returns an empty record list
- **THEN** home offers a reachable catalog-search action and history presents its empty state
- **AND** neither view fabricates a previously watched drama

### Requirement: Resume uses the selected drama's progress

The resume action SHALL use only the selected drama's saved episode and position when that episode remains available. A missing or unavailable saved episode SHALL have an explicit available-episode recovery path. A completed episode MUST NOT be resumed at its end as though it were unfinished.

#### Scenario: Resuming a saved second episode

- **WHEN** the user chooses resume for a drama saved at episode two and fifteen seconds
- **THEN** the selected playback episode is episode two
- **AND** when playback becomes available it restores fifteen seconds according to the existing playback policy

#### Scenario: The saved episode is no longer available

- **WHEN** details no longer contain an available episode matching the saved record
- **THEN** the interface makes that limitation clear and allows choosing another available episode
- **AND** it does not transfer the old position into a different episode

### Requirement: Browsing never creates viewing progress

Opening home, history, details or a player without actual playback SHALL NOT create or overwrite progress. Existing checkpoint, completion and save-retry behavior SHALL remain effective during the UI migration, and records MUST NOT contain comments or complete episode details.

#### Scenario: Opening a player and returning before playback

- **WHEN** the user enters a player and returns before actual playback begins
- **THEN** existing history remains unchanged and no new record is created

#### Scenario: A completed session is closed

- **WHEN** an episode completes and its player later closes
- **THEN** the saved completion state is not overwritten by an unfinished exit checkpoint

### Requirement: History errors are distinct from empty history

History loading or save failures SHALL present a recoverable error without implying there are no records. A failed refresh SHALL preserve already available history. The user SHALL be able to retry without losing the active browsing context.

#### Scenario: Refreshing known history fails

- **WHEN** a history refresh fails after records were loaded
- **THEN** known records remain visible with a retry action
- **AND** the failure is not displayed as a successful empty history response
