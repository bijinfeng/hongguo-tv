# Proposal

## Why

账号用户需要在应用内知道追更剧集有了新内容，或预约的剧集已经上线。当前 Rust 核心、HTTP/native 契约和共享页面都没有这项能力，继续依赖假数据会把未读数和“更新成功”误呈现给用户。

## What Changes

- 增加账号作用域的本机更新提醒快照，来源只包括真实追更与预约数据。
- 首次前台检查只建立基线；后续完整快照比较后生成追更更新和预约上线提醒，最多保留 200 条并按事件 ID 去重。
- 提供查询刷新、单条已读和全部已读的 Rust/HTTP/native/core-client 契约，保存 `stale`、检查时间和真实未读数。
- 账号切换、退出和失效会隔离或清理当前内存状态；通知记录不进入游客历史、播放历史或云同步。
- 在共享账号活动页面增加“更新提醒”页签和列表；桌面与 TV 复用语义与状态，仅调整密度、焦点和输入适配。
- 失败时保留旧列表并明确显示过期/重试状态；不做系统推送、后台定时任务、播放期间弹窗、评论弹幕、清空通知或虚构可播放集身份。

## Capabilities

### New Capabilities

- `account-update-notifications`: 前台根据账号真实追更／预约快照生成、持久化、查询和已读管理本机更新提醒。

### Modified Capabilities

- None.

## Impact

- `crates/core`：账号作用域通知 DTO、来源快照比较、独立 SQLite 持久化、owner/generation fencing。
- `crates/http-api`、`crates/native-bridge`、`packages/contracts`：GET/POST 通知接口、错误映射和生成契约。
- `packages/core-client`、`packages/app`、`packages/ui`：共享通知查询/已读状态、账号活动入口和桌面/TV 布局适配。
- 不新增依赖，不修改 `upstream/hongguo/`，保留未完成的真实账号与真实数据验收台账。
