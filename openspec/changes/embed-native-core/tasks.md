# Tasks

## 1. Shared transport and native session foundation

- [x] 1.1 Add a platform-neutral core-client transport with compatible HTTP entry and native adapter contract; verify success/error/abort, malformed media URL and late-response isolation tests on all three NSH entries.
- [x] 1.2 Add shared native session use cases for catalog/history/playback with strict input boundaries and error parity; verify Rust fixture tests, durable restart, corrupt-file preservation, unsupported account errors and no HTTP business calls.
- [x] 1.3 Add media-only loopback serving and bounded request cancellation/disposal; verify Range/HEAD/foreign origin/Host/API rejection, cancelled preparation and completion race cleanup tests; document ownership and evidence in the bridge README and VALIDATION.

## 2. Desktop mixed and TV embedding

- [ ] 2.1 Register the shared bridge in Desktop mixed and existing TV native crate; verify generated declarations plus real mixed exports, initialization failure, cancellation and disposal in NSH headless tests.
- [ ] 2.2 Wire native production entries, app-owned lifecycle and explicit HTTP preview mode without changing shared UI; verify existing browser/player headless and TV fixture suites, and document mode selection.
- [ ] 2.3 Update dev/package/release checks to select native business by default and explicit T0/HTTP previews; verify tooling failure/cleanup tests, native builds and no bundled computer address dependency.

## 3. Independent host acceptance and review

- [ ] 3.1 Install native business TV APK and remove computer API/reverse; verify real search→detail→play→next→return and process-restart resume, background/recovery, light/dark/font1.3 and remote input; review screenshots and functional evidence independently, record emulator/physical boundaries.
- [ ] 3.2 Verify actual Desktop mixed host search/view/restart resume and UI focus/Select behavior in both approved desktop sizes and themes when host access is available; preserve pending A/B checks and do not equate headless with native host.
- [ ] 3.3 Run complete pnpm verify, codegen:check, dependency security and OpenSpec strict; update feature ledger/roadmap/VALIDATION with per-slice review verdicts, remaining platform gaps and local commit state. Do not push, archive or publish.
