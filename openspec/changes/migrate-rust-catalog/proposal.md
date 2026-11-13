# Proposal

## Why

新 Rust 核心目前只提供状态与 Range 规则，搜索和详情仍返回 501。设计与 TV 宿主验证可以并行推进，但缺少稳定契约和可重复样本会阻碍后续三端接入，因此先迁移不依赖账号的目录查询。

## What Changes

- 实现官网匿名搜索及分页、详情页面解析与选集归一化，保留字符串 ID、空结果和锁定集语义。
- 建立 Rust DTO → OpenAPI → TypeScript 的目录契约，替换同名手写 DTO，保持既有页面所需字段与路由。
- 新增标记固定参考来源的合成 fixtures，以及离线解析、HTTP 边界、超时和取消测试。
- 为目录请求提供有限响应大小、超时、有限重试、无重定向和明确错误码；不使用账号 Cookie 或 App 设备身份。
- 搜索能力仅声明官网匿名源；App 注册/搜索、创作者合集、评论/演员/推荐扩展、媒体播放、账号和存储迁移不在本切片内。界面与 TV T0 的宿主实现不变。

## Capabilities

### New Capabilities

- `catalog-query`: 匿名官网搜索、详情与选集、生成契约、传输约束和离线兼容样本。

### Modified Capabilities

无现有正式规格。

## Impact

涉及 `crates/core`、`crates/http-api`、Rust 依赖与锁文件、`contracts`、`packages/contracts`、必要的 core-client 兼容及验证文档。新增固定版本 Rust HTTP/TLS 依赖，默认回归离线运行；不增加 Go 依赖、不修改共享页面或 Android 宿主。HTTP Host/Origin 和 32 KiB 请求体限制继续生效。真实官网可用性独立记录，不由 fixtures 推定。
