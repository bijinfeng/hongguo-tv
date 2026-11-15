# Radar fixtures

Radar fixtures are synthesized locally in `crates/core/src/radar/tests.rs`; HTTP and native adapter tests use the same four-bucket source shape. No third-party captures, account data, credentials, or legacy client cache are included.

The synthetic source documents exercise exact nonzero decimal IDs (1–32 ASCII digits), required nonempty ranking buckets, real calendar dates, explicit `real` / `ai` / `comic` / `unknown` types, deduplication, text/tag bounds and a 10,000-row limit before cleaning. Metrics are source JSON signed 64-bit integers; the public/cache representation is a canonical decimal string. Missing measurements stay absent. Rank/best rank must be positive, streak nonnegative, and a supplied gap positive. Source sampling intervals are retained without fabricated daily normalization. Unknown source fields (including score, likes and watch flags) are excluded.

Each source body is bounded to 5 MiB; each source attempt has a 6-second timeout, with a 13-second network deadline including lock waiting. Ranking and growth fetches preserve successful partial results independently. Only HTTP 200 is accepted; redirects and proxy environment routing are disabled. Production origins and filenames are fixed; fixture injection accepts only bare HTTP loopback IP origins.

The independent `radar-v1.json` cache is bounded to 20 MiB and revalidated on open. New directories/files use Unix 0700/0600. Writes use a unique same-directory file, file sync and atomic rename. This supports process restart persistence; directory metadata is not synced, so sudden power-loss durability is not claimed. An existing invalid cache fails initialization and remains untouched; legacy caches are never opened. If a new write fails, the response still carries fresh data with `cache_write_failed: true`, while the stored service state retains the last successful commit.

Dropping a snapshot before the commit stage cancels its fetch work. A queued or running blocking filesystem commit may finish after the caller cancels or the network deadline passes; its owned service lock prevents another refresh from overtaking it. The 13-second network deadline is not a hard bound on filesystem I/O.

These fixtures verify protocol and persistence behavior, not current third-party availability or production deployment.
