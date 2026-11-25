# Spec Delta

## Purpose

定义用户在同意后才会发生的客户端诊断上报：哪些失败可上报、事件携带什么字段、哪些数据永不离开设备，以及关闭时链路必须完全静默。

## ADDED Requirements

### Requirement: Consent gates every report

The system SHALL keep diagnostics reporting disabled until the user turns it on in settings. While disabled the app SHALL create no reporter, open no connection to the reporting service and send no event, and existing local logging SHALL continue unchanged.

#### Scenario: Default state sends nothing

- **WHEN** the app starts with no stored consent
- **THEN** the diagnostics preference reads off, no reporting endpoint is contacted, and local logs still record the same lines as before

#### Scenario: Turning the switch on and off

- **WHEN** the user turns the switch on and later turns it off
- **THEN** reporting starts from the next recorded event and stops immediately on turning off, with no queued event sent afterwards

#### Scenario: Consent survives restart

- **WHEN** the user turns reporting on and the app restarts
- **THEN** the stored preference is read as on and reporting resumes without asking again

### Requirement: Report payload has a fixed field set

The system SHALL send each diagnostic event with a stable category, a stable error code where one exists, the operation name, the product version and build, the platform name, and a per-installation session identifier. Free-form text SHALL be limited to the message of the failure and its stack when the failure produced one. The system SHALL NOT send tokens, QR or login credentials, signed media URLs, complete account data, comment or episode payloads, or raw user input.

#### Scenario: A catalog request fails

- **WHEN** a content request fails and reporting is on
- **THEN** the event carries the category, the stable error code, the operation and the version fields, and contains no request URL with signature parameters, no token and no account identity

#### Scenario: A playback failure

- **WHEN** playback preparation fails with a media source
- **THEN** the event records the failure category and code without the signed media URL, the episode list or the comment content

#### Scenario: User-typed text stays local

- **WHEN** a search or login flow fails while the user has typed input
- **THEN** the reported event contains neither the typed text nor a derived hint that reconstructs it

### Requirement: Delivery never degrades the product

The system SHALL treat reporting as best-effort. A refused, failed, slow or unavailable reporting call SHALL NOT block rendering, navigation, playback, persistence or the user-visible error path. The visible behaviour of a failing feature SHALL be identical whether reporting is on or off.

#### Scenario: Reporting host is missing

- **WHEN** the app runs where no report handler is registered
- **THEN** recording an event is dropped without an error surfaced to the user and the failing feature still shows its own recovery message

#### Scenario: Reporting backend is unreachable

- **WHEN** the reporting service cannot be reached or times out
- **THEN** the app continues normally and no retry loop or repeated user-visible notice appears

### Requirement: Fatal engine errors reach the reporter

On TV the app SHALL forward the engine's fatal error reports to the reporter when reporting is on, keeping the existing local log line regardless of consent. Each forwarded error SHALL be attributed to the running product version and build.

#### Scenario: Uncaught engine error with consent on

- **WHEN** the engine reports a fatal error and reporting is on
- **THEN** the reporter receives it tagged with the product version and build, and the local log still records the error

#### Scenario: Uncaught engine error with consent off

- **WHEN** the engine reports a fatal error and reporting is off
- **THEN** only the local log records the error and nothing leaves the device
