# 首页加载态统一批次

日期：2026-11-17。变更：界面状态统一（无 OpenSpec 变更）。本批把首页「精选／继续观看／题材筛选／片库网格」的等待、刷新、失败与空状态统一为同一套静帧骨架模型，补共享骨架原语和两个 token；完整 MVP 仍未完成。

## 背景

首页三个区域各自推断数据状态：片库请求未开始时按空状态渲染「暂时没有找到这部剧」，继续观看在记录未返回时按空状态渲染「还没有观看记录」，精选区只有「有／无推荐」两个分支，失败会永久停在手写骨架且暗色下与卡片几乎同色。三处骨架的几何、颜色与无障碍语义也互不相同。

## 决策

- 只有请求成功返回才算结论；无数据且无错误一律是「未知」，不得渲染空状态或数量。
- 首次加载画骨架，骨架只表达几何，不做 shimmer、脉冲、入场或逐条错峰；骨架换真实内容不叠加 `ContentArrival`。
- 刷新／筛选切换保留旧内容原位，计数位置显示「正在更新…」；切换筛选不先清空网格。
- 精选区跟随片库：片库失败或确认空时不显示空壳。
- 每个加载区域只播报一次忙碌语义，占位块退出无障碍遍历与焦点；桌面与 TV 共用状态模型，TV 骨架不进入遥控焦点。
- 新增 `skeleton`（浅 `#e8e8e8`／深 `#2d2f2f`）与 `skeleton-surface`（浅 `#f3f3f3`／深 `#1c1d1d`）；不以 `muted`／`border` 拼骨架。

## 实施

- `packages/ui/theme.json`：两个新 token，浅深各一套。
- `packages/ui/src/display.tsx`：新增 `SkeletonBlock`（几何块，退出无障碍遍历）与 `SkeletonRegion`（区域标签、忙碌语义、`testID`）；`Skeleton` 改用 `skeleton` token。
- `packages/app/src/category.ts`：记录数据对应的查询键，筛选切换保留旧数据并暴露 `stale`；首次／过期数据才发起读取。
- `packages/app/src/pages/home/CatalogSection.tsx`：筛选骨架、与海报卡同几何的网格骨架、失败 `Notice`、空状态与「正在更新…」计数；分页沿用 `Button` 的 pending。
- `packages/app/src/pages/home/HomeHero.tsx`：精选骨架按桌面 5／7 与 TV 文案列绘制，仅未知时显示。
- `packages/app/src/pages/home/ContinueSection.tsx`：继续观看骨架、失败 `Notice` 与重试，空状态只在成功且确认无记录时出现。
- `packages/ui/dev/Gallery.tsx`、`DESIGN.md`「加载与占位」、`docs/design/component-implementation.md`：验收页与规范同步。

## 验证

- `pnpm check` 通过；`pnpm build` 三端（web／desktop／tv）通过，Web 产物约 600 KB js。
- `pnpm ui:check` 通过；`pnpm ui:test` 18／18 通过，包含两种语义主题下全部组件组渲染。
- 三端应用回归通过：Web 229／229、Desktop 237／237、TV 239／239。分类回归按新语义更新——筛选切换后旧网格保留，过期续页不能改写内容；失败续页仍以同一游标重试，筛选失败则重读第一页。
- 宿主 fixture 截图 4／4 通过（`.local/home-loading-shot.mjs`，本地延迟代理 2500ms，macOS 图形宿主）：桌面浅／深首屏与稳定态、筛选切换、TV 浅／深首屏。产物在 `.local/loading-shots/macos/`：`first-paint-{light,dark}.png`、`settled-{light,dark}.png`、`filter-update-{light,dark}.png`、`tv-first-paint-{light,dark}.png`、`tv-settled-{light,dark}.png`。
- 图像复核：浅色首屏为精选 5／7 骨架加图版块、三张继续观看卡骨架、四个题材块与排序块、整屏海报卡骨架；深色 token 可辨；TV 首屏为文案列骨架加四张续播卡；筛选切换保留旧网格、选中「都市」并在计数位置显示「正在更新…」。
- `nsh test --target web` 在本机不可用（浏览器连接被重置），本批使用 `--target macos` 图形宿主截图，未据此宣称 Web 正式入口截图通过。

## 未验收

- 继续观看失败与重试路径、精选区在片库失败或确认空时的隐藏：只有源码逻辑，fixture 未制造对应失败。
- 屏幕阅读器实际播报、TV 遥控遍历不会进入骨架：未用真实辅助技术／物理遥控验证。
- 骨架到真实内容的高度差不只用视觉判断，未做像素级测量。
- 正式 Web／Desktop 宿主与物理 TV、真实慢网与真实上游失败：均未观察，不替代真实验收。
- `pnpm fmt:check` 当前因并行改动的 `packages/app/src/pages/Player.tsx`、`packages/app/src/store.ts` 报格式问题；本批文件自身已格式化。`pnpm test --target web` 的 Rust 阶段有两个目录别名生命周期用例在并行负载下失败，隔离重跑 5／5 通过，属既有偶发并发失败，与本批无关；三端应用回归另按上方结果分别执行。
