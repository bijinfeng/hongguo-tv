# 历史：设计规范历史快照 · 2026-11-15

本文原文已移至[历史记录](../history/2026-11-15/design/design-system-history-2026-11-15.md)，其中的阶段状态／下一步不作为当前要求。现行规则见[DESIGN](../../DESIGN.md)，API见[UI包](../../packages/ui/README.md)，覆盖与证据入口见[组件矩阵](component-implementation.md)。本页只保留旧链接导航，不再追加内容。

## 原章节导航

<a id="a-批实施约定--2026-11-13"></a>

- [A 批实施约定 · 2026-11-13](../history/2026-11-15/design/design-system-history-2026-11-15.md#a-批实施约定--2026-11-13)

<a id="设计真实性边界--2026-11-14"></a>

- [设计真实性边界 · 2026-11-14](../history/2026-11-15/design/design-system-history-2026-11-15.md#设计真实性边界--2026-11-14)

<a id="统一图标规范--2026-11-14"></a>

- [统一图标规范 · 2026-11-14](../history/2026-11-15/design/design-system-history-2026-11-15.md#统一图标规范--2026-11-14)

<a id="基础组件实施--单包双端"></a>

- [基础组件实施 · 单包双端](../history/2026-11-15/design/design-system-history-2026-11-15.md#基础组件实施--单包双端)

<a id="迁移前设计快照"></a>

- [迁移前设计快照](../history/2026-11-15/design/design-system-history-2026-11-15.md#迁移前设计快照)

<a id="overview"></a>

- [Overview](../history/2026-11-15/design/design-system-history-2026-11-15.md#overview)

<a id="范围来源与优先级"></a>

- [范围、来源与优先级](../history/2026-11-15/design/design-system-history-2026-11-15.md#范围来源与优先级)

<a id="视觉证据与验证边界"></a>

- [视觉证据与验证边界](../history/2026-11-15/design/design-system-history-2026-11-15.md#视觉证据与验证边界)

<a id="colors"></a>

- [Colors](../history/2026-11-15/design/design-system-history-2026-11-15.md#colors)

<a id="primary"></a>

- [Primary](../history/2026-11-15/design/design-system-history-2026-11-15.md#primary)

<a id="neutral"></a>

- [Neutral](../history/2026-11-15/design/design-system-history-2026-11-15.md#neutral)

<a id="typography"></a>

- [Typography](../history/2026-11-15/design/design-system-history-2026-11-15.md#typography)

<a id="hierarchy"></a>

- [Hierarchy](../history/2026-11-15/design/design-system-history-2026-11-15.md#hierarchy)

<a id="layout"></a>

- [Layout](../history/2026-11-15/design/design-system-history-2026-11-15.md#layout)

<a id="elevation--depth"></a>

- [Elevation & Depth](../history/2026-11-15/design/design-system-history-2026-11-15.md#elevation--depth)

<a id="shapes"></a>

- [Shapes](../history/2026-11-15/design/design-system-history-2026-11-15.md#shapes)

<a id="components"></a>

- [Components](../history/2026-11-15/design/design-system-history-2026-11-15.md#components)

<a id="buttons"></a>

- [Buttons](../history/2026-11-15/design/design-system-history-2026-11-15.md#buttons)

<a id="inputs--fields"></a>

- [Inputs / Fields](../history/2026-11-15/design/design-system-history-2026-11-15.md#inputs--fields)

<a id="cards--containers"></a>

- [Cards / Containers](../history/2026-11-15/design/design-system-history-2026-11-15.md#cards--containers)

<a id="navigation"></a>

- [Navigation](../history/2026-11-15/design/design-system-history-2026-11-15.md#navigation)

<a id="player--controls"></a>

- [Player / Controls](../history/2026-11-15/design/design-system-history-2026-11-15.md#player--controls)

<a id="motion-and-feedback"></a>

- [Motion and feedback](../history/2026-11-15/design/design-system-history-2026-11-15.md#motion-and-feedback)

<a id="dos-and-donts"></a>

- [Do's and Don'ts](../history/2026-11-15/design/design-system-history-2026-11-15.md#dos-and-donts)

<a id="do"></a>

- [Do:](../history/2026-11-15/design/design-system-history-2026-11-15.md#do)

<a id="dont"></a>

- [Don't:](../history/2026-11-15/design/design-system-history-2026-11-15.md#dont)

<a id="b-批播放器映射与动效实施依据"></a>

- [B 批播放器映射与动效（实施依据）](../history/2026-11-15/design/design-system-history-2026-11-15.md#b-批播放器映射与动效实施依据)

<a id="c-批原生启动与关闭状态实施依据"></a>

- [C 批原生启动与关闭状态（实施依据）](../history/2026-11-15/design/design-system-history-2026-11-15.md#c-批原生启动与关闭状态实施依据)

<a id="d1--搜索结果追加动效与交互清单"></a>

- [D1 · 搜索结果追加动效与交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d1--搜索结果追加动效与交互清单)

<a id="macos-select-键盘确认修复"></a>

- [macOS Select 键盘确认修复](../history/2026-11-15/design/design-system-history-2026-11-15.md#macos-select-键盘确认修复)

<a id="d2--最近搜索动效与交互清单"></a>

- [D2 · 最近搜索动效与交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d2--最近搜索动效与交互清单)

<a id="d1--macos-末页焦点移交"></a>

- [D1 · macOS 末页焦点移交](../history/2026-11-15/design/design-system-history-2026-11-15.md#d1--macos-末页焦点移交)

<a id="d3--定稿搜索发现动效与交互清单"></a>

- [D3 · 定稿搜索发现动效与交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d3--定稿搜索发现动效与交互清单)

<a id="d4--输入联想与演员作品动效交互清单"></a>

- [D4 · 输入联想与演员作品动效／交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d4--输入联想与演员作品动效交互清单)

<a id="d5--定稿分类筛选动效与交互清单"></a>

- [D5 · 定稿分类筛选动效与交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d5--定稿分类筛选动效与交互清单)

<a id="d6--定稿刷剧共享-ui-动效与交互清单"></a>

- [D6 · 定稿刷剧共享 UI 动效与交互清单](../history/2026-11-15/design/design-system-history-2026-11-15.md#d6--定稿刷剧共享-ui-动效与交互清单)

<a id="基础组件动效与平台边界--2026-11-14"></a>

- [基础组件动效与平台边界 · 2026-11-14](../history/2026-11-15/design/design-system-history-2026-11-15.md#基础组件动效与平台边界--2026-11-14)
