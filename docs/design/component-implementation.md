# 基础组件当前实现与覆盖

此页是公共实现／组合归属的单一覆盖矩阵，不是产品功能验收表。视觉与状态规则见[DESIGN](../../DESIGN.md)，API及用法见[UI包](../../packages/ui/README.md)，设计板入口见[组件交接](component-design.md)，全局验收状态见[VALIDATION](../../VALIDATION.md)。旧实施正文保留在[历史快照](../history/2026-11-15/design/component-implementation.md)。

## 八组覆盖矩阵

以下“已有”只说明公共源码／导出或样例存在，不能概括全部状态、全部宿主或真实业务通过。`./preview`、`./testing`仅供显式验收，产品从包根消费。

主题值只来自 `packages/ui/theme.json`，组件稿 `components/assets/theme.css` 由它生成。所有可操作控件——普通边框按钮、可选项、选集按钮、输入框与 Select——共用 `card` 表面加同一条 `input` 1px 边界，悬停 `muted`、按下 `border`、选中 `accent`；`border` 保留给内容分区、禁用边界与装饰。`Button`／`ChoiceGroup`／`DateChoice`／`Menu`／`TextInput`／`Select` 及原型 `shared/controls.css` 已按此对齐，颜色仍只经 token 表达。

| 设计组     | 公共实现                                                                                                                                                                                                                                   | 原生验收样例                                                                                                     | 完整度边界                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础       | `controlMetrics`／`space`／`radius`／`textSize`、`Icon`、`Logo`、`UiText`、`Surface`、`Badge`、`Avatar`、`Separator`；UI 不读端型，`size` 只描述几何，TV 行为用显式 props | 文字角色、数字、表面、标签、头像与图标；普通布局直接组合 `View`                                                  | Logo 沿用品牌资源；没有为每个布局原语造包装。全部图标几何由生成校验覆盖，不等于每个图标已逐张宿主观察                                              |
| 按钮与选择 | `Button`／`IconButton`、`Controls`、`CardControls`、`ActionBar`／`ActionBarGroup`／`ActionBarSeparator`                                                                                                                                    | 主／普通／安静／危险、选中、禁用、等待、紧凑档、操作分组                                                         | 原生行为覆盖不能替代 hover／pressed／focus 全部主题截图；TV 不依赖 hover 揭示动作                                                                  |
| 输入与表单 | `TextInput`、`Field`／`FieldGroup`、`SearchField`、兼容 `SearchInput`、`SearchPicker`／`SearchSuggestionRow`、`Select`、`ChoiceGroup`、`Switch`（`labelHidden`，标签文案由所在行承担时隐藏可视标签、保留无障碍名称）、`Checkbox`、`Slider` | 搜索、清空、提交、错误、只读、禁用、普通／部分选择、即时偏好、题材选择、演员／剧目建议、数值调整                 | 手机号／验证码／扫码完整流程不在基础包内；IME、真实软键盘和读屏仍待专门验收                                                                        |
| 导航       | `Tabs`、`Accordion`／`Disclosure`、`Link`、`KeyHint`、`Pagination`；主导航、返回与路径由已有控件组合                                                                                                                                       | 自动激活 Tabs、禁用折叠项、外链不可用；主导航／返回／已知页数／紧凑／禁用／单页／未知总数样例                    | 没有新建路由器或推算未知总数；Pagination 只承接已知总页数；样例不证明产品所有导航与追加锚点已迁移                                                  |
| 弹层       | `Dialog`／`ConfirmDialog`、`SidePanel`、`Menu`、`Popover`、`Tooltip`                                                                                                                                                                       | 安全默认焦点、取消／提交、等待防重复、菜单跳过禁用项、Popover 关闭、侧栏返回、来源恢复                           | 菜单、选择与任意内容弹层保留各自语义；边缘定位、长内容、所有宿主承载不能仅从默认截图推定通过                                                       |
| 内容       | `Cover`、`PosterCard`、`ContinueCard`、`StoryFeature`、`ResultCard`／`ResultRow`、`ExpandableText`、`RemovableChipGroup`、`SettingsRow`（`divided` 列表／`card` 独立卡片）、`SettingsSection`、`ActionRow`（整行目的地／命令，单一输入目标）                                              | 缺图、海报选中、续播、结果行、长文、条件连续移除、设置行；本地集合与记录样例                                     | 画廊为有界数据，不证明 `List` 回收性能或真实分页。业务身份、详情、提醒与统计留在 app                                                               |
| 观看       | `CinemaButton`／`CinemaSlider`／`CinemaSelect`／`CinemaControls`／`CinemaText`／`CinemaSettingRow`、`CinemaStageAction`、`EpisodeRange`／`EpisodePanel`／`EpisodeRail`                                                                     | 按设计稿组合的影院面板（标题与关闭、进度与时间、播放切换、下一集、音量、倍速、选集、全屏）、6 列选集网格与末集禁用、舞台动作和播放器选集面板 | 样例没有视频或解码器；准备／缓冲／恢复／结束、浏览与播放集区分仍由产品媒体状态驱动，未据此宣布全链路完成                                           |
| 反馈       | `Spinner`、`InlineStatus`、`Notice`、`Empty`、`Skeleton`／`SkeletonBlock`／`SkeletonRegion`、`Progress`、`DownloadProgress`、`Toast`／`ToastRegion`、`ContentArrival`                                                                      | 加载／成功／失败／重试、空状态、确定／不确定进度、文字／结果／海报骨架、几何加载区域、受控提示关闭、更新字节进度 | 关键失败保留原位恢复；未知总量不冒充百分比；骨架区域只播报一次忙碌且块不进入焦点。更新下载不代表离线剧集队列；完整动效与减少动态逐帧效果未全部实看 |

画廊为受控样例，不运行真实账号／视频，不充当产品页面或持久状态层。布局直接组合NSH View，不为每个原语再造同名包装。

## 高频基础与业务组合边界

| 组合                           | 当前承接                                                                  | owner与待验边界                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 长文／折叠／链接／输入提示     | ExpandableText、Accordion／Disclosure、Link、KeyHint                      | 沿用base语义；宿主外链能力、展开后焦点和完整可访问阅读分别验收                                                                                                                                                                             |
| 筛选／动作／表单组织           | ChoiceList、LabeledChoiceList、RemovableChipGroup、ActionBar、FieldGroup、FilterChoices（TV select） | app拥有值、条件含义和请求；标签行只有这两个组件，页面不写自己的圆角／最小宽／间距／换行；字段明确传递名称／错误，不复制状态机                                                                                                              |
| 集合与记录管理                 | CardControls、Checkbox、Button与生产List                                  | 稳定身份、回收、追加、离屏定位、删除回源、密度切换属于实际集合流程，不能由有界画廊代证                                                                                                                                                     |
| 已知页数分页                   | Pagination，共用 Button 的表面与焦点规则                                  | 只做受控页码窗口；滚动锚点、返回恢复、请求与未知总量追加归app                                                                                                                                                                              |
| 日期条                         | DateChoice＋CardControls，app组合日期条                                   | 单日期几何／激活已有公共导出；真实schema、时区／今天、空安排／加载／预约语义归app                                                                                                                                                          |
| 选季                           | SeasonChoice，app组合SeasonPicker                                         | 浏览季、实际播放季、可续播及待上线分开；季身份／可播性由真实服务决定                                                                                                                                                                       |
| 榜位／演员行                   | RankingCard，共用Avatar／Cover                                            | 一个动作／焦点目标，动态菜单、actor／drama身份、分页及返回归app；TV 用更紧凑的 70×94 封面行，仍是单一整行动作                                                                                                                              |
| 榜单快照表                     | RadarTable已公开导出                                                      | 只读列／行、缺值、长标题、选中／等待与定位有样例及边界回归；桌面标题按钮／TV 整行焦点、列导航可移至调用方控件带（columnControls="external"）；正式入口真实流程仍按台账补验                                                                 |
| 账号页组合                     | `ActionRow`、`Surface`、`Avatar`、`Button`、`Tabs`、`Dialog`；app 侧拆为身份卡、内容卡、片库区与登录弹窗 | 账号页身份／内容／片库与登录弹窗的桌面与 TV 构图；四轮视觉复评留证 | 真实登录、真实同步与物理遥控仍按台账验收；TV 以轻标题与按钮带替代第二列与卡片容器 |
| 账号／验证码／扫码／TV辅助输入 | Field、TextInput、Button、Dialog及浏览器组合设计                          | 会话、凭据、验证／过期／取消与真实owner由app／Rust处理；浏览器演示不算Rust账号迁移                                                                                                                                                         |
| 设置／提醒／预约／统计         | SettingsSection、SettingsRow（divided／card）、选择控件、标签／数字与反馈 | 真实保存／回滚、宿主能力、确认结果和实际累计由owner提供；不由控件状态推断成功；设置行按组件板「设置行」对齐（分组分隔线、加粗标签、说明在下、控件右对齐）；设置页三端（Web／macOS／Android TV 模拟器）截图与保存失败恢复已验，物理 TV 待补 |
| 影院与选集                     | Cinema家族、EpisodeRange／Panel／Rail                                     | slider预览／提交／取消复用公共边界；解码、实际播放与后台状态由产品媒体会话驱动                                                                                                                                                             |

DateChoice、SeasonChoice、RankingCard、RadarTable均已有真实公共实现，不再按旧方案称为“只能由Button／Select／ResultRow拼装”或“尚无表格”。是否用于完整产品并真实验收，仍查功能台账。

## 状态、还原度与证据

| 历史审查                                                                                           | 可证明的范围与限制                                                                              |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [状态完整度](../history/2026-11-15/design/component-completeness-state-audit.md)                   | 选择器动态失能关闭、空选项／失效值、TV Slider禁用取消、确认失败样例；不泛化为所有控件状态已通过 |
| [规范还原修复与补审](../history/2026-11-15/design/component-spec-conformance-fixes.md)             | R1–R6、部分打开弹层／成功封面与动效；按报告的宿主／采样范围判断                                 |
| [无障碍／状态／文案](../history/2026-11-15/design/design-system-accessibility-state-copy-audit.md) | 名称、错误关联、pending／禁用组合及修复；静态语义／截图不等于真实读屏                           |
| [原生视觉复审](../history/2026-11-15/design/component-native-review.md)                            | 指定macOS桌面／TV密度和主题；不等于Android TV／物理电视                                         |
| [原设计覆盖审查](../history/2026-11-15/design/component-coverage-audit.md)                         | 浏览器阶段组合与状态盘点；其中旧缺口／旧实现分类不覆盖本页                                      |

IME、系统字号／观看距离、真实读屏、全部hover／pressed、来源消失／长内容及逐帧动效／减少动态效果，均须按目标宿主补证。验收样例、原生check／build、真实用户流程和物理设备各有边界；未逐项证明的不标全覆盖。

TV 记录还须列出设备／宿主、屏幕尺寸、输出分辨率、density、逻辑视口、系统字号和实际观看距离；macOS 的 TV 密度预览标为替代观察，不补写实际距离。目标 Android TV 默认字号与 1.3 字号下检查正文、元信息、必要操作、焦点与独立滚动，换行或控件增长后内容和返回路径仍可达；物理电视与遥控器的可读性、输入法和读屏单独记录，不从 1920 截图推定通过。

组件样式已token化：`packages/ui/src`内字体、颜色、间距、圆角全部经`textSize`／`token`／`space`／`radius`读取主题，不再用裸`text-*`／`gap-*`／`rounded-*`类名或裸字号数字；有密度含义的控件（`Button`／`IconButton`／`TextInput`／`SearchField`／`Select`／`Checkbox`／`Switch`／`Radio`组`ChoiceGroup`与`Tabs`／`Slider`／`DateChoice`／`SeasonChoice`／`Pagination`）接受`size: 'sm'|'md'|'lg'`；`ChoiceList`／`LabeledChoiceList`固定`sm`档位，不从页面接收尺寸，桌面三档为32／40／60，TV主题下三档同为48。

仍保留且有意的非token写法：`rounded-full`（头像、滑杆拇指与轨道）、`rounded-none`（内嵌封面）、`rounded-(--radius)`（弹层引用生成的主题变量，等价`radius('xl')`）、`radar-table`整行按钮的`borderRadius: 0`；`display`骨架图尺寸与`player`空态图标框的固定像素属于组件配方。

焦点偏移不是待统一项：按钮外扩4`space('xxs')`、输入框外扩3`focusOffset`、内嵌输入框内收1`focusOffsetInside`，三者由`foundation`统一导出。Player`padding`的按边形状、1280／1440桌面与真实遥控器上的32／40密度仍待评审。

命令见[UI包验证](../../packages/ui/README.md#验证)；后续只更新本页受影响家族／缺口与证据链接，不在每份历史审查中追加同段进度。
