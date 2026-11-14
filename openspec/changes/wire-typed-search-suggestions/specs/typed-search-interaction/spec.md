## Purpose

Let viewers use shared typed suggestions to reach dramas, actor works or ordinary search while preserving editable input, current content and exact return context across Web, desktop and Android TV.

## ADDED Requirements

### Requirement: Owned current input suggestions

The app SHALL debounce committed nonempty input by240ms and request typed suggestions only while the search interaction is active. Composition, empty/over100-scalar/control input, dismissal, navigation and disposal MUST cancel pending timers/reads and ignore late results. Escape/back closes suggestions first; outside press and Tab dismiss without stealing focus. Failures remain recoverable without blocking ordinary search.

#### Scenario: Superseded or composing input

- **WHEN** an input method is composing, a query changes or the interaction loses ownership
- **THEN** no obsolete result opens suggestions, navigates or changes focus; committed input may start one current request after the debounce.

### Requirement: Meaningful activation

A supported explicitly identified drama suggestion SHALL open detail, a valid actor suggestion SHALL open actor works, and other suggestions SHALL submit name as ordinary search. The app MUST NOT infer identities or queries from opaque key, invent actors, or silently truncate a name. Activation MUST use the current displayed response and execute once.

#### Scenario: Three meanings

- **WHEN** a user activates current drama, actor or keyword rows by pointer, keyboard or DPAD
- **THEN** the corresponding flow opens using the exact series ID, actor ID or visible name and no viewing progress is written.

### Requirement: Recoverable ordinary search validation

Ordinary search SHALL reject control characters, normalize whitespace, and enforce80 Unicode scalar and100 UTF16 bounds before search/history requests. Invalid input MUST retain the original draft, usable prior results and input focus, with concise feedback. Valid submission preserves existing recent-keyword, pagination and retry behavior.

#### Scenario: Long keyword from suggestions

- **WHEN** a keyword suggestion has81 scalars or more than100 UTF16 units
- **THEN** its full name remains editable, no search or recent write occurs, and the user can shorten and resubmit; valid actor/drama identity actions do not submit that name as a keyword.

### Requirement: Actor works browsing

The shared app SHALL read the generated actor works contract, show the actor name and available public summary above existing poster cards, and keep loading/error/retry/empty states distinct. It MUST preserve the selected actor, item identity, scroll and source focus through actor→detail→back→search. Hidden or superseded reads MUST not navigate or steal focus. It MUST NOT invent pagination or claim all works across the web.

#### Scenario: Works and return

- **WHEN** a user opens an actor, browses later works, opens detail and returns twice
- **THEN** the same work and source suggestion/input are restored when still owned; newer input or user focus wins.

### Requirement: Existing design and cross-host review

The feature SHALL reuse the approved header search, shared tokens, poster grid/TV shelves and existing navigation, with styled controls in UI and behavior in App. Loading, empty, error, pointer, keyboard/DPAD, IME and reduced-motion behavior MUST be reviewed independently and observed in actual supported hosts. Automated tests alone MUST NOT be reported as physical TV or assistive-technology acceptance.

#### Scenario: Honest validation

- **WHEN** the slice is completed
- **THEN** check/build, meaningful regression tests and independent function/UI review evidence are recorded, and actual host observations and remaining environment limits are named separately.
