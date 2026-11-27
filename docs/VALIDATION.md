# 当前验收状态

更新：2026-11-26。完整 MVP 尚未完成。验收规则唯一来源为 [ENGINEERING §9](./ENGINEERING.md#9-安全测试与可观测性)，实现缺口维护在[功能台账](./feature-ledger.md)，本页只维护当前验收矩阵、开放失败与证据索引。

正式入口的真实数据／实际流程是功能验收依据；合成数据只记边界回归。工程门禁、局部真实流程、恢复诊断与整体验收分开记账，保留全部失败。逐轮运行正文在 [history](./history/README.md)，本页不追加过程叙事。

2026-11-26 起 Web 不再是产品端（官方产品已有 Web），原 `apps/web` 改名 `apps/harness`。本页与历史记录里的「Web 轮次」「Web fixture」「Web 套件」指的都是这个无头 Chromium 验收宿主；其源码、命令与产物路径按当时名称保留，不改写，向下按「宿主」读即可。

2026-11-27 起 MVP 验收宿主收窄为两种：桌面为 macOS 真机，TV 为固定 API34 arm64 AVD 模拟器。物理电视（真实遥控、硬解、4K、真实 overscan、观看距离）与 Windows／Linux 真机安装升级改为平台限制，仍在本页保留事实与原因，但不再是 MVP 验收条件。规则见 [ENGINEERING §9](./ENGINEERING.md#验收宿主矩阵)。TV 的 DPAD／媒体键／系统 IME 由模拟器注入，属于 MVP 范围，不因「非物理设备」回到待验收。

## 状态总览

| 范围                     | 状态             | 未验要点                                               |
| ------------------------ | ---------------- | ------------------------------------------------------ |
| 工程门禁                 | 通过             | 根工作区通过；不含签名、安装、升级与真实流程           |
| 宿主内容发现／详情       | 部分验收         | 分类／榜单／日历／推荐、真实切季逐项待验               |
| 取源协议（共享 core）    | 已修复待宿主实看 | 模型与媒体就绪已验；首帧／进度／后台未验               |
| 宿主真实播放             | 部分验收         | 后续详情／系列超时；深色与清空未执行                   |
| Desktop native（macOS）  | 部分验收         | 旧 409 未解释；续播入口、全屏、后台、稳定性            |
| TV v4组件化重设计        | 已实现、部分验收 | 上游真实播放失败；账号、完整IME、读屏与4K待验          |
| TV native                | 部分验收         | 仅当时 APK；当前包、纯遥控、硬解、长播                 |
| 游客历史 E1              | 部分验收 12／13  | 完整真实焦点／长列表／后台、Desktop native／当前 TV 包 |
| 基础组件／还原           | 部分验收         | 全状态截图、人工 IME、读屏、大字、逐帧动效             |
| 首页加载／占位           | 部分验收         | 失败／隐藏分支、读屏、真实慢网、正式宿主               |
| 排行榜／榜单雷达         | 部分验收         | 真实账号流程、遥控模拟、读屏、真实时延                 |
| 账号／云同步／个人记录   | 已实现待真实验收 | 账号播放／进度上传、游客合并授权、其他端登录           |
| 我的账号页面构图         | 已实现待正式验收 | 真实登录／同步、模拟遥控、系统大字                     |
| 账号追更／预约／更新提醒 | 已实现待真实验收 | 真实账号变化、预约写读、已读、重启、owner 隔离         |
| 观看统计                 | 部分验收         | Desktop／TV、重启恢复、重置、账号切换                  |
| 设置／维护／更新         | 部分验收         | 真实播放偏好、签名升级、诊断／许可                     |
| TV 诊断上报              | 部分验收         | 业务失败实际上报、未捕获异常进程收敛                   |
| 平台与发行               | 首发完成         | macOS 签名公证、N-1 升级、SBOM                         |
| 安全                     | 根门禁通过       | 宿主锁文件不在根图；两条 advisory 无修复版本           |

平台限制项（不计入上表状态，不阻塞 MVP）：物理 Android TV 的真实遥控、硬解、4K、overscan 与观看距离；Windows／Linux 真机安装与升级。两者的事实和原因见「未验与阻塞」对应小节。

## 未验与阻塞

### 工程门禁

2026-11-26 TV v4 分支 rebase 到 master `8ffe66349` 后，`c32d53b2c` 加同步超时测试修正的 `pnpm verify` 通过（NSH 0.7.0）；此前的 UI 验收入口 check＋build、design:check 与 ui:icons:check 保留各自源码范围。当前命令和范围见下方 TV v4 项。2026-11-20 的 security 与 master CI 结果仅覆盖当时源码，见[门禁与发布记录](./history/2026-11-20/gate-and-release.md)，不作为本次 CI／发行证明。

- Rust 显式联网 probe 跳过 1 项，headless 有 warning。
- 门禁只覆盖本机工作树的根工作区，不含签名、安装、升级与真实流程。

### 验收宿主内容发现／详情

`apps/harness` 在 macOS 图形宿主及 Chromium 的部分真实搜索、详情／相关返回已有证据；演员／相关共享页面 fixture 4/4 通过。

- 演员、完整分类／分页／榜单／日历／推荐、真实切季／自动续季等逐项待验。
- 2026-11-16 正式匿名演员／相关流程因 macOS 锁屏停在首页；旧合成宿主通过不计功能已验收。

### 验收宿主真实播放

最新 Chromium 浅色三次真实播放有进度增长，暂停稳定、恢复增长，季状态同步。

- 后续详情／系列超时使整轮失败，深色与后续清空未执行；播放稳定性、真实后台等未关闭。

### 取源协议（跨端共享 Rust core）

2026-11-24 修复 Mobile-v5 签名缺项后，真实取源恢复。核心证据：`playback_probe --live` 对「重生」「甜宠」「逆袭」「穿越」四个真实搜索入口均取得模型并准备出媒体（HEVC 1080P／720P，3.94–10.16 MB）；正式 `GET /api/v1/play/info` 返回 `ok:true`／`hevc`／`1080P`，媒体代理 Range 为 `206` + `video/mp4`，下载整文件经 `ffprobe`（HEVC 1920×1080 + AAC 91.37 秒）与 `ffmpeg -f null` 全片解码无错误。

- 修复前同一入口在「重生」上 9 路来源全部 `PLAYBACK_SOURCE_EMPTY` 并失败；`video_tab` 在修复后仍为空，实际取得模型的是 v5，因此不能把结论外推到其它来源。
- 这是取源与媒体准备证据。各宿主播放器首帧、进度、暂停恢复与后台仍分别按 harness／Desktop／TV 小节验收，不因本条视为播放已通过；硬解与物理设备限制单列。
- 本机未执行三端 UI 实看；结论限于上述命令与 HTTP 入口。

### Desktop native

MVP 桌面验收平台为 macOS 真机（见 [ENGINEERING §9](./ENGINEERING.md#验收宿主矩阵)），以下 Linux 记录作为平台限制保留，不阻塞 MVP。

正式入口真实搜索／详情成功；最新同账号同剧实际播放 8→87 秒、暂停后恢复至 160 秒，SQLite 进度和同步 ACK 已观察。

- 旧 409 仍未解释，首帧截图／远端原始进度回读未验。
- 随后重开遇到热更新后进程存活但零窗口，未能观察续播入口。
- 完整管理、后台、全屏、稳定性继续待验；这些需在 macOS 真机上补齐才算 MVP 通过。
- **NSH 0.7.0 的 Linux `lifecycle()` 恒报 `background` 使数据页停在骨架屏（Linux 平台限制，不阻塞 MVP）**：上游已修并合入 `main`（[#3239](https://github.com/longbridge/nsh/issues/3239)／PR [#3252](https://github.com/longbridge/nsh/pull/3252)），但**不在 0.7.1，也不在 0.7.2**——0.7.2 的发布树里 `lifecycle()` 仍只读宿主隐藏窗口，且该段源码与 0.7.1 逐字节相同。macOS 按整个应用计算不受影响，Windows 有同类缺陷（[#3287](https://github.com/longbridge/nsh/issues/3287)／[#3300](https://github.com/longbridge/nsh/pull/3300)）。定位过程与逐条核对见[平台限制排查归档](./history/2026-11-27/linux-platform-limits.md)。
- **Linux 隐藏标题栏时 GTK 窗口按钮在浅色下不可见（Linux 平台限制，已报上游 [#3381](https://github.com/longbridge/nsh/issues/3381)）**：浅色字形纯白 `#ffffff` 落在 `#f9f9f9` 栏面，对比度 1.05:1；深色 9.1:1 且有实心圆底。上游修复 PR [#3399](https://github.com/longbridge/nsh/pull/3399) 已合入 `main` 并自动关闭该 issue，但**同样不在 0.7.2**：issue 关闭不等于已发布。像素测量与最小复现见[平台限制排查归档](./history/2026-11-27/linux-platform-limits.md)。

### TV native

TV 的 MVP 验收宿主为固定 API34 arm64 AVD 模拟器；物理电视相关项记为平台限制。

C3.1 的固定 API34 模拟器三组真实观看／切集／后台／重启续播有证据，包含有限重试恢复。

- 仅对应当时 APK 和所列操作；当前包完整新功能／E1 主链、纯遥控全流程／长播未验。
- 物理电视上的真实遥控、硬解、4K、overscan 与观看距离未验，按平台限制记录，不阻塞 MVP。

### TV v4 组件化重设计

已完成并保留证据的范围：三端工程门禁（Rust 420、Web 178、Desktop 259、TV 189／191）、token 几何由 `layout-contract` 在真实应用上断言、Android 20 个页面／子视图与八组同源组件的浅深及大字矩阵、播放器与浏览的原生焦点回归、200% 追加交互、原生组件六组 139 项、正式设置与信息页 140 项、Gboard 中文候选、TalkBack 外框让出。

开放：上游真实 `/play/info` 在正式入口曾播放失败，未取得首帧；账号写读仅覆盖局部；完整 TalkBack 播报与遍历、其他 IME、逐帧动效未验；4K 输出与物理设备按平台限制记录。

逐项设备读数、运行计数、失败原始证据与排查过程见[验收详情归档](./history/2026-11-27/tv-v4-acceptance-detail.md)。

### 游客历史 E1

管理实现与写屏障已接；共享 History 管理回归 headless 25／25 通过（唯一跳过项是 TV 目标的 `detail return restores…`，原因与替代覆盖见[功能台账](./feature-ledger.md)）；冻结源码 `pnpm verify` 通过；验收宿主有真实记录、取消／单删／所选删／清空、部分跨重启证据；真实键盘管理有局部证据。

- 管理切片当前 12／13；后续运行的播放错误和详情超时保留。
- 完整真实焦点／长列表／后台、Desktop native／当前 TV 包未整体验收。

### 基础组件／还原

公共实现、三端 check／build 和行为回归，macOS 桌面／TV 密度、部分 Android 模拟器及独立视觉审查有分项证据；主题以 `packages/ui/theme.json`／`theme.tv.json` 为运行时来源，由 DESIGN.md 经 `pnpm design:codegen` 生成，对比度按 WCAG 公式核算。浏览器原型已于 2026-11-26 删除（见[该次决定](./history/2026-11-26/design)），视觉真相只余 DESIGN.md 与产品代码。

- **Web 端（harness）已能截图，开发期的视觉核对走它**（2026-11-26）：`nsh test <file> --target web` 需要 `clang` 与 `llvm-ar`；两者装上后 `zstd-sys` 的 web runtime 可编译，`open()` 的 `screenshot` 输出真实像素。首页 hero 的浅深两色已用 fixture 数据截到真实渲染（1180×780，非骨架态），圆角逐行量测为 4 行收到 0，符合 `radius('lg')`=8；同一 fixture 下 hero 的文本序列为「持／全 113 集／持械入宋／简介／立即观看／查看详情」。
- 需要区分三种证据：`pnpm test` 通过、web 端截图看过、真实桌面／TV 宿主通过。第三种仍是验收标准，web 截图不能替代——它证明的是产品代码在可控宿主里的渲染，不是宿主行为。
- 新主题与默认边框规则尚未在真实宿主逐项截图。
- 全家族所有状态、人工 IME、读屏、大字／距离、hover／pressed 与逐帧动效不能由样例或静态截图概括；见[组件矩阵](./design/component-implementation.md)。

### 首页加载／占位（共享 UI）

统一为静帧骨架模型，含 `skeleton`／`skeleton-surface` token 与 `SkeletonBlock`／`SkeletonRegion`；当批三端应用回归与宿主 fixture 截图见[批次记录](./history/2026-11-17/home-loading-unification.md)。

- fixture 未制造继续观看失败与精选区隐藏。
- 读屏实际播报、真实慢网／失败、正式 harness／Desktop 宿主截图未验证；骨架高度差只有视觉复核，未逐像素测量。遥控输入由模拟器覆盖；物理设备按平台限制记录。
- Desktop 上骨架屏永不退出的成因不是本节的加载态缺陷，而是 NSH 0.7.0 的 Linux `lifecycle()` 恒为 `background` 使读取从未发起，见[Desktop native](#desktop-native)；这是 Linux 平台限制，需在含上游修复的 NSH 版本上重新观察（该修复截至 0.7.2 仍未随任何发行发布），macOS 真机验收不受影响。

### 排行榜／榜单雷达（统一设计）

页面级来源 Tabs、雷达控件带、hairline 表格、TV 比例列宽与整行焦点已落地；macOS 宿主与 TV 视觉捕获见[批次记录](./history/2026-11-17/rankings-radar-unified-design.md)。

- 2026-11-19 `--anonymous-live` 对 `all/ranklist_hot_play_sc`、`ranklist_celebrity/ranklist_actor_fans`、`series_album/series_album_new_rank` 解析出 10／20／10 条真实条目；本机 Rust API + macOS 宿主以真实数据渲染（真实剧名、简介、`8907万热度`、`逆袭·全319集` 元信息、四行服务端分组名），截图 `artifacts/rankings-live/desktop/`；字段映射归[功能台账](./feature-ledger.md)。
- 宿主截图：TV `pnpm visual:tv --web` 960×540dp 浅／深（`artifacts/tv-visual/web/tv-rankings-{light,dark}.png`，viewport 记在同目录 `manifest.json`，source `f5cd6e8`）；桌面现存 `artifacts/rankings-ui/web/desktop/`，`artifacts/radar-ui/` 与 macos 目录已不在本机，原 radar 4／4 截图不可复现。
- 本机 `cargo nextest` 全量并行时 `lifecycle_tests::a_directory_alias_reopen_waits_for_the_original_session_to_drain` 偶发失败（单独运行 50／50 通过），属既有目录锁时序不稳定，与榜单链路无关。

- 正式入口真实账号流程；模拟器上的大字与 DPAD 全流程；读屏播报。物理电视按平台限制记录。
- 真实慢网与雷达过期／缓存提示；桌面列窗口在真实列宽下的可读性；TV 官方榜首屏密度。

### 账号／云同步／个人记录

正常 Desktop 私有目录保留凭证，关闭重开无需扫码；真实云端历史拉取及收藏添加／重开／同步／取消往返已验，前序扫码与退出证据另存。

- 账号播放／进度上传整轮仍未通过；本轮仅原生 AX 交互，截图权限不足。
- TV 正式入口用户已完成登录；身份、同步状态、重启持久与收藏往返见本页 TV v4 项。短信验证码曾进入 MFA，查询遇到过期；用户最终采用的登录方式未单独留证，不宣称短信／MFA 全流程通过。游客合并未授权；跨设备冲突、追更写入、完整预约及统计仍未完整验收。

### 我的账号页面构图

桌面与 TV 构图、深浅色、登录弹窗已截图并完成四轮视觉复评；过程、评语与三端账号回归见[门禁与发布记录](./history/2026-11-20/gate-and-release.md)。

- TV 本轮已观察真实登录后的账号与同步状态，证据见 TV v4 项；真实账号系统大字及完整同步仍待验，模拟遥控已覆盖，物理遥控按平台限制记录。旧构图评审使用合成服务响应。
- TV 以轻标题＋按钮带替代第二列与卡片容器属端型适配，不作为桌面还原度的一部分。

### 账号追更／预约／更新提醒

追更与预约真实来源比较、预约身份／分页／失败对账、通知本机持久化、HTTP/native parity、已登录 loopback 正向／未确认 parity、core-client scope fencing、Desktop／TV 共享列表和首次加载／返回焦点回归通过。

- TV 正式入口的单条预约写入／列表／重开／取消／刷新为空见本页 TV v4 项；追更写入、单条／全部已读、owner 隔离及 harness／Desktop 对应完整流程仍待验，合成回归不替代真实验收。

### 观看统计

独立 owner／epoch SQLite、批次幂等／重置围栏、真实 Player advancing stream 接入、History 共享页面、HTTP/native parity、三端 check、core／app 边界回归、完整 verify 通过；真实宿主浅色首播约 30.6 秒已产生统计并在面板显示。

- 正式宿主整轮因后续上游 `/play/info` 重播失败而未通过。
- Desktop／TV、跨主题／重启恢复、重置后不删历史、账号切换尚未验收；合成数据不作为功能通过依据。

### 设置／维护／更新

设置页已实现主题、自动播放、记住位置、默认倍速、安静观看、账号入口、应用更新（仅宿主有 updater）与恢复默认；偏好经 NSH Storage 本机持久化；桌面经 NSH `installOnQuit` 暂存安装。

- 三端 app settings 回归各 4／4；三端套件 233（Web）／244（Desktop）／246（TV，1 跳过）在 `f5cd6e8` 源码上通过（`870f7e5` 提交说明另记「Web 142, Desktop 149, TV 151」，与本批口径不同且无留存日志可仲裁；当前工作树的套件总数本次未留存，不以任一旧数代当前值），`pnpm check`、`pnpm build`、`cargo nextest` 408／408 通过。
- 截图由三端设置宿主脚本（`nsh test … --target <web／macos／android>`，`tooling/src/settings-host.mjs:41`；Android 由设备自报尺寸，脚本不设窗口，`:15`）在 2026-11-17 生成，存于 `artifacts/design/settings/`；该目录当前不在本机，截图不可复现；同年 11-19 的 TV 960×540dp 浅／深设置页见 `artifacts/tv-visual/web/tv-settings-{light,dark}.png`。共享更新状态回归 7／7（含暂存、提前重启失败仍保留暂存、回执只报告一次）。
- 语言／缓存／预取／诊断／许可无真实数据源不展示。
- 模拟器上的设置与遥控操作、安静观看／自动播放／续播行为的真实播放实看、macOS 正式签名升级仍开放。物理 Android TV 与 Windows／Linux 桌面真机按平台限制记录。
- 桌面真实「准备安装 → 退出 → 下次启动为新版本」、强杀后回执报告「上次更新未完成」、立即重启失败后退出仍完成换入均未验。
- 离线剧集能力待核对，不以预取代证。

### TV 诊断上报

TV 设置页「诊断数据 → 发送诊断数据」默认关闭；打开后宿主以官方 `io.sentry:sentry-android:8.65.1` 初始化上报，创建／搜索记录／播放准备三类失败经 `diagnostics.report` 交给宿主。事件字段固定为 `category`／`code`／`operation` 加发行版标识，脱敏在 TSX 侧完成（URL 查询串与片段、Bearer／JWT、邮箱、手机号）；DSN 经 `TV_SENTRY_DSN` 注入，不进仓库。

- 工程门禁：`pnpm verify` 退出码 0（Web 255／Desktop 257／TV 182 项 NSH 测试，TV 1 项历史跳过；含本轮新增脱敏、旧偏好兼容与宿主通道用例）；`pnpm security` 退出码 0（cargo-deny advisories／bans／licenses／sources 全 ok）。
- TSX→宿主契约（TV 入口 `apps/tv/App.test.tsx`，用真实 category 失败路径，不是 mock）：未同意时零 `diagnostics.report`；同意后一次失败恰好一条上报，`category=catalog`、`operation=加载分类`，序列化结果不含 `http://`、`sign=` 或 `/api/v1/`，且 `category-error` 恢复界面照常出现。
- 2026-11-24 API 34 arm64 模拟器（`hongguo-tv-api34-arm64`）：同意关闭时启动无 `cache/sentry`、无 SDK 初始化；打开开关后 SDK 初始化，`.options-cache/release.json` 为 `"0.1.5+6"`、`environment.json` 为 `"production"`；重启后已存同意自动重放，`cache/sentry` 重新出现。直接向 DSN 端点投递 envelope 返回 `200` 与 event id，Sentry 问题列表出现对应条目（`HONGGUO-TV-1`）。
- **未验证**：引擎致命错误经 `NshView` 转发到 Sentry 的设备侧证据；后端不可达时用户可见行为不变；未捕获异常被 SDK 接管后的进程收敛。这三项需要能精确注入网络故障的环境（当前模拟器无 root，`/etc/hosts` 与 iptables 均不可用），保留为未验项与平台限制，不阻塞 MVP。ANR 与 NDK 崩溃不在本变更范围。
- 真机踩到的两处与设计不符已在 `openspec/changes/add-diagnostics-reporting/design.md` 更正：纯 Java `io.sentry:sentry` 在 Android 上拒绝初始化；`sentry-android` 的 `SentryInitProvider` 会绕过同意，须以 `io.sentry.auto-init=false` 关闭。
- 桌面 `nsh.json` 未声明 `capabilities`，而 NSH 一旦出现该块就默认拒绝未列出的能力；因此诊断宿主测试注册在 TV 入口（TV 已有完整能力白名单），桌面 manifest 保持原样，不为其引入能力收紧风险。

### 平台与发行

2026-11-20 首次正式发布 `v0.1.0`；2026-11-21 从 master 发布 `v0.1.1`（源码 `722cbd8`，run 44764824518）。两次的 `quality`／`security` 前置 job 均通过，两端构建成功；`v0.1.1` 的产物已下载实测：APK 证书 `8d34d7e8…` 与 `tooling/release-policy.json` 一致（`CN=Hongguo TV Release`），两端 SHA-256 与各自清单一致，两份更新清单的 Ed25519 签名以配置公钥验签通过。发布细节与逐项未验见[门禁与发布记录](./history/2026-11-20/gate-and-release.md)。

- Windows／Linux 实际安装、正式签名／公证／SBOM、无 Go 干净环境未完成；这些不阻塞 MVP，但也不得宣称两平台已支持。2026-11-22 接入两平台的工程门禁：ci.yml entry 在 windows-2025／ubuntu-24.04 跑桌面行为测试，release-preview 的 `windows-preview`／`linux-preview` 产出未签名预览 ZIP／归档；两者首次流水线运行与产物真机验收均未完成。
- **桌面发布流水线已扩到三平台（2026-11-24，仅源码改动，尚未跑过发布）**：`release-publish.yml` 的 `desktop` 改为 macOS／Windows／Linux 矩阵，各平台产 `<os>-<arch>` 命名的归档，由新增 `desktop-manifest` job 生成一份三平台 `latest.json`；新增 `tooling/src/desktop-archive.mjs` 按 `nsh-updater` 暂存规则复核归档（单一顶层目录、可执行文件、`nsh/app.json` 的应用 ID），preview 与 publish 共用。**证据只到工具层**：`update-manifest` 回归 7 项全部通过（本机装的是 NSH 0.6.1、仓库固定 0.6.0，固定版本那条断言只在把 `.nsh-version` 临时指向 0.6.1 时通过；已还原为 0.6.0，CI 装固定版本不受影响），`desktop-archive` 2 项通过；校验器对真实 `apps/desktop/.nsh/out/红果.tar.gz` 通过；用临时密钥对三平台归档（真实 Linux 包 + 合成的 macOS／Windows 包）跑通「生成记录 → 壳层签名 → 复验」，并确认删掉 Windows 平台键后即使签名正确仍被拒绝。**Windows runner 打包、三平台同时发布、Windows／Linux 真机安装与 N-1 → N 升级均未验，按平台限制记录；不宣称两平台已支持，也不阻塞 MVP。**
- **Linux x64 源码构建与打包已在本机 Ubuntu 26.04（GTK 4.22／WebKitGTK 6.0 2.52）通过**（2026-11-23）：`pnpm setup:workspace`、`pnpm check --target desktop`、`pnpm build --target desktop`、`pnpm package:desktop` 均退出码 0，产出 `apps/desktop/.nsh/out/红果` 与 `红果.tar.gz`；包内 `App` 的 `ldd` 无缺失库，启动后真实 GTK 窗口渲染出侧边栏与首页骨架，并在 `~/.local/share/dev.hongguo.desktop/` 建立 `guest.sqlite3`／`account.sqlite3`／`watch-statistics.sqlite3` 与媒体 lease 目录；`strace` 记录到 DNS 与多条 443 外连，说明 native core 的真实上游请求已发出。**限制：本机无 GTK 开发头文件，构建借用 `/tmp` 之外的隔离 sysroot（解包的 `libgtk-4-dev`／`libwebkitgtk-6.0-dev`／GStreamer dev 包）而非系统安装，因此该结论不等于「干净宿主按文档可构建」；安装包交互（桌面文件安装、启动器、N-1 升级）、真实数据能否在界面完成加载、以及窗口装饰仍未验收。**
- **桌面默认窗口尺寸此前缺失，本次修正**：`apps/desktop/nsh.json` 未配置 `"window"`，NSH 的 Linux 宿主回退到其内部 `390×844` 手机尺寸（`nsh-platform-linux-0.6.0/src/app.rs:207`），与 DESIGN「390px 窄窗口已退出产品范围／正式桌面按 1180×780、1440×1000 检查」冲突。已按 1180×780 写入 `window.defaultSize`，打包后 `app.json` 携带该值，X11 实测窗口尺寸由 390×844 变为 1180×780。**该尺寸只在 X11／XWayland 量化确认；GNOME Wayland 原生窗口未取得窗口几何证据。**
- **Linux 窗口无边框／阴影：0.6.1 未改变，且原先的 Yaru 归因被受控实验证伪**（Linux 平台限制，不阻塞 MVP）。`nsh-platform-linux` 的 `src/system.rs`（运行时改写 `gtk-application-prefer-dark-theme`／`gtk-interface-color-scheme` 处）在 0.6.0 与 0.6.1 之间 md5 一致；该 crate 两版唯一源码改动是 `src/native.rs` 的视频 `paused` 状态。0.6.1 打包后窗口仍报 `Theme parser error: Failed to import resource:///com/ubuntu/themes/Yaru/4.0/gtk.css`，`_GTK_FRAME_EXTENTS` 仍为 `25,25,25,25`。**该警告不影响装饰绘制**：PyGObject 探针执行与 NSH 相同的两个 `set_property`（报该警告）与不执行（不报）两种模式，其窗口 `xwd` 输出逐字节相同（450×387，md5 一致）。**真正待判的是合成器**：本机 X 会话 `_NET_WM_CM_S0` 为 `not found`（无合成器），16/24 位 `xwd` 的 25px 边距区读到纯黑且不含 alpha，因此**窗口装饰在本机仍未取得通过或失败的可靠视觉证据**。下一步：在带合成器环境（GNOME Wayland 原生会话或 Xvfb+picom）取 32 位 ARGB 截图判定，再决定是否需报 NSH 上游。
- **NSH 0.6.1 升级的影响面已逐项核查**（2026-11-23，本机 Ubuntu 26.04）：`.nsh-version`、`Cargo.toml` 三个 `nsh-*`、`tooling/tv-toolchain.json`（version+commit `2f51d86`）、CLI 与 `Cargo.lock` 五处一致。`Cargo.lock` 仅 8 个 `nsh-*` 包换版本号与 checksum，**无新增／删除包，第三方依赖未动**。`pnpm verify` 退出码 0：245 项 NSH 测试全过（web 75.6s／desktop 785.2s／tv 675.5s），`release:check` 返回 ok；`pnpm security` 退出码 0。`nsh-updater` 源码与 0.6.0 完全相同（仅 `Cargo.toml` 版本行），更新清单签名格式不变。**未验证／受影响项**：①本机无 `~/.nsh/runtime/android`，TV 打包与真机验证未做；②`packages/app/test/history-management.tsx:481` 那条仅为 TV 跳过的用例在 0.6.1 下**仍失败**（临时启用后 177/178，`id:history-fixture-detail-return` 5s 未出现；`active:true` 已能正确上报，但详情面板仍未切换），跳过标记保留；③Windows／Linux 真机安装与 N-1 升级仍未验。
- macOS 为 ad hoc 签名，无 Developer ID／公证，按已确认决定由用户手动放行；MVP 发行验收需在 macOS 真机上补齐签名路径。
- `v0.1.0` 的 tag 在功能分支上，不符合发布规范；`v0.1.1` 是第一个从 master 发布的版本。
- **N-1 → N 桌面升级已在真实宿主机通过**（2026-11-21，本机 `/Applications/红果.app`）：机器上原装 `0.1.0`（build 1），经应用内更新路径升级后 `Contents/Info.plist` 为 `0.1.1`（build 2），`updates/` 目录 mtime 与换入时刻一致（08:49），`update-expected-version` 回执已被启动流程消费（读一次即删，符合 `apps/desktop/native/src/updates.rs` 的 `confirm`），升级后的 `0.1.1` 新进程正常启动并成为活动窗口（pid 40300）。服务端侧同步核对：`releases/latest` 302 到 `v0.1.1`，`latest.json` 返回 version `0.1.1`、URL 与 sha256 均指向该 Release。**该结论只覆盖 macOS arm64 与应用内更新路径；强制终止后回执报「上次更新未完成」、立即重启失败后退出仍完成换入两条分支仍待补，Windows／Linux 升级按平台限制记录。**
- `release-signing` environment 保护为空，发布 job 不挂 environment；无 SBOM／provenance／NOTICE。

### 安全

`cargo-deny` 的 bans／sources 通过；依赖已升到 NSH 0.6.1（`Cargo.toml:45-47` 的 `nsh-base`／`nsh-core`／`nsh-engine`）。2026-11-20 按[依赖检查](./dependencies/native-release-security.md)给 4 项许可证与 2 项 unmaintained advisory 补精确版本例外后，`deny.toml` 保留 bans／sources 与全局 `allow`，`unused-ignored-advisory = "deny"`（`deny.toml:17-21`），`pnpm security` 退出码 0。2026-11-23 升到 0.6.1 后 `pnpm security` 仍退出码 0（advisories／bans／licenses／sources 全 ok）；同两条 advisory 的 `chrono 0.4.45`／`ttf-parser 0.25.1` 在 0.6.1 依赖图中未变，例外继续适用；`deny.toml:105` 的 `webpki-roots` 许可证例外在 0.6.1 依赖图中未命中，只产生 `license-exception-not-encountered` warning，不影响门禁结果。

- `pnpm security` 只按根工作区跑 `cargo deny --locked check`（`tooling/src/cli.mjs:338-341`，cwd 固定为仓库根），NSH 生成宿主锁文件（`apps/*/.nsh/rust/Cargo.lock`，含 bincode 1.3.3、syntect、two-face）不在其范围。
- 两条 advisory（chrono 0.4.45 RUSTSEC-2026-0543、ttf-parser 0.25.1 RUSTSEC-2026-0192）均无修复版本，到期 2027-02-28；根门禁按精确版本例外放行，`v0.1.0` 即在该策略下发布，宿主锁文件仍未纳入同一策略。
- 单独 `pnpm audit --audit-level moderate` 此前实测 exit 0（见[依赖检查](./dependencies/native-release-security.md)「尚未完成的验证」）；SBOM／provenance／NOTICE 与 Gitleaks 均未接入 `.github`（`grep -rIl` 为空）。

## 开放问题与下一步

| 问题                                 | 证据／影响                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 下一步                                                                                                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 原生 409／PLAYBACK_IDENTITY_MISMATCH | `desktop-native-2026-11-15T10-19-31Z/` 及 `account-live/public-media-probe-diagnostic-2026-11-15.log`                                                                                                                                                                                                                                                                                                                                                                                                                         | 保留身份校验；用已有诊断区分来源；后来的成功不解释旧失败                                                                                                                                                                                               |
| 真实详情／系列超时                   | 最新 Web 轮次 `2026-11-15T09-27-22-243Z/` 在管理后打开保留项详情超时                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 最小复现并区分上游／产品／环境，针对受影响路径补验                                                                                                                                                                                                     |
| 真实播放间歇失败                     | `2026-11-15T08-21-31-073Z/` 和 `08-29-22-483Z/`，后者一次 UI 重试恢复但整轮仍失败                                                                                                                                                                                                                                                                                                                                                                                                                                             | 保留原始失败与安全诊断，单列恢复路径；不宣称稳定性通过                                                                                                                                                                                                 |
| 封面加载与 UI 证据不足               | 最新 Web 历史和失败详情仍有灰占位，原生错误页焦点仍在搜索框                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 补实际成功加载与错误／重试焦点观察；不从 JSON 或静态图推断                                                                                                                                                                                             |
| E1／平台剩余流程                     | 当前通知变更任务除 4.3 外已完成；三端 NSH 检查／构建／测试及通知功能／UI 审查通过                                                                                                                                                                                                                                                                                                                                                                                                                                             | 按端补正式入口真实流程；账号通知 4.3 仍开放，不自动关闭 E1                                                                                                                                                                                             |
| 供应链与发行阻塞                     | 根 `pnpm security` 通过，但两条 advisory 无修复版本、宿主锁文件不在根图；Windows／Linux 无安装包                                                                                                                                                                                                                                                                                                                                                                                                                              | 按依赖责任处理并保留门禁；macOS 与 TV 模拟器的签名、安装与升级通道按 §9 矩阵验收；两平台桌面按平台限制记录                                                                                                                                             |
| Linux 窗口无边框／阴影               | 0.6.1 未修复（`system.rs` 与 0.6.0 逐字节相同）；Yaru 归因已被受控实验证伪；本机无合成器，装饰未取得可靠视觉证据                                                                                                                                                                                                                                                                                                                                                                                                              | 平台限制，不阻塞 MVP；如需支持该平台，在带合成器环境取 32 位 ARGB 截图后报 NSH 上游                                                                                                                                                                    |
| TV 套件 flaky，根因未定              | `apps/tv` 下 `nsh test`（headless）连跑四次得到 11／0／0／10 个失败。抓到的一次失败是 `Error: rowCoverSize is not defined` at `packages/app/src/pages/Following.tsx:367`，而该文件的 `import { rowCoverSize } from '../business-row'` 在第 7 行，模块本身是无依赖的纯函数。这两个文件当时都是**工作区里他人未提交的改动**（`M Following.tsx`、`?? business-row.ts`）。CI 上同批次还报 `no pressable view matches id:nav-history`，因为 TV 导航只有 `nav-home`／`nav-discover`／`nav-rank`／`nav-mine`，桌面才有 `nav-history` | 未修，且不该由本轮修：先确认 `business-row.ts` 提交后是否复现。若仍 flaky，再查打包器对新模块的加载顺序。`nav-history` 那 9 项是共享套件缺 target 分支，需逐项判定该走 TV 层级还是只在桌面跑                                                           |
| 本机 web target 编不了 TV crate      | `apps/tv` 下 `nsh test --target web` 必然失败，`mio` 报 `crate::sys::*` unresolved（`UdpSocket::from_raw_fd` 类型不符等 48 处）。`cargo build -p hongguo-tv-native`（host target）38s 通过，连编两次稳定，所以 `mio 1.2.5` 与锁版本都无罪。`nsh.json` 只有 `"rust": "native"`，NSH 生成的 web crate 无条件依赖该 crate，`native-bridge` → `http-api` → `tokio/net` 因此进了 wasm；NSH 没有按 target 限定依赖的配置项                                                                                                          | 无需修：`nsh test` 不带 `--target` 就是 headless，走 host 编译，TV 套件正常跑（196 项约 20s）。**不要用 `--target web` 跑 `apps/tv`**；`apps/harness` 的 web target 正常（`UiPreview.test.tsx` 3s 通过）。本机若报 `mio` 先查是否误加了 `--target web` |

### 在本机跑各端套件

| 端      | 命令                          | 说明                                                            |
| ------- | ----------------------------- | --------------------------------------------------------------- |
| harness | `cd apps/harness && nsh test` | headless；也可 `--target web`                                   |
| desktop | `cd apps/desktop && nsh test` | headless                                                        |
| TV      | `cd apps/tv && nsh test`      | headless，走 host target。**不要加 `--target web`**，见上一条   |
| 单文件  | `nsh test App.test.tsx`       | 只跑一个文件；与跑整个目录的结果不必一致，判断 flaky 要连跑多轮 |
| 并行度  | `nsh test -j 1`               | 默认按核数并行，每个文件一个引擎。限制并行度可排除资源竞争      |

`nsh test` 会先跑该目录 Rust crate 的 `cargo test`。`apps/tv` 首次编译约 40s，之后增量。CI 里 `nsh test` 前会先跑 `pnpm setup:runtime`，因为它直接跑测试、跳过了 `nsh check`／`build` 这两个本来会写 `runtime.generated.json` 的命令。

## 证据索引

下表指向保留的历史章节；artifact 在忽略目录中，换机器时可能不可用。缺失产物时保持证据不可复现／待补，不凭文字继承通过。

| 证据                                                                                                               | 来源与限制                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [门禁与发布记录](./history/2026-11-20/gate-and-release.md)                                                         | 2026-11-20 工程门禁、master CI、首次发布产物实测与账号页构图评语；当前状态见本页矩阵                                             |
| [账号会话批次](./history/2026-11-15/account-session.md)                                                            | 真实扫码／同库恢复／退出的局部成功、账号历史整轮失败、游客公开路径与浅深色四图；工程门禁另记，不代证完整账号验收                 |
| [账号片库同步批次](./history/2026-11-15/account-library-sync.md)                                                   | 正常应用目录持久登录、真实云端历史及收藏往返已验；离线回归单列，播放、游客合并与平台视觉仍开放                                   |
| [账号追更批次](./history/2026-11-15/account-follow.md)                                                             | 固定协议、scope／凭证／失响应审查与正式共享入口；合成边界、真实只读及授权云写分开记账                                            |
| [账号更新提醒批次](./history/2026-11-16/account-notifications.md)                                                  | 真实来源协议与本机通知工程实现、三端 UI／状态回归；未替代正式账号变化、已读、重启和 owner 隔离验收                               |
| [账号预约批次](./history/2026-11-16/account-reservations.md)                                                       | 两组预约读取、item／series 身份、失败对账和共享 UI 的工程／源码审查；真实列表、云写、宿主和物理 TV 仍待验                        |
| [原生核心收尾审查](./history/2026-11-16/native-core-review.md)                                                     | C3.3 完整 verify、codegen、OpenSpec strict 与安全门禁结果；Desktop C3.2、物理 TV、安全发行仍待验                                 |
| [观看统计批次](./history/2026-11-16/account-watch-statistics.md)                                                   | 独立存储、真实 Player 采集、共享 History UI、完整 verify 和三端回归；真实播放、重启／重置和物理 TV 仍待验                        |
| [详情演员与相关作品批次](./history/2026-11-16/detail-actors-related.md)                                            | Web fixture 4/4、TV 输入适配 light/dark/1.3 通过；正式匿名 Web 因锁屏未进入搜索，不能代替真实验收                                |
| [排行榜与雷达统一设计批次](./history/2026-11-17/rankings-radar-unified-design.md)                                  | 原型桌面／TV 与产品端统一结构、macOS 宿主 radar 4／4 与 rankings 8／8、TV 视觉捕获 2／2；真实流程、物理 TV 与读屏仍未验          |
| [首页加载态统一批次](./history/2026-11-17/home-loading-unification.md)                                             | 静帧骨架状态模型、共享原语与 token、三端构建与组件回归；宿主 fixture 浅深色／TV 首屏 4／4；失败路径、读屏与正式宿主仍未验        |
| [设置页还原批次](./history/2026-11-17/settings-page.md)                                                            | 单列设置页与真实偏好、NSH Storage 持久化、当批源码三端套件与 Web／macOS／Android TV 模拟器截图；物理端、真实播放与签名升级仍待验 |
| [最新播放与最终工程检查](./history/2026-11-15/VALIDATION.md#实际播放进度确认--2026-11-15局部真实流程)              | Web 真实轮次失败、原生 409、一次原生诊断恢复、实际图像复核与最终 verify；诊断不算完整验收                                        |
| [播放状态与早期失败](./history/2026-11-15/VALIDATION.md#播放状态与原始失败诊断--2026-11-15真实复验未通过)          | 合成四态、搜索 504、只读准备 probe、磁盘不足和前序工程失败分开保留                                                               |
| [真实键盘管理](./history/2026-11-15/VALIDATION.md#e1-真实键盘取消与阅读锚点增量--2026-11-15仍为-713)               | 浅深各 10 段走完但发生播放重试，passed=false；合成长列表／锚点另记                                                               |
| [早期完整 Web 历史主链](./history/2026-11-15/VALIDATION.md#e1-chromium-真实主链终轮与清理复审--2026-11-15仍为-713) | 当轮 18 段真实流程与持久快照通过，仅对应其源码及范围，不能覆盖后来的失败                                                         |
| [详情真实流程](./history/2026-11-15/VALIDATION.md#真实数据验收标准与详情正向补验--2026-11-15)                      | 正式入口真实搜索／相关返回；演员、切季及平台边界分别保留                                                                         |
| [TV 独立真实业务](./history/2026-11-15/VALIDATION.md#c31--tv-原生官网观看与持久续播)                               | 固定 API34、当时 APK、无电脑 API／reverse、三组 watch18＋resume7 及 SQLite，含有限重试；非物理 TV                                |
| [旧工程／T0／迁移前结果](./history/2026-11-15/VALIDATION.md)                                                       | 只保留当时平台、入口、源码与数据来源，不能当作当前产品已验收                                                                     |
| [组件还原与覆盖](./design/component-implementation.md)                                                             | 当前公共实现及已知限制；逐轮审查从该页进入历史，不重复维护全局完成状态                                                           |

## 后续怎样更新

只更新受影响范围的状态与未验要点；一个结果只维护一处，不向 README、路线、每份设计交接同步长篇叙事。需要保留新完整运行记录时放在 `docs/history/` 的对应批次文件或忽略的 artifact，并从本页链接。证据关联源码身份、入口／包、真实／合成数据来源、平台、时间、操作、结果和限制。

产品／契约／共享控件／宿主变化后按影响更新适用证据；纯文档整理不重跑产品构建，也不改写 OpenSpec 任务或验收结论。下一开发批次遵循[实施路线](./implementation-roadmap.md)。
