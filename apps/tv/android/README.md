# TV emulator gate

This is a thin host using the official NSH 0.5.0 embedding classes and the app's
mixed `libnsh.so`. It owns the TV manifest, remote input and lifecycle. Business
screens stay in `packages/app`; styled controls and tokens stay in `packages/ui`.

```sh
pnpm package:tv
pnpm test:tv-emulator
pnpm test:tv-browsing
pnpm test:tv-player
```

The default package is the **T0 technical probe**, containing original synthetic
H.264/AAC media and the Rust bridge probe. It requires no API server, network,
Node process or adb reverse rule at runtime. `HONGGUO_CORE_ORIGIN=… pnpm package:tv`
still builds the explicit external-API UI preview; it does not pass this T0 gate.

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

`test:tv-browsing` and `test:tv-player` install external-API preview APKs with explicit
loopback fixtures and temporary adb reverse rules, then restore appearance, font
scale, runtime configuration and their reverse rule. They are separate from the
independent T0 gate. The player fixture serves original 12-second test patterns;
its API/history are stubs, not Rust/official-content acceptance. Reports go to
`artifacts/browsing/tv` and `artifacts/playback/tv-apk` respectively.

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
