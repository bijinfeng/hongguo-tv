# Design

## Context

See `proposal.md` — Why. Current desktop shell is `<DesktopShell>` = 176 侧栏 + 一个 `flex-1` 右列，右列里 `Topbar`（86 高）再叠 `Pages`。`apps/desktop/nsh.json` 目前只有一个 `window.defaultSize`，没有 `titleBar`，所以系统标题栏仍在。`apps/web/App.tsx` 复用同一个 `DesktopShell`，因此任何外壳改动会同时作用于 Web。

NSH 0.7 的类型已确认这批能力存在（`apps/desktop/.nsh/types/`）：

- `WindowAttributes.titleBar: { style: "default" | "hidden", height?: number | null, controlsOffset?: Point | null }`
- `TitleBarArea { height, left, right }`，由 `titleBar()` 响应式返回；系统标题栏可见或非桌面端时全为 0
- `TitleBar` 组件：整行可拖拽、双击执行系统标题栏行为、只在与原生控件重叠的左右边缘自动补内距
- `desktop={{ windowDrag }}`：任意视图可作为拖拽区，内部输入框与带按压处理器的视图保持可点击
- `desktop={{ windowControl }}`：把自绘视图当作系统窗口按钮命中（本变更不使用）

`titleBar()` 的 `left` / `right` 是“控件实际占用宽度”，不是平台常量：macOS 红绿灯在左，Windows caption 在右，GTK 跟随 `gtk-decoration-layout` 可左可右。这是让位逻辑必须读它而不是写死平台判断的原因。

## Goals / Non-Goals

**Goals:**

- 一条横贯窗口的标题栏，品牌、页面名、搜索、账号在三种原生控件布局下都不被遮挡。
- 拖拽、双击最大化、右键窗口菜单、输入框可点这些系统行为全部保留，不靠自绘按钮补。
- 全屏与影院态有明确收束规则，且标题栏高度是唯一来源，播放器常量从它推导。
- Web 目标零窗口依赖：同一组件在 Web 下无拖拽、无安全区、不炸。

**Non-Goals:**

- 不实现 frameless（`frame: "none"`）。这会同时丢掉 Linux 的 CSD 圆角、阴影与窗口管理器缩放边，需要自绘 8 条 resize 边，收益只是自绘按钮。用户诉求是自绘标题栏，不是自绘按钮。
- 不做 `controlsOffset` 微调（只在 macOS 红绿灯位置需要偏离居中时用），首版信任 NSH 居中。
- 不改 TV 外壳、不改 `packages/ui` 控件几何。

## Decisions

### 隐藏系统标题栏，保留 frame

`nsh.json` 写 `window.titleBar: { style: "hidden", height: 48 }`，`frame` 保持默认。

- 保留 frame 换来：Linux 仍有 CSD 圆角、阴影、窗口管理器缩放；Windows 仍由 NSH 绘制 Win11 caption 按钮（含 Snap 布局悬停、DPI、失焦变暗、深色跟随）；macOS 仍由 AppKit 绘制红绿灯。
- 备选 `frame: "none"` + 自绘按钮被否：需要自绘 8 条 resize 边、自己处理 Snap 布局、自己适配 DPI 与失焦态，且 Linux 失去窗口管理器缩放。用户确认要“自定义标题栏”，未要求自绘按钮。
- 高度写进 `nsh.json` 而不是仅由组件决定，是为了首帧就无系统标题栏，避免启动闪一下原生标题栏。

### 48 而非 52 或 32

- 微软 Fluent 给“含搜索框或头像”的标题栏 48，给纯标题 32；VS Code 用 35 容器 + 22 控件。
- 本界面在标题栏内同时放搜索与账号，取 48。
- 搜索框按 `control-md` 的 40 高（DESIGN 把 44 标注为移动端触控例外），48 减去 40 留 4+4。
- 早期稿件曾按搜索 44 推出 52；确认采用 40 后回到 48，减少 4 个点的垂直占用。

### 让位读 `titleBar()`，不判断平台

```
left  = titleBar().left  + contentGutter-ish 12
right = titleBar().right + 12
```

- `titleBar()` 在系统标题栏可见、非桌面、全屏无控件时返回 0，公式自然退化，无需分支。
- 用响应式读取而非启动时快照：全屏进出、GTK 布局切换都会改变占用宽度，读响应式值即自动跟随。
- 备选：按 `process.platform` 查表写 90 / 138 / 84。被否：Linux 用户可改按钮位置，写死会重叠或留大空白；且平台常量会随 NSH 版本漂移。

### `TitleBar` 组件 + `Topbar` 降为内容行

- `<TitleBar>`（新）负责：整行拖拽、让位内距、48 高度、影院态收束。
- `<Topbar>`（改）只负责内容：品牌、页面名、搜索、账号，横向排布，不再自带 86 高度与自己的 inset。
- 拆分理由：拖拽与让位是窗口语义，内容排布是页面语义。合成一个组件会让 Web 分支必须带一堆 `if (desktop)`。
- 影院态由 `TitleBar` 判断（复用 `DesktopShell` 已有的 `cinema()`），内容行整体不渲染。

### 品牌从侧栏移到标题栏

- 红绿灯占用左上角，176 宽的侧栏顶部放不下品牌与红绿灯共存：实测会出现红绿灯 20、品牌 17、导航图标 33 三个互不齐的左边缘。
- 品牌移到标题栏左侧（原生控件安全区之后），侧栏成为纯导航。
- 备选：加宽侧栏到 232 让两者同行。被否：内容区变窄 56px，且 15%→20% 的轨道占比过高。

### Web 走同一组件、不同能力

`<TitleBar>` 内读 `isAvailable`（`nsh/desktop`）：

- 桌面：`windowDrag` 开，读 `titleBar()`，`boxShadow` 等窗口级效果交给宿主。
- Web：不设置 `windowDrag`，`titleBar()` 返回 0，内容行仍然渲染。
- 影院态在 Web 下整条隐藏（与现状一致）。

## Risks / Trade-offs

- **[Linux 在不同 GTK 主题下控件条宽度差异]** → 只读 `titleBar().right`/`left`，不假设宽度；真机至少验两种主题与左右两种 `gtk-decoration-layout`。
- **[最小窗口宽度下标题栏内容溢出]** → 标题栏内不放大字号；搜索框按可用宽度收缩，账号与品牌不收缩；在 1180×780 与更窄宽度复核。
- **[双击最大化在 Linux 上依赖窗口管理器]** → 交给 `TitleBar` 的系统行为，不自实现；真机分别在有/无窗口管理器合成下观察。
- **[删除 86 顶栏影响播放器画面高度]** → `player/layout.ts` 的 `CHROME` 常量同步收窄，必须在 1180×780 与 1440×1000 两个尺寸重算，不能只在放大窗口下看。
- **[红绿灯在 48 内的实际垂直居中未验]** → 依赖 NSH 的居中实现，列入真机待验；若偏移，用 `controlsOffset` 修正而不是改标题栏高度。
- **[Web 与桌面共用组件导致桌面逻辑泄漏到浏览器]** → 所有窗口 API 经 `isAvailable` 守卫；Web 侧的 `titleBar()` 恒 0 已写入 spec 场景。

## Migration Plan

1. 先加 `nsh.json` 的 `titleBar`，此时界面会出现“系统标题栏消失 + 原 86 顶栏仍在”的中间态，仅本地开发分支存在。
2. 落 `TitleBar` / `Topbar` / `DesktopShell` / `Sidebar`，同时改 `player/layout.ts` 常量，保证一次提交内 chrome 高度自洽。
3. 同步 `DESIGN.md` 的 Layout 行与 `design/prototype/visual-redesign-real/desktop.html`。
4. 回滚：还原 `nsh.json` 的 `titleBar` 键即回到系统标题栏；组件改动可独立保留（`TitleBar` 在系统标题栏下高度为 0，内容行退化为普通顶栏）。

## Open Questions

- Windows Snap 布局悬停区是否会覆盖标题栏右侧的账号按钮——需真机确认后可能微调右侧让位。
- macOS 在 48 高度内红绿灯的实际视觉居中是否与 NSH 描述一致。
