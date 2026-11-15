# 基础组件覆盖与状态完整度审查

2026-11-15。范围是当前产品需要的基础组件，以及已设计／实现组件的状态；不重开已修复的视觉还原 R1–R6。本轮先审查，再按审查结果实施最小修复。

基线：`db99438`，加当前工作树。雷达相关 Rust／app／UI／原型存在并行未提交实现；本报告将其视为正在实施，不列为缺失，也不代替该任务验收。当前导出以 [UI 入口](../../packages/ui/src/index.tsx) 为准，设计以根 [DESIGN](../../DESIGN.md)、[组件交接](component-design.md) 和 [演进准入](component-roadmap.md) 为准。

## 结论

没有发现当前产品必须新增、却既无设计也无实现的基础组件。八组基础控件都有承接；日期、榜位和选季已有独立公共实现。主要问题是状态转换没有闭合，而不是组件数量不够。

审查发现 **2 项实现问题、2 项状态设计／样例缺口、1 项文档漂移**。本轮已修复 2 项实现问题，补齐空选项／失效值表现和确认失败回归样例；选择器问题同时影响普通 Select 和 CinemaSelect。不能据此宣称全部组件、全部宿主的所有状态已经通过。

## 实施结果

- `Select` 与 `CinemaSelect` 在打开期间变为 disabled 或宿主能力失效时立即关闭；打开请求和变更回调再次检查可用性，避免旧弹层提交值。
- 普通选择器提供“暂无可选项”反馈；受控 value 不在 options 时显示“当前选项不可用”，不静默写回业务值。
- TV `Slider` 在调整中被禁用时走既有取消路径，回滚到进入调整前的值并触发 `onCancel`，不触发提交。
- 基础画廊增加确定性的确认失败／重试样例；失败保留弹层，下一次确认可完成操作。
- 新增公共 UI 回归覆盖上述转换；三端 `ui:check`、`ui:test`、macOS `ui:host` 均通过。

## 是否缺少基础组件

| 范围                                                         | 当前承接                                                                                                                                                 | 本轮判定                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 文字、表面、图标、头像、标签、分隔                           | UiText、Surface、Icon、Logo、Avatar、Badge、Separator                                                                                                    | 有设计与公共实现；静态信息不强加交互状态                  |
| 动作与工具栏                                                 | Button／IconButton、Controls／CardControls、ActionBar 及分组                                                                                             | 已覆盖；不另建一套 Toolbar 或 TV 按钮                     |
| 输入与选择                                                   | TextInput、Field／FieldGroup、SearchField、SearchInput／SearchPicker、Select、ChoiceGroup、Tabs、Checkbox、Switch、Slider                                | 已覆盖；动态状态问题见 S1–S3                              |
| 导航、分页与内容组织                                         | Button／Tabs／Link、Accordion／Disclosure、KeyHint；app 负责导航和集合                                                                                   | 已有组合；无需增加第二个路由器、分页状态机或布局框架      |
| 弹层与反馈                                                   | Dialog／ConfirmDialog、SidePanel、Menu、Popover、Tooltip、Toast／ToastRegion、Notice、InlineStatus、Empty、Skeleton、Spinner、Progress／DownloadProgress | 公共能力已存在；确认失败样例见 S4                         |
| 媒体与内容                                                   | Cover、PosterCard、ContinueCard、StoryFeature、ResultCard／ResultRow、ExpandableText、RemovableChipGroup、SettingsRow、影院控件与选集面板                | 已有承接；媒体会话、账号和持久化仍由 app／Rust 拥有       |
| 日期、榜位、选季、比较表                                     | DateChoice、RankingCard、SeasonChoice 已提交；RadarTable 当前工作树已有                                                                                  | 不是缺组件；RadarTable 本轮仅核对存在性和职责，未重新验收 |
| 账号／验证码／扫码／TV 数字键盘                              | 浏览器已有业务组合设计，Field／Input／Button／Dialog 可复用                                                                                              | 账号业务与原生组合迁移待办，不能改称基础控件缺失          |
| ContextMenu、CopyValue、跨区能力提示                         | 有候选准入，现有 Menu／Notice／Link 可先承接                                                                                                             | 尚无需要新增公共封装的重复用途证据，不制作空壳            |
| 多行输入、密码、上传、树、命令面板、拖拽、完整日期选择、图表 | 当前需求未触发                                                                                                                                           | 不列缺口；以后由真实需求触发设计                          |

SearchHistory 已有 Rust 查询历史和 app 搜索组合，不能依据旧候选表再次判为未实现。大集合也已有生产 `List`；回收、离屏定位和实际性能是专项验收问题，不靠新增一个同名 Collection 包装解决。

## 新发现

### S1 · P2（已修复）：选择器打开后变禁用，仍能提交选项

类型：实现缺口／交互状态。位置：[普通 Select](../../packages/ui/src/form.tsx:404)、[CinemaSelect](../../packages/ui/src/player.tsx:128)。

触发：先打开选项，再由外部状态把 `disabled` 改为 true。触发器变灰，但原列表仍在，选项仍可激活；普通值从 `a` 改为 `b`，影院速度从 `1` 改为 `2`，变更回调各执行一次。浅深主题、桌面与 TV 密度均在 macOS 图形宿主复现。

两个包装都把 disabled 传给 BaseSelect，却保留 open，并直接转发 change。锁定的 NSH 0.5.0 只在打开入口检查整个 Select 的 disabled，选项提交检查的是选项自身禁用；因此仅依赖 base 不能关闭这个交集。无需修改引擎，应由 UI 包封住公共契约。

影响：界面已表示不可操作，旧弹层却能继续更改值。CinemaSelect 在真实 Player 中用于速度／清晰度，并绑定媒体 `enabled()`；普通 Select 当前主要由原生样例消费。本轮验证了组件级条件，未伪称真实媒体故障已经触发过此路径。

处理：UI 层在 disabled／宿主能力变化时关闭列表，并在打开和变更边界拒绝 stale 事件；普通与影院选择器共用这条边界。回归覆盖打开后禁用、浅深主题、桌面／TV 宿主。

### S2 · P2（已修复）：TV Slider 被禁用时，未确认预览悬留

类型：实现缺口／中断状态。位置：[Slider 的禁用 effect](../../packages/ui/src/form.tsx:699)。

触发：值为 35，确认进入调整，右移预览为 36，随后外部将 disabled 改为 true。结果保持 36，确认次数 0、取消次数 0。headless 和 macOS TV 密度可见宿主一致。

当前 effect 只把 editing 设为 false，没有回滚，也没有结束事件；随后 blur 因 editing 已清空而不会取消。调用方的预览值与确认值因此分离，用户也无法继续确认或返回取消。

处理：禁用中断复用 Slider 的 `cancel()`，回滚 entry value 并调用 `onCancel`；不调用 `onChangeEnd`。新增 TV 宿主回归覆盖调整中禁用。

该问题属于公共通用 Slider；当前产品播放器使用 CinemaSlider 和 app 的 TV 定位会话，本报告不把此复现扩大为播放器定位故障。

### S3 · P2：Select 的空选项／失效选中值缺少明确契约

类型：状态设计与交接缺口；本轮观察到默认实现不足，不直接认定现有产品页面故障。位置：[SelectProps 与触发器回退](../../packages/ui/src/form.tsx:384)、[选择状态设计](component-design.md)。

已有长列表、个别禁用项和返回不提交的设计，但没有明确说明：选项为空、全部不可选、当前 value 不在新选项中，以及打开期间选项失效时，各自如何呈现、退出和恢复。

独立夹具将 options 清空后，owner 的 value 仍为 `a`，触发器只显示字段名“选择器”，仍可激活；再次打开没有可见空态或可选项。截图不能区分“没有选择”与“原选择已失效”。保持受控值本身合理，缺的是清晰的呈现与 owner 责任约定。

建议先补三条有限规则：零选项时由组合展示已有 Notice／Empty 或明确不可用入口；失效值由 owner 决定保留说明或清除，UI 不静默挑第一项／写回业务值；打开期间失效须约定关闭／焦点交接。全部禁用项若有保留原因，允许可读列表，不能把它与零选项一概隐藏。无需新增一个“空选择器”组件。建议 `$impeccable harden`。

### S4 · P3（已修复）：原生确认弹层的失败／重试样例不可达

类型：样例与回归缺口，**不是错误 UI 缺实现**。位置：[Gallery 的 confirmError](../../packages/ui/dev/Gallery.tsx:135)、[确认回调](../../packages/ui/dev/Gallery.tsx:748)、[弹层测试](../../packages/ui/test/overlays.tsx)。

Gallery 初始化 confirmError 为 undefined，唯一写入仍是 undefined；确认直接记录成功并关闭。另一个 pending 弹层固定等待，不能进入失败／重试。因此现有画廊无法检查“等待 → 失败保留 → 再次提交”的外观、焦点与恢复；传了 error prop 不等于状态有样例。

本轮将确定性的失败开关加入基础画廊及正式回归；失败保留弹层，错误可见，下一次确认可完成操作。ConfirmDialog 能力本身没有新增业务状态。

### D1 · P3：实施矩阵滞后，容易误判为缺组件

类型：文档漂移。位置：[高频基础与业务组合表](component-implementation.md#高频基础与业务组合边界)、[GalleryBusinessRecipes](../../packages/ui/dev/GalleryExtras.tsx:183)。

旧表仍把日期记为 Button、选季记为 Select、榜位记为 ResultRow，并将快照表记为未覆盖；当前已有 DateChoice、SeasonChoice、RankingCard，RadarTable 正在工作树实施。画廊“日期、分季需真实能力支持”的总说明也未反映已提交的日历／系列切片。

建议后续按“当前公共实现／生产组合／已验证宿主”更新单一矩阵，并区分已提交与当前实施。旧组合可以保留为基础组合示例，但不继续承担产品接入状态说明。本轮保留正在并行编辑的矩阵文件，没有覆盖它。

## 状态覆盖核对

“未新增问题”表示本次范围内未发现新的确定缺陷，不表示本轮重跑过该行全部状态；旧批次证据继续见 [规范修复记录](component-spec-conformance-fixes.md) 与 [状态专项](design-system-accessibility-state-copy-audit.md)。

| 家族                                                | 已有设计／实现状态                                                         | 本轮结论与仍需补项                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Button／IconButton                                  | 默认、hover／pressed／focus、selected、disabled、pending 与恢复            | 既有 selected＋disabled／pending 已有回归；未发现必须追加通用 error API 的依据                                |
| TextInput／SearchField                              | 草稿、错误与说明、焦点、只读、禁用、清空、等待提交保护、TV 进入／退出编辑  | 状态能力已存在；真实 IME、编辑中失能、系统大字／读屏不能由既有静态样例推定通过                                |
| Checkbox／Switch                                    | unchecked／checked／mixed、disabled 保留值                                 | 上轮已修复相交配对；偏好保存失败回滚属 owner，可复用现有 SettingsRow.error，不新增另一种 Switch               |
| Select／CinemaSelect                                | 当前值、选项禁用、打开、候选移动、确认／返回、动态失效关闭、空选项、失效值 | S1 已修复；S3 的有限呈现契约已补；仍需真实业务 owner 明确何时清除失效值                                       |
| ChoiceGroup／Tabs                                   | 受控选择、焦点、禁用选项／整组与恢复                                       | 已有交集回归；空集合／当前项移除的 owner 策略和宿主焦点仍需专项样例，不直接判为实现坏了                       |
| Slider                                              | 预览、确认、返回回滚、失焦取消、禁用                                       | S2 已修复；范围变化与真实媒体会话仍由 owner 验收                                                              |
| Menu／Popover／Tooltip                              | 打开／关闭、菜单禁用项、来源恢复、Tooltip 桌面补充／TV 不依赖              | 本轮 Menu 打开后禁用会关闭，未复现 S1；不因 Popover 没有 disabled prop 就机械判缺                             |
| Dialog／ConfirmDialog／SidePanel                    | 安全初始焦点、取消、pending 防重复、error、关闭与来源恢复                  | S4 样例已补；来源消失、长内容与所有宿主仍不能概括为已验                                                       |
| Accordion／Disclosure／ExpandableText               | 展开／折叠、保留值、禁用触发器；短文不出现展开入口                         | 已展开且禁用时保留可读内容符合现有“禁用触发器”API，不强制清空内容；内容替换／触发器消失的焦点需要后续专项证据 |
| Notice／Empty／Skeleton／Progress／DownloadProgress | 错误／重试、空态、等待、确定／未知总量、减少动态                           | 未发现新的基础组件缺失；未知总量误满条上轮已修复                                                              |
| Toast／ToastRegion                                  | 消息堆栈、显式关闭、owner 传入 transition phase                            | owner 负责时序；多消息／退出／交互暂停需分别验收，不以配方存在宣称 caller 已播放所有阶段                      |
| Cover／Avatar 与内容卡片                            | 有图／缺失／失败、来源恢复、长文、稳定身份与选中                           | 正常封面与取景沿用补审证据；不为静态头像／封面强加 pending 或 error 动作 API                                  |
| DateChoice／SeasonChoice／RankingCard               | 受控接受／拒绝／外部更新、焦点独立、真实日期／身份、长标题及状态           | 已有独立样例和测试。待上线季仍可浏览，空安排日期仍可选，不能简单补 disabled                                   |
| RadarTable                                          | 当前工作树已有 selected／pending、空表恢复、长列、缺值与定位样例           | 本轮只核对源码／设计覆盖，未验并行最终版本                                                                    |

## 本轮证据与边界

忽略目录 `artifacts/component-state-audit/` 保存隔离夹具、运行脚本、check／build 日志、headless 日志、macOS 截图和源码 SHA256 清单。夹具只通过 `@hongguo/ui` 公共入口消费，不修改组件、不访问网络／账号／媒体、不持久化数据。

- `headless-tv.log`、`headless-web.log`：诊断 S1／S2、空选项、Menu 关闭和确认失败恢复。桌面日志的 TV 专用滑杆条目是空操作，不算桌面滑杆通过。
- `host-tv.log`、`host-web.log`：macOS 图形宿主的 TV／桌面密度，普通／影院选择器浅深主题；TV 通用滑杆中断、空选项、Menu 和确认失败恢复。本轮实际复核截图，未以 headless 代替外观证据。
- 诊断脚本记录了修复前的复现与修复后的对照；首次影院定位器选错语义角色，改为实际文本入口后重跑；一轮桌面宿主采集主动中止后单独重跑，不纳入结论。
- 检查并构建隔离入口；构建仍有 NSH 汇总 warning，未作为本轮状态问题归因。不改依赖；未重跑全仓 verify／security，不能将并行工作树宣称为全量验收通过。

本轮没有运行 Android／物理 TV、VoiceOver／TalkBack、中文 IME、系统大字或真实媒体流程，也没有重新跑全部历史视觉／动效组合。旧报告已注明的这些证据不足继续保留，不能都算新增代码缺陷。

后续只剩 D1 矩阵文档同步，以及真实业务 owner 对失效 value 清除策略的确认。生产代码本轮已修改，未提交、未推送。
