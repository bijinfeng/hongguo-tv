# Anonymous category contract

`manifest.json` records the pinned read-only reference source hashes. The input and expected page are synthetic, including a decimal identity above the safe JavaScript integer range, duplicate and unsupported records, selectors and a session/offset. No account, production identity or captured personal data is stored. No Go process is required.

Category uses its own cursor and POST payload, independently of website search and recommendation feeds. Only the fixed `/category/real-drama`, `/category/comic-drama`, `/category/ai-drama` and `/category/comic` scenes are accepted. Omitted genre/sort keep scene defaults; explicit empty selections are All. The reference status selector is always completed when selectors are requested. Unknown filters and invalid IDs fail before networking.

Offline checks:

```sh
cargo test --locked -p hongguo-core -p hongguo-http-api -p hongguo-native-bridge
pnpm codegen:check
```

Explicit live check, counts only:

```sh
cargo run --locked -p hongguo-core --example category_probe -- --anonymous-live
```

This performs a read-only category query with ephemeral unregistered IDs and body-bound Passport signing, no cookies or persisted account/device state. Only an empty200 response retries, up to three fresh identities within12 seconds; network, verification and protocol errors remain errors. Do not log bodies, signed URLs, session IDs or identity headers. Dropping the owner cancels pending reads and retries.

Passing core contracts or the probe does not verify the shared filter UI, recommendations, physical TV, independent installations or release readiness. The visible UI follows in its own approved-design slice.
