# Anonymous public search discovery

`passport-vectors.json` is the fixed synthetic passport signing vector from the pinned, read-only reference listed with file hashes in `manifest.json`. Rust validates IV derivation, SM3/F13/protobuf bytes, Helios/Gorgon, all four AESV3 branches and final Medusa bytes. The copied JSON is formatted with the workspace formatter; its values match the reference. No Go process or toolchain is used. `plan.input.json` contains only synthetic public cells and an intentionally large decimal identity; native/HTTP parity tests use it through isolated loopback servers. Unit tests also generate mixed/wrapped/bounded/malformed plans.

Offline checks:

```sh
cargo test --locked -p hongguo-core -p hongguo-http-api -p hongguo-native-bridge
pnpm codegen:check
```

Explicit real-service probe (not run by tests, prints counts only):

```sh
cargo run --locked -p hongguo-core --example discovery_probe -- --anonymous-live
```

It performs one ephemeral anonymous registration and fixed public-plan read. It does not accept terms, history, accounts, cookies or upstream destinations. It neither persists identity nor mutates playback. A success with zero cells is optional empty content; protocol/verification/network failures stay errors. The six-second deadline includes registration, lock wait, transfer and parsing. Logs must never contain device IDs, signed URLs, response bodies or cookies.

This core/API slice adds no discovery UI. A passing probe does not validate recommendations, typed autocomplete, user accounts, independent native installations, physical TV, playback or release readiness.
