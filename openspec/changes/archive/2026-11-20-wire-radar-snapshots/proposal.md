# Proposal

## Why

官方动态榜单已经接通，定稿中的第三方榜单快照／增长仍没有真实数据链路。按固定上游的 radar.go 迁移这条独立只读能力，让观众查看带真实日期和缓存状态的榜单后进入剧集详情。

## What Changes

- Rust 独立雷达服务读取固定 hongguo-radar 的四类榜单及增长快照，限制网络、负载和解析，分别缓存分支并保留真实获取时间。
- HTTP 与原生会话共享同一 DTO 和取消边界，不新增用户可控来源 URL、账号写入或播放副作用。
- 排行榜保留红果榜，新增定稿的榜单雷达，复用同一 UI 包，保留来源日期、缺失值、负增量、独立失败和缓存反馈。
- 按精确剧集 ID 读取详情后导航；不伪造封面、选集、日增折算、评分或社交字段。

## Capabilities

### New Capabilities

- `radar-snapshots`: Bounded independent third-party ranking/growth snapshots, durable fallback and truthful shared browsing.

### Modified Capabilities

None.

## Impact

crates/core、http-api、native-bridge、web-api；生成 OpenAPI／TypeScript 契约；packages/app 榜单状态与页面、packages/ui 表格行、原型雷达文案和三端验收入口。无新依赖、Go 业务或旧客户端缓存读取。交付源码和验收输入只在主项目工作区，已有基础组件并行改动单独保留。
