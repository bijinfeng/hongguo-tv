# Design

## Context

See proposal.md. HTTP/native account endpoints currently return 501; both Rust history and TSX writer reject nonempty owners. Fixed upstream Passport protocols, device registration and signing vectors supply the reference behavior.

## Decisions

- Rust owns credentials, registered devices, attempts, deadlines and active library. Generated public DTOs contain only local attempt IDs, validated PNG, masked phone and necessary challenge display fields; no credential is exported or debug formatted.
- One account coordinator serializes owner transactions and library access. Network attempts run outside its lock, retain generation identity, and recheck identity before commit. Cancellation is immediate even during network work.
- Account session uses a private SQLite database with bounded deserialization, validated UID binding and durable transactions. The session and registered anonymous device are stored separately; failed storage leaves the previously published account unchanged. No legacy session import and no claim of encryption without a keychain.
- Guest SQLite remains compatible; account databases carry verified owner metadata. Switches drain old operations and invalidate write sessions before publishing a different library. An account command returns account plus library atomically; a state endpoint reconciles a lost mutation response.
- Every account command captures the current owner and a random owner epoch. Commit rotates the epoch, including a switch back to the same owner, so delayed logout, start or cancel commands cannot mutate a replacement session. A detached commit retains the coordinator lock through persistence and publication if the caller disconnects.
- The app freezes admission, flushes its final player checkpoint and drains accepted writes before commands capable of login/logout; old reads and receipts cannot publish across the transition. Failed reconciliation keeps admission blocked until an authoritative state can be read.
- QR expiry defaults to 180 seconds (maximum 600), poll interval 1.8 seconds; confirmed redirect gets at most 45 more seconds. Phone challenge lifetime is ten minutes and querying never extends it. Cooldowns survive refresh/cancel within the core lifetime and uncertain sends are not retried automatically.

## Interface and motion

Compose the account profile and local-history entry from shared UI controls; the login button opens a shared Dialog containing QR/phone/MFA forms with existing desktop/TV input adapters, selection and presence transitions, hover/press tokens, and Dialog fade/reduced-motion behavior. Opening places focus inside the form, closing returns focus to the login button, success closes automatically, and closing/leaving/backgrounding cancels the attempt without logging out; check light/dark, keyboard/DPAD, cancellation and error recovery on actual hosts, and leave unobserved behavior unverified.

| Change                           | Shared treatment                                   | Reduced motion and focus                                                            |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Buttons and form controls        | Existing UI hover/press/pending states             | Retain visible focus without scaling                                                |
| QR/phone selection               | Shared Tabs selection indicator                    | Immediate selection; same form controller and platform input adapters               |
| Login dialog open/close/success  | Shared Dialog fade                                 | No animation; initial QR/country focus and return to surviving login/logout trigger |
| QR or MFA content arrival        | Existing ContentArrival transition                 | No translation; do not replay on every poll                                         |
| Poll status, expiry and cooldown | Update text in place, without a new animation loop | No automatic focus movement; expired QR removed                                     |

No sound, drag, gesture or continuous animation is added. Static screenshots prove geometry only; motion, screen-reader and physical-TV limitations remain explicit in validation.

## Risks / Trade-offs

- Upstream Passport signatures and session validity can change: fixed vectors plus real authorized login remain necessary.
- Local private storage is not encrypted credential storage: platform protection needs actual platform verification.
- A timed-out account command may already have committed: reconcile the atomic state endpoint before resuming writes.
- Public Web deployment is out of scope after `remove-web-product`; the HTTP transport now only serves the acceptance harness and native `http-preview`, both loopback-only. Owner/epoch isolation stays required, because those callers still share one core instance and a wrong owner must never read or write another account's records.

## Migration Plan

Preserve existing guest files and do not read legacy credentials. Introduce account DTOs and owner support, integrate the two host transports, then replace the compatibility account page. Deliver verified submodules independently without declaring the full login batch accepted. Cloud records and remaining MVP work stay in the existing queue.
