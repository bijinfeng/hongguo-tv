# Spec Delta

## Purpose

Let authenticated users read their actual follow-update membership and explicitly follow or unfollow a precise series through the formal application. Preserve account isolation, honest remote outcomes, existing viewing flows and accessible navigation across desktop, web and TV.

## ADDED Requirements

### Requirement: Follow membership is account-owned and independent

The system SHALL keep follow-update membership separate from favorites, reservations and viewing history. Reads and mutations MUST require the current authenticated owner and epoch. Guests MUST NOT issue authenticated follow requests or acquire synthetic follow membership.

#### Scenario: Guest activates follow

- **WHEN** a guest activates the detail follow action or opens the follow page
- **THEN** the application offers its existing account login entrance without issuing a cloud follow request
- **AND** returning from login does not automatically replay the original write intent

### Requirement: Membership snapshots require complete validated pagination

The system SHALL publish a new authoritative membership snapshot only after every required upstream page is validated within bounded resources. Errors, malformed identity, unsupported envelopes, stalled or cyclic continuation and exhausted budgets MUST NOT produce an empty or partial authoritative snapshot.

#### Scenario: A later page fails

- **WHEN** a refresh receives valid earlier pages followed by an invalid page or timeout
- **THEN** the refresh reports failure and preserves the prior same-owner snapshot as stale
- **AND** an absent item is not classified as unfollowed from those partial results

#### Scenario: Identity is valid but card metadata is unavailable

- **WHEN** a member has a valid series identity but lacks supported playable card metadata
- **THEN** it remains a member with an honest unavailable-content presentation
- **AND** no episode video identity or playback route is fabricated

### Requirement: Remote protocol preserves precise identities

The system SHALL use the fixed reference follow-list and follow-mutation protocols, exact decimal series identities and explicit desired boolean state. Reservation item IDs and episode video IDs MUST NOT substitute for a follow series identity. Optional update labels and progress MUST originate from actual response fields.

#### Scenario: Follow list uses the reference nested card shape

- **WHEN** the list returns a series identity outside its common and expand card fields
- **THEN** that identity is retained as a series identity and nested display fields are normalized
- **AND** it is never published as a playable episode identifier

### Requirement: Mutations express explicit online intent

The system SHALL send only an explicit user request to add or cancel one exact series. It MUST prevent overlapping conflicting mutations, reject invalid scope before dispatch, and distinguish remote acknowledgement from observed membership. It MUST NOT queue offline follow success or silently resend an ambiguous mutation.

#### Scenario: User cancels a followed series

- **WHEN** the user activates cancel for a confirmed followed series
- **THEN** one request expresses the desired unfollowed state for that exact series
- **AND** the confirmed UI state changes only after a valid same-scope membership observation

#### Scenario: Follow write is offline

- **WHEN** the write cannot reach the remote service
- **THEN** the application reports the failure or uncertainty without presenting a successful follow change
- **AND** no favorite operation, history checkpoint or offline replay item is created

### Requirement: Lost responses reconcile without assuming rollback

After ambiguous delivery, the system SHALL retain the unresolved desired state and first perform a same-scope complete read ordered after locally admitted mutation work. A matching observation MAY resolve displayed membership but MUST NOT be described as proof of exactly-once execution. Failed or mismatching reconciliation MUST preserve uncertainty and require explicit user action before another write.

#### Scenario: A successful write response is lost

- **WHEN** a dispatched follow mutation may have succeeded but its caller loses the response
- **THEN** recovery reads the complete current follow membership without automatically repeating the write
- **AND** stale or failed observations cannot report cancellation or rollback

#### Scenario: Upstream explicitly rejects a mutation

- **WHEN** the remote service returns a definite business rejection
- **THEN** the operation remains rejected even if later reading refreshes membership
- **AND** the rejection is not converted into operation success by a generic error handler

### Requirement: Scope transitions reject stale work

The system SHALL cancel obsolete work and validate owner and epoch before dispatch and before publication. Already dispatched remote writes MUST NOT be described as rolled back by local cancellation. A switch, logout, shutdown or A-to-B-to-A transition MUST prevent old results from changing current membership, credentials or focus.

#### Scenario: Account changes during follow mutation

- **WHEN** a mutation for account A remains in flight while the active scope changes
- **THEN** its later response cannot update the new scope or restore account A
- **AND** a future visit to A reads its current remote membership rather than reusing the old epoch

### Requirement: HTTP and native expose the same contract

HTTP and native SHALL call the same core use cases and expose equivalent generated DTOs, scope validation, errors and cancellation semantics. Public responses MUST NOT contain credentials, raw upstream payloads, selected endpoint URLs or arbitrary signing options.

#### Scenario: Equivalent malformed continuation across transports

- **WHEN** HTTP and native encounter the same invalid continuation while reading follow membership
- **THEN** both return the same safe failure category and neither publishes a complete snapshot

### Requirement: Formal entrances expose real follow state

The formal account entrance, follow page and detail action SHALL share current-owner follow state. The page SHALL provide refresh, readable cards, detail navigation and explicit single-item cancellation with loading, empty, stale, error and recovery states. Unimplemented reservations and reminders MUST NOT appear as working tabs or counters.

#### Scenario: Open follow list from account

- **WHEN** a signed-in user opens follow membership from the account page
- **THEN** the formal application loads the actual account membership and offers detail and cancel actions
- **AND** initial loading or failure is not shown as an empty successful list

### Requirement: Known completed content does not offer new following

The detail action SHALL suppress or disable new following when actual upstream data explicitly identifies a completed series. Existing following SHALL remain cancellable. Unknown completion status MUST NOT be inferred from list position, episode counts, title or local viewing progress.

#### Scenario: A completed series is already followed

- **WHEN** actual data identifies a followed series as completed
- **THEN** the user can still cancel following
- **AND** no new-follow action is offered after confirmed cancellation while that completion evidence remains current

### Requirement: Navigation preserves focus and reading position

Follow lists and actions SHALL support keyboard and TV directional navigation, visible focus, meaningful accessible names, light/dark appearances, enlarged text and reduced motion. Detail return SHALL restore a surviving stable identity and scroll anchor. Removal SHALL restore focus only while the operation still owns the current navigation intent.

#### Scenario: Cancel a focused virtualized row

- **WHEN** confirmed cancellation removes the focused row
- **THEN** the next surviving neighbor or relevant empty-state action is revealed with visible focus
- **AND** newer input, navigation, backgrounding or epoch change cancels delayed restoration

### Requirement: Real workflows determine functional acceptance

Functional acceptance SHALL primarily use formal product entrances, actual authenticated remote data and recorded user workflows. Real cloud writes MUST have explicit authorization for the account, targets and operations. Synthetic fixtures SHALL cover boundaries and regressions only; missing real evidence MUST remain implemented but awaiting real acceptance.

#### Scenario: Synthetic regressions pass without authorized real writes

- **WHEN** protocol and lifecycle regressions pass but real add-and-cancel verification is unavailable or unauthorized
- **THEN** engineering checks are recorded separately and functional acceptance remains open
- **AND** no credentials are copied, account logged out or unrelated cloud data changed to obtain a passing result
