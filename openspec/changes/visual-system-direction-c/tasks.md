# Tasks

## 1. Land the existing work on a real branch

- [x] 1.1 Create a branch from `master` and carry the 14 uncommitted files (`DESIGN.md`, `packages/ui/*`, `tooling/*`, `packages/app/src/shell/*`, `pages/rankings/layout.ts`) onto it, and verify with `git status` that no change was lost and that `crates/` is untouched.
- [x] 1.2 Record the branch name and base commit in the change before running any further task, so the work is recoverable if the workspace is reset.

Branch: `feat/visual-system-direction-c`, base commit `4ac1a5e` (`master`, includes the NSH 0.7.0 upgrade `814e2fc`). The 14 modified files carry over uncommitted; `crates/` is clean.

## 2. Surface ladder

- [x] 2.1 Set the light and dark surface colours in `DESIGN.md` so `background → card → muted → popover` differ by roughly 1.05–1.15 per step, regenerate with `pnpm design:codegen`, and verify `pnpm design:codegen --check` passes with no drift.
- [x] 2.2 Rewrite the `Elevation & Depth` section of `DESIGN.md` to state the single mechanism (surface difference plus whitespace) and the fixed ladder order, and verify the documented order matches `theme.json` values for both themes.

## 3. Type and icon weight

- [x] 3.1 Apply the display change in `DESIGN.md` (44/500, line height 1.15, letter spacing −0.01em), set `body` line height to 1.6, add the `caption` role at 12/1.4, regenerate, and verify the generated type tokens and the role count test agree.
- [x] 3.2 Wire `caption` through `packages/ui/src/typography.ts` and verify a component using the caption role renders at 12 with line height 1.4 in both themes.
- [x] 3.3 Change the icon stroke in `packages/ui/src/icon.tsx` to 1.75 and rewrite the icon paragraph of `DESIGN.md` with the optical-weight rationale; verify `pnpm ui:icons:check` still passes and that no SVG path changed.

## 4. Overlay depth

- [x] 4.1 Add the two-layer `overlayShadow` to `packages/ui/src/foundation.ts`, export it from `index.tsx`, and verify it is a structured array accepted by the NSH `boxShadow` type rather than a string.
- [x] 4.2 Apply `overlayShadow` to the Menu, Popover, Dialog and Tooltip popup styles and verify each opens with the shared depth in light and dark, while ordinary content surfaces remain shadow-free.

## 5. Spacing scale

- [x] 5.1 Replace the viewport-fraction gutter with `space()` steps in `ContentColumn.contentGutter()` (32 below 1200, 40 from 1200, 48 from 1500) and verify the top bar and page content share the same left and right edges at 1180 and 1440.
- [x] 5.2 Point `Topbar.tsx` and `pages/rankings/layout.ts` at the shared gutter and verify the ranking band inset no longer computes its own fraction.

## 6. Direction C shell layer

- [x] 6.1 Give the desktop rail and the title bar a chrome surface distinct from the page content, following the ladder from task 2, and verify in light and dark that the rail reads as its own column without a divider line.
- [x] 6.2 Set the navigation item geometry in the rail to the capsule radius from the direction C source, and verify selected, hover and focus states stay distinguishable at 1180 and 1440.

## 7. Verification

- [x] 7.1 Run `pnpm check`, `pnpm build` and `pnpm test` and verify all pass with no skipped target; keep any failing output and confirm whether it pre-exists on `master` before attributing it to this change.

  `pnpm check` and `pnpm build` pass for web, desktop and tv. `pnpm test` ends with one Rust failure, `account::service::sync::tests::timeout_stop_shutdown_and_drop_cancel_rounds_and_reject_restart` (`fixture condition: Elapsed(())` at `crates/core/src/account/sync/tests.rs:306`). `crates/` is untouched by this change, the test passes in isolation on both this branch (0.22s) and clean `master` (0.14s), and it fails in the full suite on both. The browser suite `browsing-host.mjs web browsing` reports the same 10 failures on clean `master` and on this branch, so neither failure belongs to this change.
- [x] 7.2 Capture real renders of the home page in light and dark through the product entry and verify the hero card boundary is visible and the surface order reads correctly.
- [ ] 7.3 Observe the desktop host at 1180×780 and 1440×1000 in both themes, recording what was seen per platform, and leave TV and any unobserved host as pending rather than claiming a pass.

  Observed on the real Linux desktop host (Ubuntu GNOME, Wayland, `GDK_BACKEND=x11`), 1180×780 content window, light and dark:

  - The ladder holds in the light host: page `#ffffff`, hero card `(247,248,248)`, rail and title bar `#f9f9f9`, search field `(242,243,243)` — four distinct steps in the intended order, where `card` and `background` were both `#ffffff` before this change and the hero's left half was invisible.
  - Dark reads `#1a1c1c` for the rail and title bar on a black page, with the popover ahead of `muted` as specified.
  - The rail has no divider line: it separates from the page by surface alone, and the title bar continues that same surface across the top, so the window has one chrome band instead of a bar over a second bar.
  - Icons at the new 1.75 stroke sit at the label's weight beside the 14pt rail text.

  Not observed: a maximized or fullscreen desktop window at 1440×1000, and the TV host at 960×540dp. Evidence in `artifacts/window-chrome/linux-titlebar-controls-faint.png` (light) and `linux-titlebar-controls-dark.png` (dark); both stay out of the repository, as `artifacts/` is ignored.

  Blocked locally: `pnpm ui:host:desktop` resolves `nsh-macos-host`, which this Linux machine does not have, and the WSL Wayland session has no working X capture. Web renders through the real product entry are captured in `artifacts/browsing/web/home-{light,dark}.png` and verified; the native desktop host and TV remain implemented-pending-real-acceptance.

## Workflow follow-up

- Update the feature ledger and VALIDATION entries once real-host evidence exists.
- Archive the change after review requirements are satisfied.
