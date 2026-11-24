# Tasks

## 1. Android dependency and build gate

- [x] 1.1 Add the pinned `io.sentry:sentry-android` dependency (exact version) to `apps/tv/android/app/build.gradle`, set `android.useAndroidX=true` (the plain Java artifact refuses to initialize on Android), declare `io.sentry.auto-init=false` so the SDK never starts before consent, and regenerate `gradle/verification-metadata.xml` with the Gradle-generated checksums; verify `assembleDebug` and lint pass with `warningsAsErrors`.
- [x] 1.2 Confirm `nsh-classes.jar` references no `androidx/` symbol, so enabling AndroidX only affects dependency resolution, and record the SDK, its licence and the auto-init choice in `THIRD_PARTY_NOTICES.md`; verify `pnpm security` stays green.

## 2. Consent preference and settings surface

- [x] 2.1 Add `diagnosticsReporting` (default `false`) to `packages/app/src/settings.ts` with a lenient per-field reader that keeps other stored values when a field is missing or mistyped; verify a `settings.v1` payload without the new field still loads its existing values and only a non-object or unparsable payload falls back to defaults.
- [x] 2.2 Add the settings row and switch in `packages/app/src/pages/settings/` reusing `SettingsSection`, `SettingsRow` and `Switch`, with an explanatory description stating what is sent and that it is off by default; verify desktop and TV tests in `packages/app/test/settings.tsx` cover default-off, toggling, persistence across reopen and the existing reset action.
- [x] 2.3 Route consent changes to the host through `host.call('diagnostics.consent', enabled)` behind a `host.available()` guard, surfacing a row-level error when the host rejects; verify a rejected call leaves the stored preference unchanged and shows the row error rather than a false “on” state.

## 3. Diagnostics event contract and call sites

- [x] 3.1 Define the shared diagnostic event type and builder in `packages/app/src/` with a fixed `category`/`code`/`operation` set reusing existing stable error codes, plus version, build, platform and session identifier; verify unit tests reject an unknown category and confirm no URL query string, token, account identity or user input survives sanitization.
- [x] 3.2 Emit events from the existing failure sites (catalog/search, playback preparation, storage and account flows) through a single sender that no-ops when consent is off or no host handler exists; verify each call site records once per failure without duplicates, and that the existing `console.warn` lines and user-facing recovery messages are unchanged.
- [x] 3.3 Add `diagnostics.report` and `diagnostics.consent` to `apps/tv/nsh.json` `capabilities.host` and verify a TV build with a missing grant fails loudly instead of silently dropping reports.

## 4. Host reporter

- [x] 4.1 Implement the host-side reporter handling `diagnostics.consent` and `diagnostics.report`, initializing the SDK only when the DSN is non-empty and consent is on, disabling traces, replays, session tracking and default PII; verify consent-on then consent-off produces no further requests in a device or emulator log capture.
- [x] 4.2 Forward `NshView` fatal errors into the reporter while keeping the existing `Log.e` line unconditional, and chain the previously installed uncaught-exception handler after reporting; verify the process still terminates the same way it does today when an uncaught exception occurs with reporting both on and off.
- [x] 4.3 Wire the DSN through `buildConfigField` from a `TV_SENTRY_DSN` environment variable, leaving it empty when unset, and verify a build without the variable still compiles, keeps reporting disabled and leaks no DSN into source or artifacts.

## 5. Verification and records

- [x] 5.1 Run the full `pnpm verify` and `pnpm security`, and confirm the TV packaging path still produces an installable APK; record any tool or SDK absence as an unfinished check rather than a pass.
- [x] 5.2 Observe the real flow on a device or emulator: consent off sends nothing, consent on hands the host one sanitized report per failure through the real category failure path, and that failure's user-visible recovery is unchanged. Engine-fatal forwarding and the "backend unreachable changes nothing" case stay **unverified**: this emulator cannot be given a targeted network fault without root, so those two need a physical device or a rooted image.
- [x] 5.3 Update `docs/feature-ledger.md` and `VALIDATION.md` with the new diagnostics row, the consent default, the real-flow evidence retained, and the explicit gaps (no ANR, no NDK crash, no Desktop/Web/iOS reporting).

## Workflow follow-up

- After implementation and real-device evidence, archive this change with the `openspec-archive-change` skill.
