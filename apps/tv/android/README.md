# TV emulator gate

This is a thin host using the official NSH 0.7.0 embedding classes and the app's
mixed `libnsh.so`. It owns the TV manifest, remote input and lifecycle. Business
screens stay in `packages/app`; styled controls and tokens stay in `packages/ui`.

```sh
pnpm package:tv
pnpm test:tv-browsing
pnpm test:tv-player
pnpm test:tv-components
HONGGUO_RUNTIME_MODE=t0 pnpm package:tv
pnpm test:tv-emulator
```

The default package uses the production entry and bundled Rust core with real
services. `HONGGUO_CORE_ORIGIN=… pnpm package:tv` builds the explicit external-API
preview. The **T0 technical probe** requires `HONGGUO_RUNTIME_MODE=t0`; it bundles
original synthetic H.264/AAC media and the Rust bridge probe, with no API server,
network, Node process or adb reverse rule at runtime. These modes have separate
acceptance scopes; see [TV targeted verification](../../../docs/development.md#tv-定向验证) and the acceptance matrix in [ENGINEERING §9](../../../ENGINEERING.md#验收宿主矩阵).

The host defaults to a debug-signed APK. A release build is selected with
`HONGGUO_TV_BUILD_TYPE=release` and fails closed unless the Gradle process receives
`TV_RELEASE_STORE_FILE`, `TV_RELEASE_STORE_PASSWORD`, `TV_RELEASE_KEY_ALIAS` and
`TV_RELEASE_KEY_PASSWORD`. Keep the keystore and values in a protected Actions
environment; never commit them or place them in an artifact.

Use JDK 25.0.3 for the fixed NSH toolchain and JDK 17 for this Gradle host
(verified locally with 17.0.20.1). Set `TV_JAVA_HOME` to the latter; Apple Silicon
Homebrew's `openjdk@17` is detected automatically. Gradle 8.14.4 and AGP 8.13.2 are
pinned. Wrapper/distribution checksums and Gradle artifact checksums are checked;
the official embedding archive is downloaded to `.local/tools/` and SHA256-checked.
No Gradle cache, native runtime, generated assets or SDK is committed.

Start exactly one `system-images;android-34;android-tv;arm64-v8a` AVD using
`tv_1080p` (1920×1080, density 320, D-pad enabled). The gate refuses a phone image,
another API/ABI, multiple adb targets, stale APKs and development reverse rules.
Physical TV acceptance is a separate track and is not this gate's prerequisite.

The gate runs the NSH headless bridge/cancellation test, Android Lint, installs the
final APK and instrumentation APK, then drives D-pad/confirm/Back in both themes.
Its 13 checks cover bridge/disposal, bundled media preparation, play/pause, a
stationary paused clock, seek, source switching, surface removal/rebuild,
Home/resume, activity recreation and return to TV Home. Reports, screenshots and
the exact APK hash go to ignored `artifacts/tv-emulator/`. It restores night mode.

After installing the normal app and its instrumentation APK, `adb shell am instrument -w -e suite header dev.hongguo.tv.test/dev.hongguo.tv.T0Acceptance` checks the six header actions using full native view bounds. It reports the actual font scale and rejects controls outside the viewport or overlapping one another; cropped accessibility bounds alone cannot establish this. The command uses the current emulator settings and does not change them.

The same installed native app also supports `adb shell am instrument -w -e suite native-business -e phase settings dev.hongguo.tv.test/dev.hongguo.tv.T0Acceptance`. Its 16 checks traverse the settings categories, read local information, scroll the read-only about region, verify that confirm is inert there, restore the header source and preserve the home reading position. Use `-e phase settings-accessibility` to activate the settings tool through public accessibility focus/click actions before running the same checks; this separately covers source removal before the native page-depth change is observed. Neither mode is a full TalkBack speech test. It uses current text and appearance settings; it does not change saved application preferences.

`--profile extra-large-text` selects 200% text for browsing/player acceptance; the series
adapter accepts the same profile. This is an emulator setting, not an app preference.

The browsing locator scrolls or reveals mounted offscreen cells before requesting focus,
and checks their bounds against the actual viewport. Traversal has a page limit and a
no-progress deadline, so larger text can take more pages without extending business-state
assertion deadlines. Failure dumps include native bounds, scroll offsets and scrollability.

`test:tv-browsing` and `test:tv-player` install external-API preview APKs with explicit
loopback fixtures and temporary adb reverse rules, then restore appearance, font
scale, runtime configuration and their reverse rule. They are separate from the
independent T0 gate. The player fixture serves original 12-second test patterns;
its API/history are stubs, not Rust/official-content acceptance. Reports go to
`artifacts/browsing/tv` and `artifacts/playback/tv-apk` respectively.

`test:tv-components` packages the shared component gallery in this production
host. It requires the single `hongguo-tv-api34-arm64` AVD, checks native overlays,
pending/recovery, remote editing and Chinese composition through InputConnection
in both themes at 100%/130%/200% text, and checks reduced motion in the final
profile. It restores appearance, text and animation settings, rebuilds and
reinstalls the normal app entry, and reports any cleanup failure. Evidence is in
`artifacts/ui-components/native-tv`. The gallery uses synthetic state; it does
not verify real business flows or manual IME candidate selection.

`TvRemote` uses public accessibility click actions and visible view bounds; it
leaves keys to a focused text editor. Enabled stage actions named “显示播放控制” /
“确认播放位置” expose the player's hidden / preview states to this input adapter;
keep these semantic names in sync with the adapter when localizing. Dialog roles
and Select list roles provide public accessibility scopes, with portal lists taking
precedence over their parent sheet. Directional movement prefers its row/column;
focused sliders use public increment/decrement actions. Android versions before
30 retain the named “播放设置” / “选集” scopes because NSH has no spoken dialog
role there; keep those names in sync when localizing. The adapter
sends finite `player-command` events through public `NshView.send`; the shared app
validates payloads, drops commands outside the current player, and owns all
playback decisions. Media play/pause are idempotent; panels retain their input.
Keyboard Escape follows native layered Back. No NSH private handles or invented
media key names are used. The T0 probe does not claim complete business
navigation, all overlays/virtualized lists, TalkBack, hardware decoding, production
signing or a migrated native business core. Extend and test those in their slices.
Android/Gradle dependencies have checksum verification; that is not a vulnerability
or license audit. Existing Rust security findings are recorded in `VALIDATION.md`.

The optional `nsh test --target android --filter 'TV T0'` development host was also
tested successfully. Its debug APK contains all three ABIs and can exceed 2.7 GB;
repeated installs exhausted this AVD's storage and later stalled. It is not a
prerequisite of the final-APK gate. The gate's instrumentation verifies the actual
Rust call/disposal and media/input behavior in the much smaller shipped APK;
the controlled-clock owner-cancellation regression runs headless.
