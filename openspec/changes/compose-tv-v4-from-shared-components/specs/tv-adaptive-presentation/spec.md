# TV Adaptive Presentation Delta

## Purpose

Provide a television presentation that follows the v4 design at viewing distance while preserving real product capabilities, remote navigation, source identity and shared behavior across supported hosts. Define observable adaptation and recovery rules for the component-based reconstruction.

## ADDED Requirements

### Requirement: A single visible focus indicator has one owner

Each focused television action or input SHALL have one visible focus indicator, including native modal windows. A composite field MUST NOT draw an additional active ring around its focused child. Disabled or pending controls MUST reject activation and programmatic action focus, and re-enabled controls MUST become reachable again.

#### Scenario: A native parameter window opens

- **WHEN** a playback or settings modal opens in its own native window
- **THEN** remote movement reaches its controls, one indicator follows the actual focused control and Back closes only the current layer before restoring its source

#### Scenario: A control recovers from disabled state

- **WHEN** a grouped action is disabled while focused and later re-enabled
- **THEN** focus hands off to an enabled action, cannot be restored to the disabled action and can reach it again after recovery

### Requirement: Passive content retains reading semantics

Passive content MUST NOT acquire button semantics or action focus merely because it has a label, border or a parent focus group. Explicit reading regions and readonly text selection SHALL retain their accessibility behavior without pretending to be actions.

#### Scenario: Passive content is adjacent to an action

- **WHEN** remote focus moves through a row containing text, an image and an action
- **THEN** the action is the action stop; static content does not gain a clickable outline, while an explicitly named reading region keeps its non-clicking reading behavior

### Requirement: Television geometry respects the host content area

The television interface SHALL lay out controls in host logical units and keep essential text, actions and focus outlines inside the effective system and overscan safe area. Safety margins MUST be applied once. Media SHALL retain its aspect ratio, including when filling the surface.

#### Scenario: Output resolution and insets change

- **WHEN** the television output resolution or system insets change
- **THEN** essential controls and focus outlines remain visible, media retains its aspect ratio and safety margins are not duplicated

### Requirement: Text enlargement reflows content independently

The interface SHALL honor system text enlargement once and reflow containers, actions and collections without scaling the entire screen. At the 960-point design width, standard, large and extra-large text SHALL use collection density tiers from the approved v4 design; narrower regions MUST reduce columns further when required for readable content.

#### Scenario: Large text in a constrained results region

- **WHEN** text enlargement reaches 130% or 200% and a sidebar reduces the results width
- **THEN** text enlarges once, results use fewer columns as necessary, actions remain reachable and media images do not enlarge merely because text did

### Requirement: Shared controls retain platform behavior

The television presentation SHALL use the shared control family with consistent focus, selected, current, pending and disabled meanings. Television visual changes MUST preserve existing desktop and web control behavior and their default visual settings.

#### Scenario: A shared control has a television appearance

- **WHEN** the same control is presented on television and desktop
- **THEN** television uses its approved geometry while desktop retains its existing defaults, and each platform exposes the same supported value and action semantics

### Requirement: Four primary destinations preserve all supported entry points

Television SHALL offer Featured, Discover, Rankings and Mine as primary destinations, with search and settings as distinct tools. Existing actor works, seasons, calendar, reminders, ranking radar, account and maintenance capabilities MUST remain reachable through appropriate secondary entries. Moving navigation focus MUST NOT change destinations until activation.

#### Scenario: Reach an existing secondary capability

- **WHEN** a user opens reminders, actor works or ranking radar through its owning destination
- **THEN** the existing capability remains available and Back restores its source without resetting the shared session or collection

### Requirement: Collections restore identity after reflow and removal

Collections SHALL retain exact entity identity, loaded content and a valid reading anchor across detail navigation, density changes and temporary hiding unless newer user intent supersedes restoration. Missing or removed targets MUST hand focus to a valid remaining target or the page's primary entry. Actor and drama identities MUST remain distinct.

#### Scenario: Return after columns change

- **WHEN** a user returns from detail after the source collection changes column count
- **THEN** the original entity is located in the new layout and receives focus without discarding completed pages or using an obsolete row index

#### Scenario: The focused record is removed

- **WHEN** a successful management action removes the focused record
- **THEN** focus moves to a valid remaining record or the page's primary entry without focusing hidden or recycled content

### Requirement: Remote editing and overlays preserve input ownership

The interface SHALL support remote activation, directional movement and layered Back behavior using the active input or overlay owner. The remote keyboard SHALL edit the existing search query and retain native input for Chinese. Closing an overlay MUST restore a valid source focus unless newer user intent takes priority.

#### Scenario: Cancel an active playback panel

- **WHEN** Back is pressed while a playback panel or uncommitted slider preview is active
- **THEN** that layer handles cancellation before route navigation and the media session remains intact

#### Scenario: Edit and submit a query

- **WHEN** a user edits a query with remote keys or native input and submits it
- **THEN** the existing search flow receives the query without a second search history or unsupported transliteration behavior

### Requirement: Visual reconstruction preserves honest business states

Pages SHALL render actual capability and operation states for catalog, playback, account and library actions. Loading, empty, pending, failure and unavailable states MUST remain distinct. Prototype data MUST NOT become production content, account state, metrics or successful operation feedback. Television poster slots MUST preserve the complete source image aspect ratio.

#### Scenario: A library write fails

- **WHEN** a library write fails
- **THEN** the previous committed library state remains with retry feedback rather than displaying a successful change

#### Scenario: A poster image is unavailable

- **WHEN** a poster image cannot load
- **THEN** the card retains its title, placeholder and supported action

### Requirement: Review surfaces exercise production controls

Component review surfaces SHALL use the same controls and interaction semantics as product pages, with stable accessible roles, labels and automation identities. Synthetic data validation MUST remain identified separately from real-host, real-data and actual user-flow acceptance.

#### Scenario: A component fixture passes

- **WHEN** a synthetic fixture demonstrates large text, remote focus and failure handling
- **THEN** the result is recorded as component or regression evidence and does not imply that a real playback or account flow has passed acceptance
