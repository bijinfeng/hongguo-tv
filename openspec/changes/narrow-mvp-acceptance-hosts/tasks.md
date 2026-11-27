# Tasks

## 1. 规则唯一来源

- [x] 1.1 在 ENGINEERING §9 增加「验收宿主矩阵」：桌面＝macOS 真机、TV＝固定 API34 arm64 AVD、harness 仅开发期视觉；明确模拟器注入的 DPAD／媒体键／Escape／IME 属 MVP 范围，物理电视与 Windows／Linux 真机为平台限制，并说明不得以模拟器结果宣称物理设备通过。
- [x] 1.2 对齐 ENGINEERING §5（arm64 验收环境）、§8（CI 矩阵中 macOS／TV 行才构成 MVP 依据，Windows／Linux 只证明可编译启动）、§10（MVP 发行验收在 macOS 与 TV 模拟器完成）。

## 2. 当前文档

- [x] 2.1 PRODUCT：平台段与「尚待确定」改为 macOS 真机 + 模拟器，说明 Windows／Linux 与物理电视不属 MVP 验收条件。
- [x] 2.2 DESIGN、ARCHITECTURE、TV_DEVELOPMENT：把「模拟器／纯遥控／物理电视不能互相代证」改为「模拟器注入的遥控属验收，物理电视记平台限制」。
- [x] 2.3 VALIDATION：增加 2026-11-27 口径说明与平台限制段；逐条未验结论区分「平台限制」与「MVP 阻塞」；证据索引表保持原样。
- [x] 2.4 功能台账、实施路线、`docs/design/*`、`docs/playback-v5.md`、`docs/client-updates.md`、`packages/ui/README.md`、`crates/native-bridge/README.md` 同步措辞；`docs/history/**` 不改写。

## 3. 规范与活跃变更

- [x] 3.1 本变更 delta 修改 `radar-snapshots`、`typed-search-interaction`、`category-catalog` 三份主规范中把物理电视写成 MVP 边界的条款，保留「事实必须记录」的要求。
- [x] 3.2 改写以待验物理设备为退出条件的活跃任务：`compose-tv-v4-from-shared-components` 8.2、`migrate-account-follow` 5.4、`migrate-account-library-sync` 6.3、`wire-guest-history-management` 4.2 的注记、`migrate-rust-playback` 6.3、`implement-approved-browsing-ui` 6.2，以及相关 design／proposal 中的物理设备句。

## 4. 校验

- [x] 4.1 跑 `openspec validate --all --strict` 与文档相对链接检查；本次不改产品源码，按 ENGINEERING §11 不重跑产品构建。
- [x] 4.2 报告哪些条目从「待验」变为「平台限制」，并明确 MVP 剩余的真实开放失败（真实播放首帧、账号进度上传、观看统计等）不受本次范围收窄影响。

## 完成记录

- 校验：`openspec validate --all --strict` 37/37 通过；`pnpm fmt:check`、`pnpm lint` 通过；改动文档的相对链接与锚点已核对。`pnpm test:tooling` 有一项既有失败（`tooling/test/workspace.test.mjs:36` 期望 `parseArgs(['check','--target','harness'])` 返回不含 `entry` 的对象，实际返回 `{command,target,entry:undefined}`），位于本轮未修改的 `tooling/src/process.mjs`，未纳入本次文档变更。
- 转为平台限制：物理 Android TV 的真实遥控、硬解、4K、overscan 与观看距离；Windows／Linux 真机安装、签名与 N-1 升级。两者事实、原因与证据索引保留在 VALIDATION。
- 仍为 MVP 开放失败：TV 与 macOS 上的真实播放首帧、账号播放进度上传整轮未通过、观看统计仅局部、TV v4 与游客历史 E1 未整体验收。本次只移除宿主环境阻塞，不改变这些结论。
