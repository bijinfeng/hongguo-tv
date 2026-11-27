# Spec Delta

## MODIFIED Requirements

### Requirement: Existing design and cross-host review

The feature SHALL reuse the approved header search, shared tokens, poster grid/TV shelves and existing navigation, with styled controls in UI and behavior in App. Loading, empty, error, pointer, keyboard/DPAD, IME and reduced-motion behavior MUST be reviewed independently and observed in actual supported hosts. Automated tests alone MUST NOT be reported as assistive-technology acceptance.

#### Scenario: Honest validation

- **WHEN** the slice is completed
- **THEN** check/build, meaningful regression tests and independent function/UI review evidence are recorded, and actual host observations and remaining environment limits are named separately.
- **AND** the missing physical TV is recorded as a platform limit rather than an open MVP requirement

#### Scenario: MVP acceptance hosts

- **WHEN** loading, empty, error, pointer, keyboard/DPAD, IME or reduced-motion behavior is observed
- **THEN** macOS on a real machine or the fixed API34 arm64 emulator with injected DPAD and system IME satisfies the host observation
- **AND** emulator observations are never presented as physical-TV certification
