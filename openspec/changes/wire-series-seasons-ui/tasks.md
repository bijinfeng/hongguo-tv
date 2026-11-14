# Tasks

## 1. Shared season state and controls

- [x] 1.1 Deliver shared SeasonChoice/SeasonPicker and identity-bound browsing detail cache; verify controlled choice, real playing/resume status, upcoming/unavailable zero playable reads, cache isolation and late-response rejection with independent tests and documented ownership.
- [x] 1.2 Align continuation with the fixed upstream adjacent-selector rule and split browsing from foreground-only playback lifecycle; verify skipped/missing/upcoming/duplicate seasons, current-number fallback, exact first video, inactive/background and late relation/detail cancellation in deterministic state tests.

## 2. Production pages

- [x] 2.1 Wire active Detail browsing, per-season summary/episodes/resume and source return using shared controls; verify playable/upcoming selection, wrong identity, safe retry and no playback/history effects before explicit confirmation.
- [x] 2.2 Wire Player episode surfaces and Feed actual-season ownership, cancel stale continuation on newer intent, and remove social entries; verify actual playback/history identities, strict end continuation, manual/seek/replay/background interruption and original recommendation/source restoration.

## 3. Integration acceptance

- [x] 3.1 Run three-target NSH check and build, relevant component/controller/page tests and complete pnpm verify; record genuine failures and their fixes without weakening package boundaries or ownership assertions.
- [x] 3.2 Review approved desktop/TV layouts and real-host keyboard/DPAD states in light/dark and TV large text, including decoder/settings/return regression; record fidelity/completeness evidence, source/device restoration and unavailable physical-device/accessibility/motion boundaries, then commit only this feature locally.
