# Proposal

## Why

当前 Rust 已接入账号会话与独立历史库，但尚无云历史／进度同步、收藏和显式游客历史导入。下一批需要把这些能力接入正式入口，同时保留已有数据库、写入回执与账号隔离。

## What Changes

- 增加先拉取再上传的账号同步、持久 outbox、精确 ACK、时间冲突处理和本机隐藏；同步失败保留记录与待上传操作。
- 支持游客本机收藏和账号收藏；单项取消账号收藏同步远端，清空收藏与历史删除只在本机隐藏。
- 显式合并登录前历史，保留原观看时间、游客库和账号收藏；导入记录、outbox 与去重水位同事务提交。
- 原地升级游客 v2／账号 v3 库，保留历史、搜索、owner 及既有数据；不重建、不接管其他 owner 的库。
- Rust 单一 DTO 覆盖 HTTP/native；共享账号页、详情收藏和片库入口展示实际同步、失败与恢复状态。
- 真实云写验收先取得用户对账号及操作的明确授权；合成回归不算真实功能验收。

## Capabilities

### New Capabilities

- `account-library-sync`: 账号云历史／进度、事务 outbox、冲突、隐藏、取消及 epoch 隔离。
- `library-favorites`: 游客／账号收藏、独立持久化与正式详情／片库交互。
- `guest-history-import`: 显式游客历史导入、冲突、去重水位与部分导入恢复。

### Modified Capabilities

无已归档主规范。依赖活跃 `migrate-account-session-isolation` 的实际接口，不改写其任务或验收结论。

## Impact

影响 `crates/core/src/account`、`library`、HTTP/native 适配、OpenAPI／generated.ts、core-client 和 `packages/app` 正式入口；控件与动效仍归 `packages/ui`。固定参考为 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`，具体 wire 见 design。

追更、预约、更新提醒、统计、社交、旧客户端数据导入及公开 Web 多用户部署不在本批；收藏不能代替追更或预约。只沿用现有 Rust 依赖，不引入 Go 或新 UI 工具链。
