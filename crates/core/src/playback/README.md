# Playback ownership

`PlaybackRequest` validates exact decimal episode/series IDs and finite content, quality and codec options before network work. `PlaybackService` owns anonymous source resolution and media preparation; it never saves viewing history. Account cookies, legacy client state and arbitrary user endpoints are excluded.

Model identity is established by the exact outer episode key or a matching direct episode ID. An exact keyed episode can carry a distinct 32-character alphanumeric internal CDN video ID. A different decimal episode, malformed identity or unbound direct CDN identity is rejected. Fallback media must retain that internal ID and the original duration. Bytevc2 remains unsupported even with an hvc1 wrapper.

Two preparation jobs may run per instance. Equal requests share a revision-fenced job; every waiter has an owner lease. Dropping the last owner aborts owned network/preparation work. Shutdown aborts all jobs; an obsolete revision cannot publish. Successful waiters receive independent random local handles, so releasing one does not invalidate another. Media leases, limits and expiry are documented in `../media/README.md`.

Only time spent resolving models consumes the 30-second source budget: video_tab 8 seconds, registered legacy 14 seconds, single profiles 8 seconds. The registered single variant has a 4-second sub-budget; attempts and anonymous refreshes remain finite. The complete job has a 95-second deadline. A parsed model is only a candidate: failed media preparation may advance the finite sequence, while explicit access denial, identity mismatch, storage/capacity failure, invalid selection or unsupported requested quality stops recovery. Nothing bypasses a business or CDN access rejection.

Default tests use loopback sources and synthetic metadata/NIST vectors. An opt-in preparation probe is separate:

```sh
cargo run -p hongguo-core --example playback_probe -- --live 重生 .local/playback-probe
```

The probe reports only stage, codec, quality and byte counts, and releases the local handle. It neither prints signed URLs, keys or identities nor proves host decoding, first frame, watching progress or installed native behavior.
