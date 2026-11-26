# Proposal

## Why

桌面与 Web 的视觉系统已实现，但存在可复现的缺陷，且已确定新的视觉方向：

1. **浅色主题表面分层失效**：`card` 与 `background` 同为 `#ffffff`，hero 卡片、内容卡和搜索框在浅色下是白底白框，只剩一条细线在撑，实际渲染中左半区完全不可见（已用真实宿主截图确认）。
2. **display 排版反向**：`display` 用 44/400 并带 +0.06em 字距。正向字距是衬线排版习惯，搬到系统无衬线上会散开；44/400 在视觉上比它上方的 32/600 更轻，视线先落在问候语而不是精选内容。
3. **图标压过文字**：官方 Lucide 描边 2 在 20 档渲染成 1.67pt，而 14–16 号中文竖笔是 1.1–1.4pt，整行读起来像“图标加说明”。
4. **浮层没有深度**：菜单、Popover、Dialog、Sheet、Tooltip 与页面同表面，层级只能靠边框区分，而规范要求「一个机制：表面色差 + 留白」。
5. **间距不成档**：内容边距用 `width × 0.035` 这种视口分数，每个页面各自落在档位之间的一两个像素上。
6. **缺少 direction C 的视觉语言**：用户已在三个方向中选定 C（影院沉浸：hero 430、胶囊导航、封面环境光），需要作为目标方向落地，且必须同时成立浅色与深色。

第 1–5 项已在工作区修改完成但未提交，且落在错误的基线上（改动在 `chore/ci-pr-feedback-speed` 的工作区里，而该分支没有 `feat/visual-system-refinement` 的记录）。本变更把这些改动收到正式基线上，并把 direction C 的外壳与 token 层落地。

## What Changes

- 重新标定表面阶梯，使浅色与深色都成立：`background → card → muted → popover` 每级相差约 1.05–1.15，`card` 必须与 `background` 可辨。
- 修正 `display` 排版：44/500、行高 1.15、字距 −0.01em；`body` 行高 1.6；新增 `caption` 12/1.4 文字角色，取代就地写 12/13。
- 图标描边从 2 改到 1.75（保留官方 24 网格与路径），使 20 档渲染为 1.46pt，与相邻标签同重。
- 新增共享 `overlayShadow` 两层投影，应用于 Menu、Popover、Dialog、Tooltip；平静表面不加投影。
- 内容边距改为间距档位（32／40／48 按窗口宽度取档），替换视口分数，使顶栏与各页共用同一 `contentGutter`。
- 落地 direction C 的外壳层：侧栏与标题栏使用独立的 chrome 表面（与页面内容区分层），导航项为胶囊几何，圆角与控件尺寸按 C 的档位。
- 页面级 C 改造（hero 430、封面环境光、海报尺寸）按批次跟进，不在本变更一次改完。

## Capabilities

### New Capabilities

- `visual-surface-system`: 表面阶梯、浮层深度、文字角色、图标描边与间距档位构成的视觉契约，以及浅深两种主题下必须成立的可辨约束。

### Modified Capabilities

无。

## Impact

涉及 `DESIGN.md`（颜色、排版、Elevation、图标四节）、`packages/ui/theme.json`、`theme.tv.json`、`tokens.generated.ts`、`foundation.ts`、`icon.tsx`、`overlay.tsx`、`typography.ts`、`index.tsx`、`tooling/src/design-tokens.mjs` 与 `tooling/test/design-tokens.test.mjs`，以及 `packages/app/src/shell/ContentColumn.tsx`、`Topbar.tsx`、`pages/rankings/layout.ts`。

不新增 UI 框架依赖，不引入图表库，不修改 `upstream/hongguo/`。TV 主题值同步但 TV 外壳几何不变。
