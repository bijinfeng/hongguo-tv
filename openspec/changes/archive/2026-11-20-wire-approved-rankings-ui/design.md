# Design

## Context

See proposal.md. The core returns RankResult and recursive RankOption; existing category/feed patterns provide cancellation and revision fencing. NSH builds retained components once. Implementation and acceptance sources live in the primary repository at /Users/admin/Desktop/hongguo-tv. The earlier worktree is a read-only migration reference.

## Goals / Non-Goals

**Goals:** preserve dynamic opaque selections, exact continuation, bounded shown IDs, actor/drama identity and source restoration with shared controls and virtualized rows.

**Non-Goals:** fabricate radar data, write account state/history, alter playback, introduce UI dependencies or duplicate host implementations. The prototype's five-axis rating was demonstration only and is cancelled, not a missing protocol or MVP dependency. The fixed upstream radar.go third-party ranking snapshots and growth lists remain a separate migration scope grounded in existing behavior and fields.

## Decisions

- A dedicated controller owns optional explicit rank/sub/panel selection and completed pages. Server selected hints determine presentation defaults without rewriting requests or triggering extra reads. A new rank clears sub/panel; a new sub clears panel. Recursive sub groups follow the selected branch. All known panel groups remain visible with exact labels.
- AbortController plus revision plus active/lifecycle checks fence writes independently of transport cooperation. Retry reconstructs the same captured selection and unchanged completed page; malformed/stalled cursors fail visibly.
- Deduplication uses kind:id; shown uses unique raw decimal IDs in last-occurrence order, bounded to 128. No inferred rank or playable actor.
- The page receives controller/navigation callbacks rather than importing Store. Vertical List rows use one desktop slot or two stable TV slots; per-identity refs and collection-bound scroll anchors restore source without overriding a newer focus intent. Shared RankingCard owns presentation.
- Motion inventory before code: shared Button/CardControls selected/hover/pressed use existing control transitions (instant with reduced motion); loading labels update in place without layout entrance; first successful content uses ContentArrival 180ms/8pt/ease-out, disabled under reduced motion; append/recycled cells never replay entrance; Notice uses existing error entrance; no overlay/drag/live media. Integration agent copies inventory into DESIGN.md and observes real hosts before acceptance.

## Risks / Trade-offs

- Recursive selectors can change shape → retain initial menus when omitted, identify choices by source path and exact ID, and invalidate dependent state on explicit parent choice.
- Shared UI and global routes are concurrent → fixed exported props and test entry contracts coordinate ownership; no unassigned files edited here.
- Host evidence must come from the primary repository sources; migrated drafts do not count as accepted implementation.
- Prototype scope can exceed actual capability → implement only behavior and data supported by the fixed upstream and real service. Remove the demonstration-only five-axis rating rather than inventing a protocol or deriving axes from heat. Migrate the upstream radar.go third-party snapshots and growth lists separately without adding dimensions or synthetic scores.

### Review corrections

- Subranking lookup remains children-only; panel lookup traverses option.panels as well as children, retaining each panel ancestor without presenting cross-panel edges as children. Regression covers A → nested panel B → nested panel C plus an unrelated children branch.
- Dynamic selectors occupy a vertical scroll viewport capped at 32% of page height and 192 desktop points / 252 TV reference units. Per-row viewport height follows fontScale; no selector is truncated from the data. Dense production-page regressions cover 32 named panels and eight child levels at desktop 1180×780 and TV logical 960×540, including the final panel, result action and continuation failure/retry. Actual TV 1.3-font host evidence remains required.
