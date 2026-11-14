# Anonymous recommendation vectors

Synthetic, credential-free vectors derived from the pinned reference behavior in
`upstream/hongguo/core/cmd/hongguotv/lists.go` (`Recommendations`, `parseFeedDramas`)
and `discussion_test.go` (`TestFeedChannelPhaseTransition`). Channel mapping and
session/cell/plan carryover follow `ui/app.js` (`recommendationChannel`, list cursor).
They are not live captures. Decimal IDs above JavaScript's safe integer range
exercise lossless parsing; wrapper series IDs must not replace video_detail IDs.

- tab.input: select matching channel39; one supported drama; cell continuation starts at0.
- cell.input: nested/direct records, repeated identity and nonvideo cells; two summaries, cursor6.
- All default tests are offline. Explicit `cargo run --locked -p hongguo-core --example feed_probe -- --anonymous-live`
  reads the three anonymous channels and their next phase, reporting counts only.
  No account45, registration, saved identity, history, credentials, playback or writes.
