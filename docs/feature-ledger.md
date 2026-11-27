# 首期功能台账

当前实现台账（2026-11-25）。验收要求见 [ENGINEERING §9](./ENGINEERING.md#9-安全测试与可观测性)，实际通过范围见 [VALIDATION](./VALIDATION.md)。合成回归不计真实功能验收。

行为基线：`upstream.lock.json` 固定 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。上游指针均相对于 `upstream/hongguo/core/cmd/hongguotv/`，只读参考，不执行 Go。批次见[实施路线](./implementation-roadmap.md)，设计见[页面地图](./design/ui-map.md)。状态只代表新工作区，不继承原型或旧链路的成功。

状态取值：“待核对、待实现、已实现待真实验收、已验收、平台不适用”。任务勾选数不代表功能完成率。

MVP 验收宿主按 [ENGINEERING §9](./ENGINEERING.md#验收宿主矩阵)：桌面只认 macOS 真机，TV 只认固定 API34 AVD 模拟器。物理电视（真实遥控、硬解、4K、overscan、观看距离）与 Windows／Linux 真机安装升级是平台限制，保留在证据里但不阻塞 MVP；各缺口小节仍照实写出这些未验事实。

## 状态总览

| 功能／页面                     | 批次／端             | 状态                 | 证据                                                                                                                                                                               |
| ------------------------------ | -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TV v4组件化重设计              | TV／共享组件         | 已实现待完整真实验收 | [设计](./design/tv-redesign.md)、[实施映射](../openspec/changes/compose-tv-v4-from-shared-components/design.md#实施映射与功能保留)、[当前验收](./VALIDATION.md#tv-v4-组件化重设计) |
| 首页续播                       | A／三端              | 部分验收             | app/testing、[VALIDATION](./VALIDATION.md)                                                                                                                                         |
| 搜索／结果／追加               | A 首批、D 分页／三端 | 已实现待真实验收     | contracts/fixtures/catalog、app/testing                                                                                                                                            |
| 联想／热搜／搜索历史           | D／三端              | 已实现待真实验收     | catalog suggestions fixtures、HTTP/native、Host／TV 验收                                                                                                                           |
| 演员作品                       | D／三端              | 已实现待真实验收     | catalog actor-works fixture、HTTP/native、共享 Host／TV 验收                                                                                                                       |
| 分类／筛选                     | D／三端              | 已实现待真实验收     | category-state／SourceControls／Host／TV 分类 fixture                                                                                                                              |
| 加载／占位（共享 UI 状态）     | —／三端              | 已实现待真实验收     | [批次记录](./history/2026-11-17/home-loading-unification.md)、ui:test、宿主 fixture                                                                                                |
| 排行榜／榜单雷达               | D／三端              | 已实现待真实验收     | [批次记录](./history/2026-11-17/rankings-radar-unified-design.md)、rankings fixtures                                                                                               |
| 新剧／上新日历                 | D，预约写入 E／三端  | 部分验收             | calendar controller／Host／真实 HTTP 宿主／TV 输入适配                                                                                                                             |
| 详情／选集／演员／相关         | A/D／三端            | 已实现待真实验收     | [详情演员与相关作品批次](./history/2026-11-16/detail-actors-related.md)、series-detail fixture                                                                                     |
| 系列／季／自动下一季           | D／三端              | 已实现待真实验收     | seasons 状态／缓存／控件、HTTP Host／TV 验收                                                                                                                                       |
| 播放／切集／进度／后台         | B／三端，C 原生      | 部分验收             | app playback/library、PlayerMediaHost、[VALIDATION](./VALIDATION.md) B4b                                                                                                           |
| 倍速／音量／清晰度／全屏／偏好 | B/F／适用端          | 部分验收             | PlayerMediaHost；宿主上的暂停／seek／质量证据                                                                                                                                      |
| 历史／续播／管理／清空         | A 展示、E 管理／三端 | 已实现待真实验收     | `crates/core/tests/library.rs`、app/testing、live-history-host                                                                                                                     |
| 观看统计                       | E／三端              | 部分验收             | [观看统计批次](./history/2026-11-16/account-watch-statistics.md)                                                                                                                   |
| 收藏                           | E／三端              | 已实现待完整验收     | [真实证据](./history/2026-11-15/account-library-sync.md)                                                                                                                           |
| 追更                           | E／三端              | 已实现待真实验收     | [追更记录](./history/2026-11-15/account-follow.md)、VALIDATION                                                                                                                     |
| 更新提醒                       | E／三端              | 已实现待真实验收     | [更新提醒批次](./history/2026-11-16/account-notifications.md)                                                                                                                      |
| 预约                           | E／三端              | 已实现待真实验收     | [预约批次](./history/2026-11-16/account-reservations.md)                                                                                                                           |
| 扫码／手机／验证               | E／三端              | 部分验收             | [真实证据](./history/2026-11-15/account-session.md)                                                                                                                                |
| 我的账号页面构图               | E／桌面、TV          | 已实现待正式验收     | 四轮视觉复评（PASS 8.17）、三端 NSH 回归；[记录](./history/2026-11-20/gate-and-release.md)                                                                                         |
| 恢复／退出／切号／同步／合并   | E／三端              | 已实现待真实验收     | [会话](./history/2026-11-15/account-session.md)、[同步证据](./history/2026-11-15/account-library-sync.md)                                                                          |
| 设置／外观／播放偏好           | F／三端              | 部分验收             | [设置页批次](./history/2026-11-17/settings-page.md)                                                                                                                                |
| 诊断／更新／版本／许可         | F/G／适用端          | 部分验收             | 共享更新状态回归 8／8；TV 模拟器弹窗验收 9／9（light/dark/large）；启动自动弹出真机待验                                                                                            |
| TV 遥控／媒体键／返回／输入    | A 输入；B 播控／TV   | 部分验收             | T0Acceptance／BrowsingAcceptance／PlayerAcceptance；VALIDATION B4c；模拟器覆盖，物理遥控为平台限制                                                                                 |
| 原生业务 bridge／独立安装      | C／Desktop/TV        | 部分验收             | [原生收尾审查](./history/2026-11-16/native-core-review.md)、native-bridge／mixed tests                                                                                             |
| 隔离／发行                     | G／各端              | 部分验收             | [门禁与发布记录](./history/2026-11-20/gate-and-release.md)、安全／安装／无 Go 构建；macOS 与 TV 模拟器为 MVP 验收端                                                                |
| 刷剧／频道推荐                 | 不提供独立页面／三端 | 不提供               | contracts/fixtures/feed、feed_probe；旧 UI 证据仅作历史                                                                                                                            |
| 社交能力                       | 不实施               | 不提供               | 仅保留源码事实与历史验证                                                                                                                                                           |
| 离线下载／任务管理             | F／能力适用端        | 待核对               | 原行为、文件／离线读取／任务取消待核对                                                                                                                                             |
| 支持／打赏／应用推荐           | F／适用端            | 待核对               | 未配置态／外部确认待验                                                                                                                                                             |
| TV 系统首页频道／外部卡片      | F／TV                | 待核对               | 真实 TV 系统能力待验                                                                                                                                                               |

## 当前缺口

### 首页续播

A 续播入口已接通；B4b 宿主上的官网播放及重启续播通过。macOS 真机是 MVP 桌面验收端，重启后的续播入口仍待在该平台观察。

### 搜索／结果／追加

D1 分页、同页重试、去重／取消和来源恢复已有合成回归；macOS 末页焦点已修复。TV 正式入口已观察真实中文查询、追加分页、故障注入后的重试和第二页精确来源恢复，范围见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)；macOS 与 TV 的完整分支仍待验，官网核心 probe 不代替正式入口验收。

### 联想／热搜／搜索历史

D2／D3 实现及合成回归通过，正式入口真实流程待验收；D4 共享联想、三种动作、防抖／组合输入和 100／80 字／UTF16 边界已接；三端 fixture 通过，人工 IME 与辅助技术待验。

### 演员作品

D4 core／严格契约／共享作品 UI 已实现待真实验收；82 项虚拟列表、精确来源与较新用户焦点通过 fixture，非官网演员页 UI／全网全集验收。

### 分类／筛选

D5 core 与定稿三维分类 UI 已接；分页／来源／清除、动态选项与键盘有合成回归；TV 正式入口已有真实筛选与恢复流程证据，见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)；完整真实分页与关键词组合仍开放。

### 加载／占位（共享 UI 状态）

首页精选／继续观看／题材筛选／片库网格已统一：未知不渲染空态，刷新保留旧内容，失败原位重试；fixture 浅深色与 TV 首屏 4／4 通过。TV 正式入口的网络时延注入、失败／重试和真实内容证据见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)；其他平台、完整读屏及全部状态仍待验。

### 排行榜／榜单雷达

匿名核心与共享榜单已接；统一设计已落地，macOS 宿主 radar 4／4、rankings 8／8（1440／1180 浅深，截图不在本机），TV 960×540dp 浅深视觉捕获 2／2。2026-11-19 按真实接口核对字段：行字段改读 `title`／`video_desc`／`episode_cnt`／`sub_title`／`RecommendText`，服务端不提供名次，行内不显示。正式入口真实账号流程、读屏与时延边界待验收；遥控由模拟器覆盖，物理电视为平台限制；五轴演示评分已取消。

### 新剧／上新日历

共享日期／新剧、独立缓存／双游标与公告阅读已接，三端合成数据宿主通过；TV 正式入口已有局部真实验收，见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)。其他平台完整流程、全天遍历及跨 owner／季预约仍开放。

### 详情／选集／演员／相关

A 分段／锁定恢复与 D 系列切季已接；actors/related 共享页面已完成源码与视觉审查，fixture 4/4、TV 输入适配三档通过；TV 正式入口已有真实详情浏览与来源返回证据；演员／系列等完整流程及其他宿主验收继续开放，见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)。剧评按用户指令排除。

### 系列／季／自动下一季

共享切季／严格紧邻后继已接；浏览隔离、迟到取消、同季确认及来源恢复有合成回归；正式入口真实切季／自动续季待验收，账号预约仍开放。

### 播放／切集／进度／后台

Rust 准备／Range 与定稿 Player 已接；宿主上的官网闭环、TV native 三主题观看／后台／重启续播已验；macOS 本机真实播放／暂停恢复已观察（8→87→160 秒），重开后的续播入口未观察。

取源新增 [Mobile-v5 链路](./playback-v5.md)：`crates/core/src/playback/provider/mobile_v5.rs` 位于 `video_tab` 之后、旧 multi 之前，独立身份槽，仅确认 HTTP 200 空正文时轮换一次。签名层 `crates/core/src/playback/sign_v5.rs` 以 40 组固定向量逐字节校验通过（32 组 F13 旋转、4 组 carrier、4 组 wire），`cargo nextest -p hongguo-core` 除一条既有账号同步时序抖动外全过、clippy 零告警。

2026-11-24 修正两个协议字段后，v5 已取得真实模型：`manifest_version_code=74332` 必须随最终 query 签名，播放证明字段 21 使用 wire 值 `738`；旧值 `754` 会返回 HTTP 200 空正文。修复前「重生」在 9 路来源全部空响应后失败；修复后四个真实入口（重生／甜宠／逆袭／穿越）均准备出 HEVC 媒体（720P–1080P，3.94–10.16 MB），正式 `GET /api/v1/play/info` 返回 `ok:true`，代理 Range 为 `206 video/mp4`，`ffprobe` 与 `ffmpeg` 全片解码通过。这是取源与媒体准备证据，各宿主播放器首帧／进度／暂停恢复仍按 VALIDATION 待验。许可归属见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)，公开发行前待确认。

### 倍速／音量／清晰度／全屏／偏好

倍速／音量／质量已接；B4c TV 遥控与嵌套选择已验。全屏只有窗口模式：浏览器宿主 `window` 不可用且 NSH 生成类型里没有元素级全屏 API（`apps/harness/.nsh/types/nsh/desktop.d.ts:564`），因此宿主不渲染全屏按钮而不是画一个常禁用的；退出全屏（按钮或宿主 Escape）后焦点回到触发器。macOS 真实交互全屏与持久偏好未验。

### 历史／续播／管理／清空

E1 管理 UI／写屏障已接，当前管理切片 12／13；共享 History 回归 headless 25／25 通过（唯一跳过项 `detail return restores…` 在 TV 目标为 `test.skip`：960×540dp 下 detail-flow 信号在 NSH 0.7.0 不落定，`9bc20a4` 引入，Desktop 仍覆盖该行为；`packages/app/test/history-management.tsx:483`），冻结源码 `pnpm verify` 通过；真实宿主上的管理与持久化有局部证据，后续播放错误／详情超时保留；完整真实焦点／后台及 macOS 桌面／当前 TV 包待验，整体未验收。

### 观看统计

工程实现与共享 UI 已接；完整 `pnpm verify` 通过，按实际播放推进分段累计类型／题材，独立于云历史，不用进度或记录条数推算，不伪造跨设备统计。真实宿主浅色首播约 30.6 秒已累计并显示；该轮因上游重播失败未通过，Desktop／TV、重启恢复与重置仍待验收。

### 收藏

已实现待完整验收：独立收藏、精确 series、本机清空与远端取消分离；macOS 桌面已验添加／重开／同步／取消往返；当前 TV 正式入口已验添加／列表／重开／取消，证据见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)，完整视觉仍待验。点赞按用户决定排除。

### 追更

已实现；HTTP/native 共用 DTO／用例，已登录 loopback 正向 parity 覆盖空列表、ACK 未确认和后续读回，scope／凭证 CAS、共享 UI 有工程回归；正式真实列表／云写与可见宿主仍待验。

### 更新提醒

工程实现与 UI 状态已接；真实账号追更／预约变化、单条／全部已读、重启与 owner 隔离仍待 harness／Desktop／TV 正式入口验收，不宣称系统推送。

### 预约

工程实现、身份区分、失败对账、HTTP/native 已登录 parity 和共享 UI 已接；TV 正式入口已观察日历预约、列表读取、重开保留、取消与刷新为空，证据及剩余边界见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)。季入口与跨 owner／跨端完整流程仍待验。

### 扫码／手机／验证

Rust QR／手机号／MFA 状态与正式入口已接；Desktop 真实扫码成功；当前 TV 已由用户完成正式入口登录并验证重启保留，具体方式未单独留证；手机号／短信／MFA 完整链仍未验。

### 我的账号页面构图

已实现待正式验收：桌面与 TV 构图、深浅色、登录弹窗已截图复核；真实登录、真实同步与系统大字仍按本表其他行验收；遥控由模拟器覆盖，物理电视为平台限制；TV 以轻标题＋按钮带替代第二列与卡片容器。

### 恢复／退出／切号／同步／合并

私有持久凭证、账号隔离、云历史／进度双写、outbox、显式游客导入已接。正常 Desktop 关闭重开自动登录、云历史拉取及收藏往返已验；当前 TV 已验登录保留、真实记录读取与收藏往返。真实账号播放／进度上传仍失败或待验，游客导入未获授权，跨端及冲突场景未完整验收。

### 设置／外观／播放偏好

主题（跟随系统／深／浅）、自动播放、记住位置、默认倍速、安静观看（桌面收起侧栏／顶栏）、账号入口、应用更新（仅宿主有 updater）、恢复默认已接；语言／缓存／预取无真实数据源不展示。TV 新布局保留同一偏好owner，普通偏好保存失败可在原行重试；关于展示构建元数据与项目MIT许可，支持／推荐未配置时明确不可用。当前宿主证据与剩余限制见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)，物理 Android TV 设备验收待补。

### 诊断／更新／版本／许可

应用更新没有独立二级页：桌面在设置一级菜单原位完成检查／下载／安装／暂存与错误恢复，TV 用共享弹窗承载同一流程，账号页入口在 TV 打开弹窗、在桌面转到设置分区。TV 启动自动检查发现可安装或已就绪候选时自动弹窗（播放中延迟、每会话一次、不自动下载），桌面不弹窗。桌面经 NSH `installOnQuit` 暂存并在退出时换入，可提前重启；回执在启动时报告已更新或上次未完成。诊断接线见下段，关于许可仅为项目MIT许可，不代表第三方依赖许可审计；启动自动弹出与真实退出换入／签名升级待真实验收，不以安装器打开计成功。

诊断上报（`add-diagnostics-reporting`）已在 TV 宿主接通：设置页「诊断数据 → 发送诊断数据」默认关闭，打开才初始化官方 `sentry-android`；关闭时 SDK 不初始化、无网络请求。事件契约固定 `category`／`code`／`operation` 加发行版标识，脱敏在 TSX 侧完成（剥离 URL 查询串与片段、Bearer／JWT、邮箱、手机号）。DSN 经 `TV_SENTRY_DSN` 注入 `BuildConfig`，不进仓库。已在 TV 入口用真实分类失败验证：未同意零上报，同意后一次失败恰好一条脱敏上报且恢复界面不变；模拟器上验证了 SDK 初始化、`release`／`environment` 落盘与重启后同意重放。**未验证**：引擎致命错误转发、后端不可达时的可见行为、未捕获异常接管后的进程收敛（需可精确注入网络故障的环境，列为平台限制）；ANR 与 NDK 崩溃不在范围；Desktop／验收宿主／iOS 无上报。

### TV 遥控／媒体键／返回／输入

A 浏览基线保留；B4c 生产 APK 的 DPAD／媒体键／硬件 Escape 已接，模拟器证据见 VALIDATION；物理遥控为平台限制，不阻塞 MVP。

### 原生业务 bridge／独立安装

C1／C2 已接默认原生入口、写队列关闭与显式 preview；TV 原生官网观看／后台／SQLite／重启续播三组通过；C3.3 工程门禁与 strict 已完成；macOS 实际宿主与安全仍待验，物理电视为平台限制。

### 公网隔离／发行

未完成。2026-11-20 `deny.toml` 按精确版本补齐 4 项许可证与 2 项 unmaintained advisory 例外后根工作区 `pnpm security` 通过，`v0.1.0` 已在该门禁下首次正式发布；但两条 advisory 无修复版本、生成宿主锁文件不在根图内、Windows／Linux 安装与签名公证仍未做，完整产品矩阵与 N-1 升级未验。2026-11-24 发布流水线扩为 macOS／Windows／Linux 三平台桌面归档与一份合并签名的 `latest.json`（新增 `desktop-manifest` job），preview 与 publish 共用归档布局校验；这改变的是流水线形状，Windows／Linux 真机安装与升级仍未验收。

### 刷剧／频道推荐（用户取消页面）

2026-11-17 按用户要求移除正式入口、频道页面和专用 UI 验收套件；不再列为待补页面，产品范围见 [PRODUCT](./PRODUCT.md)。Rust `FeedResult` 核心保留，app 刷剧状态、页面及播放器嵌入分支移除。

### 社交能力（用户排除）

用户主动排除评论、回复、弹幕、剧评和点赞及其入口／设置；不是不可实现，也不再列为 MVP 待迁移或缺失项。

### 离线下载／任务管理（待核对）

未定位离线剧集任务队列依据；不确认创建／暂停／恢复／离线播放／仅 Wi-Fi，不保留默认下载导航；继续核对，不将预取／更新或应用下载当成离线能力证明。

### 支持／打赏／应用推荐

收款方与推广资产待确认，不复制上游收款资产；未配置态／外部确认待验。

### TV 系统首页频道／外部卡片

待核对，不要求浏览器支持。

## 上游指针与状态所有者

供追溯使用；日常按状态与缺口判断，不需要读本表。

| 功能／页面                     | 上游行为指针                                                                                                | 状态所有者与契约                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 首页续播                       | guest_history.go、ui/watching-return.js                                                                     | Rust library；app 导航                                               |
| 搜索／结果／追加               | search_web.go、search_web_test.go、ui/pagination.js                                                         | core catalog SearchResult；app 查询／锚点                            |
| 联想／热搜／搜索历史           | hongguo_client.go::SearchSuggestions、search_discovery.go、search_history.go                                | Rust catalog／history；app 草稿／读写队列                            |
| 演员作品                       | hongguo_client.go::ActorWorks、main.go::actorWorks、ui/app.js                                               | core catalog 演员身份／作品；app 导航                                |
| 分类／筛选                     | ui/search-discovery.js、ui/index.html                                                                       | core 查询语义；app 筛选                                              |
| 加载／占位（共享 UI 状态）     | 无上游页面指针（跨区域数据状态）                                                                            | app 区域状态判断；ui SkeletonBlock／SkeletonRegion                   |
| 排行榜／榜单雷达               | lists.go::RankList、radar.go、rank_badge.go、radar_test.go                                                  | Rust RankResult；app 动态选择／游标／来源                            |
| 新剧／上新日历                 | lists.go::NewSeries/SubscriptionList(calendar)、lists_test.go 独立游标                                      | Rust typed new/calendar；app 模式／日期／游标／来源                  |
| 详情／选集／演员／相关         | hongguo_client.go::SeriesDetail、search_web.go、ui/app.js::renderDetailActors                               | core 独立 SeriesDetail；app 选集／完整元数据／来源                   |
| 系列／季／自动下一季           | series_seasons.go、seasons.go、ui/next-season-hint.js                                                       | Rust 系列契约；app 浏览／媒体独立身份                                |
| 播放／切集／进度／后台         | player_actions.go、minireel_range.go、ui/playback-recovery.js                                               | core play／media；app playback session                               |
| 倍速／音量／清晰度／全屏／偏好 | ui/playback-settings.js、ui/playback-pointer.js                                                             | core 解析／偏好；app 播控／host                                      |
| 历史／续播／管理／清空         | guest_history.go、library.go、guest_history_test.go                                                         | Rust SQLite Library／HistoryChange                                   |
| 观看统计                       | watch_statistics.go、ui/watch-statistics.js                                                                 | Rust 独立 SQLite 按 owner／epoch 累计／重置；app Player 采集与展示   |
| 收藏                           | library.go、library_test.go、cloud_test.go                                                                  | core library／account；app 操作                                      |
| 追更                           | follow.go、follow_test.go                                                                                   | core account online follow；app 共享列表／详情                       |
| 更新提醒                       | crates/core/src/account/notifications.rs、packages/app/src/notifications-state.ts                           | core 按 owner 保存本机快照差异；app 共享控制器／列表                 |
| 预约                           | lists.go、lists_test.go、series_seasons.go                                                                  | core account；共享日历／季入口／预约列表                             |
| 扫码／手机／验证               | account_qr.go、account_phone.go、account_mfa_regression_test.go                                             | core 凭据／会话；共享 Dialog 表单                                    |
| 我的账号页面构图               | 原型 desktop.html／tv.html 账号页、账号页组件拆分 app/pages/account                                         | app/pages/account（身份卡、内容卡、片库区、登录弹窗）＋ ui/ActionRow |
| 恢复／退出／切号／同步／合并   | account.go、cloud.go、guest_history.go、cloud_test.go                                                       | core 私有会话／owner 库；TSX 原子切换                                |
| 设置／外观／播放偏好           | packages/app/src/settings.ts、pages/SettingsPage.tsx＋pages/settings/*、packages/ui/src/settings-row.tsx 等 | NSH Storage 本机偏好；页面状态归 app                                 |
| 诊断／更新／版本／许可         | playback_diagnostics.go、ui/updates.js、ui/third-party-licenses.txt                                         | core／host；app 状态                                                 |
| TV 遥控／媒体键／返回／输入    | ui/numeric-keypad.js、ui/number-input.js、ui/index.html                                                     | Android TvRemote／app 导航                                           |
| 原生业务 bridge／独立安装      | runtime.go 仅行为对照                                                                                       | native-bridge→core；host 生命周期                                    |
| 隔离／发行                     | 上游仅行为参考，遵守本项目 ENGINEERING                                                                      | 会话隔离；签名／升级 host                                            |
| 刷剧／频道推荐                 | lists.go::Recommendations/parseFeedDramas、discussion_test.go、ui/app.js                                    | Rust FeedResult 核心保留；app 刷剧状态、页面及播放器嵌入分支移除     |
| 社交能力                       | discussion.go、video_likes.go、hongguo_client.go::SeriesDetail、ui/index.html                               | 上游存在；本产品不消费                                               |
| 离线下载／任务管理             | README.md 范围声明；minireel.go 与 ui/episode-prefetch-settings.js 仅证明缓存预取                           | 离线契约与状态所有者未确认                                           |
| 支持／打赏／应用推荐           | ui/recommended-apps.js、ui/index.html                                                                       | 经确认的资产；app 展示／host 外链                                    |
| TV 系统首页频道／外部卡片      | ui/index.html、上游 Android 宿主（待专项定位）                                                              | Android adapter；app 带来源路由                                      |

## 状态更新规则

真实／合成、入口／平台和源码范围按[工程验收标准](./ENGINEERING.md#9-安全测试与可观测性)分别判断；验证结果及开放失败只维护在 [VALIDATION](./VALIDATION.md)。

每次只更新受影响行的当前实现／缺口与证据入口，不追加日期进度。共享控件归 ui，业务归 app，持久状态归 Rust；设计与 API 链接其唯一来源。历史阶段记录见[台账快照](./history/2026-11-15/feature-ledger.md)，不能覆盖表中当前状态。
