# Spec Delta

## Purpose

Allow a signed-in user to explicitly bring newer valid viewing history from this application's guest library into their account. Preserve original viewing times and guest data, avoid importing favorite membership, and make repeated or partial imports recoverable without resurrecting deleted records.

## ADDED Requirements

### Requirement: Import is explicit and owner scoped

Login and session recovery MUST NOT automatically merge guest records. The account page SHALL show eligible import counts and require explicit confirmation in the current owner epoch before importing this application's own guest history.

#### Scenario: Login with existing guest records

- **WHEN** the user signs in with eligible guest history
- **THEN** account history remains independent until the user confirms import
- **AND** a stale confirmation after an owner transition cannot import into the new account

### Requirement: Import only newer valid viewing history

Import SHALL deduplicate valid guest progress by exact series identity and select its latest viewing timestamp. Only progress strictly newer than the account record, prior import watermark and local history-hidden timestamp SHALL be eligible; original viewing time MUST be retained.

#### Scenario: Equal or invalid guest progress

- **WHEN** a guest record is older, equal, previously imported, hidden later, or lacks valid playback identity
- **THEN** it is not imported or queued for upload
- **AND** a genuinely newer guest viewing event can become eligible later

### Requirement: Membership and guest data remain independent

Import SHALL preserve account favorite membership and leave the guest library unchanged. Guest favorites, follow-update and reservation membership MUST NOT be imported as history or account membership.

#### Scenario: Import a drama with different favorites

- **WHEN** guest progress is imported for a drama with a different account favorite state
- **THEN** account progress updates with its original viewing time while the account favorite state remains unchanged
- **AND** the guest's progress and favorite remain unchanged

### Requirement: Import commits records and retry state together

Imported progress, its pending upload and import watermark SHALL commit atomically. Failed storage MUST NOT publish imported counts or advance watermarks. The outbox SHALL retain at most 2000 operations while allowing replacement of matching pending progress.

#### Scenario: Queue capacity permits a partial import

- **WHEN** more valid candidates exist than available pending-operation slots
- **THEN** eligible work that fits is committed and the result reports imported and remaining counts
- **AND** a full queue with no replaceable work fails without losing candidates

#### Scenario: Restart or upload failure after import

- **WHEN** the application restarts or cloud upload fails after a committed import
- **THEN** imported progress and pending work survive, and repeating import does not duplicate old work
- **AND** imported records deleted later do not return solely because the import watermark was forgotten

### Requirement: Import recovery is visible and accessible

The shared account page SHALL show confirmation, progress, partial completion and explicit retry without inventing rollback after dispatch. Keyboard, TV navigation and reduced-motion behavior SHALL preserve focus and readable records; real upload acceptance MUST follow explicit user authorization.

#### Scenario: Leave during confirmed import

- **WHEN** the user leaves or backgrounds the account page after import was dispatched
- **THEN** committed work remains authoritative and its result can be reconciled on return
- **AND** completion does not navigate, steal hidden-page focus or claim an unverified cloud upload succeeded
