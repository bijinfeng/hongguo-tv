# Proposal

## Why

Rust 官网搜索已提供 `has_more`、`next_offset` 和 `source=web`，生产页面却只显示首批并提示缩小关键词。D1 接通既有分页，让用户继续查找，同时保留已有列表、返回位置与真实失败。

## What Changes

- 共享搜索状态按官网已消费页数请求下一批，固定来源，按 series_id 去重且保留顺序。
- 在既有结果页底部复用共享按钮与 Notice，提供加载下一批、加载中、失败重试和终页状态，不造新页面或假筛选。
- 查询／重搜／卸载取消所属追加请求，拒绝迟到结果和不推进的游标，保留可用结果与焦点／滚动锚点。
- 通过三端行为测试、实际 Web 与 TV 宿主截图及独立UI／功能审查；Mac 锁屏与其他C3缺口继续单列。

## Capabilities

### New Capabilities

- `search-continuation`: 已有匿名官网搜索结果的有界追加、失败恢复与稳定浏览位置。

### Modified Capabilities

无。主 specs 目录当前无已归档 capability；本变更沿用未归档目录契约，不修改 Rust DTO。

## Impact

涉及 packages/app 搜索状态／页面及对应测试、既有宿主验收夹具和文档。Rust catalog、HTTP／native transport 已支持官网分页；无新依赖、Go、UI框架或协议。推荐、联想热搜／搜索记录、筛选、榜单、账号与系列仍按D/E后续切片实施，不因本切片缩小完整MVP范围。
