# Proposal

## Why

账号已有追更，但预约列表、日历预约与待上线季预约仍缺失。预约是独立账号记录，不能用追更或收藏替代；本批接通实际协议与正式入口。

## What Changes

- Rust 完整读取当前账号的待上线及已上线预约，保留预约身份与可播 series 的区别。
- 绑定 owner／epoch 添加及取消预约；ACK 后完整读取确认，不把受理或失响应称为成功，不自动重发写操作。
- HTTP／native 共用核心及生成 DTO，三端共享控制器、预约列表、日历和季入口；沿用基础组件和来源恢复。
- 正式入口使用本机保留的登录、真实数据验收；真实云写须取得适用授权。

## Capabilities

### New Capabilities

- `account-reservations`: 账号预约完整读取、精确预约身份变更、失败对账、共享预约入口与来源恢复。

### Modified Capabilities

无。

## Impact

涉及 account 核心、HTTP／native、contracts／core-client 和共享 app。不新增依赖、crate、UI 工具链或离线写队列；不修改 upstream。固定 wire 依据 `upstream.lock.json` 的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`，重点为 `lists.go`、`lists_test.go`、`series_seasons.go` 和相关 UI。更新提醒、统计及其他剩余 MVP 功能仍在后续批次，不因此移出产品范围。
