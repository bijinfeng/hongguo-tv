# Proposal

## Why

账号接口仍返回 501，历史层仅接受游客 owner。必须将真实登录、会话持久化与账号库切换一起接通，防止登录后无法保存进度或跨账号写入。

## What Changes

- Rust 迁移官网扫码、手机号／短信与上行短信验证，有限状态及本地随机尝试 ID 对外，凭据仅留核心。
- 私有、原子持久化当前会话，恢复、退出和游客／账号独立历史；切换前排空检查点并使旧写会话失效。
- HTTP／native 共用 DTO 与核心服务，正式共享账号页接入，保留桌面键盘和 TV 遥控差异。
- 真实授权流程作为验收依据；向量、loopback 与合成 UI 仅作边界回归。

## Capabilities

### New Capabilities

- `account-session`: 登录尝试、有效凭据与 UID 校验、恢复和可靠退出。
- `library-owner-isolation`: 游客及账号独立存储、切换和旧请求隔离。

### Modified Capabilities

无现有主规范；不覆盖游客历史活跃变更中的管理要求。

## Impact

`crates/core`、HTTP/native 装配、生成契约、core-client 写会话及 `packages/app` 账号状态／页面。固定参考源码只读，不引入 Go 或新 UI 工具链。云同步、收藏／追更／预约继续后续完整 MVP 批次；公开 Web 部署已由 `remove-web-product` 移出范围，但 owner／epoch 隔离仍是 HTTP 与 native 共用同一 core 实例的必要条件，物理 TV 与发行仍单独验收。
