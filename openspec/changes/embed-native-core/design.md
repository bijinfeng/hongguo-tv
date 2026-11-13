# Design

## Context

See proposal.md for motivation. `core-client` currently has one HTTP origin and shared pages call a finite set of `/api/v1` paths. Rust CatalogClient, LibraryStore and PlaybackService already own validated use cases. `http-api` assembles business and media routes together. TV native currently exports only T0 probes; Desktop has no native crate. NSH 0.5.0 publicly provides native classes, async methods, `data_dir()` and background tasks on the host Tokio runtime. Real macOS observation is currently blocked by the locked host.

## Goals / Non-Goals

**Goals:** Keep one shared UI and business semantics while adding a native transport; explicit session/request/media ownership; production native defaults and repeatable isolated acceptance.

**Non-Goals:** Account migration, new discovery pages, UI redesign, legacy data import, separate backend processes, physical-device certification or publication. A/B open host checks remain open.

## Decisions

1. Add a platform-neutral transport seam to core-client, keeping `configureClient(origin)` for Web and explicit fixture previews. Native adapter maps the same finite requests to a shared exported native session. Preserve structured error envelopes and numeric status used by CoreError; use generated domain DTOs rather than a second native business model. No page knows NSH bridge classes.
2. `crates/native-bridge` registers one shared module/class into each thin native crate. An asynchronous open uses the host's public app data directory and existing Tokio runtime. Rust owns SQLite and PlaybackService. Init rejects without clearing files or silently using memory. No runtime per request or global mutable account.
3. Each request has a caller identity. A session bounds live tasks, supports explicit cancel, and aborts pending read/preparation on close. A completed preparation whose response loses ownership is released. History mutations use the store's existing serialized durable worker; cancelling a UI observer does not promise rollback of a committed write. Avoid retaining an NSH class instance solely through a pending task after disposal; session drop closes shared native resources.
4. Expose a media-only router in http-api using the existing Range handlers and exact loopback policy. The native session binds a random port, starts a bounded service on the host runtime and returns only its origin. HTTP business routes are absent. Opaque 256-bit handles supply per-session media access, with no wildcard CORS or upstream URLs.
5. Desktop mixed and TV embedding register the same native module. Native entries choose native by default, explicit runtime preview config selects HTTP; T0 remains a separate entry. Build/dev/package scripts make the mode visible and never package a T0 probe as production business. Shared App keeps its existing lifecycle/checkpoint behavior; entry cleanup disposes the native adapter.
6. Deliver C in reviewable slices: transport/core bridge foundation, desktop/TV production wiring and packaging, then independent host acceptance. Each slice records exact evidence and commits locally. Reuse the existing player/browsing acceptance and synthetic core fixtures rather than creating an alternative UI.

## Risks / Trade-offs

- NSH async task and class lifetimes differ from Tokio tasks → verify generated declarations and actual exports with mixed headless tests, plus explicit cancellation/disposal tests.
- Media lease completes at cancellation boundary → release losing handles in Rust and test the completion race rather than relying on eventual idle expiry.
- Native media HTTP is reachable by other local processes → exact Host/Origin, no business routes, unpredictable handles, owned listener shutdown and no arbitrary URL acceptance.
- Native TLS/SQLite Android cross-compilation can reveal platform gaps → compile the bundled native library and install on the existing emulator before claiming C done; preserve external preview mode for fixture regressions.
- Desktop lock prevents real-host review → continue independent work, retain this unverified task; headless is not macOS viewing acceptance.
- Dependencies newly linked into native hosts can change license/security findings → run security and document actual findings, never loosen existing gates.

## Migration Plan

Keep Web and explicit HTTP preview callers compatible. First add native session tests without switching defaults; then wire thin entries and commands, running all three check/build plus complete verify. Finally stop the computer API, clear reverse, install native business APK and validate actual online viewing plus process restart; desktop follows the same semantics when host access is available. Rollback uses the previous local commit or explicit HTTP preview for development without deleting native databases. No release or archive is part of this change.
