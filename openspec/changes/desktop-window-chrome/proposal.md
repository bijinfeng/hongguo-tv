# Proposal

## Why

桌面端当前仍使用系统默认标题栏，窗口顶部出现两层 chrome：系统标题栏（约 28–32）叠加应用自己的 86 顶栏。用户看到窗口标题“红果”和应用的品牌／页面名重复，垂直空间被吃掉，且系统标题栏与深色页面不成一体。macOS、Windows、Linux 三个平台的系统标题栏外观互不相同，无法与页面背景连续。

NSH 0.7 已提供 `window.titleBar: { style: "hidden", height }` 与 `TitleBar` 组件：隐藏系统标题栏后，macOS 仍保留原生红绿灯并垂直居中在给定高度内，Windows 由 NSH 按 Win11 风格绘制 caption 按钮，Linux 由 GTK 绘制 `WindowControls` 并跟随 `gtk-decoration-layout`。这正是本变更的前提能力。

## What Changes

- **BREAKING**：桌面窗口从系统标题栏改为隐藏标题栏 + 应用自绘标题栏。窗口外观、可用垂直空间与拖拽区域随之改变。
- `apps/desktop/nsh.json` 增加 `window.titleBar: { style: "hidden", height: 48 }`，使首帧即无系统标题栏，避免启动时闪一下原生标题栏。
- 新增共享 `TitleBar` 外壳（`packages/app/src/shell/TitleBar.tsx`），承载品牌、页面名、搜索与账号动作；原 `Topbar.tsx` 降为标题栏内的内容行，86 高度收回 48。
- 侧栏去掉顶部品牌，导航从标题栏下沿开始；品牌移入标题栏左侧，位于系统控件右侧安全区内。
- 左右安全区取自 `titleBar().left` / `titleBar().right` 再追加共享内距，随平台、全屏与 Linux 用户按钮布局变化。
- 影院／安静观看态：标题栏退化为一条 48 高的透明拖拽带，品牌、页面名、搜索与账号隐藏，系统按钮仍浮于其上。
- 播放器画面高度常量按新的 chrome 高度同步收窄，并在 1180×780、1440×1000 复核。
- Web 目标使用同一套标题栏内容布局，但不启用窗口拖拽、不显示系统按钮占位；浏览器自带标题栏。

## Capabilities

### New Capabilities

- `desktop-window-chrome`: 桌面窗口外壳的自定义标题栏行为，包括三端原生窗口控件避让、拖拽与双击、全屏与影院态收束、以及 Web 无窗口时的等价布局。

### Modified Capabilities

无。

## Impact

涉及 `apps/desktop/nsh.json`、`packages/app/src/shell/`（新增 `TitleBar.tsx`，改写 `Topbar.tsx`、`DesktopShell.tsx`、`Sidebar.tsx`）、`packages/app/src/pages/player/layout.ts`、`DESIGN.md` 的 Layout 行。原文还列了 `design/prototype/visual-redesign-real/desktop.html`；该浏览器稿已于 2026-11-26 删除，理由见 DESIGN.md「没有第二份渲染」。

不触碰 `packages/ui` 公共组件契约（除既有 `Icon` 图标名），不改描边、颜色、控件尺寸档位，不修改 TV shell（Android 无桌面窗口），不修改 `upstream/hongguo/`。三端真机观察是验收门槛：macOS 与 Windows 未在真机跑过前，状态保持“已实现待真实验收”。
