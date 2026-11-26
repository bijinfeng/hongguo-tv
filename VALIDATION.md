# 当前验收状态

更新：2026-11-25。完整 MVP 尚未完成。验收规则唯一来源为 [ENGINEERING §9](ENGINEERING.md#9-安全测试与可观测性)，实现缺口维护在[功能台账](docs/feature-ledger.md)，本页只维护当前验收矩阵、开放失败与证据索引。

正式入口的真实数据／实际流程是功能验收依据；合成数据只记边界回归。工程门禁、局部真实流程、恢复诊断与整体验收分开记账，保留全部失败。逐轮运行正文在 [history](docs/history/README.md)，本页不追加过程叙事。

## 状态总览

| 范围                     | 状态             | 未验要点                                               |
| ------------------------ | ---------------- | ------------------------------------------------------ |
| 工程门禁                 | 通过             | 根工作区通过；不含签名、安装、升级与真实流程           |
| Web 内容发现／详情       | 部分验收         | 分类／榜单／日历／推荐、真实切季逐项待验               |
| 取源协议（共享 core）    | 已修复待宿主实看 | 模型与媒体就绪已验；首帧／进度／后台未验               |
| Web 真实播放             | 部分验收         | 后续详情／系列超时；深色与清空未执行                   |
| Desktop native           | 部分验收         | 旧 409 未解释；续播入口、全屏、后台、稳定性            |
| TV v4组件化重设计        | 已实现、部分验收 | 上游真实播放失败；账号、完整IME、读屏、物理TV与4K待验  |
| TV native                | 部分验收         | 仅当时 APK；当前包、物理 TV、纯遥控、硬解、长播        |
| 游客历史 E1              | 部分验收 12／13  | 完整真实焦点／长列表／后台、Desktop native／当前 TV 包 |
| 基础组件／还原           | 部分验收         | 全状态截图、人工 IME、读屏、大字、逐帧动效             |
| 首页加载／占位           | 部分验收         | 失败／隐藏分支、读屏、真实慢网、正式宿主               |
| 排行榜／榜单雷达         | 部分验收         | 真实账号流程、物理遥控、读屏、真实时延                 |
| 账号／云同步／个人记录   | 已实现待真实验收 | 账号播放／进度上传、游客合并授权、其他端登录           |
| 我的账号页面构图         | 已实现待正式验收 | 真实登录／同步、物理遥控、系统大字                     |
| 账号追更／预约／更新提醒 | 已实现待真实验收 | 真实账号变化、预约写读、已读、重启、owner 隔离         |
| 观看统计                 | 部分验收         | Desktop／TV、重启恢复、重置、账号切换、物理 TV         |
| 设置／维护／更新         | 部分验收         | 物理端设置、真实播放偏好、签名升级、诊断／许可         |
| TV 诊断上报              | 部分验收         | 业务失败实际上报、未捕获异常进程收敛、物理 TV          |
| 平台与发行               | 首发完成         | Windows／Linux、公开 Web、签名公证、N-1 升级、SBOM     |
| 安全                     | 根门禁通过       | 宿主锁文件不在根图；两条 advisory 无修复版本           |

## 未验与阻塞

### 工程门禁

2026-11-25 TV v4 工作区的 `pnpm verify` 通过；三端 check／build、UI 验收入口 check＋build、design:check 与 ui:icons:check 另有通过记录。当前命令和范围见下方 TV v4 项。2026-11-20 的 security 与 master CI 结果仅覆盖当时源码，见[门禁与发布记录](docs/history/2026-11-20/gate-and-release.md)，不作为本次 CI／发行证明。

- Rust 显式联网 probe 跳过 1 项，headless 有 warning。
- 门禁只覆盖本机工作树的根工作区，不含签名、安装、升级与真实流程。

### Web 内容发现／详情

正式 Web 入口在 macOS 图形宿主及 Chromium 的部分真实搜索、详情／相关返回已有证据；演员／相关共享页面 Web fixture 4/4 通过。

- 演员、完整分类／分页／榜单／日历／推荐、真实切季／自动续季等逐项待验。
- 2026-11-16 正式匿名演员／相关流程因 macOS 锁屏停在首页；旧合成宿主通过不计功能已验收。

### Web 真实播放

最新 Chromium 浅色三次真实播放有进度增长，暂停稳定、恢复增长，季状态同步。

- 后续详情／系列超时使整轮失败，深色与后续清空未执行；播放稳定性、真实后台等未关闭。

### 取源协议（跨端共享 Rust core）

2026-11-24 修复 Mobile-v5 签名缺项后，真实取源恢复。核心证据：`playback_probe --live` 对「重生」「甜宠」「逆袭」「穿越」四个真实搜索入口均取得模型并准备出媒体（HEVC 1080P／720P，3.94–10.16 MB）；正式 `GET /api/v1/play/info` 返回 `ok:true`／`hevc`／`1080P`，媒体代理 Range 为 `206` + `video/mp4`，下载整文件经 `ffprobe`（HEVC 1920×1080 + AAC 91.37 秒）与 `ffmpeg -f null` 全片解码无错误。

- 修复前同一入口在「重生」上 9 路来源全部 `PLAYBACK_SOURCE_EMPTY` 并失败；`video_tab` 在修复后仍为空，实际取得模型的是 v5，因此不能把结论外推到其它来源。
- 这是取源与媒体准备证据。各宿主播放器首帧、进度、暂停恢复、后台、硬解与物理设备仍分别按 Web／Desktop／TV 小节验收，不因本条视为播放已通过。
- 本机未执行三端 UI 实看；结论限于上述命令与 HTTP 入口。

### Desktop native

正式入口真实搜索／详情成功；最新同账号同剧实际播放 8→87 秒、暂停后恢复至 160 秒，SQLite 进度和同步 ACK 已观察。

- 旧 409 仍未解释，首帧截图／远端原始进度回读未验。
- 随后重开遇到热更新后进程存活但零窗口，未能观察续播入口。
- 完整管理、后台、全屏、稳定性继续待验。

### TV native

C3.1 的固定 API34 模拟器三组真实观看／切集／后台／重启续播有证据，包含有限重试恢复。

- 仅对应当时 APK 和所列操作；当前包完整新功能／E1 主链、物理 TV／纯遥控全流程／硬解／长播未验。

### TV v4 组件化重设计

源码：当前主工作区 `b7d577d` 加未提交变更；NSH 版本以 `.nsh-version` 为准，本轮为 0.6.0。功能保留与拥有者见[实施映射](openspec/changes/compose-tv-v4-from-shared-components/design.md#实施映射与功能保留)，本项不代表完整 MVP 或正式发行完成。

| 验证                 | 实际结果与范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程与组件           | `pnpm verify`、三端 check＋build、ui:check、design:check、ui:icons:check 通过；Rust 420／420（另跳过 1）、Web 178／178、Desktop 259／259、TV 191／191（另跳过 1）；UI 公共回归 19／19，日期组件 4／4，历史管理 Web 25／25，布局几何 3／3。千集选集回归已验证范围跳至末组、锁定项不可激活、浏览不改变实际播放身份，以及外部切集后范围同步。合成边界不计功能验收。                                                                                                                                                                                                                                                                  |
| Android 页面与组件   | 固定 API34 arm64 AVD；标准浅深色覆盖 20 个产品页面／子视图和八组同源组件。另有 720p 100%／130%／200%、1080p 130%／200% 五组，各完成 28 张截图。只证明所列页面就绪和截取视口，不代表所有滚动内容、所有状态或读屏已验。                                                                                                                                                                                                                                                                                                                                                                                                             |
| 保守安全区与大字矩阵 | 1080p／200% 的浅深色另完成 20 个页面／子视图及八组同源组件，共 56 张截图；通过 NSH Android 测试宿主注入安全区并实际读回 `27／48／27／48`，每组文字倍率读回为 2，120 点宽控件布局为 120×56。人工复核两组 20 个页面首视口的字级、换行、间距、对齐、配色及可见反馈；长内容仍由页面滚动承载，不将首视口当作全部内容验收。证据为 `artifacts/tv-visual/android-conservative/manifest.json`；它证明受控安全区环境中的 Android 绘制，不证明物理过扫描或非零真实系统 insets。                                                                                                                                                              |
| 原生逻辑尺度         | 1080p／density 320：window 960×540 points、pixelRatio 2；720p／density 213：约 961.50×540.85 points、pixelRatio 1.33125。系统字号 1／1.3／2 下，120 点宽的按钮实测最小高度约 36／41.3／56 点；字号只缩放一次。系统 insets 当轮均为 0；标准内容安全边距和焦点余量在根应用。                                                                                                                                                                                                                                                                                                                                                        |
| 焦点与影院           | `pnpm test:tv-player` 浅色、深色和 130% 各 26／26；安装的是显式 HTTP fixture 预览 APK，真实 Android media surface 解码自制 12 秒视频，覆盖暂停、定位预览／取消、媒体键、原生参数层与嵌套选择、逐层返回及来源恢复，新增顶部设置入口的原生返回检查。截图观察到单一焦点框，不能外推为所有控件动态失能恢复、人工 IME 或物理遥控已验。                                                                                                                                                                                                                                                                                                 |
| 原生浏览交互         | 当前可交互 AVD 的浅色 100%、深色 100% 和 130% 各 73／73。显式 HTTP fixture 覆盖网格虚拟化、分页失败／重试／末页、精确来源、较新意图、演员及中文输入；组合使用无障碍定位与 DPAD，定位目标须进入实际视口后才允许聚焦。原助手过滤屏外已挂载节点，并在大字减列后被固定总时限提前中断；现复用同帧树，以视口进展检测停滞并限制遍历页数，未减少业务断言。最新逐组结果、日志和源码摘要在 `artifacts/browsing/current-reveal-verification.json`；旧失败保留在 `artifacts/tv-input-native/focus-source-native-gates.json` 及所列日志。合成 HTTP 不计真实服务验收。                                                                          |
| 200% 追加交互        | 系列／季 33 项、综合浏览 76 项及演员专项 25 项通过；播放器 27 项通过，最新出口与原生包恢复均通过，见 `artifacts/tv-visual/extra-large-native-gates.json`。演员首个作品返回曾落到返回按钮：同排长标题撑高整行，按整行居中使较短源卡片移出视口。共享集合现按准确卡片、List 视口与当前滚动位置修正偏移；保留可见范围、集合和新意图检查。定向集合回归 4／4、最新三端工程门禁及综合原生复验通过；原始失败日志、截图与原生树在 `artifacts/browsing/unequal-row-before/`。错误、关键词、重试及播放动作／选集分别滚动验证，不要求大字下同时出现在同一视口；浏览仍检查返回后保留第59集所在段。数据为合成，真实服务与物理设备限制继续开放。 |
| 原生组件交互         | `pnpm test:tv-components` 把同源 Gallery 装入生产 TV 宿主；浅深 × 100%／130%／200% 六组共 139 项检查通过，最后一组关闭系统动画并读回 reduced motion。覆盖四类弹层初始／返回焦点、静态正文拒绝动作焦点、pending 焦点交接／拒绝程序聚焦／恢复、长中文 InputConnection 组合提交、遥控字母／数字、退格与清空。覆盖设置错误旁恢复动作、恢复不改原值、恢复按钮移除后的有效焦点。修复了 Dialog 无名背景遮罩抢占候选与背景窗口旧轮廓未及时重绘。截图复核单一轮廓；系统设置和正式入口安装均已恢复。此结果不覆盖人工 IME 候选选择、TalkBack 或真实业务。                                                                                    |
| 正式设置与信息页     | 同一原生包在浅色100%、深色130%、浅色200%、深色200%四组，每组顶栏3项，加DPAD确认与无障碍focus/click两条设置信息路径各16项，共140项通过。使用完整原生View bounds核对六个顶栏入口不重叠、不出界；遥控遍历末项、读取真实版本与许可、进入只读区域并滚至MIT、确认不动作、Left回原分类、Back回设置来源并保留首页实际滚动位置均通过。未改变保存偏好或用户记录。证据为 `artifacts/tv-input-native/focus-source-matrix/`。                                                                                                                                                                                                                  |
| 正式原生包与真实服务 | 当前正式入口的原生 debug 包，无电脑 API／adb reverse；真实中文查询、上游结果、遥控聚焦、详情及开始观看操作共通过 7 项。第一集播放在一次可见重试后仍显示“播放失败：服务暂时不可用，请稍后重试”，未取得首帧；进度、后台、SQLite／重启链未执行。证据为 `artifacts/playback/native-business-tv/focus-source-recheck/`，日志 `.local/tv-real-primary-watch-after-focus-fix.log`。脚本原先假定首屏可见第1集，486集长详情使该前提失败；现使用实际“开始观看”主操作，不跳过媒体时钟检查。                                                                                                                                                  |
| 真实搜索与分页       | 正式原生入口以已提交中文最近词“重生”取得真实结果；DPAD 到首尾并追加下一页，保留旧页，观察到新增 8 个身份；从第二页真实详情 Back 后，恢复 `drama-7702048804177972249` 和原查询。向 AVD 注入限速／时延后呈现超时和重试，草稿保留，网络恢复后重试得到真实服务响应。唯一英文验收词被服务返回推荐内容，未观察到真实空响应；空态仍由合成边界验证，不能混称真实空结果。已有搜索／观看记录保留，验收词留在最近搜索中。证据为 `artifacts/tv-visual/real-search/summary.json`；中文系统 IME 证据见下文。                                                                                                                                    |
| 真实账号局部流程     | 用户完成正式入口登录后，TV 账号身份与“已同步”可见；强制关闭／重开仍登录并读到真实继续观看记录。《儿媳的反转》收藏添加、列表读回、重启保留及取消后空列表均观察；追更与待上线预约初始为空。另从真人剧综合／最新排序各读取六个真实条目，均显示“已完结”且追更禁用，未触发追更写入；这是所查12条的结果，不推断整个服务无连载内容。证据为 `artifacts/tv-visual/real-follow/summary.json`。《春山不眠》从真实未来日历预约成功并在预约列表读回，AVD 冷启动及原生包更新后仍保留；已取消本轮测试预约，刷新后为空。该短剧第一集在一次可见重试后仍服务不可用、未取得首帧；不证明账号进度上传。证据为 `artifacts/tv-visual/real-account/`。    |
| 真实筛选与日历返回   | 正式原生包的真实类型、题材、排序切换已观察：漫剧有真实结果，漫剧＋动作＋最新返回诚实空状态；切回真人剧后返回真实结果并保留最新排序，无效题材由原 controller 协调。日历切至 20261119 后内容更新，DPAD 进入真实详情再 Back，原日期及精确卡片焦点恢复。未写片库或观看历史；证据为 `artifacts/tv-visual/real-browsing/`。                                                                                                                                                                                                                                                                                                             |
| 真实首页与错误恢复   | 当前正式原生包观察到真实 Hero、目录和已有账号的三条续播内容。通过 [Android Emulator 网络模拟](https://developer.android.com/studio/run/emulator-console)向这台测试 AVD 注入时延／限速：冷启动首页呈现加载、失败时不补造推荐、重试后恢复真实 Hero／目录；找剧保留上次结果并说明筛选未生效，恢复网络重试后显示所选漫剧；日历保留选中日期、不混入其他日期卡片，重试后取得该日期真实内容。网络已恢复无限速／零时延。证据为 `artifacts/tv-visual/real-home/` 与 `real-network-recovery/`。这是实际入口和真实服务上的故障注入，不是自然上游故障或 HTTP fixture。                                                                        |
| 个人入口与次级导航   | 新原生包用 DPAD 确认进入观看记录／收藏／追更／预约／更新提醒，Back 均恢复“我的”对应按钮；只读观看统计页与正式雷达入口可达，未删除记录、重置统计或标记通知。修复前遥控进入历史后返回落到 `nav-mine`；现在 store 单独保存“我的”来源回调，详情卡片返回不覆盖它，切换主入口清除。共享回归另覆盖五入口、详情和重复返回。真实证据为 `artifacts/tv-visual/real-navigation/`，修复前证据为 `real-navigation-before-source-fix/`。演员页沿用上述三档浏览 fixture，提醒／雷达浅深及大字视口见页面矩阵；未观察的真实演员与完整提醒操作仍开放。                                                                                               |
| 系列／季原生浏览     | 复用生产 App 和 Java 适配层的独立测试包，浅色、深色、130% 各 33 项，另补 200% 33 项通过；涵盖方向移动不提交、确认切季、待上线／不可观看、503 重试、真实可见选集身份、详情返回及浏览不写历史。脚本使用 TV 主题和生产品牌资源／诊断依赖，诊断 DSN 为空；严格 fixture 仅新增当前首页目录的精确只读请求。大字恢复后先遥控滚动到选集，再验证身份，不能将屏外节点当作可见成功。证据为 `artifacts/seasons-ui/current-tv-v4.json`，恢复错误为空。数据与媒体为合成，不替代真实系列、续季、账号或物理设备验收。                                                                                                                             |
| 4K 模拟限制          | AVD 请求 3840×2160／density 640 后，截图仍为 1920×1080，宿主实测 window 480×270、pixelRatio 4，导航布局截断且页面切换检查失败。该 override 不构成可用的 4K UI 输出；保留失败并恢复原分辨率／density／字号，物理 4K 继续未验。                                                                                                                                                                                                                                                                                                                                                                                                     |

共享偏好回归用Storage stub验证第一次保存失败、连续重试仍定位原字段、成功后按原意图持久并重开读回；这不是原生真实磁盘故障验收。SettingsRow仅提供受控恢复动作，theme、普通播放偏好、quietWatching及autoCheckUpdates沿用原保存owner；诊断同意仍按宿主授权处理。直接ACTION_FOCUS后立即ACTION_CLICK打开设置曾在返回时落到旧海报；宿主现于来源被移除时保留同一来源记录，并推迟到pre-draw处理焦点，避免页面更新中途聚焦旧内容。负向检查发现只恢复目标仍会把首页垂直位置从0滚到565像素；修复后200%深色的同一路径16项通过，位置为0→0。对照证据为 `artifacts/tv-input-native/focus-source-before/`；完整TalkBack遍历、播报与输入仍未验。

正式原生包还完成了系统 Gboard 12.8 TV 的中文候选流程：临时启用简体中文，输入 `chongsheng` 后出现真实拼音组合及“重生”候选，DPAD 上键选择、确认提交，Back 仅关闭输入法并保留草稿，Enter 提交后得到真实搜索结果。输入法已恢复“使用系统语言”，临时中文语言已关闭，原英文设置保留。证据为 `artifacts/tv-input-native/`；这证明所列模拟按键下的系统 IME 流程，不是产品拼音转写能力或物理遥控验收。其他 IME、200% 下的完整候选路径与完整读屏仍待补。

系统 TalkBack 14.0 leanback 的局部验收发现绿色系统框与宿主外框叠加，宿主现随公开 `AccessibilityManager` 触摸探索状态让出绘制权，并在模式变化时重绘、销毁时解除监听。实际原生包验证：同一导航控件的应用外框像素从 208 降为 0，系统绿色框保留；方向键只移动焦点、确认进入找剧，Back 返回精选，再打开退出确认时取消获得系统焦点。关闭 TalkBack 后同一页面恢复应用外框，系统绿色框消失。已恢复原无障碍设置。证据为 `artifacts/tv-input-native/talkback-*.png` 与 `talkback-summary.json`。TTS 引擎已连接，但 AVD 使用 `-no-audio`，本轮没有听辨或转录播报；完整遍历、读屏输入和物理设备仍未验。

原生宿主已避开匿名容器生成完整模态可访问子树的递归路径；此前在可交互 AVD 观察到两次输入 ANR，现只在对话框定位时过滤匿名布局，Select portal 继续按公开 ListView 语义识别。当前播放器三组各 26 项、同源组件六组共 139 项通过；来源移除与 pre-draw 交接修复另由上述 140 项覆盖。相关旧失败在 `.local/tv-player-current-host.log`、`.local/tv-player-semantic-scope.log`、`.local/tv-player-list-scope.log`，只保留作追溯，不把单轮通过当作压力稳定性证明。

可交互配置的后段分页定位经助手修正后，最新三档各 73 项通过；旧失败与当时源码摘要保留，结果以表中当前记录为准。旧组件末组未进入编辑已补实际获得焦点及 UI idle 等待，最新六组通过；旧播放器末次媒体键切集失败在最新三组未复现，但偶发触发均未完全锁定。失败证据保留在 `artifacts/ui-components/native-tv-interactive-focus-failure/`、`.local/tv-components-after-screen-reader.log`、`.local/tv-components-observed-focus.log`、`.local/tv-redesign-player-before-retry.log`、`.local/tv-redesign-browsing-before-*.log` 与 `.local/tv-redesign-browsing-large-debug.log`；一次截图返回空也未据此宣称根因已解。

圆角、字级、间距、对齐、配色与可见状态已用所列浅深／大字视口复核；hover／pressed 另有共享回归。完整逐帧动效、全部减少动效路径、完整 TalkBack 遍历／播报／输入、其他 IME 及 200% 候选流程、物理 overscan／非零真实系统 insets、物理遥控和观看距离仍未覆盖。用户确认目前只有模拟器，物理 TV／4K 保持未验；账号仅覆盖表中局部写读，未清空原有记录。

证据在本机 ignored 目录：`artifacts/tv-visual/android/manifest.json`、`artifacts/tv-visual/android-matrix/manifest.json`、`artifacts/tv-visual/web/manifest.json`、`artifacts/playback/tv-apk/`、`artifacts/ui-components/native-tv/summary.json` 与 `artifacts/playback/native-business-tv/installed-native.json`。矩阵 manifest 保留最新五组各 28 张完成截图与 4K 失败（总计 141 张，含 4K 局部截图）；当前工程门禁日志为 `.local/tv-final-verify-after-unequal-card-fix.log`，网络恢复日志为 `.local/tv-real-timeout-recovery.log` 与 `.local/tv-real-home-timeout.log`；其他旧命令保留在 `.local/tv-redesign-*.log`。真实业务各轮安装包与截图保留在对应证据目录，不能将旧包的流程结果当作当前包的全量复验。当前正式入口的独立 native debug 预览包身份统一记录在 `artifacts/tv-visual/current-native-package.json`；对应 `current-native-home.png`，不在此复制易过期的摘要。该包仍是调试预览，不是签名正式发行。

### 游客历史 E1

管理实现与写屏障已接；共享 History 管理回归 headless 25／25 通过（唯一跳过项是 TV 目标的 `detail return restores…`，原因与替代覆盖见[功能台账](docs/feature-ledger.md)）；冻结源码 `pnpm verify` 通过；正式 Web 有真实记录、取消／单删／所选删／清空、部分跨重启证据；真实键盘管理有局部证据。

- 管理切片当前 12／13；后续运行的播放错误和详情超时保留。
- 完整真实焦点／长列表／后台、Desktop native／当前 TV 包未整体验收。

### 基础组件／还原

公共实现、三端 check／build 和行为回归，macOS 桌面／TV 密度、部分 Android 模拟器及独立视觉审查有分项证据；主题已按新设计稿同步到 `packages/ui/theme.json`，组件稿 `theme.css` 由它生成，对比度按 WCAG 公式核算。

- 新主题与默认边框规则尚未在真实宿主逐项截图。
- 全家族所有状态、人工 IME、读屏、大字／距离、hover／pressed 与逐帧动效不能由样例或静态截图概括；见[组件矩阵](docs/design/component-implementation.md)。

### 首页加载／占位（共享 UI）

统一为静帧骨架模型，含 `skeleton`／`skeleton-surface` token 与 `SkeletonBlock`／`SkeletonRegion`；当批三端应用回归与宿主 fixture 截图见[批次记录](docs/history/2026-11-17/home-loading-unification.md)。

- fixture 未制造继续观看失败与精选区隐藏。
- 读屏实际播报、物理遥控与物理 TV、真实慢网／失败、正式 Web／Desktop 宿主截图未验证；骨架高度差只有视觉复核，未逐像素测量。

### 排行榜／榜单雷达（统一设计）

页面级来源 Tabs、雷达控件带、hairline 表格、TV 比例列宽与整行焦点已落地；macOS 宿主与 TV 视觉捕获见[批次记录](docs/history/2026-11-17/rankings-radar-unified-design.md)。

- 2026-11-19 `--anonymous-live` 对 `all/ranklist_hot_play_sc`、`ranklist_celebrity/ranklist_actor_fans`、`series_album/series_album_new_rank` 解析出 10／20／10 条真实条目；本机 Rust API + macOS 宿主以真实数据渲染（真实剧名、简介、`8907万热度`、`逆袭·全319集` 元信息、四行服务端分组名），截图 `artifacts/rankings-live/desktop/`；字段映射归[功能台账](docs/feature-ledger.md)。
- 宿主截图：TV `pnpm visual:tv --web` 960×540dp 浅／深（`artifacts/tv-visual/web/tv-rankings-{light,dark}.png`，viewport 记在同目录 `manifest.json`，source `f5cd6e8`）；桌面现存 `artifacts/rankings-ui/web/desktop/`，`artifacts/radar-ui/` 与 macos 目录已不在本机，原 radar 4／4 截图不可复现。
- 本机 `cargo nextest` 全量并行时 `lifecycle_tests::a_directory_alias_reopen_waits_for_the_original_session_to_drain` 偶发失败（单独运行 50／50 通过），属既有目录锁时序不稳定，与榜单链路无关。

- 正式入口真实账号流程；物理 TV／真实遥控的大字与 DPAD 全流程；读屏播报。
- 真实慢网与雷达过期／缓存提示；桌面列窗口在真实列宽下的可读性；TV 官方榜首屏密度。

### 账号／云同步／个人记录

正常 Desktop 私有目录保留凭证，关闭重开无需扫码；真实云端历史拉取及收藏添加／重开／同步／取消往返已验，前序扫码与退出证据另存。

- 账号播放／进度上传整轮仍未通过；本轮仅原生 AX 交互，截图权限不足。
- TV 正式入口用户已完成登录；身份、同步状态、重启持久与收藏往返见本页 TV v4 项。短信验证码曾进入 MFA，查询遇到过期；用户最终采用的登录方式未单独留证，不宣称短信／MFA 全流程通过。游客合并未授权；跨设备冲突、追更写入、完整预约及统计仍未完整验收。

### 我的账号页面构图

桌面与 TV 构图、深浅色、登录弹窗已截图并完成四轮视觉复评；过程、评语与三端账号回归见[门禁与发布记录](docs/history/2026-11-20/gate-and-release.md)。

- TV 本轮已观察真实登录后的账号与同步状态，证据见 TV v4 项；物理遥控、真实账号系统大字及完整同步仍待验。旧构图评审使用合成服务响应。
- TV 以轻标题＋按钮带替代第二列与卡片容器属端型适配，不作为桌面还原度的一部分。

### 账号追更／预约／更新提醒

追更与预约真实来源比较、预约身份／分页／失败对账、通知本机持久化、HTTP/native parity、已登录 loopback 正向／未确认 parity、core-client scope fencing、Desktop／TV 共享列表和首次加载／返回焦点回归通过。

- TV 正式入口的单条预约写入／列表／重开／取消／刷新为空见本页 TV v4 项；追更写入、单条／全部已读、owner 隔离及 Web／Desktop 对应完整流程仍待验，合成回归不替代真实验收。

### 观看统计

独立 owner／epoch SQLite、批次幂等／重置围栏、真实 Player advancing stream 接入、History 共享页面、HTTP/native parity、三端 check、core／app 边界回归、完整 verify 通过；真实 Web 浅色首播约 30.6 秒已产生统计并在面板显示。

- 正式 Web 整轮因后续上游 `/play/info` 重播失败而未通过。
- Desktop／TV、跨主题／重启恢复、重置后不删历史、账号切换及物理 TV 尚未验收；合成数据不作为功能通过依据。

### 设置／维护／更新

设置页已实现主题、自动播放、记住位置、默认倍速、安静观看、账号入口、应用更新（仅宿主有 updater）与恢复默认；偏好经 NSH Storage 本机持久化；桌面经 NSH `installOnQuit` 暂存安装。

- 三端 app settings 回归各 4／4；三端套件 233（Web）／244（Desktop）／246（TV，1 跳过）在 `f5cd6e8` 源码上通过（`870f7e5` 提交说明另记「Web 142, Desktop 149, TV 151」，与本批口径不同且无留存日志可仲裁；当前工作树的套件总数本次未留存，不以任一旧数代当前值），`pnpm check`、`pnpm build`、`cargo nextest` 408／408 通过。
- 截图由三端设置宿主脚本（`nsh test … --target <web／macos／android>`，`tooling/src/settings-host.mjs:41`；Android 由设备自报尺寸，脚本不设窗口，`:15`）在 2026-11-17 生成，存于 `artifacts/design/settings/`；该目录当前不在本机，截图不可复现；同年 11-19 的 TV 960×540dp 浅／深设置页见 `artifacts/tv-visual/web/tv-settings-{light,dark}.png`。共享更新状态回归 7／7（含暂存、提前重启失败仍保留暂存、回执只报告一次）。
- 语言／缓存／预取／诊断／许可无真实数据源不展示。
- 物理 Android TV／桌面真机设置与遥控操作、安静观看／自动播放／续播行为的真实播放实看、正式签名升级仍开放。
- 桌面真实「准备安装 → 退出 → 下次启动为新版本」、强杀后回执报告「上次更新未完成」、立即重启失败后退出仍完成换入均未验。
- 离线剧集能力待核对，不以预取代证。

### TV 诊断上报

TV 设置页「诊断数据 → 发送诊断数据」默认关闭；打开后宿主以官方 `io.sentry:sentry-android:8.65.1` 初始化上报，创建／搜索记录／播放准备三类失败经 `diagnostics.report` 交给宿主。事件字段固定为 `category`／`code`／`operation` 加发行版标识，脱敏在 TSX 侧完成（URL 查询串与片段、Bearer／JWT、邮箱、手机号）；DSN 经 `TV_SENTRY_DSN` 注入，不进仓库。

- 工程门禁：`pnpm verify` 退出码 0（Web 255／Desktop 257／TV 182 项 NSH 测试，TV 1 项历史跳过；含本轮新增脱敏、旧偏好兼容与宿主通道用例）；`pnpm security` 退出码 0（cargo-deny advisories／bans／licenses／sources 全 ok）。
- TSX→宿主契约（TV 入口 `apps/tv/App.test.tsx`，用真实 category 失败路径，不是 mock）：未同意时零 `diagnostics.report`；同意后一次失败恰好一条上报，`category=catalog`、`operation=加载分类`，序列化结果不含 `http://`、`sign=` 或 `/api/v1/`，且 `category-error` 恢复界面照常出现。
- 2026-11-24 API 34 arm64 模拟器（`hongguo-tv-api34-arm64`）：同意关闭时启动无 `cache/sentry`、无 SDK 初始化；打开开关后 SDK 初始化，`.options-cache/release.json` 为 `"0.1.5+6"`、`environment.json` 为 `"production"`；重启后已存同意自动重放，`cache/sentry` 重新出现。直接向 DSN 端点投递 envelope 返回 `200` 与 event id，Sentry 问题列表出现对应条目（`HONGGUO-TV-1`）。
- **未验证**：引擎致命错误经 `NshView` 转发到 Sentry 的设备侧证据；后端不可达时用户可见行为不变；未捕获异常被 SDK 接管后的进程收敛。这三项需要能精确注入网络故障的环境（当前模拟器无 root，`/etc/hosts` 与 iptables 均不可用），留待物理设备。ANR 与 NDK 崩溃不在本变更范围。
- 真机踩到的两处与设计不符已在 `openspec/changes/add-diagnostics-reporting/design.md` 更正：纯 Java `io.sentry:sentry` 在 Android 上拒绝初始化；`sentry-android` 的 `SentryInitProvider` 会绕过同意，须以 `io.sentry.auto-init=false` 关闭。
- 桌面 `nsh.json` 未声明 `capabilities`，而 NSH 一旦出现该块就默认拒绝未列出的能力；因此诊断宿主测试注册在 TV 入口（TV 已有完整能力白名单），桌面 manifest 保持原样，不为其引入能力收紧风险。

### 平台与发行

2026-11-20 首次正式发布 `v0.1.0`；2026-11-21 从 master 发布 `v0.1.1`（源码 `722cbd8`，run 44764824518）。两次的 `quality`／`security` 前置 job 均通过，两端构建成功；`v0.1.1` 的产物已下载实测：APK 证书 `8d34d7e8…` 与 `tooling/release-policy.json` 一致（`CN=Hongguo TV Release`），两端 SHA-256 与各自清单一致，两份更新清单的 Ed25519 签名以配置公钥验签通过。发布细节与逐项未验见[门禁与发布记录](docs/history/2026-11-20/gate-and-release.md)。

- Windows／Linux 实际安装、公开 Web 会话隔离／部署、正式签名／公证／SBOM、无 Go 干净环境及完整产品矩阵未完成。2026-11-22 接入两平台的工程门禁：ci.yml entry 在 windows-2025／ubuntu-24.04 跑桌面行为测试，release-preview 的 `windows-preview`／`linux-preview` 产出未签名预览 ZIP／归档；两者首次流水线运行与产物真机验收均未完成，不据此宣称平台支持。
- **桌面发布流水线已扩到三平台（2026-11-24，仅源码改动，尚未跑过发布）**：`release-publish.yml` 的 `desktop` 改为 macOS／Windows／Linux 矩阵，各平台产 `<os>-<arch>` 命名的归档，由新增 `desktop-manifest` job 生成一份三平台 `latest.json`；新增 `tooling/src/desktop-archive.mjs` 按 `nsh-updater` 暂存规则复核归档（单一顶层目录、可执行文件、`nsh/app.json` 的应用 ID），preview 与 publish 共用。**证据只到工具层**：`update-manifest` 回归 7 项全部通过（本机装的是 NSH 0.6.1、仓库固定 0.6.0，固定版本那条断言只在把 `.nsh-version` 临时指向 0.6.1 时通过；已还原为 0.6.0，CI 装固定版本不受影响），`desktop-archive` 2 项通过；校验器对真实 `apps/desktop/.nsh/out/红果.tar.gz` 通过；用临时密钥对三平台归档（真实 Linux 包 + 合成的 macOS／Windows 包）跑通「生成记录 → 壳层签名 → 复验」，并确认删掉 Windows 平台键后即使签名正确仍被拒绝。**Windows runner 打包、三平台同时发布、Windows／Linux 真机安装与 N-1 → N 升级均未验，不宣称两平台已支持。**
- **Linux x64 源码构建与打包已在本机 Ubuntu 26.04（GTK 4.22／WebKitGTK 6.0 2.52）通过**（2026-11-23）：`pnpm setup:workspace`、`pnpm check --target desktop`、`pnpm build --target desktop`、`pnpm package:desktop` 均退出码 0，产出 `apps/desktop/.nsh/out/红果` 与 `红果.tar.gz`；包内 `App` 的 `ldd` 无缺失库，启动后真实 GTK 窗口渲染出侧边栏与首页骨架，并在 `~/.local/share/dev.hongguo.desktop/` 建立 `guest.sqlite3`／`account.sqlite3`／`watch-statistics.sqlite3` 与媒体 lease 目录；`strace` 记录到 DNS 与多条 443 外连，说明 native core 的真实上游请求已发出。**限制：本机无 GTK 开发头文件，构建借用 `/tmp` 之外的隔离 sysroot（解包的 `libgtk-4-dev`／`libwebkitgtk-6.0-dev`／GStreamer dev 包）而非系统安装，因此该结论不等于「干净宿主按文档可构建」；安装包交互（桌面文件安装、启动器、N-1 升级）、真实数据能否在界面完成加载、以及窗口装饰仍未验收。**
- **桌面默认窗口尺寸此前缺失，本次修正**：`apps/desktop/nsh.json` 未配置 `"window"`，NSH 的 Linux 宿主回退到其内部 `390×844` 手机尺寸（`nsh-platform-linux-0.6.0/src/app.rs:207`），与 DESIGN「390px 窄窗口已退出产品范围／正式桌面按 1180×780、1440×1000 检查」冲突。已按 1180×780 写入 `window.defaultSize`，打包后 `app.json` 携带该值，X11 实测窗口尺寸由 390×844 变为 1180×780。**该尺寸只在 X11／XWayland 量化确认；GNOME Wayland 原生窗口未取得窗口几何证据。**
- **Linux 窗口无边框／阴影：0.6.1 未改变，且原先的 Yaru 归因被受控实验证伪**。`nsh-platform-linux` 的 `src/system.rs`（运行时改写 `gtk-application-prefer-dark-theme`／`gtk-interface-color-scheme` 处）在 0.6.0 与 0.6.1 之间 md5 一致；该 crate 两版唯一源码改动是 `src/native.rs` 的视频 `paused` 状态。0.6.1 打包后窗口仍报 `Theme parser error: Failed to import resource:///com/ubuntu/themes/Yaru/4.0/gtk.css`，`_GTK_FRAME_EXTENTS` 仍为 `25,25,25,25`。**该警告不影响装饰绘制**：PyGObject 探针执行与 NSH 相同的两个 `set_property`（报该警告）与不执行（不报）两种模式，其窗口 `xwd` 输出逐字节相同（450×387，md5 一致）。**真正待判的是合成器**：本机 X 会话 `_NET_WM_CM_S0` 为 `not found`（无合成器），16/24 位 `xwd` 的 25px 边距区读到纯黑且不含 alpha，因此**窗口装饰在本机仍未取得通过或失败的可靠视觉证据**。下一步：在带合成器环境（GNOME Wayland 原生会话或 Xvfb+picom）取 32 位 ARGB 截图判定，再决定是否需报 NSH 上游。
- **NSH 0.6.1 升级的影响面已逐项核查**（2026-11-23，本机 Ubuntu 26.04）：`.nsh-version`、`Cargo.toml` 三个 `nsh-*`、`tooling/tv-toolchain.json`（version+commit `2f51d86`）、CLI 与 `Cargo.lock` 五处一致。`Cargo.lock` 仅 8 个 `nsh-*` 包换版本号与 checksum，**无新增／删除包，第三方依赖未动**。`pnpm verify` 退出码 0：245 项 NSH 测试全过（web 75.6s／desktop 785.2s／tv 675.5s），`release:check` 返回 ok；`pnpm security` 退出码 0。`nsh-updater` 源码与 0.6.0 完全相同（仅 `Cargo.toml` 版本行），更新清单签名格式不变。**未验证／受影响项**：①本机无 `~/.nsh/runtime/android`，TV 打包与真机验证未做；②`packages/app/test/history-management.tsx:481` 那条仅为 TV 跳过的用例在 0.6.1 下**仍失败**（临时启用后 177/178，`id:history-fixture-detail-return` 5s 未出现；`active:true` 已能正确上报，但详情面板仍未切换），跳过标记保留；③Windows／Linux 真机安装与 N-1 升级仍未验。
- macOS 为 ad hoc 签名，无 Developer ID／公证，按已确认决定由用户手动放行。
- `v0.1.0` 的 tag 在功能分支上，不符合发布规范；`v0.1.1` 是第一个从 master 发布的版本。
- **N-1 → N 桌面升级已在真实宿主机通过**（2026-11-21，本机 `/Applications/红果.app`）：机器上原装 `0.1.0`（build 1），经应用内更新路径升级后 `Contents/Info.plist` 为 `0.1.1`（build 2），`updates/` 目录 mtime 与换入时刻一致（08:49），`update-expected-version` 回执已被启动流程消费（读一次即删，符合 `apps/desktop/native/src/updates.rs` 的 `confirm`），升级后的 `0.1.1` 新进程正常启动并成为活动窗口（pid 40300）。服务端侧同步核对：`releases/latest` 302 到 `v0.1.1`，`latest.json` 返回 version `0.1.1`、URL 与 sha256 均指向该 Release。**该结论只覆盖 macOS arm64 与应用内更新路径；强制终止后回执报「上次更新未完成」、立即重启失败后退出仍完成换入两条分支，以及 Windows／Linux 升级仍未验。**
- `release-signing` environment 保护为空，发布 job 不挂 environment；无 SBOM／provenance／NOTICE。

### 安全

`cargo-deny` 的 bans／sources 通过；依赖已升到 NSH 0.6.1（`Cargo.toml:45-47` 的 `nsh-base`／`nsh-core`／`nsh-engine`）。2026-11-20 按[依赖检查](docs/dependencies/native-release-security.md)给 4 项许可证与 2 项 unmaintained advisory 补精确版本例外后，`deny.toml` 保留 bans／sources 与全局 `allow`，`unused-ignored-advisory = "deny"`（`deny.toml:17-21`），`pnpm security` 退出码 0。2026-11-23 升到 0.6.1 后 `pnpm security` 仍退出码 0（advisories／bans／licenses／sources 全 ok）；同两条 advisory 的 `chrono 0.4.45`／`ttf-parser 0.25.1` 在 0.6.1 依赖图中未变，例外继续适用；`deny.toml:105` 的 `webpki-roots` 许可证例外在 0.6.1 依赖图中未命中，只产生 `license-exception-not-encountered` warning，不影响门禁结果。

- `pnpm security` 只按根工作区跑 `cargo deny --locked check`（`tooling/src/cli.mjs:338-341`，cwd 固定为仓库根），NSH 生成宿主锁文件（`apps/*/.nsh/rust/Cargo.lock`，含 bincode 1.3.3、syntect、two-face）不在其范围。
- 两条 advisory（chrono 0.4.45 RUSTSEC-2026-0543、ttf-parser 0.25.1 RUSTSEC-2026-0192）均无修复版本，到期 2027-02-28；根门禁按精确版本例外放行，`v0.1.0` 即在该策略下发布，宿主锁文件仍未纳入同一策略。
- 单独 `pnpm audit --audit-level moderate` 此前实测 exit 0（见[依赖检查](docs/dependencies/native-release-security.md)「尚未完成的验证」）；SBOM／provenance／NOTICE 与 Gitleaks 均未接入 `.github`（`grep -rIl` 为空）。

## 开放问题与下一步

| 问题                                 | 证据／影响                                                                                                       | 下一步                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 原生 409／PLAYBACK_IDENTITY_MISMATCH | `desktop-native-2026-11-15T10-19-31Z/` 及 `account-live/public-media-probe-diagnostic-2026-11-15.log`            | 保留身份校验；用已有诊断区分来源；后来的成功不解释旧失败    |
| 真实详情／系列超时                   | 最新 Web 轮次 `2026-11-15T09-27-22-243Z/` 在管理后打开保留项详情超时                                             | 最小复现并区分上游／产品／环境，针对受影响路径补验          |
| 真实播放间歇失败                     | `2026-11-15T08-21-31-073Z/` 和 `08-29-22-483Z/`，后者一次 UI 重试恢复但整轮仍失败                                | 保留原始失败与安全诊断，单列恢复路径；不宣称稳定性通过      |
| 封面加载与 UI 证据不足               | 最新 Web 历史和失败详情仍有灰占位，原生错误页焦点仍在搜索框                                                      | 补实际成功加载与错误／重试焦点观察；不从 JSON 或静态图推断  |
| E1／平台剩余流程                     | 当前通知变更任务除 4.3 外已完成；三端 NSH 检查／构建／测试及通知功能／UI 审查通过                                | 按端补正式入口真实流程；账号通知 4.3 仍开放，不自动关闭 E1  |
| 供应链与发行阻塞                     | 根 `pnpm security` 通过，但两条 advisory 无修复版本、宿主锁文件不在根图；Windows／Linux 无安装包                 | 按依赖责任处理并保留门禁；签名、安装与升级通道各自验收      |
| Linux 窗口无边框／阴影               | 0.6.1 未修复（`system.rs` 与 0.6.0 逐字节相同）；Yaru 归因已被受控实验证伪；本机无合成器，装饰未取得可靠视觉证据 | 在带合成器环境取 32 位 ARGB 截图判定，再决定是否报 NSH 上游 |

## 证据索引

下表指向保留的历史章节；artifact 在忽略目录中，换机器时可能不可用。缺失产物时保持证据不可复现／待补，不凭文字继承通过。

| 证据                                                                                                                  | 来源与限制                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [门禁与发布记录](docs/history/2026-11-20/gate-and-release.md)                                                         | 2026-11-20 工程门禁、master CI、首次发布产物实测与账号页构图评语；当前状态见本页矩阵                                             |
| [账号会话批次](docs/history/2026-11-15/account-session.md)                                                            | 真实扫码／同库恢复／退出的局部成功、账号历史整轮失败、游客公开路径与浅深色四图；工程门禁另记，不代证完整账号验收                 |
| [账号片库同步批次](docs/history/2026-11-15/account-library-sync.md)                                                   | 正常应用目录持久登录、真实云端历史及收藏往返已验；离线回归单列，播放、游客合并与平台视觉仍开放                                   |
| [账号追更批次](docs/history/2026-11-15/account-follow.md)                                                             | 固定协议、scope／凭证／失响应审查与正式共享入口；合成边界、真实只读及授权云写分开记账                                            |
| [账号更新提醒批次](docs/history/2026-11-16/account-notifications.md)                                                  | 真实来源协议与本机通知工程实现、三端 UI／状态回归；未替代正式账号变化、已读、重启和 owner 隔离验收                               |
| [账号预约批次](docs/history/2026-11-16/account-reservations.md)                                                       | 两组预约读取、item／series 身份、失败对账和共享 UI 的工程／源码审查；真实列表、云写、宿主和物理 TV 仍待验                        |
| [原生核心收尾审查](docs/history/2026-11-16/native-core-review.md)                                                     | C3.3 完整 verify、codegen、OpenSpec strict 与安全门禁结果；Desktop C3.2、物理 TV、安全发行仍待验                                 |
| [观看统计批次](docs/history/2026-11-16/account-watch-statistics.md)                                                   | 独立存储、真实 Player 采集、共享 History UI、完整 verify 和三端回归；真实播放、重启／重置和物理 TV 仍待验                        |
| [详情演员与相关作品批次](docs/history/2026-11-16/detail-actors-related.md)                                            | Web fixture 4/4、TV 输入适配 light/dark/1.3 通过；正式匿名 Web 因锁屏未进入搜索，不能代替真实验收                                |
| [排行榜与雷达统一设计批次](docs/history/2026-11-17/rankings-radar-unified-design.md)                                  | 原型桌面／TV 与产品端统一结构、macOS 宿主 radar 4／4 与 rankings 8／8、TV 视觉捕获 2／2；真实流程、物理 TV 与读屏仍未验          |
| [首页加载态统一批次](docs/history/2026-11-17/home-loading-unification.md)                                             | 静帧骨架状态模型、共享原语与 token、三端构建与组件回归；宿主 fixture 浅深色／TV 首屏 4／4；失败路径、读屏与正式宿主仍未验        |
| [设置页还原批次](docs/history/2026-11-17/settings-page.md)                                                            | 单列设置页与真实偏好、NSH Storage 持久化、当批源码三端套件与 Web／macOS／Android TV 模拟器截图；物理端、真实播放与签名升级仍待验 |
| [最新播放与最终工程检查](docs/history/2026-11-15/VALIDATION.md#实际播放进度确认--2026-11-15局部真实流程)              | Web 真实轮次失败、原生 409、一次原生诊断恢复、实际图像复核与最终 verify；诊断不算完整验收                                        |
| [播放状态与早期失败](docs/history/2026-11-15/VALIDATION.md#播放状态与原始失败诊断--2026-11-15真实复验未通过)          | 合成四态、搜索 504、只读准备 probe、磁盘不足和前序工程失败分开保留                                                               |
| [真实键盘管理](docs/history/2026-11-15/VALIDATION.md#e1-真实键盘取消与阅读锚点增量--2026-11-15仍为-713)               | 浅深各 10 段走完但发生播放重试，passed=false；合成长列表／锚点另记                                                               |
| [早期完整 Web 历史主链](docs/history/2026-11-15/VALIDATION.md#e1-chromium-真实主链终轮与清理复审--2026-11-15仍为-713) | 当轮 18 段真实流程与持久快照通过，仅对应其源码及范围，不能覆盖后来的失败                                                         |
| [详情真实流程](docs/history/2026-11-15/VALIDATION.md#真实数据验收标准与详情正向补验--2026-11-15)                      | 正式入口真实搜索／相关返回；演员、切季及平台边界分别保留                                                                         |
| [TV 独立真实业务](docs/history/2026-11-15/VALIDATION.md#c31--tv-原生官网观看与持久续播)                               | 固定 API34、当时 APK、无电脑 API／reverse、三组 watch18＋resume7 及 SQLite，含有限重试；非物理 TV                                |
| [旧工程／T0／迁移前结果](docs/history/2026-11-15/VALIDATION.md)                                                       | 只保留当时平台、入口、源码与数据来源，不能当作当前产品已验收                                                                     |
| [组件还原与覆盖](docs/design/component-implementation.md)                                                             | 当前公共实现及已知限制；逐轮审查从该页进入历史，不重复维护全局完成状态                                                           |

## 后续怎样更新

只更新受影响范围的状态与未验要点；一个结果只维护一处，不向 README、路线、每份设计交接同步长篇叙事。需要保留新完整运行记录时放在 `docs/history/` 的对应批次文件或忽略的 artifact，并从本页链接。证据关联源码身份、入口／包、真实／合成数据来源、平台、时间、操作、结果和限制。

产品／契约／共享控件／宿主变化后按影响更新适用证据；纯文档整理不重跑产品构建，也不改写 OpenSpec 任务或验收结论。下一开发批次遵循[实施路线](docs/implementation-roadmap.md)。
