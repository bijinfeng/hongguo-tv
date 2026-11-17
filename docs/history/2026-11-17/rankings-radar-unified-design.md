# 排行榜与榜单雷达统一设计批次

日期：2026-11-17。变更：界面结构与视觉统一（无 OpenSpec 变更）。本批把排行榜的「红果榜」与已实现的「榜单雷达」收敛为同一套页面与表格语言：页面级来源 Tabs、雷达控件带、去卡片 hairline 表格、TV 整行焦点；官方榜头部按设计稿恢复暗红渐变。完整 MVP 仍未完成。

## 背景

设计稿 `design/prototype/visual-redesign-real` 只覆盖官方榜，且带内容类型与播放／选集动作，超出产品边界；已实现的雷达是另一套语言（带边框卡片、灰底表头、文字筛选、独立列导航、逐条状态行）。同一页面两个来源因此像两个产品。

## 决策

- 来源层级：页面顶部放「红果榜｜榜单雷达」Tabs；雷达视图（官方快照／飙升榜）Tabs 留在控件带。
- 雷达头部只做控件带：来源／日期 meta 与刷新；日期、刷新、筛选、列导航同一带内。
- 表格去卡片：hairline 表头与行分隔、页面对齐；列导航在桌面移入控件带，TV 按视口分配列宽、不横向滚动。
- 榜单行单一焦点目标：桌面标题是行内动作，TV 整行是焦点动作（DPAD 只上下移动行）。
- 官方榜头部沿用设计稿暗红渐变与白色文字，不加装饰投影；数据仅公开目录标题，不引入评分、播放或选集动作。
- 加载态沿用「加载与占位」：未知画静帧骨架，刷新保留最近成功数据并原位提示，失败与过期用紧凑状态行。

## 实施

- `packages/ui/src/radar-table.tsx`：去卡片与灰底表头；`columnControls="header" | "external"`；`RadarTableRef.scrollColumns('start' | 'end')`；TV 比例列宽与整行 `Button`（artwork 承载单元格），桌面标题按钮与横向列窗口保留。
- `packages/app/src/pages/rankings/RadarToolbar.tsx`：新增控件带（meta、刷新、视图 Tabs、筛选、列导航）与 `RadarPending` 骨架。
- `packages/app/src/pages/Radar.tsx`：改为组装；移除内部限高控件 Scroll；状态行合并为紧凑行；空态与分支不可用保留。
- `packages/app/src/pages/rankings/RankingsHero.tsx`：恢复设计稿暗红渐变与 cinema 文字；TV 头部高度收紧。
- `packages/ui/src/ranking-card.tsx`：TV 行收紧（封面 70×94、行内边距 14、间距 12），保证 TV 首屏可读到完整行。
- `packages/app/src/shell/Navigation.tsx`：补 TV 端「排行榜」入口。
- 原型 `design/prototype/visual-redesign-real`：桌面与 TV 加入来源 Tabs、雷达控件带、hairline 表格、加载／空／失败演示参数；README 补充演示方式。
- 规范：`DESIGN.md` 排行榜动效清单、`packages/ui/README.md`（RankingCard／RadarTable 契约）、`docs/design/component-implementation.md` 同步。

## 验证

- `pnpm check` 通过；`pnpm build` 三端通过；`pnpm ui:check` 通过；`pnpm ui:test` 18／18 通过。
- 雷达宿主验收：`node tooling/src/radar-host.mjs macos --foreground` → 4／4 通过（1440／1180 × 浅／深），覆盖详情归属、八列、缓存分支、返回来源、列导航与焦点恢复；截图在 `artifacts/radar-ui/macos/desktop/`。
- 排行榜宿主验收：`node tooling/src/rankings-host.mjs macos --foreground` → 8／8 通过（1440／1180 × 浅／深，动态选择器、32 面板与续页），截图在 `artifacts/rankings-ui/macos/desktop/`。
- TV 视觉捕获：`.local/rankings-tv-shot.mjs`（App `target="tv"`，1920×1080，macOS 图形宿主）浅／深各 1 条通过，产物 `.local/rankings-tv-shots/`：`tv-rankings-{light,dark}.png`、`tv-radar-snapshot-*.png`、`tv-radar-growth-*.png`。
- 图像复核：桌面雷达为页面级来源 Tabs、meta ＋ 刷新、视图 Tabs ＋ 列导航、筛选 chips、hairline 表格；增长视图两行筛选与升序行正确。TV 官方榜为渐变头部、榜单 chips 与完整榜单行；TV 雷达为全宽八列表格、整行焦点、无横向滚动。

## 未验收

- 正式入口真实账号与真实数据的榜单／雷达流程；本批证据来自 fixture 宿主与本地视觉捕获。
- 物理 TV／真实遥控的距离、大字、DPAD 列导航与整行焦点全流程；TV 捕获用的是 macOS 图形宿主。
- 读屏实际播报；骨架／状态行的动态播报时机未由读屏验证。
- 真实慢网与失败下的雷达刷新、过期与缓存提示；fixture 只覆盖固定序列。
- 桌面列窗口在真实列宽下是否够用、TV 官方榜首屏密度是否合适，仍需正式宿主观察。
