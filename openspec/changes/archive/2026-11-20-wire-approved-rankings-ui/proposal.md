# Proposal

## Why

匿名排行榜核心已提供动态选项与演员／剧集联合条目，但共享应用尚无消费者。按定稿接入真实榜单，让用户在桌面和 TV 选择榜单、续页、进入详情或演员作品，并精确返回。

## What Changes

- 新增共享排行榜页面与页面生命周期内的只读状态，动态展示 rank/sub/panel，不固定演示榜名或推算名次。
- 桌面纵向条目、TV 两列条目；剧集进入详情，演员进入作品，来源保存 kind:id、滚动锚点与焦点。
- 精确续页、同路径失败重试、去重、隐藏／后台／销毁取消及迟到结果隔离，新增确定性状态测试。
- 取消原型纯演示的五轴雷达评分，不将其视为五维协议缺失或 MVP 待办，也不以 heat 合成评分。固定上游 radar.go 已有的第三方榜单快照／增长列表仍按源码范围留待独立迁移；本切片只接真实匿名榜单，不为原型扩造能力。

## Capabilities

### New Capabilities

- `ranking-browsing`: Anonymous dynamic ranking browsing, exact continuation and identity-preserving navigation across desktop and TV.

### Modified Capabilities

None.

## Impact

新增 packages/app/src/rankings.ts、pages/Rankings.tsx、test/rankings.tsx。集成者接线导航、共享行控件与宿主测试；无 Rust DTO、依赖、历史写入或账号行为变化。
