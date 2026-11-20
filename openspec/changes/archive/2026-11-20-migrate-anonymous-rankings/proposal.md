# Proposal

## Why

D6刷剧已接定稿，首期排行榜仍完全缺失。先迁移固定上游的匿名官方榜单读取，给后续定稿排行列表提供严格、跨宿主一致的真实数据契约。

## What Changes

- 迁移RankList的固定GET、首屏tab26／续页tab18、三级动态selector与精确offset／session／shown。
- 用互斥类型区分剧目和演员条目，演员ID不冒充可播放series_id，保留服务端顺序和有界摘要。
- HTTP/native共享严格输入、脱敏失败、有界请求与取消；生成OpenAPI／TS契约，增加离线与显式匿名只读探针。
- 本切片不含可见页面、雷达数据、新剧日历、系列关系、账号或写操作；它们保留在完整MVP路线，后续单独实施和验收。

## Capabilities

### New Capabilities

- `anonymous-rankings`: 官方匿名榜单的动态选择、类型安全摘要及精确分页。

### Modified Capabilities

无；主spec库尚为空。

## Impact

core catalog及现有anonymous signed transport、HTTP/native路由、生成契约和合成fixtures。无新依赖、Go、数据库、账号、UI或upstream改动。并行updater源码留在主工作区，不纳入本切片。
