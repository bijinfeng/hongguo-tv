# Design

## Context

See proposal.md. Approved prototype app.js newPage and tv.js tvNew define title, horizontal dates, released posters and upcoming public arrangement. Existing Discover/PosterCollection supplies stable slots, virtualized grid/TV shelf, source/focus guards; ui owns all controls, covers, notice and entrance motion. Generated CalendarEntry explicitly separates released Drama from upcoming announcement. Parent owns root/store/fixture wiring and all execution gates.

## Goals / Non-Goals

Add calendar.ts, pages/Calendar.tsx, test/calendar.tsx, test/CalendarState.tsx, shared ui/date-choice.tsx and this change. No account write, false type filter, local date invention, new theme or history mutation. Host tests, screenshots and full check/build run centrally after integration.

## Decisions

- createCalendar owns mode/calendar date/new audience, completed pages per selection, schema, selected item and one cancel/revision lane. The initial default calendar request omits date and subscribe cursor; continuation freezes the first accepted default day so upstream midnight rollover cannot mix dates. Dates only come from validated schema. New and calendar cache independently; errors require explicit retry and successful cached returns do not refetch.
- Normalize new-drama results only as typed released CalendarItems. Upcoming stays its own typed entry; never coerce reservation identity to Drama. Mixed virtualized cards use namespace identity, four-column desktop and single TV shelf; source callbacks restore the exact item/list anchor under a focus-intent guard.
- Public upcoming card activation replaces the existing content region with public arrangement and a truthful unavailable reservation message, with no media/account request. Keeping an announcement above a fitted poster strip compressed covers at 1180×780, so the retained list is hidden, disabled and removed from accessibility while arrangement is open. The close action stays above a scrollable named region; close/Escape/native Back dismiss locally before leaving the calendar and restore the source. Date/mode changes clear the old arrangement. No mutation or automatic replay follows login.
- Reuse Button, CardControls, FilterChoices, PosterCard/Cover, ContentArrival and Notice. Shared DateChoice preserves the approved three-layer day label, large date and month hierarchy, CardRoot keyboard/selection semantics and platform size scales; invalid dates render no control. The page derives weekdays from exact advertised Gregorian dates and today from upstream metadata. Date strip height follows fontScale. Keep approved title/date/content order, spacing and platform sizes; no hardcoded prototype dates. New-drama audience labels are 全部/男生/女生, not genre.
- Native text metrics can exceed a minimum date target: measure the date content and reserve its actual height plus focus padding rather than clipping it to the minimum. The page stores virtualized position and separate card/pagination focus intents, fenced by active/key/dispose/newer navigation. Restore the cached viewport first; only fall back to a source row if it is unmounted or outside that viewport. The list reserves focus padding; a source fallback never reuses another row's cached offset. Measurements carry a revision so an A→B→A selection cannot accept an old position answer.
- A visible inactive macOS window keeps its read; background/hidden/disposed owners cancel. Native Android ordinary View refs do not restore focus in the stock development host. TV acceptance must use the project TvRemote adapter; named scroll regions become explicit reading stops, preserve child accessibility, consume directional scroll until an edge and never activate as a button. API 26–29 requires an explicit focus-region-* marker; API 30+ uses exact region semantics. Replacement content uses focus-entry-* for a guarded first-action handoff without modal trapping.
- Focus outsets live inside every virtual row's measured geometry. Center a source only when its cached viewport cannot fully show it, then measure after the list jump before focusing. One active recheck is allowed; unsettled geometry waits for layout/ref notifications instead of repeatedly stealing focus. Desktop card height reserves 32 points for row and native reveal safety, while TV keeps 16 reference units across the shelf axis. Sufficient desktop space retains the poster ratio; shared PosterCollection follows the same safety rule.

## Motion inventory

| State                                      | Existing tool/token                                   | Reduced motion             |
| ------------------------------------------ | ----------------------------------------------------- | -------------------------- |
| Date/mode/card hover pressed selected      | Shared ui fast color100ms/opacity                     | Immediate colors           |
| First accepted content and error           | ContentArrival/Notice entrance180ms easeOut distance8 | No translation             |
| List append, recycled cards, focus/readout | Immediate stable layout, no per-card entrance         | Same                       |
| Date/mode collection change                | Reset list anchor; current control retains focus      | Same                       |
| Detail forward/return                      | Existing root NavStack and focus guard                | Existing none/TV immediate |
| Loading                                    | Static truthful text and disabled duplicate action    | Same                       |
| Arrangement close/back and long-text read  | Immediate guarded source restore and scrolling        | Same                       |

The durable integrated inventory and input contract live in docs/calendar-browsing.md, linked from DESIGN.md.

## Risks / Trade-offs

- Date schema may disappear on continuation -> retain accepted schema; validate before exposing controls.
- DateChoice adds the approved date hierarchy in the shared UI layer; parent visual review checks real light/dark Desktop/TV sizing, full-width distribution, larger text and focus visibility rather than assuming source composition proves visual fidelity.
- Future metadata lacks account reservation -> explicit unavailable state, no fake confirmation.

## Migration Plan

Add controller/page/test fixture exports, parent wire section calendar and test preview, then check/build, focused/full tests and real light/dark Web/macOS/TV review. Rollback removes this additive slice without storage changes. No commit/push/archive by child.
