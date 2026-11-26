# Proposal

## Why

TV v4已形成18页的候选设计及字号／安全区规则，但生产仍使用旧TV页头、横向片库和较大的控件。需要先建立可复用的组件与组合契约，再分批还原页面，避免逐页复制样式、破坏现有业务或将浏览器样例带进正式客户端。

本变更已获准实施；技术方案、差量规范与任务是本轮实现的约束。设计依据为[TV设计说明](../../../docs/design/tv-redesign.md)，实际能力仍以PRODUCT、台账与主规范为准。

## What Changes

- 按“基础组件 → 业务组件 → 页面”推进：基础控件、内容展示、主题和动效继续归`packages/ui`；业务组合、导航投影、请求和页面状态归`packages/app`；`apps/tv`保持薄入口。
- 以已有Button、UiText、PosterCard、EpisodeRange、Dialog、CinemaControls等为起点，补齐真实缺口及有限变体，不新建整套TvButton／TvPosterCard或第二份业务状态机。
- 将v4的紧凑字级、控件、完整海报、安全边距、大字减列和影院外观映射到TV主题；扩展主题生成器的TV颜色／圆角覆盖能力，保留桌面／Web默认输出。
- TV以宿主points和现有NSH字体缩放机制布局；先验证真实宿主度量，复用原生模态、List和焦点，不把浏览器transform或AndroidAutoSize直接移入NSH。
- 将四个主入口、搜索工作区、我的片库、详情／播放及设置组织成可组合的页面；保留演员、系列／季、更新提醒、榜单雷达、诊断及已有真实功能的可达入口。
- 以同一生产组件组成开发验收页和产品页面，按批次验证状态、遥控、还原度及跨端回归；原型样例不能作为真实账号、目录或播放数据。

## Capabilities

### New Capabilities

- `tv-adaptive-presentation`：TV逻辑尺度、独立文字倍率、统一组件组合、四入口导航、原生浮层与焦点恢复，以及分层还原验收。

### Modified Capabilities

- `search-discovery-surface`：将旧TV横向shelf约束调整为遥控输入工作区与随字号减列的内容网格；保留发现请求归属、真实数据、失败恢复和精确返回规则。
- `ranking-browsing`：将旧TV两列榜单约束调整为侧边选择与自适应网格；保留真实选项／分页／类型身份及缺少rank时不得用序号补造排名的规则。

## Impact

未来实现涉及`DESIGN.md`、`tooling/src/design-tokens.mjs`及测试、`packages/ui`、`packages/app`、相关开发预览和验收入口。只有实际宿主度量检查证明必要时，才另列Android宿主适配修改；不预先改density或原生媒体surface。

预期无新增运行依赖、Rust DTO、数据库或网络协议变更，不实施账号／持久化迁移，不覆盖其他活跃变更。旧`implement-approved-browsing-ui`的未验收项继续保留；其TV外观由本变更接续，协议与实际验收不因新设计而自动完成。正在推进的诊断、账号、播放等变更以届时工作区真实源码整合。

本轮按已批准设计实施生产组件与页面，不推送；完成状态以任务对应的实现及验收证据为准。
