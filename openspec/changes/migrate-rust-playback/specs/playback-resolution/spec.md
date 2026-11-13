# Spec Delta

## Purpose

Resolve an available drama episode into a usable local playback resource while preserving identity, bounded recovery and cancellation. Keep anonymous playback separate from account credentials and prevent unavailable or incompatible sources from appearing successful.

## ADDED Requirements

### Requirement: Playback validates the selected episode

The service SHALL validate drama ID, video ID, supported content family, quality and codec mode before upstream work. It MUST preserve exact string IDs and MUST NOT substitute another episode or return success for unavailable content.

#### Scenario: Invalid playback selection

- **WHEN** a request has an invalid ID or unsupported mode or content family
- **THEN** it fails with a stable input error before registration or media requests

#### Scenario: Source identity does not match

- **WHEN** an upstream model identifies a different video from the selected episode
- **THEN** the source is rejected and never becomes that episode's playback resource

### Requirement: Resolution uses bounded and isolated recovery

Resolution SHALL use only configured playback providers with bounded attempts and deadlines. Anonymous identities MUST be isolated from account credentials. Business rejection MUST remain distinguishable from transient transport failure; fallback MUST NOT bypass episode access restrictions.

#### Scenario: A provider stalls

- **WHEN** one provider does not complete within its allocated attempt budget
- **THEN** recovery remains within the overall deadline and eventually succeeds with a usable source or returns a classified failure

#### Scenario: Upstream denies access

- **WHEN** the selected episode receives an explicit access or business rejection
- **THEN** the service reports that rejection without an unrestricted fallback loop or fabricated playable media

#### Scenario: Anonymous identity is refreshed

- **WHEN** confirmed empty responses permit a bounded identity refresh
- **THEN** simultaneous requests share that refresh and late failures cannot replace a newer accepted identity
- **AND** no account cookies or tokens enter anonymous requests

### Requirement: Source acceptance includes media readiness

The service SHALL accept a source only after validating its supported format and media readiness. An incompatible codec, malformed model or failed media preparation MUST NOT be reported as successful playback. Returned data MUST contain a local opaque media path rather than upstream secrets.

#### Scenario: A model exists but cannot play

- **WHEN** a response contains only an incompatible codec or unusable media
- **THEN** it does not mark that provider successful and returns a recoverable classified error when permitted recovery is exhausted

#### Scenario: Quality changes

- **WHEN** the user chooses a supported quality or codec mode for the same episode
- **THEN** the selected representation matches the request or explicitly reports an allowed fallback
- **AND** another representation cannot overwrite the current request's identity

### Requirement: Cancellation stops owned preparation

Leaving playback, changing episodes or shutting down SHALL cancel obsolete resolution and media preparation. Shared work SHALL remain active only while it has a live owner. Late completion MUST NOT publish a canceled resource or change the active episode.

#### Scenario: Episode changes during preparation

- **WHEN** episode B replaces episode A before A is ready
- **THEN** A's obsolete work is canceled or detached from its remaining owners
- **AND** only B can become the current player source

#### Scenario: Last owner leaves

- **WHEN** every owner cancels a pending preparation
- **THEN** its network work and temporary resources are released within a bounded interval

### Requirement: Failures disclose no playback secrets

Errors and diagnostics SHALL expose stable stage and failure codes without signed upstream URLs, keys, cookies, device identifiers or response bodies. Unsupported or failed playback MUST NOT change viewing history.

#### Scenario: Upstream network failure

- **WHEN** a transport error contains a signed request URL
- **THEN** the client and ordinary logs receive only sanitized diagnostics and a retry path
- **AND** no viewing progress is saved
