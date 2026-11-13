# Playback fixtures

These hand-authored envelopes contain synthetic IDs and `.invalid` media URLs. `manifest.json` pins the read-only behavior reference and records each inspected file digest. Crypto/signature vectors copied from the pinned reference retain their independent provenance; no test executes Go or imports client data.

Current domain boundary: only ordinary drama content type `1004`, exact nonzero decimal string IDs up to 32 digits, automatic or 100P–9999P quality, and the documented default/auto/software aliases. The aliases select a capability profile; they do not prove a host decoder works. Unsupported content families fail before I/O.

The model parser requires exact keyed identity or an affirmative direct model identity, preserves arbitrary-precision numeric IDs, and accepts only ordinary AVC/HEVC candidates. `bytevc2`/`bvc2` is excluded even when another metadata layer says hvc1. Encrypted URL seeds match the independent URL vector. Protected content is currently rejected pending the authorized media preparation implementation; these samples are not evidence of real playback. Missing requested quality fails explicitly rather than silently changing resolution.

No source address or protection material is serialized in PlayInfo or playback errors. Error categories never carry raw upstream bodies, URL errors, device IDs or cookie text.

Anonymous registration has three isolated finite profile slots, a 30-minute TTL, single-flight ownership, revision fencing, bounded eight-second requests and a ten-minute refresh/failure cooldown. Legacy fallback registrations belong to their resolution; the current GET and registered-single profiles can reuse their own short-lived identity. Only a confirmed HTTP 200 empty body permits one refresh. Model absence, business rejection and incompatible codecs never trigger registration storms.

Playback Argus/Ladon and Gorgon match pinned synthetic vectors. The legacy signer keeps the tuned-ticket branch and Helios but excludes account Medusa. The 7.3.5.32 single profile uses its own Argus/Gorgon and JSON registration. Fallback API is restricted to trusted HTTPS production domains; fixture fallback must remain on its exact loopback origin. At most four codec attempts retain signed query bytes, episode identity and duration. These are model candidates, not usable media resources: capability and the HTTP play route remain unavailable until media readiness is implemented.
