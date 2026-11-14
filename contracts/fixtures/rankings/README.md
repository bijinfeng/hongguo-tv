# Anonymous official-ranking fixtures

Synthetic values follow fixed `lists.go::RankList/rankOptions` and `lists_test.go::TestRankJSONSelectorsAndActors` at the manifest commit. No Go execution, real account, credential, tracking URL or live response is used; `secret` marker fields test omission. Synthetic paths on allowlisted image hosts are never fetched by these tests.

The page deliberately includes a drama and actor with the same decimal ID, duplicate records, a creator album, disabled video, explicit rank vs heat and a nested selector/panel. `page.expected.json` is the reviewed public contract, not a parser-generated snapshot. Actor IDs never become playable series IDs, and summary episodes are absent. Raw service offset20 is independent of two visible items.

`cargo test -p hongguo-core rankings` covers exact selector/query bytes, tab26/18, service/cell cursor fallback, empty advancement, limits and malformed/stalled responses. Transport tests reuse the anonymous signed request harness, check ephemeral identity/signature headers and absence of credentials, device registration or history writes. Native tests compare HTTP/native success/failure, input rejection and cancellation/session close.

Explicit optional anonymous read-only smoke: `cargo run --locked -p hongguo-core --example rankings_probe -- --anonymous-live`. It prints aggregate counts only and never runs in the offline suite. Live variability or successful probe does not verify a ranking UI, full series relationship, radar, media playback or physical TV.
