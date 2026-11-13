# TV emulator gate

This is a thin host using the official NSH 0.5.0 embedding classes and the app's
mixed `libnsh.so`. It owns the TV manifest, remote input and lifecycle. Business
screens stay in `packages/app`; styled controls and tokens stay in `packages/ui`.

```sh
pnpm package:tv
pnpm test:tv-emulator
```

The default package is the **T0 technical probe**, containing original synthetic
H.264/AAC media and the Rust bridge probe. It requires no API server, network,
Node process or adb reverse rule at runtime. `HONGGUO_CORE_ORIGIN=… pnpm package:tv`
still builds the explicit external-API UI preview; it does not pass this T0 gate.

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

`TvRemote` uses public accessibility click actions and visible view bounds; it
leaves keys to a focused text editor. The T0 probe does not claim complete business
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
