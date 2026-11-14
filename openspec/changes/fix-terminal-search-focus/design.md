# Design

## Context

See proposal.md. D1 uses a standalone BaseButton ref outside the virtualized result rows. macOS loses its key-view position when that node leaves the hierarchy; the final 1440 dark host check reproduces it. Current NSH0.5 generated BaseButton/ComponentHostProps expose no focus/blur callbacks and ViewRef has no focused getter. Rust ambient focus watchers exist, but adding a cross-host native UI module solely for this callback would add significant plumbing. The primitive View exposes native focus/blur, role, disabled, press and accessibility state; its native platform already owns Enter/Space/accessibility activation.

## Goals / Non-Goals

**Goals:** Preserve the existing action's focus ownership until removal and restore a stable search control only while that ownership remains valid.

**Non-Goals:** Global focus manager, new native module, upstream patch, new labels, new pagination protocol, changed list geometry or completing C3.2.

## Decisions

1. Add a narrow focus-observable standalone action in packages/ui, reusing the existing Button appearance. Native View owns the semantic button role, disabled and press states plus platform keyboard/accessibility activation; no custom key handler. Keep the existing BaseButton and Toolbar path for all ordinary controls. Document that this specialized action is outside Toolbar and observe focus/blur with no additional Tab stop.
2. Observe actual focus ownership at the specialized root and report focused removal through its owner cleanup. Search guards that callback by active search, the same submitted query, a ready successful terminal page and no continuation error. On macOS call the existing focusSearchInput in the same removal turn, without a timer or unconditional response focus. The input lies outside the result List, so the handoff does not reset that List. Public TSX cannot know a Toolbar row's actual roving stop: selected/first/last refs are unsafe guesses, so do not attempt card focus. Tab from the input still enters the retained result rows; its ordinary user-driven focus reveal remains native.
3. Keep retries and pending labels on the same action. A blur invalidates ownership, navigation/query/disposal fail the Search guard, and late responses cannot trigger a hidden control handoff. No change to store transport/cancellation or TV's native recovery; verify the specialized root in each actual host.

## Risks / Trade-offs

- Focus notifications around removal can differ by host → first prove native focus/blur/cleanup behavior with an isolated control and actual macOS continuation, then retain no-steal regression during the delayed final response. Do not claim success from headless alone.
- A custom root could lose button semantics → retain native role/label/disabled/press/selected state and validate Enter/Space, pointer, disabled and accessibility action; do not place it in a Toolbar where BaseButton owns roving registration.
- Focusing the input adds Tab steps before results → retain List position and verify its keyboard path on actual macOS, including a row whose arrow-selected stop differs from the last opened card. This avoids an unsafe card-ref guess or adding a native UI module only for this repair.
- UI shared appearance drift → reuse one existing presentation rather than copy visual constants; inspect light/dark and reduced motion screenshots.

## Migration Plan

No data/DTO/dependency migration. Add isolated focus and terminal/no-steal regression, implement the narrow UI lifecycle and Search guard, run check/build/full verify and actual macOS/Web/TV regression with package/state restoration. Obtain independent UI/function review and commit only this repair locally; no push/archive/publish. Rollback code only; preserve D2 storage and parallel documents.
