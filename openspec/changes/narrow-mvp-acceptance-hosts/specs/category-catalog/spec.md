# Spec Delta

## MODIFIED Requirements

### Requirement: Shared read-only contracts and honest review

HTTP and native SHALL expose the same category envelope and stable failure mapping through generated contracts. Offline tests MUST cover malformed input, body signing, finite retries, privacy, cancellation and transport parity. UI scope review MUST distinguish this core slice from visible filter UI and overall product acceptance on the MVP acceptance hosts — macOS on a real machine and the fixed API34 arm64 emulator.

#### Scenario: Cross-host consumption

- **WHEN** either transport requests the same validated category with a fixture upstream
- **THEN** status and result agree and no library/history writes occur; no passing core test is presented as real filter UI or release acceptance.
- **AND** the emulator's filter observation counts as the TV filter acceptance, while physical-TV limits are recorded separately
