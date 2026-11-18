# 系列／季浏览交接

源码与验收输入位于主项目目录。共享 UI 不持有网络、观看历史或预约状态；桌面与 TV 不拆 package 或业务控制器。

## 责任与身份

| Owner                       | 负责                                                                  | 不作为其输入的状态                 |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `packages/ui/SeasonChoice`  | 受控标题、状态、选择与独立焦点；公共主题、尺寸、按压和 fast 反馈      | 季号推断、媒体、账号、请求         |
| `packages/app/SeasonPicker` | 完整服务顺序、来源补位、横滚安全区、实际 playingId 与历史续播标签     | 浏览选择不能推导播放中             |
| `createSeasons`             | 来源 series_id／content_type、浏览选择、只读系列请求、独立后继意图    | 不导航、不准备媒体、不写历史       |
| `createSeasonDetail`        | 按 series_id／content_type 缓存已验证详情，取消迟到所有权             | 预告和禁播只展示摘要，不读可播详情 |
| Detail                      | 当前浏览季的简介、选集、分段和续播；显式确认合法成员后交给 store      | 保留原详情返回来源，不把选季当播放 |
| Player／Feed                | 实际媒体／集身份、checkpoint 和手动操作取消后继；推荐来源独立于实际季 | 新推荐不能被旧详情或旧媒体回调覆盖 |

可见但 inactive 的窗口保留浏览读取；后台、隐藏和卸载取消未完成读取。自动续播每个边界都要求 active 前台，且实际最后一集必须有完整、唯一、未锁定的身份。暂停、选季（包括再次确认当前季）、切集、定位、重播、刷新、离页、失焦或后台均撤销待完成后继；中断后不自动重试。

后继沿固定上游 `ui/app.js` 的 `continueFromSeason`：完整 selector 中唯一 `season_index=current+1` 才是候选。紧邻季待上线／禁播时停留，不跳到更后面的可播季；有更高季但缺紧邻季时报告不完整。只有当前季号缺失才读取 next-season 识别当前编号，它返回的最近更高可播季不能直接授权播放。首集还须通过精确详情身份、类型与解锁成员检查。

## 布局与输入

沿组件板 `discovery-extras` 的双层季选择：标题与实际状态分开，选中和焦点可以同时存在；左右移动焦点，确认才选择。桌面详情放在选集区，播放器放右栏；TV／全屏复用既有 EpisodePanel。桌面媒体列独立滚动，不能为露出底部控制而裁掉右栏标题。TV 保留方向、确认、逐层 Back 和来源恢复，文本不依赖悬停。

Android 返回来源在选择时记录是否属于页面；同一用户意图内优先原页面目标，避免导航时顶部按钮的临时抢焦覆盖原集。较新的用户意图仍优先，虚拟行重建继续按稳定公开 ID 恢复。

系列状态使用原位等待／安全错误与精确重试，不伪造预约成功。评论、弹幕、剧评和点赞没有入口。收藏／追更仍遵守账号能力边界。

播放器只在当前媒体已加载、前台运行且实际进度连续增长时传入实际 playingId；元数据就绪、准备和重试不等同播放。暂停／缓冲／跳转位置／完成／失败或后台后清除确认，恢复后需由新的连续进度重新证明。桌面右栏与 TV／全屏面板共用这一绑定，当前浏览选择及真实历史续播状态分别保留。状态原位即时更新，不新增标签、动画或焦点动作。真实 Web 浅色三次播放／暂停／恢复的状态已核对，但整轮因保留项详情超时未通过；Desktop native 首轮播放准备失败，补日志诊断轮实际播放及状态切换成功，仍保留前轮失败。合成边界、真实失败及工程检查分别记录在 VALIDATION，不据此关闭系列或 MVP 验收。

## 动效清单

- 桌面详情的选集区、播放器右栏以及 TV／全屏选集面板共用 SeasonPicker／SeasonChoice。焦点与选择独立，hover／pressed／selected 复用控件 fast 反馈；减少动态时即时反馈。
- 选季只切浏览上下文，不切媒体。标题、状态、等待与错误在原区域更新；切季重置分段，缓存返回保留真实选集，不重播入口动效。横向揭示使用控件既有 reveal，减少动态时关闭滚动动画。
- “播放中”只绑定前台已加载且实际进度连续增长的媒体，元数据就绪或请求自动播放均不代表实际播放；准备、暂停、缓冲、跳转位置、完成、失败或后台后重新等待进度确认，当前浏览选择和真实续播信息分别保留。状态文字在原区域即时更新，不新增动画、声音或焦点变化。
- 播放器末集后继等待与失败沿用完成区的影院文字与重试动作；只有确认可播放关系及首集后才切实际媒体。手动操作和新的导航意图取消旧后继，旧内容不延迟抢回焦点。
- TV／全屏打开关闭选集继续复用 EpisodePanel 的既有进出和来源恢复；不新增弹层、装饰动效或声音。静态截图不代表逐帧或减少动态效果已验；验证范围记录在 VALIDATION。

## 复现

在主仓使用固定 Node／pnpm／NSH 环境：

```sh
pnpm verify
node --test tooling/test/seasons-fixture.test.mjs tooling/test/seasons-tv-remote.test.mjs tooling/test/seasonless-fixtures.test.mjs
node tooling/src/seasons-host.mjs web
node tooling/src/seasons-host.mjs macos --foreground
node tooling/src/seasons-tv-remote.mjs run
```

图形宿主使用真实 HTTP 和本地自制 mp4，覆盖两尺寸浅深、精确重试、迟到响应、浏览与播放隔离、实际解码结束与暂停取消；`--filter pause-next` 可单独复验末集后暂停，`--filter same-selection-next` 复验再次确认当前季取消后继。TV 使用生产 Java 输入适配层的独立安装 ID，三档主题／字号；可用 `--suite details|mismatch|player-browse`、`--profile light|dark|large-text` 缩小范围。脚本核对输入 SHA、生产 APK 字节与设备设置恢复，不能降低磁盘或恢复门禁。

组件、组合、缓存与控制器的独立入口为三端 `SeasonChoicePreview`、`SeasonComponentsPreview`、`SeasonDetailPreview`、`SeasonsStatePreview`；公共 preview／testing exports 与产品路由分离。运行范围、失败分类和最终证据统一以 VALIDATION 为准；合成宿主不证明真实账号、独立官网业务、物理电视、人工 IME 或辅助技术通过。
