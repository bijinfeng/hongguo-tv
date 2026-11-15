# 观看统计批次

日期：2026-11-16。变更：`migrate-watch-statistics`。本批完成观看统计的 Rust 核心、HTTP/native 契约、core-client、真实播放器采集和 History 共享页面；完整 MVP 仍未完成。

## 实施结果

- 统计保存在独立版本化 `watch-statistics.sqlite3`，按 owner 聚合每日总量、内容类型和题材，保留 366 天；不写入标题、剧集、播放位置、URL 或凭证，也不修改历史库。
- 批次使用 8–96 位幂等 ID、reset revision 和 owner epoch 围栏，单批及单日均有上限；重复批次返回同一权威快照，失败批次留在本地队列等待显式恢复。
- Player 只提交前台、已 ready、未暂停、未缓冲、未拖动且媒体位置真实前进的时间。暂停、缓冲、seek、报错、后台、切集、结束和销毁都会切断统计锚点；采样使用单调时钟，并按本地日跨午夜切段。
- Desktop 和 TV 共用同一统计状态、采集器、History 面板和语义组件，只沿用平台密度与焦点适配。页面提供今天／近 7 天／近 31 天、类型／题材、加载／空／错误／重试和重置确认。

## 功能审查

源码审查覆盖 core 存储事务、保留和坏库拒绝、batch hash 幂等、reset fencing、AccountService owner scope、HTTP/native method parity、core-client 响应校验和 Player 生命周期。未发现会把进度回调、暂停时长、seek 跳跃或旧账号数据计入统计的确定问题。

## UI 审查

观看统计入口位于共享 History 页面，使用已有 `Surface`、`Tabs`、`Notice`、`Badge`、`Button` 和 `ConfirmDialog`。桌面与 TV 共享状态和语义，TV 仅使用既有密度单位；重置后恢复入口焦点，错误和空态保留原位，不使用图表依赖或合成统计结果。

## 验证

- `pnpm codegen:check`、`pnpm fmt:check`、`cargo fmt --all -- --check` 通过。
- `pnpm check --target web`、`desktop`、`tv` 通过并完成对应 Rust crate build。
- `cargo test -p hongguo-core watch_statistics`、HTTP/native 定向回归通过；`cargo test -p hongguo-native-bridge --lib` 48/48 通过。
- `pnpm test --target web` 的 tooling/app 142/142 通过，Rust 并行阶段出现 1 个原生目录别名生命周期用例偶发失败（352/353），随后该 native crate 全量隔离重跑 48/48 通过；该一次性并发失败保留为诊断，不据此宣称完整 `pnpm verify` 已通过。
- 统计采集器回归已注册到 Web／Desktop／TV 三端入口；三端各 3 项 collector 回归通过。共享 History 的重置／收起焦点回归三端各 1 项通过，覆盖取消后回到“重置统计”与收起后回到“观看统计”触发按钮；macOS 可见宿主浅深色截图复核通过，截图只使用受控统计响应，不作为真实累计验收。
- 冻结完整 `pnpm verify` 通过：Rust nextest 405/405（1 skipped），Web／Desktop／TV 检查、构建与应用回归均通过；最终三端 app 回归分别 240/240（Web）、240/240（Desktop）、240/240（TV），`codegen:check`、`fmt:check` 和 tooling 也通过。
- 真实 Web 入口补做了 live Chromium 浅色流程：使用上游返回的普通短剧（`content_type` 为空）实际播放约 30 秒，观察到 `POST /api/v1/watch-statistics` 约 30.6 秒并在观看统计面板显示；随后重播阶段上游 `/api/v1/play/info` 连续失败，整轮 `passed=false`，因此不关闭真实播放、重启恢复和重置验收项。证据目录：`artifacts/live-history/2026-11-15T20-29-36-740Z`。本轮未执行 Desktop／TV，也未宣称跨主题、重启或重置通过。

## 未验收

合成回归和 headless 检查不替代真实产品验收。真实 Web 本轮仅完成一次浅色首播累计与面板显示，因后续上游媒体失败整轮未通过；尚未完成正式 Web 的稳定重播、跨主题、关闭重开恢复、重置只清统计不删历史、账号切换隔离，以及 Desktop／TV 真实播放、跨午夜切段和物理 Android TV／长播／视觉动效。凭证持久化沿用既有 `account.sqlite3` 正式实现；本批没有改变登录凭证存储或退出语义。

本批不推送；提交时只纳入观看统计相关文件，保留原型、设计历史和其他并行 dirty 改动。
