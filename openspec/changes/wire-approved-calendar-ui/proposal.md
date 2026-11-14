# Proposal

## Why

新剧和日历匿名核心已就绪，定稿的新剧日期条与上映内容仍未接真实数据。完成共享页面，让键鼠与TV用户按真实日期找剧，并保留分页位置与返回来源。

## What Changes

- 新剧与上新日历切换，日历只提供服务端真实日期，新剧独立人群筛选；不伪造日历类型筛选。
- 已上线剧可查看详情，未上线公告只展示公开安排及诚实的预约门槛。
- 双游标、首屏省略预约游标、分页保序去重、失败保留同路径重试、隐藏/后台取消与迟到隔离。
- 复用共享控件、TV尺寸、虚拟列表、来源和焦点守卫；接线及全量宿主门禁由集成批次完成。

## Capabilities

### New Capabilities

- `release-calendar-browsing`: 真实新剧、日期日历和可恢复浏览。

### Modified Capabilities

无，主spec库为空。

## Impact

共享 app 增加 calendar controller、页面、返回接线及测试；ui 增加 DateChoice，并兑现 PosterCard 的有限视口高度约束。TV 宿主补充非模态内容入口交接和命名正文区域遥控阅读，验收工具覆盖真实 Web HTTP、macOS 与独立 TV 输入适配宿主。不改 Rust、UI 主题、数据库、依赖或固定上游。账号预约写入待 E，不伪造成功。
