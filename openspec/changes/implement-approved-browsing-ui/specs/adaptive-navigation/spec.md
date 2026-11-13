# Spec Delta

## Purpose

Provide navigation that fits desktop browsing and television remote input while preserving the same user tasks. Users can return to their previous content, focus and reading position without confusing unavailable features with working capabilities.

## ADDED Requirements

### Requirement: Navigation follows the selected product target

The application SHALL provide a sidebar and search workspace for Web/desktop and independently composed top navigation, content regions and a search page for TV. Target selection MUST be explicit and MUST NOT classify every Android environment as a TV.

#### Scenario: Desktop and TV use their intended composition

- **WHEN** the user opens the desktop application or the TV application
- **THEN** each shows its corresponding navigation composition with home, catalog search, viewing history and account reachable
- **AND** choosing the same drama has the same business meaning on both targets

### Requirement: Navigation restores task context

The application SHALL preserve search input, results, list position, episode segment and source control across detail navigation. Back SHALL dismiss the topmost owned overlay before returning to the source page and SHALL restore a valid source focus without moving focus into hidden content.

#### Scenario: Returning from a long result list

- **WHEN** the user opens a drama from a scrolled result list and returns
- **THEN** the original query, result identity, scroll position and drama focus are restored

#### Scenario: Closing a navigation overlay

- **WHEN** the user presses Back or Escape while an overlay is open
- **THEN** only that overlay closes and focus returns to its trigger or the nearest valid control if that trigger no longer exists

### Requirement: Input and focus remain operable

Every available action SHALL have an accessible name and visible focus, and support the target's keyboard or remote controls. Focus and selection SHALL be distinguishable. Editing keys and active input-method composition MUST NOT trigger unrelated navigation; users MUST have a directional exit from TV input fields.

#### Scenario: Editing a TV search query

- **WHEN** the user edits a query with an active input method
- **THEN** composition and caret movement remain owned by the editor
- **AND** after editing the user can leave the field and reach search results with the remote

#### Scenario: Moving focus through available content

- **WHEN** the user moves keyboard or remote focus between navigation and content
- **THEN** the focused control remains visible and does not activate merely because it receives focus
- **AND** its focus indicator does not shift surrounding geometry

### Requirement: Capability availability reflects reality

The application MUST NOT populate production views with design samples or simulate successful unsupported operations. Unavailable sections SHALL be omitted from active navigation or visibly unavailable without a dead route. Existing account and playback flows SHALL remain reachable and present recoverable service failures.

#### Scenario: Opening the first production browsing milestone

- **WHEN** recommendations, rankings or downloads have no implemented service
- **THEN** the application does not show fabricated content or successful actions for those capabilities
- **AND** search, history, account and existing playback entry paths remain available

### Requirement: Appearance and motion preserve usability

The application SHALL preserve readable hierarchy and visible control states in light and dark appearances at supported desktop sizes and on TV. Reduced motion SHALL remove nonessential movement while retaining immediate state feedback and usable focus. Narrow window layouts are outside the product shape and are not designed or verified.

#### Scenario: Changing appearance with reduced motion

- **WHEN** the user views browsing content in either appearance at a supported desktop size or on TV with reduced motion enabled
- **THEN** content hierarchy, focus, selection and unavailable actions remain distinguishable
- **AND** nonessential transitions are removed without delaying input or restoring focus to covered content
