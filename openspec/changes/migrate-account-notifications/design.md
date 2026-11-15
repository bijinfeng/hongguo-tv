# Design

## Boundary and data flow

`AccountService` owns the verified owner scope, online generation, source reads, and a dedicated notification store under the account's private data directory. The notification database is separate from `account.sqlite3` (credentials) and the account library database, so notification rows never enter cloud sync or playback/history payloads. A refresh captures the owner epoch before asynchronous work, reads complete follow and reservation snapshots through existing account methods, and publishes only if the same owner/generation is still current.

The local record contains only the stable event ID, kind (`follow_update` or `reservation_online`), real series/reservation identity, bounded title/message/episode metadata, optional drama summary, created time, read flag, and source baselines. It never stores raw upstream responses, cookies, tokens, video IDs, episode lists, or media URLs. SQLite uses an explicit schema version, owner check, one transaction for baseline plus items, a 200-row cap, and secure-delete/rollback settings consistent with the existing account stores.

## API contract

- `GET /api/v1/notifications`: authenticated foreground refresh; returns `{owner_id, owner_epoch, items, unread_count, checked_at, stale, error?}`.
- `POST /api/v1/notifications`: authenticated `{id}` or `{all:true}` mark-read command; returns the committed snapshot. Unknown IDs are safe idempotent no-ops or a bounded validation error according to the existing account error convention.
- Other methods, malformed JSON, oversized bodies, missing scope, stale owner epoch, and guest calls use existing strict request/error handling.

HTTP and native route through the same core use case and generated DTOs. `core-client` keeps decimal IDs as strings and refuses to replace a newer owner/generation result with a late response.

## Shared UI

The account activity model gains a third tab, “更新提醒”, alongside “追更” and “预约”. `UpdateNotifications` owns the resource, refresh throttle, scope key, pending read acknowledgement, and stale/error state. It calls refresh on explicit page entry or account-visible foreground refresh, never from the playback surface or background lifecycle. The row uses existing `List`, `Badge`, `Notice`, `Button`, and content-arrival primitives with the app's semantic tokens; rows navigate to real series detail when identity is present and otherwise show a bounded detail action. There is no direct play button without a real episode/video identity.

Desktop keeps pointer hover and compact row density. TV keeps the same row semantics with larger focus targets, DPAD order, and restore-to-tab/row focus on return. Both use the same controller, strings, tokens, and state machine. No system notification, popup, sound, or animation wave is added; list updates use the existing reduced-motion-aware content arrival behavior.

## Review and acceptance

Functional review covers guest/login, first baseline, follow change, reservation transition, deduplication, retention, stale preservation, mark-one/all, owner switching, restart, cancellation, and HTTP/native parity with synthetic boundaries. UI review covers light/dark, long text, empty/loading/stale/read-pending states, keyboard/DPAD focus, return restoration, no playback/background fetch, and shared semantics across Desktop/TV. Real acceptance remains open until the formal Web/Desktop/TV entries use a real logged-in account and observe a real follow or reservation change; synthetic fixtures cannot close it.
