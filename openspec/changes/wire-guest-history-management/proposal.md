# Proposal

## Why

Rust 已有真实游客历史的删除／清空契约，生产“继续观看”页面仍无法管理这些记录。E1 将已有持久化能力接成可恢复的管理闭环，并解决删除与进度写入、迟到读取、失败重试之间的顺序问题。

## What Changes

- 在共享历史页面增加管理／完成、单条移除、逐项选择、全选／部分选中／全不选、删除所选和清空确认；普通浏览继续使用现有详情与续播流程。
- 复用既有 `HistoryChange.remove/clear`。所选删除按确认时的稳定 ID 顺序逐条提交，遇到失败即停止，保留已完成结果和未完成选择，显式重试剩余项；不伪造原子批量接口。
- 将 library 读取发布、progress、删除／清空、失败 checkpoint 重试及关闭／更新排空置于同一 app 所有者下；迟到 GET 不覆盖提交结果，旧失败进度不复活已删除记录，之后真正开始的新观看仍可建记录。
- 复用公共 Checkbox、ConfirmDialog、Button 与现有虚拟历史列表，补安全默认焦点、取消／返回、删除后的焦点与阅读位置交接，以及三端状态和真实存储验收。

这是完整首期 MVP 的 E1 切片。账号登录／隔离／同步／显式合并、收藏、追更、预约、独立观看统计、C3.2 与 F/G 继续按原范围推进；本切片不模拟这些能力，不恢复用户排除的社交功能。

## Capabilities

### New Capabilities

- `guest-history-management`: 游客历史的可确认管理、顺序删除部分成功、与进度及读取一致的 app 状态和精确焦点交接。

### Modified Capabilities

无。当前 `openspec list --specs --json` 的主规格为空；已完成的 `migrate-guest-history` 与 `implement-approved-browsing-ui/continue-watching` 变更保留既有存储及续播要求，本变更不重写其历史内容。

## Impact

主要涉及 `packages/app/src/pages/History.tsx`、`store.ts` 及必要的小型共享 library 状态模块和对应测试／显式宿主夹具；`packages/ui` 只在现有公共控件确需补足时调整。HTTP/native 与 Rust SQLite `Library/HistoryChange` 已具备基础能力，预期不改 DTO、数据库版本或新增依赖；若实际需要改 Rust DTO，必须另按现有 codegen 流程生成并检查契约。更新功能台账、路线、VALIDATION 与可重复验收说明；不读取旧客户端数据，不把本机删除称为云端删除，不推送、归档或发行。
