# Tasks

## 1. Owner and protocol core

- [x] 1.1 Add persistent account owner identity and write-session invalidation; verify guest compatibility, independent reopen, wrong owner and A-to-B-to-A regressions with focused Rust tests.
- [x] 1.2 Port registered-device, domestic/international signatures and Passport protocol methods; verify fixed reference vectors and loopback transport/identity failures without sending real SMS.
- [x] 1.3 Implement bounded cancellable attempts, cooldown, QR/phone/MFA state and credential persistence; verify late cancellation, expiry, failed save, restart and logout boundaries in Rust tests and document module API.

## 2. Shared production integration

- [x] 2.1 Generate Rust-owned account DTOs and wire HTTP/native state/command routes and active library selection; verify transport parity, origin restrictions and `pnpm codegen:check`.
- [x] 2.2 Support owner-specific TSX writers and atomic transitions with checkpoint draining; verify old reads/receipts, unresolved writes and lost-command reconciliation regressions.
- [x] 2.3 Replace compatibility account page with shared QR/phone/MFA/logout states; verify cancellation, cooldown, keyboard/DPAD, light/dark and platform forms with check/build and focused tests; keep usage and motion inventory current.

## 3. Real flow and batch closure

- [ ] 3.1 Perform authorized real login, app restart, independent viewing history and logout-to-guest flows through formal entrances; preserve failures and distinguish untested phone/MFA/platform branches.
- [x] 3.2 Independently review functional/security changes and actual-host UI evidence, run one complete verify on stable batch source, then record actual results and make focused local commits without pushing or releasing.
