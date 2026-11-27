# Design

## Context

See `proposal.md` — Why. 现状与约束：

- `DESIGN.md` 是颜色／排版／间距／图标的唯一设计源，`tooling/src/design-tokens.mjs` 从它编译出 `packages/ui/tokens.generated.ts`、`theme.json`、`theme.tv.json`；`design:codegen --check` 检查漂移。改数值必须改 DESIGN.md，不能只改生成物。
- `Icon` 是唯一图标消费入口（`packages/ui/src/icon.tsx`），按 `Canvas` 绘制官方 SVG 路径，`lineWidth` 写在绘制回调里。
- `NSH` 的 `boxShadow` 接受 `string | BoxShadowLayer[]`（`apps/desktop/.nsh/types/nsh/types.d.ts:238,353`），因此两层投影可用结构化数组表达，不拼字符串。
- `popupStyle` 是 Menu／Popover／Dialog／Tooltip 各自独立传入的样式入口，没有共享的浮层样式基座。
- 内容边距目前分散：`ContentColumn.contentGutter()`、`Topbar` 自己的 `inset()`、`rankings/layout.ts` 各自的 `windowSize().width * 0.035`。
- 已确认的可用能力：`backgroundImage` 支持 `linear-gradient`／`radial-gradient`（`types.d.ts:354`），产品代码中 `HomeHero`、`RankingsHero`、`player.tsx` 已在用，direction C 的环境光不需要新机制。

## Goals / Non-Goals

**Goals:**

- 让第 1–5 项缺陷在数值层面被真正修掉，而不是调参掩盖：浅色 `card` 与页面可辨、display 不再反向、图标与标签同重、浮层有共享深度、间距落在档位。
- 把 direction C 的**外壳层**落地：chrome 表面与页面分层、胶囊导航几何。这是页面级改造的前提，改完外壳后每个页面都能在同一基底上迭代。
- 保持 TV 语义一致、数值独立。

**Non-Goals:**

- 不在本变更改 hero 高度、封面环境光、海报尺寸与各页面构图。这些是 direction C 的页面层，按批次跟进，每批单独看效果。
- 不引入图表库、动画框架或新的 UI 依赖。
- 不改 `DESIGN.md` 之外的文档结构，不新增第二套规范。

## Decisions

### 表面阶梯取 1.05–1.15 的比例，而不是固定色值差

- 浅色：`background #ffffff → card #fafafa → muted #f2f3f3 → popover #ffffff`。`card` 与页面的差约 2%，在 sRGB 上刚好越过“看得出但不像面板”的阈值；`popover` 回到纯白是因为它浮在 `muted` 之上，方向必须朝亮而不是朝暗。
- 深色：`background #000000 → card #101111 → muted #1a1c1c → popover #212323`。比例与浅色一致，只是方向朝亮。
- 备选：用固定 L\* 差（如每级 +3）。被否：深色在纯黑起点上 +3 L\* 就已经明显发灰，浅色在纯白顶点上根本没有向上空间，两端行为不一致。
- 这条写进了 spec 的 `Surfaces form a visible ladder`，因为“可辨”是可观察行为，不是实现细节。

### 图标描边 1.75 而非缩尺寸或换图标集

- 官方 2 在 20 档是 1.67pt。相邻 14–16 号中文竖笔约 1.1–1.4pt。1.75 把 20 档降到 1.46pt，落进同一区间。
- 备选 1：把图标从 20 降到 16。被否：改变网格节奏，且 16 档的 2 描边是 1.33pt，仍在区间上沿。
- 备选 2：换一套更细的图标集。被否：AGENTS 明确要求固定 Lucide 官方 SVG，禁止混用。
- `DESIGN.md` 的图标节同步改写，把“2 单位描边”换成带理由的 1.75。

### `overlayShadow` 用结构化两层数组，不用字符串

- 两层：接触边 `0 2 6 rgba(0,0,0,.18)` + 抬升 `0 12 32 rgba(0,0,0,.28)`。单层投影在小半径下读作污渍，两层才有“浮起”感。
- 颜色固定用平台黑加透明度，因此不需要为浅深主题各出一套 token。
- 放在 `foundation.ts` 并从 `index.tsx` 导出，与 `border`、`focusRing` 同级：它是共享基础量，不是组件私有样式。
- 只应用在 Menu／Popover／Dialog／Tooltip 的 `popupStyle`，Sheet 按其承载另行确认（NSH 的 Sheet 有自己的表面处理）。

### 间距档位把 `contentGutter` 变成唯一来源

- `contentGutter()` 按窗口宽度返回 `space('xl' | '2xl' | '3xl')`（32／40／48，阈值 1200、1500）。
- `Topbar` 与 `rankings/layout.ts` 改为调用它，不再各自算 `width × 0.035`。
- 备选：保留视口分数但四舍五入到 4 的倍数。被否：仍然跨页不一致，且没有语义名称。

### direction C 只落外壳，页面分批

- 外壳层：chrome 表面（侧栏／标题栏）与内容页面分层，导航项胶囊几何（`radius-full`），控件沿用现有 `sm`／`md` 档位。
- 页面层（hero 430、封面环境光、海报 216）留到后续批次，因为每处都需要单独的真机观察与几何复核，一次改完无法归因。
- 理由：用户明确选择“先外壳与 token，页面逐步”。

### 变更应落在 `master` 的新分支上

- 当前 14 个文件的改动在工作区里，但所在分支是 `chore/ci-pr-feedback-speed`，且会话中提到的 `feat/visual-system-refinement` 分支停在 `3b40404`、没有任何提交。改动尚未提交，换分支即丢失。
- 交付时需要新建基于 `master` 的分支并把这批改动带过去；该动作属于实施阶段，不在本规划内执行。

## Risks / Trade-offs

- **[1.75 描边在所有档位都偏细]** → 只在 20 与 16 档验证过光学校准；24 及以上档位（如 TV 的 22）需在真实宿主看一次，必要时按档位微调而不是全局改回 2。
- **[浅色 `card #fafafa` 与白色背景在低质量屏上仍难辨]** → 真机与截图都要看；若仍不足，下一级调到 `#f7f8f8`，但必须同时复核 `muted` 与 `popover` 的顺序不被破坏。
- **[深色 `muted` 提到 `#1a1c1c` 会影响控件禁用态可辨性]** → 禁用态依赖 `muted` 表面加 `border`，需连同禁用按钮、输入框一起看。
- **[浮层投影在深色页面可能过重]** → 28% 黑在纯黑页上几乎不可见、在深灰卡上明显。两层都保留，但需在深色菜单打开状态下实测；若过重则只调第二层的 alpha。
- **[`contentGutter` 跳变造成窗口缩放时内容抖动]** → 阈值处会有一次 8px 跳变代替连续微调。这是刻意的：档位一致性优先于连续平滑。
- **[direction C 的胶囊导航与现有 `Button` 导航变体冲突]** → 先只改外壳的导航项几何，不动 `Button` 契约；若需要新变体，在页面批次里评估。

## Migration Plan

1. 先把工作区现有的 14 项改动移到基于 `master` 的新分支并提交，形成可回滚的基线。
2. token 与设计源同步修改（DESIGN.md → 重新生成 → 漂移检查）。
3. 图标描边、浮层投影、间距档位作为独立小步落地，各自可单独回滚。
4. 外壳层 C 几何最后落地，因为它依赖已稳定的表面阶梯。
5. 回滚：token 改动回滚需同时还原生成物；描边与投影是单点常量，可独立回退。

## Open Questions

- Sheet 是否也应带 `overlayShadow`（NSH 的 Sheet 承载是否已自带深度）——实施时确认，不改变 spec。
- TV 的 22pt 图标在 1.75 档下的光学重量需真机观察。
