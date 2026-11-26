# Design

## Context

See proposal.md for motivation. The repository currently has three NSH projects (`apps/web`, `apps/desktop`, `apps/tv`) and treats all three as deliverables: `tooling/src/process.mjs` exports them as `targets`, `docs/development.md` documents `--target web|desktop|tv`, and the CI matrix builds a `web` row. In practice only `apps/desktop` and `apps/tv` ship; `apps/web` has no release job, no deployment configuration and no Dockerfile.

`apps/web` still earns its keep as the only NSH project without a `rust` key. Running `nsh test --target web` there drives a headless Chromium engine, which 18 tooling scripts use as an HTTP/fixture host for acceptance evidence. `crates/http-api`'s business routes are exercised from `apps/web` only through `services/web-api`, a 91-line composition root.

## Goals / Non-Goals

**Goals:** Stop presenting Web as a product in code, tooling, CI, OpenSpec and current docs; keep every existing harness capability and its evidence paths; name the surviving pieces after what they do.

**Non-Goals:** Removing `crates/http-api` or its business routes, changing any DTO or generated contract, redesigning shared UI, touching `packages/app`／`packages/ui`／`packages/core-client`, rewriting `docs/history/**` or `openspec/changes/archive/**`, or adding a replacement web client.

## Decisions

1. **Two vocabularies, kept apart.** `targets = ['harness', 'desktop', 'tv']` names the NSH projects that `check`／`build`／`test` cover; `products = ['desktop', 'tv']` names what `dev` and `package` accept. The harness must keep being compiled — it type-checks the shared packages against a second host — but letting it be "developed" or "packaged" is the confusion this change removes. `requireProduct()` in `tooling/src/cli.mjs` fails with the accepted list rather than silently building something that cannot ship.

2. **`nativeTarget()` still answers `web` for the harness.** That value is NSH's platform name — the engine selection passed to `nsh test --target web` — not this repository's product vocabulary. Host scripts (`browsing-host.mjs`, `settings-host.mjs`, `player-host.mjs`, …) likewise keep their `web|macos|android` arguments: those choose an NSH platform and must not be renamed into a target that no longer means a platform.

3. **`apps/harness` keeps its whole surface.** Every `*Preview.tsx` is a 3–4 line `mount()` wrapper over `packages/app`／`packages/ui`; keeping them costs nothing and preserves `pnpm ui:host:desktop`, which needs a manifest whose theme is `theme.json` but which does not build a Rust native app — exactly what `apps/harness` is. `PlayerPreview.tsx` and `UiPreview.tsx` stay for the same reason: `player-controls-host.mjs` and `packages/app/test/Host.tsx` open them by path.

4. **`services/core-api`** keeps its single responsibility (loopback composition root, `{"event":"ready"}` handshake, graceful shutdown) and only changes name. `hongguo-http-api` is not merged into it because `crates/native-bridge` — the production media-byte path for Desktop and TV — depends on `media_router`, and `pnpm codegen` exports the OpenAPI schema from `hongguo-http-api`'s example. Deleting `http-api` would break native playback and contract generation, neither of which depends on Web.

5. **CI drops the harness row instead of renaming it.** `workspace` already runs `pnpm check` and `pnpm build` across every target, so the harness is still type-checked and built on each run; what disappears is a macOS runner whose only job was the harness's own browser suite. `apps/harness/**` therefore classifies as `none` in `ci-paths.mjs`: no target job can be affected by a change that ships nothing.

6. **Evidence keeps its subject, not its label.** `VALIDATION.md` and `docs/feature-ledger.md` describe real Chromium and macOS runs that happened. Those entries keep their source head, screenshots and limitations; only the noun changes from "Web 端" to "harness（Chromium 宿主）". Deleting or inflating them would be worse than the naming problem.

## Risks / Trade-offs

- 18 tooling scripts change working directory → a missed path fails loudly (`ENOENT` on `runtime.generated.json`), and the acceptance scripts are opt-in, so the failure surfaces on the next run rather than silently. `pnpm test:tooling` covers the classification and option parsing that a path typo would break.
- The harness's browser tests stop gating pull requests → they run in local `pnpm test` and in `pnpm verify`; `workspace` still compiles the harness, so the risk is a behavioural regression in two control tests, not a broken build.
- Active OpenSpec changes contain 11 tasks that name Web → re-scoping them edits someone else's in-flight change. Each edit only replaces the host noun and leaves the acceptance intent, so the tasks stay checkable rather than being deleted.
- Renaming `services/web-api` touches `Cargo.lock` and every spawn site → verified by `cargo metadata`, `pnpm codegen:check` (the OpenAPI must be byte-identical) and `pnpm release:check`.

## Migration Plan

Rename the two directories and their manifests first, then the tooling vocabulary and paths, then tests, CI and documentation. `Cargo.lock` and `pnpm-lock.yaml` are regenerated and re-verified with `--frozen-lockfile`. No data, database or wire format changes: existing `runtime.generated.json` files are gitignored and rewritten on the next `pnpm prepare`; the old `apps/web` and `services/web-api` paths do not survive in any committed script. Rollback is a revert of this change; nothing in it is a one-way door, and no release or archive is part of it.
