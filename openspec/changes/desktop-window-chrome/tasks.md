# Tasks

## 1. Window configuration

- [x] 1.1 Add `window.titleBar: { style: "hidden", height: 48 }` to `apps/desktop/nsh.json` and verify `pnpm check` still passes for the desktop target with the generated `.nsh/types` unchanged.
- [ ] 1.2 Confirm the first rendered frame has no system title bar by running the desktop dev host and observing window creation, recording the host and platform observed.

## 2. Shell composition

- [x] 2.1 Add `packages/app/src/shell/TitleBar.tsx`: read `isAvailable` and `titleBar()`, apply the shared drag row, reserve `left`/`right` plus the shared inline padding, take the 48 height from a single constant, and skip window behaviour on web; verify with a component test that zero-reported areas produce no extra padding and that web rendering does not set `windowDrag`.
- [x] 2.2 Reduce `Topbar.tsx` to the content row (brand, page crumb, search, account) without its own height or platform inset; verify the search field keeps its accessible name and the account action stays reachable.
- [x] 2.3 Rewrite `DesktopShell.tsx` to compose `TitleBar`, the two-column body and the existing pages, keeping the current `cinema()` rule for collapse; verify fullscreen and cinema states collapse the bar to a drag strip and restore on exit.
- [x] 2.4 Remove the brand block from `Sidebar.tsx` so navigation starts under the bar; verify the 176 rail keeps its width, its pulse on navigation focus, and that no vertical dead row remains.
- [x] 2.5 Update `packages/app/src/pages/player/layout.ts` chrome constant to the new bar height and verify `pictureHeight()` keeps a whole first screen at 1180×780 and 1440×1000.

## 3. Design sources

- [x] 3.1 Update the `DESIGN.md` Layout table row for the desktop shell so the recorded side rail, bar height and search width match the implementation, and verify the documented values against `TitleBar.tsx` and `Sidebar.tsx`.
- [x] 3.2 Update `design/prototype/visual-redesign-real/desktop.html` and its `assets/theater.css` `.topbar` geometry to the new bar so the prototype still matches the product shell; verify by opening the prototype at 1180×780 and 1440×1000.

## 4. Verification

- [x] 4.1 Run `pnpm check` and `pnpm build` for the desktop and web targets and verify both pass, keeping any failure output rather than skipping a target.
- [x] 4.2 Run `pnpm test` and the desktop app tests, and verify no regression in shell, navigation or player assertions; record any pre-existing failure separately instead of attributing it to this change.
- [ ] 4.3 Observe the Linux desktop host with real window controls in both `gtk-decoration-layout` sides, light and dark, focused and unfocused, maximized and fullscreen, and record what was seen with the platform noted.
- [ ] 4.4 Leave macOS and Windows as implemented-pending-real-acceptance until observed on real machines, recording the specific unverified items: traffic-light vertical centring, caption button hit areas, Snap layout hover, and double-click behaviour.

  Still unverified on every platform: this machine is Linux under WSL, `pnpm ui:host:desktop` requires `nsh-macos-host` (absent), and the Wayland session has no working X capture. The bar is gated on `isAvailable && windowState() !== null`, so a headless host never exercises the native bar either — the app suites pass 257/257 desktop, 174/174 web and 180 passed with 2 skipped on tv, which covers the content row and both themes but none of the window behaviour.

## Workflow follow-up

- Update the feature ledger row and VALIDATION entry for the desktop shell once real-host evidence exists.
- Archive the change after review requirements are satisfied.
