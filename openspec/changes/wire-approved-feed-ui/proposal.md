# Proposal

## Why

匿名推荐核心已经迁移，但定稿刷剧仍无产品入口。接入共享页面，让用户切换频道、连续发现下一部并进入现有播放与详情流程。

## What Changes

- 桌面复用定稿嵌入播放器、标题与选集栏，TV复用当前剧展示与独立全屏；首页加入刷剧入口。
- 推荐16、真人剧39、漫剧36独立分页、当前剧与恢复状态；关注保留登录门槛，账号能力随E批实现。
- 下一部保序去重，接受tab到cell0，失败保留当前内容并重试同一游标；隐藏/后台/销毁取消与迟到隔离。
- 复用Player的媒体、历史和选集能力，保留独立播放；浏览预取不写历史。

## Capabilities

### New Capabilities

- `recommendation-browsing`: 定稿跨端刷剧、频道会话与播放连续性。

### Modified Capabilities

无；主spec库尚为空。

## Impact

packages/app共享状态、页面、导航和播放器组合，packages/ui频道控件，三端测试入口及宿主验收。无新依赖、Rust DTO、Go或上游修改；完整账号互动、榜单和发行仍属后续批次。
