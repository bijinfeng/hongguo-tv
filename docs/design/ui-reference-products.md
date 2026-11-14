# UI 参考产品候选

> 2026-11-14 范围更新：本文保留历史研究／验收记录；当前设计以 [真实性审查](reality-audit.md)、[页面地图](ui-map.md) 为准。评论、回复、弹幕、剧评、点赞已由用户排除；离线任务与任意缓存容量未获证据支持，不能从本文恢复为当前要求。

调研日期：2026-11-13。本轮筛选可借鉴的产品，不锁定页面方案，不修改原型。Web／桌面与 TV 分别评估。下文“适合借鉴”是设计判断，截图可见事实与源码行为分开记录。

## 推荐优先级

- Web／桌面：**Jellyfin Web 的片库组织 + FreeTube 的桌面观看结构**。
- TV：**Infuse 的视觉与剧集详情 + Jellyfin Android TV 的剧集浏览和焦点处理**；SmartTube 补充遥控播控研究，Netflix TV 补充内容发现。
- 短剧业务：红果官方补充刷剧与找剧；Kazumi 补充选集、更新、追番、弹幕与评论的功能组织。本次 Kazumi 图片为手机截图，不作为桌面或 TV 布局定稿依据。
- Kodi 主要研究方向导航和成熟媒体中心的操作组织；本轮找到的仓库截图较旧，不作为现代视觉的首选。

## 开源项目

Star 为调研时 GitHub API 的仓库快照，四舍五入显示；用于判断关注度，结合相关端的真实界面和维护状态评估。Jellyfin 使用具体客户端仓库的 Star，不拿服务端总数代替。

| 项目                                                                  |  Star | 适用参考         | 最值得看什么                                               | 本轮证据与限制                                                                              |
| --------------------------------------------------------------------- | ----: | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [FreeTube](https://github.com/FreeTubeApp/FreeTube)                   | 22.4k | 桌面             | 顶部搜索、收起侧栏、视频主区与推荐侧区、影院模式           | 已看官方桌面播放图及 Watch.vue；持续维护，官网仍以 Beta 标记下载                            |
| [Jellyfin Web](https://github.com/jellyfin/jellyfin-web)              |  4.0k | Web／桌面        | 续播、最新内容、片库筛选、海报与详情关系、按季管理剧集     | 已看官网首页／详情图，抽查首页和剧集列表源码；官网图片文件名标记 10.8，不代表当前 12.x 外观 |
| [Kazumi](https://github.com/Predidit/Kazumi)                          | 42.3k | 跨端业务流程补充 | 追番、更新日历、选集／评论切换、当前集标识、弹幕           | 已看仓库首页／详情／播放图和选集源码；截图是手机形态，不能据此认定桌面或 TV 体验            |
| [Jellyfin Android TV](https://github.com/jellyfin/jellyfin-androidtv) |  4.7k | TV               | 内容行、续播、系列与季、全屏控制层、焦点恢复               | 已看仓库 TV 首页／播放图及焦点管理源码；0.20.0 于 2026-11-10 发布，开发分支和发布版需分开   |
| [SmartTube](https://github.com/yuliskov/SmartTube)                    | 36.3k | TV               | 遥控内容浏览、长标题卡片、短视频栏目、快进快退时控制层行为 | 已看仓库首页图及 seek 模式源码；截图含 Beta 标识，不能直接视为最新稳定版的完整表现          |
| [Kodi／Estuary](https://github.com/xbmc/xbmc)                         | 21.5k | TV／客厅媒体中心 | 导航到内容区域的方向关系、焦点控制、媒体分类               | 已看默认皮肤截图及 Home.xml 的方向导航；截图内日期为 2016 年，视觉年代明显                  |

以上六个仓库在本次核查时均未归档，近期均有推送。活跃提交不等于界面已经稳定：正式发行、开发中功能、历史截图分别使用。

## 商业产品

| 产品                                                                               | 适用参考       | 借鉴重点                                               | 图片资料与证据边界                                                                 |
| ---------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [Infuse](https://firecore.com/infuse)                                              | TV、桌面片库   | 内容背景、简介层次、续播主动作、按季剧集行、弱化工具感 | 已看官网 Library 图；作为展示图研究视觉，未操作真实客户端                          |
| [Netflix TV](https://www.netflix.com/tudum/articles/netflix-new-tv-layout)         | TV 内容发现    | 聚焦当前内容、浏览时提供决策信息、个人内容入口         | 已看官方 TV 改版图；发布于 2025 年，设备及版本存在差异                             |
| [Apple TV](https://support.apple.com/zh-hans/guide/tvapp/atvbb35c9fc3/1.0/web/1.0) | 跨端续播与片库 | 继续观看、待播、详情与剧集层级、按设备组织导航         | 本轮沿用官方操作说明，未新增实际界面截图核查；图片证据优先级暂低于 Infuse／Netflix |
| [红果短剧](https://apps.apple.com/cn/app/id6451407032)                             | 短剧业务       | 刷剧与找剧双路径、追剧、预约、任意选集、评论           | 已看官方商店宣传图与描述；手机视频区可见收藏、评论等操作，不能从图推断完整隐藏流程 |

腾讯视频、爱奇艺仍可补充中文播控习惯，本轮仅核实官方 iPad 宣传图，暂不作为桌面或 TV 的主要样本。Plex 官方媒体页本次访问返回 403，暂不纳入已完成图片核查的名单。

## 图片入口与可见观察

### Web／桌面

**FreeTube：桌面观看页。** 视频占据左侧主区，右侧推荐列表；顶部搜索和左侧导航仍可见。适合研究观看与浏览并行；图中的密集文字、频道订阅业务不必整体搬入短剧产品。[官方截图](https://freetubeapp.io/images/FreeTube2.png)

![FreeTube 官方桌面观看页](https://freetubeapp.io/images/FreeTube2.png)

**Jellyfin Web：片库首页。** 继续观看与最新电影形成独立内容行，续播卡底部有进度。适合研究片库结构；“我的媒体”分类不是我们必须保留的模块。[官方首页图](https://jellyfin.org/assets/images/10.8-home-4a73a92bf90d1eeffa5081201ca9c7bb.png)、[详情图](https://jellyfin.org/assets/images/10.8-details-df4f7caaee389ffbaeeaa95b668fa037.png)

**Kazumi：选集与评论关系。** 仓库播放截图将视频置于上方、选集／评论置于下方，当前集有图标与文字状态。可参考任务关系，不把手机纵向布局直接用到桌面。[播放图](https://raw.githubusercontent.com/Predidit/Kazumi/4ca04009fdae696883629e0984e7d7134cc7ed84/static/screenshot/img_4.png)、[首页图](https://raw.githubusercontent.com/Predidit/Kazumi/4ca04009fdae696883629e0984e7d7134cc7ed84/static/screenshot/img_1.png)

### TV

**Infuse：剧集详情。** 内容背景承接画面，简介与操作集中左侧，下方按季横向列出剧集，续播按钮明确给出时间。适合我们独立 TV 方案的详情层次；短剧未必具备横版背景和每集剧照，需要为缺少素材设计完整替代状态。[官方图片](https://firecore.com/themes/main/images/feature-library.jpg)

![Infuse 官网剧集详情展示](https://firecore.com/themes/main/images/feature-library.jpg)

**Jellyfin Android TV：浏览和播放。** 首页以大卡分类和续播内容行组织；播放图使用覆盖在视频上的大尺寸控制层。适合对照其源码研究遥控行为，截图本身无法证明焦点恢复效果。[TV 首页图](https://raw.githubusercontent.com/jellyfin/jellyfin-androidtv/bdee133c7e5ab3f7e70495d1c85337d1e0446b4d/fastlane/metadata/android/en-US/images/tvScreenshots/1.png)、[播放图](https://raw.githubusercontent.com/jellyfin/jellyfin-androidtv/bdee133c7e5ab3f7e70495d1c85337d1e0446b4d/fastlane/metadata/android/en-US/images/tvScreenshots/2.png)

**SmartTube：TV 内容流。** 左侧菜单与右侧内容行并列，首页包含常规视频与 Shorts 行。适合研究不同视频比例的浏览和遥控切换；其频道数量和卡片信息密度不直接照搬。[仓库首页图](https://raw.githubusercontent.com/yuliskov/SmartTube/ab04c75fa1ea19604cfb8a3dc6d5dfb719f0ec53/images/browse_home.png)

**Kodi：遥控导航参考。** 默认皮肤将菜单与内容区域明确分开。图片老旧，优先结合方向导航源码研究操作模型。[仓库截图](https://raw.githubusercontent.com/xbmc/xbmc/313acbeaa33dc29bdf379685bf91359e2f534893/addons/skin.estuary/resources/screenshot-01.jpg)

## 已抽查的实现证据

源码链接固定到本次读取的提交，避免后续默认分支变化造成引用漂移。这些是实现线索，不是 NSH API 示例，也不代表相关开发分支功能已经发行。

| 项目                | 源码位置                                                                                                                                                                                                                       | 核实到的实现                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| FreeTube            | [Watch.vue](https://github.com/FreeTubeApp/FreeTube/blob/b752c5d635adda11b1f699b7a01fefd166631080/src/renderer/views/Watch/Watch.vue)                                                                                          | 播放、说明和评论位于主区域；播放列表与推荐位于侧区；影院模式分别改变区域样式。其评论并非位于推荐侧栏 |
| Kazumi              | [episode_selection_panel.dart](https://github.com/Predidit/Kazumi/blob/4ca04009fdae696883629e0984e7d7134cc7ed84/lib/pages/video/episode_selection_panel.dart)                                                                  | 选集滚动容器、当前集状态、来源选择器及打开前焦点记录                                                 |
| Jellyfin Android TV | [FocusPersistManager.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/bdee133c7e5ab3f7e70495d1c85337d1e0446b4d/app/src/main/java/org/jellyfin/androidtv/ui/navigation/focus/FocusPersistManager.kt)                     | 用稳定 key 记录最后焦点，保存和恢复；区分初始焦点请求与恢复请求                                      |
| Jellyfin Android TV | [HomeFragment.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/bdee133c7e5ab3f7e70495d1c85337d1e0446b4d/app/src/main/java/org/jellyfin/androidtv/ui/home/HomeFragment.kt)                                               | 首页内容行有独立焦点分组及离开行区域的约束；也可看到 Compose 与旧浏览组件互操作的特殊处理            |
| SmartTube           | [SeekModePlaybackFragment.java](https://github.com/yuliskov/SmartTube/blob/ab04c75fa1ea19604cfb8a3dc6d5dfb719f0ec53/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/playback/mod/SeekModePlaybackFragment.java) | 进度定位有进入／结束状态；定位时停止控制层淡出计时并显示控制层                                       |
| Kodi                | [Home.xml](https://github.com/xbmc/xbmc/blob/313acbeaa33dc29bdf379685bf91359e2f534893/addons/skin.estuary/xml/Home.xml)                                                                                                        | 默认控件及显式上下左右跳转目标，适合研究确定的区域导航                                               |
| Jellyfin Web        | [hometab.js](https://github.com/jellyfin/jellyfin-web/blob/70d942d928ac165d7f2d2d7cb0aefe135aee22ba/src/apps/legacy/controllers/hometab.js)                                                                                    | 首页内容分区独立加载、恢复、暂停和销毁；这里只核实生命周期，不将 onResume 误读成视频续播实现         |

## 进入设计前的下一步

从候选中选定主样本后，按相同任务逐屏比较：首页找剧 → 详情 → 选集 → 播放 → 返回 → 续播。TV 额外记录每一步的焦点、方向键、确认与返回行为；桌面额外记录窗口变窄、影院模式、并行阅读评论及键盘操作。

当前完成的是产品初筛、图片观察与局部源码核查，尚未启动上述客户端完成端到端操作。后续设计采用的模式仍需适配红果短剧的内容比例、长选集和账号互动，而非按某一产品整套复制。
