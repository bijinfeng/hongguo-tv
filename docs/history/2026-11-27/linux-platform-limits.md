# Linux 平台限制排查记录（2026-11-27 归档）

非当前指令。本文件保存从 `VALIDATION.md` 移出的两处 Linux 平台限制定位过程。当前结论与状态见 [VALIDATION](../../../VALIDATION.md#desktop-native)，规则见 [ENGINEERING §9](../../../ENGINEERING.md#验收宿主矩阵)。

这两项都属于 Linux 桌面宿主的上游缺陷，而 Linux 不在 MVP 验收宿主内（桌面只认 macOS 真机），因此保留事实、不阻塞 MVP。

## NSH 0.7.0 Linux `lifecycle()` 恒报 `background`

**现象**：桌面首页恒为骨架屏，且不显示失败态。

**定位**：`nsh-platform-linux` 用隐藏宿主窗口的 `surface.root.is_mapped()` 计算 `lifecycle()`。桌面窗口模型下宿主从不 map，因此 Linux 应用整个运行期间只报 `background`。本仓 40+ 处以 `lifecycle() === 'active'` 门控读取（含 `packages/app/src/category.ts:25` 的首页目录），条件恒假时 effect 走 `cancel()` 且不设错误，界面停在骨架屏。

**排除项**：探针实测 `lifecycle` 在 X11 与 Wayland 下均为 `background`；移除 `titleBar` 后不变，故与标题栏改动无关。macOS 按整个应用计算，不受影响。

**上游状态**：已修（[#3239](https://github.com/longbridge/nsh/issues/3239)，PR [#3252](https://github.com/longbridge/nsh/pull/3252) `5ffa0bf984`），但**不在 0.7.1 内**——逐条核对 0.7.1 的 23 个提交无此项，`main` 领先 0.7.1 共 138 个提交，11-25 的 nightly 早于修复。Windows 有同类缺陷（[#3287](https://github.com/longbridge/nsh/issues/3287)、[#3300](https://github.com/longbridge/nsh/pull/3300)）。

**结论**：不是本仓缺陷。它只阻塞 Linux 上的实时数据观察。

## Linux 隐藏标题栏时 GTK 窗口按钮浅色不可见

**观察**（2026-11-26，已报上游 [#3381](https://github.com/longbridge/nsh/issues/3381)）：浅色下三个字形为纯白 `#ffffff`、无底色，在 `#f9f9f9` 栏面上对比度 **1.05:1**（纯白栏面为 1.0:1）；深色下 `#b3b4b4` on `#101111` 为 **9.1:1** 且有实心圆底。

**归因**：`chrome.rs::apply_title_bar` 只设 margin 与 decoration layout，不设颜色或 CSS class，按钮前景取 GTK 主题值，应用无法从 TSX 修正。同一截图中应用自身文字为 `#171717` 满强度，排除未聚焦变暗。

**复现**：用 `nsh init --template ts` 独立最小工程实测复现，三个按钮（`− □ ×`）均在。产品截图中「最小化缺失」是账号图标位置重叠造成的误判。

**待判**：`titleBar: { style: "hidden" }` 在 Linux 浅色下的可用性等上游修复再判。
