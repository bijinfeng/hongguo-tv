# 播放器控件视觉收口

日期：2026-11-16。变更：`migrate-rust-playback` 5.1/5.2 的最小视觉修复。

## 实施结果

- TV 影院播放按钮按 TV 密度使用 96 单位，桌面继续使用 64，保持同一语义和控件实现。
- 选集栏增加不可压缩和视口约束，窄窗口或 TV 面板不会被 flex 布局压扁。
- 没有改动 Video 生命周期、Rust 播放协议、真实数据来源或历史写入；评论、弹幕等不在范围内。

## 验证

- `pnpm verify` 通过：Rust nextest 405/405（1 skipped），Web／Desktop／TV 应用回归 240/240，三端 check、build、codegen、格式与发布基础检查通过。
- `node tooling/src/player-controls-host.mjs web`：2/2；`android`：2/2，使用 API 34 模拟器。
- `node tooling/src/player-media-host.mjs web` 与 `android` 通过，覆盖受控媒体宿主的暂停、倍速、静音、seek、选集、重播和释放边界。
- 已复核 Web 1180×780 浅／深色以及 Android TV API 34 浅／深色的影院控件和选集面板截图；这些截图只用于视觉检查，不替代真实上游媒体验收。

## 限制

macOS media host 仍有既有时序失败：点击“开始观看”后，在播放进度控件挂载前查询导致用例失败。该问题不由本批 diff 引入，也不能据此宣称 macOS 真实媒体播放通过。Android 模拟器控件宿主不等于物理 TV、硬件解码、长播或正式安装包验收。

本批只提交播放器源码和本记录，不推送；其他并行 dirty 改动保持不变。
