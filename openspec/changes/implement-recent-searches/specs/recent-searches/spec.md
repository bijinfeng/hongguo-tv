# Spec Delta

## Purpose

Viewers can reuse deliberately submitted search terms on the same installation without typing them again. Recent keywords remain independent of viewing history and upstream account data, and clear has an explicit durable outcome.

## ADDED Requirements

### Requirement: Submitted keywords persist in a bounded local list

The system SHALL persist at most ten unique submitted keywords, newest first. Whitespace MUST be trimmed and collapsed; empty text, controls and more than 100 UTF-16 units or the existing website limit of 80 characters MUST be rejected. Draft edits MUST NOT be saved or sent to the upstream service.

#### Scenario: Repeat and restart

- **WHEN** a viewer submits an already saved keyword and restarts the application
- **THEN** that normalized keyword appears once at the front and at most ten keywords remain

#### Scenario: Invalid input

- **WHEN** a keyword is empty, contains controls or exceeds its limit
- **THEN** the write fails explicitly and committed keywords remain unchanged

### Requirement: Keyword mutations preserve unrelated data

Keyword storage SHALL be owned by Rust and shared by HTTP/native clients. Mutations MUST return only committed snapshots, preserve viewing history and existing files on migration failure, and never import legacy client data or publish keywords to an upstream account.

#### Scenario: Upgrade an existing installation

- **WHEN** an installation with committed viewing history first uses recent searches
- **THEN** its history remains intact and its recent keyword list starts empty

### Requirement: Clearing recent searches is explicit and recoverable

The system SHALL expose clear only for saved keywords and retain the last committed list on failure. Failed mutations MUST offer an explicit retry; a later successful clear MUST NOT be overwritten by an earlier load or save response.

#### Scenario: Clear fails and retries

- **WHEN** a clear fails and the viewer retries
- **THEN** keywords remain visible until the clear commits, then the empty state replaces them without changing viewing records

### Requirement: Recent keywords follow approved browsing interaction

The approved desktop and TV find pages SHALL offer saved keywords as named keyboard/remote actions before a query is submitted. Choosing one MUST execute real search. Clearing the current query MUST return to discovery without deleting keywords. Existing pagination and appended result detail/return behavior MUST remain usable.

#### Scenario: Reuse a saved term

- **WHEN** a viewer activates a recent keyword with keyboard or remote
- **THEN** the input and submitted search use that term, and returning to the discovery state shows the refreshed recent list
