# Spec Delta

## Purpose

Native installations let users discover, watch and resume available anonymous content without running a separate backend on their computer. Their application-owned data and media resources retain the same behavior and recovery boundaries as the shared web application.

## ADDED Requirements

### Requirement: Native business calls run inside the application

Desktop and TV SHALL execute migrated catalog, guest history and playback operations in their own process, preserving shared DTOs and stable errors. Unsupported account operations SHALL fail explicitly. HTTP preview and technical probe modes MUST be explicitly selected.

#### Scenario: Independent launch

- **WHEN** an installed native application launches with no computer API running and no port reverse
- **THEN** it can search, open details and prepare accessible media using its bundled core
- **AND** unsupported account actions report the existing unavailable error without simulated success

### Requirement: Persistent data belongs to the native application

The system SHALL store guest history only in the host-provided application data directory, preserve it across restarts, and retain incompatible or corrupt files with a recoverable failure. It MUST NOT import legacy data or fall back silently to ephemeral storage.

#### Scenario: Restart after watching

- **WHEN** actual playback has checkpointed and the installed application restarts
- **THEN** the same episode and committed position are available for resume
- **AND** a failed initialization preserves the original files and reports failure

### Requirement: Cancellation and disposal retain bounded ownership

Native requests SHALL have bounded concurrency and cancellable request identities. Cancellation MUST suppress stale results, detach pending preparation owners, and release any ready media handle that loses its caller. Disposal SHALL reject further work and close owned media resources; committed history writes MUST remain durable.

#### Scenario: Navigation during preparation

- **WHEN** a viewer exits or changes episode before preparation completes
- **THEN** the old result cannot replace the new selection
- **AND** the cancelled caller retains no published media handle

#### Scenario: Session shutdown

- **WHEN** a native session is closed repeatedly or its host is destroyed
- **THEN** pending work and media access stop and subsequent requests fail explicitly
- **AND** an already committed history snapshot survives reopening

### Requirement: Local media exposes only authorized representations

Native media SHALL use random loopback listening and opaque per-session handles, preserve GET/HEAD and Range semantics, and enforce exact authority and origin checks. It MUST NOT expose business endpoints, filesystem paths or upstream credentials through the media listener.

#### Scenario: Media boundary

- **WHEN** a native player requests its issued media handle
- **THEN** it receives the same bounded representation and byte-range responses as the core media contract
- **AND** unknown handles, foreign origins, changed Host and business API paths are rejected

### Requirement: Native acceptance preserves approved UI

Native business integrations SHALL reuse approved shared layouts, controls and navigation. Acceptance MUST distinguish fixtures, installed emulator business, real desktop hosts and physical television behavior; preview or headless success MUST NOT stand in for independent installation acceptance.

#### Scenario: Native viewing review

- **WHEN** a native business slice is accepted
- **THEN** UI and function evidence cover search, details, viewing, return and restart resume on the applicable host
- **AND** untested physical devices, assistive technology and release signing remain explicit
