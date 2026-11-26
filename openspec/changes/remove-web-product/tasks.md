# Tasks

## 1. Remove the Web product identity

- [x] 1.1 Rename `apps/web` → `apps/harness` and `services/web-api` → `services/core-api` (`hongguo-core-api`); update the manifest id to `dev.hongguo.harness`, the workspace member list, `workspace.dependencies`, root `tsconfig.json` and both lockfiles; verify `cargo metadata`, `pnpm install --frozen-lockfile` and a byte-identical `pnpm codegen:check`.
- [x] 1.2 Drop `dev:web`, `dev:fixture:web` and `package:web`; split `targets` from `products` in `tooling/src/process.mjs` so `check`/`build`/`test` still cover the harness while `dev`/`dev:fixture`/`package` accept only `desktop`/`tv`.
- [x] 1.3 Repoint every host script and `ui:check`/`ui:host:*`/`ui:preview` option at `apps/harness`, keeping the NSH platform arguments (`web`/`macos`/`android`) unchanged.

## 2. CI reachability

- [x] 2.1 Remove the `web` row from the entry matrix and the `scope` outputs; drop the harness-only cache and runner-assertion conditions; classify `apps/harness/**` as needing no target job while `workspace` keeps checking and building it.

## 3. Requirement sources

- [x] 3.1 Create this change and re-scope the 11 unchecked tasks in nine active changes that named Web as an acceptance host; update the five main specs and the per-change spec deltas that name Web as a product, and note in `migrate-account-session-isolation` that public Web deployment is out of scope while owner/epoch isolation still is not.

## 4. Documentation

- [x] 4.1 Update the current documents that present Web as a deliverable (README, PRODUCT, ARCHITECTURE, ENGINEERING, DESIGN, VALIDATION, `docs/development.md`, `docs/feature-ledger.md`, `docs/implementation-roadmap.md`, `packages/ui/README.md`, brand readme and the one-line mentions), keeping every existing piece of evidence and its limitations; leave `docs/history/**` and archived changes untouched.

## 5. Verification

- [ ] 5.1 Run the full gates on the changed tree (`pnpm fmt:check`, `pnpm lint`, `pnpm test:tooling`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo nextest run --workspace`, `pnpm codegen:check`, `pnpm release:check`, `pnpm check`, `pnpm build`, `pnpm test`, `node tooling/src/cli.mjs ci:jobs`) and record which ones could not run, without claiming a pass for a skipped gate.
- [ ] 5.2 Start `pnpm dev:desktop` and, where a device exists, `pnpm dev:tv`, to confirm the harness rename did not break the hosts; record the actual outcome and leave unverified device paths explicitly open.
