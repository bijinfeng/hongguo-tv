# Anonymous release calendar fixtures

Synthetic public metadata follows the fixed reference paths in `upstream/hongguo/core/cmd/hongguotv/lists.go` and its independent-cursor test. No account state, credentials, sessions from live services, tracking payloads, or full episode details are captured.

Run `cargo test --locked -p hongguo-core calendar`, `cargo test --locked -p hongguo-native-bridge calendar`, and `pnpm codegen:check`. The opt-in `calendar_probe -- --anonymous-live` prints aggregate counts only; it does not prove UI, selected-day completeness, account reservations, or playback.

The first calendar page omits `subscribe_offset`; explicit zero differs. Released offset45 followed by offset24/subscribe23 is a valid phase transition. `has_more` and `down_has_more` are independent. Upcoming reservation IDs are never promoted to playable series IDs.
