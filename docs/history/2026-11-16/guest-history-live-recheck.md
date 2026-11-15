# 游客历史真实浏览器复查 · 2026-11-16

本次只复查游客历史管理，使用正式 `apps/web/App.tsx`、Chromium、真实上游和独立 SQLite；没有注入响应、直接写历史或使用账号凭证。合成数据只用于 headless 边界回归。

## 结果

- `artifacts/live-history/2026-11-15T22-04-40-950Z/`：真实搜索、两部普通短剧播放、进度写入、取消、单删、重播、第二部播放和 API 重启恢复均走到记录阶段；浏览器管理阶段在全选控件之后超时，不能计为整轮通过。
- `artifacts/live-history/2026-11-15T22-20-37-975Z/`：上游返回了 `content_type=1` 的可观看条目。当前播放协议只支持普通短剧 `1004`，因此在一次显式重试后仍拒绝播放；这暴露了验收候选筛选过宽，不能归因于播放器回归。
- `artifacts/live-history/2026-11-15T22-23-20-192Z/`：候选筛选收紧到 `1004` 后，真实浅色流程完成首播、取消、单删、重播、第二部播放和重启恢复；浏览器 Checkbox 的 selector／键盘激活在管理阶段仍由 NSH web driver 超时，整轮保持失败。
- `artifacts/live-history/2026-11-15T22-29-30-683Z/`：预检搜索收到真实上游 HTTP 504，未使用替代数据，未重跑取绿灯。

本批只调整真实验收 driver：候选必须符合当前播放协议的 `1004`，浏览器 Checkbox 管理使用稳定点击目标；生产 History、Checkbox 和持久化代码没有改动。浏览器 driver 的 Space 键未能作用到 NSH 原生 Checkbox，保留为宿主限制；原生桌面／TV 的键盘流程仍需独立正式入口验收。

## 回归与审查

- tooling 回归：142/142 通过。
- History 共享 headless 回归：25/25 通过。
- `pnpm fmt:check` 与 `node --check tooling/src/live-history-host.mjs` 通过。
- 真实截图复核确认普通历史页、管理页、空态和播放页使用同一套生产布局；本次没有新增视觉样式或数据展示。

本次仍未勾选 `wire-guest-history-management` 的 4.2：浏览器全流程、Desktop native、当前 TV 包、完整焦点／后台和物理 TV 仍未覆盖；真实上游失败也没有被合成回归替代。工程门禁补验已完成并记录为 4.3：冻结源码上的 `pnpm verify` 通过，三端 check/build、Rust 405/405、App Web/Desktop/TV 232/239/240、codegen:check、格式、包边界和 release check 均通过。
