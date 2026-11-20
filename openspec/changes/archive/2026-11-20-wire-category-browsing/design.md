# Design

## Context

See proposal.md. The core exposes CategoryResult and dynamic selectors through identical HTTP/native routes. Existing Search owns keyword/discovery state; PosterCollection owns virtualized identity anchors. The approved desktop discoverPage uses three labeled choice rows; TV tvDiscover uses three selectors and tvSearch is distinct.

## Goals / Non-Goals

Add category browsing through the shared app and ui. Preserve keyword landing, discovery, suggestions, source behavior and read-only privacy. No query/category combination, extra filter dimensions, feed, ranks, storage, DTO or dependency changes.

## Decisions

- A separate discover section and category controller retain state while hidden. Main navigation Find points here; Search remains accessible via the existing desktop search glyph and TV header search tool. The desktop glyph becomes a named semantic button without adding a new icon or sidebar entry. TV search Back returns to the preceding category when entered from there; newer navigation supersedes it.
- Controller uses captured transport, active/lifecycle ownership and AbortController with revision fencing. Successful data survives detail coverage and section changes; unfinished first/more requests can retry when active again. Selection change clears pages/session/shown and selection anchor. Change type resets topic. No background reads or writes.
- Explicit empty genre and sort make All/General honest; only supported returned short_play/comic_series options are named 真人剧/漫剧. Topic is category_dim_theme, not wire genre. General has no selected sort; Latest=online_time and Popularity=hot_score, visible only when supported. hot_collect is not relabeled. Remaining dimensions stay core-only.
- Initial selector request is1; continuation0 preserves absent options. Session/offset come from service; shown is the last128 unique loaded IDs. Validate advancing cursor even for empty item pages and allow another page. Preserve loaded cards on more failure. The UI uses loaded results, never a fabricated total or end marker based on empty items.
- Extend shared UI with FilterChoices: desktop label plus semantic Toolbar buttons, TV Select with named trigger and existing SelectFocus. Button states use existing motion/theme; popup parts use shared tokens. Reuse PosterCollection for grid/shelf and focus guards. Avoid per-row entrance animation.

## Risks / Trade-offs

- Dynamic options differ from demo → preserve real labels and IDs, bounded options in core, long-label host fixture; do not invent sample topics.
- Search/category mismatch → separate pages; search never displays active category chips or silently clears q. Search entry/Back must not drop category state.
- Native Select timing/focus → use existing SelectFocus and verify macOS/TV keyboard and dismissal visibly.

## Migration Plan

Implement controller plus focused state tests, compose controls/pages/navigation, add fixture and graphical/TV acceptance, independent reviews and full verify. Preserve concurrent docs with isolated suffix staging; one local commit, no push/archive. Rollback by reverting this slice, no state migration.
