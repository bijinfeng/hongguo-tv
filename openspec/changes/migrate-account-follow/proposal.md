# Proposal

## Why

正式入口已有账号会话和收藏，但没有账号追更列表与详情追更操作。收藏不能代替追更；本批按固定上游协议接通这一条完整流程，为后续预约和本机更新提醒留下清晰边界。

## What Changes

- Rust 读取登录账号的完整追更列表，校验分页、内容身份和载荷边界；失败不把部分结果当完整成员表。
- 支持精确 series 的显式添加／取消；绑定 owner／epoch，处理取消、切号、重复提交及响应丢失后的只读对账。
- HTTP／native 使用同一 Rust 用例与生成 DTO；复用现有账号、固定云传输和取消基础设施。
- 共享账号入口、追更页、详情按钮使用真实账号状态和同一基础组件；保留列表位置、返回来源与键鼠／遥控焦点。
- 正式入口真实数据优先验收；真实云写须具备对账号、剧目与操作的明确授权，合成数据仅验证边界回归。

## Capabilities

### New Capabilities

- `account-follow`: 账号追更完整读取、显式远端变更、scope 隔离、失响应对账及正式入口交互。

### Modified Capabilities

无已归档主规范需要修改；依赖活跃账号会话与片库变更的已实现接口，不改写其任务和验收结果。

## Impact

影响 `crates/core/src/account`、目录摘要的可选真实完结字段、HTTP／native 适配、OpenAPI／generated.ts、core-client 与 `packages/app`。基础控件、图标、主题、动效仍归 `packages/ui`。不新增 crate、Go 依赖、UI 工具链或泛化任务框架。

依据 `upstream.lock.json` 的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`，重点为 `follow.go`、`follow_test.go`、`main.go::follow` 和对应 UI；本地关键文件 blob 已匹配锁文件。其他版本的产品盘点不是本批 wire 来源。

预约、提醒、系统通知、后台轮询、统计、关注内容频道、批量取消、游客追更、离线写队列与旧客户端数据导入不在本批。不复用收藏 outbox，不把未确认远端操作称为成功。
