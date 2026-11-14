# 无障碍、组件状态与文案专项审查

2026-11-15。审查当前工作区的 `packages/ui` 公共导出与 `packages/app` 使用，补充此前颜色、动作层级、字级、图片、间距和表面的审查。当前工作区包含未提交及并行修改，不能以 HEAD 代替本次源码；重点文件的 SHA256、夹具、日志与截图留在 ignored `artifacts/design-system-audit/`。

## 结论与范围

设计系统的共享基础适合继续使用：语义 token、NSH base 控件、受控值、端型适配和焦点交接已有明确所有者。初审发现 **6 项实现差异：P1 × 1、P2 × 5，未发现可确认的 P0**。后续已按原优先级实施六项修复，详见[修复实施与证据](#修复实施与证据)。下方发现与家族矩阵保留初审时的事实，不能当作修复后的未关闭清单；不需要重做视觉体系。

本轮是三个专项，不对性能、完整平台符合性或全产品适配给出总分，也不声称通过完整无障碍合规认证。源码确认属性链路与状态配方；macOS 真实开发宿主确认部分禁用行为和外观；VoiceOver／TalkBack 的实际输出仍待验。

| 证据                 | 本轮覆盖                                                                                                               | 不能推定的结论                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 公共导出与调用方源码 | 下方全部导出家族的适用状态、语义责任、实际页面使用                                                                     | 所有状态组合都已运行、宿主已正确映射每项语义     |
| macOS 宿主专项 2／2  | desktop 端型、1440×1000、浅深主题、减少动态效果；合成样例，不接业务服务                                                | Web／Android TV 已通过、正常动效或整页业务已验收 |
| 两张宿主截图         | 禁用选择、只读、错误、等待、影院按钮组合                                                                               | 读屏、字号放大、TV 距离可读性与逐帧表现          |
| 既有组件回归         | 参考 [VALIDATION](../../VALIDATION.md) 中前批结果与 [components.tsx](../../packages/ui/test/components.tsx) 的测试范围 | 本轮重新跑过完整组件回归或根 verify              |

## 无障碍职责

| 责任       | 共享 UI                                                        | app／页面                                | 验收方式                         |
| ---------- | -------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| 名称／角色 | base 语义、图标隐藏、控件 label 契约                           | 提供准确动作与对象名、真实页面标题       | 源码＋宿主可访问树／读屏         |
| 值／状态   | 暴露 checked、selected、expanded、disabled、invalid 等适用状态 | 提供真实值与异步状态，不以默认值冒充未知 | 行为＋状态组合截图＋读屏         |
| 字段错误   | 接收并传递 description／invalid，邻近显示错误                  | 校验原因与恢复指引，组合时显式关联       | 错误出现、重新聚焦、修改后清除   |
| 关键反馈   | 提供 InlineStatus／Notice／Toast／Progress 等语义载体          | 决定何时加载、完成、失败和需要播报       | 完整任务读屏；避免重复或逐帧播报 |
| 焦点       | base 与 SelectFocus／CardControls／移除适配                    | 导航、列表身份、有效来源和业务取消       | 键盘／遥控、弹层、删除和迟到回调 |
| 长文／缩放 | 控件可增长、限行与展开配方                                     | 不固定裁切业务内容，提供必要全文入口     | 长值、系统大字、两主题和目标宿主 |

`Field`、`FieldGroup`、`SettingsRow` 的可见标签／错误不等于自动把说明注入每个子控件。调用方或具名组合负责这条链路；不要求为任意 JSX 增加隐式穿透框架。

## 公共导出家族状态矩阵（初审快照）

每行都已核对当前源码；“本轮宿主”仅指上述 2 项合成测试与截图。未列的状态对该家族不适用，不能据此要求所有组件新增同一套 Props。表中“既有回归”是前批证据，不计入本轮 2／2。

| 家族／公共导出                                                                                                         | 必须覆盖的状态或组合                                                                 | 当前证据与差异                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Product、uiScale、tvUnit、controlMetrics；Icon、Logo                                                                   | 端型／密度、浅深配对；装饰不重复朗读                                                 | 源码；Icon 隐藏可访问元素。基础函数／标识无 pending、error 状态                                    |
| Button、IconButton                                                                                                     | variant；selected＋hover／pressed；disabled／pending；恢复原选择；名称与焦点         | 既有 primary＋selected 回归；本轮 primary＋selected＋pending 阻止激活。忙碌表达见 F2               |
| TextInput、Field、FieldGroup；SearchField、SearchInput                                                                 | 错误＋焦点、说明关联、只读／禁用、草稿、清空、IME；TV 进入／退出编辑；搜索等待与恢复 | 本轮只读值与 SearchField 等待提交 guard 通过；字段链路 F1、等待 F2 未关闭                          |
| Checkbox、Switch                                                                                                       | false／true、Checkbox mixed；分别叠加 disabled；值保持且可辨                         | 本轮 checked／mixed＋disabled 不能触发；截图确认 F3。false＋disabled 与恢复需继续纳入组合样板      |
| ChoiceGroup、Tabs、Select；FilterChoices、EpisodeRange                                                                 | 当前／其他选项、整组和单项禁用、长标签、展开、移动／确认／取消、来源恢复             | 本轮两种禁用选项、Select 当前值可见且触发被阻止；既有选择与焦点回归。不将截图等同于读屏已验        |
| Slider、CinemaSlider                                                                                                   | 有效／未知范围、禁用、预览／提交／取消、调整值与已提交值分离                         | 本轮禁用普通滑杆截图；既有普通／TV Slider 调整回归。专项没有操作 disabled Slider 或重验影院拖动    |
| Dialog、ConfirmDialog、SidePanel；Popover、Menu                                                                        | 打开／关闭、禁用触发与选项、安全默认、pending／失败保留、来源消失、焦点恢复          | 源码及既有确认／取消／来源恢复回归；本轮未运行弹层组合、读屏或系统大字                             |
| Accordion、Disclosure、ExpandableText                                                                                  | 展开／收起、适用项禁用、短文无展开、长文全文可达                                     | 源码与既有折叠回归；本轮未重验长文放大与展开后的读屏顺序                                           |
| Controls、ActionBar、ActionBarGroup、ActionBarSeparator、CardControls；SearchPicker、SearchSuggestionRow               | 组内方向导航、首尾边界、非模态建议、关闭／来源返回、隐藏与禁用跳过                   | 源码与既有组合回归；建议空／忙／失败由 app 渲染，不给容器强加业务状态                              |
| RemovableChipGroup、Link、Tooltip、KeyHint                                                                             | 移除／清空／空态焦点；链接缺 href／禁用；提示显示／关闭、TV 不依赖悬停               | 源码与既有移除焦点回归；本轮未验证外链系统承载或所有提示读屏                                       |
| UiText、Surface、Badge、Avatar、Separator；ResultRow、SettingsRow                                                      | 标题与正文语义、长值、缺图、选中、设置错误；表面配对                                 | 源码与前批视觉证据；实际页面标题语义见 F4。静态承载不自动继承输入／忙碌状态                        |
| Spinner、InlineStatus、Notice、Empty、Skeleton、Progress、DownloadProgress；Toast、ToastRegion                         | 加载／空／失败／恢复、已知／未知进度、减少动态效果、关键播报、关闭／队列             | 源码存在 busy、range、alert／live 等基础；Updates 显式 announce 可参考。本轮未实测播报队列与频率   |
| Cover、PosterCard、ContinueCard、StoryFeature、ResultCard；ContentArrival                                              | 缺图／失败／src 切换、长剧名、选中／焦点、稳定身份、显式内容到达／减少动态效果       | 源码与前批内容组观察；本轮不重验成功图片网络、回收列表或入场动效                                   |
| CinemaButton、CinemaSelect、CinemaControls、CinemaText、EpisodePanel、EpisodeRail、CinemaStageAction、CinemaSettingRow | 选中／禁用、控制层显隐与焦点退出、选择展开、独立滚动、影院前景配对                   | 本轮 selected＋disabled CinemaButton guard 与截图；其余为源码及既有组合证据，真实媒体／TV 操作待验 |

## 发现与修复验收（初审快照）

### F1 · P1：字段错误与 TV 输入入口的语义链路不完整

类别：无障碍。位置：[form.tsx](../../packages/ui/src/form.tsx:115)、[SearchInput](../../packages/ui/src/search-input.tsx:6)、[SearchForm](../../packages/app/src/SearchForm.tsx:156)、[Gallery](../../packages/ui/dev/Gallery.tsx:299)。

- TV `InputFrame` 未进入编辑时使用外层 button 目标；该目标有名称和 focusable guard，但没有传递 disabled／invalid／description，内层输入仅在进入编辑后才持有这些属性。视觉错误状态与入口语义可能分离；防操作 guard 不等于状态暴露。
- 产品搜索只传 invalid；`SearchInput` 不接收错误说明，`search-validation` 文本也未声明 alert／live。用户重新聚焦输入时，错误原因没有显式语义关联。
- Gallery 的 `Field error`＋`TextInput invalid` 示例漏传 description；Field 自身有 alert，仍不能替代输入上的错误说明。`SearchField` 已主动传递 error／description，可作为组合契约参照。

影响：使用辅助技术纠错时可能知道“无效”却不知道原因；TV 用户在编辑前后得到的说明可能不同。以上是确定的源码缺项，实际朗读失败尚未通过 VoiceOver／TalkBack 复现，不据此宣称特定 WCAG 条款实测失败。

建议 `$impeccable harden`：由 UI 补入口状态传递和 SearchInput 说明契约，app 提供校验原因，示例遵循相同契约。验收空输入错误、重新聚焦、编辑／取消、disabled 和恢复；分别检查键盘焦点与读屏遍历，保留既有 TV 草稿及 IME 行为。

### F2 · P2：搜索等待与普通禁用缺少明确区分

类别：无障碍／状态表达。位置：[SearchField](../../packages/ui/src/form.tsx:346)、[Button](../../packages/ui/src/button.tsx:88)、[CardRoot](../../packages/ui/src/card-controls.tsx:128)。

`SearchField.pending` 仅把提交按钮禁用，标签仍为“搜索”，也没有所属忙碌区域。Button 的 pending 会在可访问名称追加“处理中”，但可见内容未变；CardRoot 未传 busy 状态。因此独立使用时，用户难以区分正在请求与暂不可用。行为 guard 正确，本轮通过输入 submit 与 disabled press 确认没有调用提交；不是重复提交缺陷。

建议 `$impeccable harden`：组合提供可见等待和适用的 busy／状态播报，复用现有反馈组件；不要求每个子控件新增 pending。验收开始、持续、成功、失败、取消及恢复，确保原输入和选择保留，重复动作受阻，状态不重复播报。

### F3 · P2：禁用后已有选择的标记过弱

类别：主题／状态表达。位置：[Checkbox／Switch](../../packages/ui/src/form.tsx:455)。

Checkbox 的 disabled 将选中／部分选中底色覆盖为 muted，但勾选／横线仍用 primary-foreground。浅深宿主截图中标记均偏弱，浅色白勾尤其难辨；深色 Switch 的开启拇指也偏弱，需同批配对检查。Gallery 原有单个未选中禁用样例不能覆盖这个交集。

本轮行为仍保持值并阻止操作；问题是可辨认性。禁用控件不直接按可操作控件的对比度阈值判合规失败。

建议 `$impeccable polish`：在共享控件配对 disabled 标记／底色，保留 checked 和 mixed 的形状区别；扩展验收页覆盖 false／true／mixed＋disabled、恢复可用、浅深与两端密度。不得仅通过整项透明度进一步弱化标记。

### F4 · P2：公共标题语义尚未用于实际页面

类别：无障碍。位置：[Home](../../packages/app/src/pages/Home.tsx:44)、[History](../../packages/app/src/pages/History.tsx:136)、[Account](../../packages/app/src/pages/Account.tsx:67)、[NavPage](../../packages/app/src/index.tsx:105)。

UiText 的 page／section／title 已提供 header 与 level，但以上生产页面仍用只有字号的 Text。NavPage 明确 `headerVisible={false}` 且未提供 title，不能靠它补足这些页面标题。辅助技术按标题定位内容缺少显式依据。

建议 `$impeccable harden`：按真实页面结构使用现有标题语义，保留当前布局；不把每个卡片或所有大字都变成标题。验收页面／小节层级、隐藏页面不参与遍历，以及读屏标题导航。

### F5 · P2：请求错误直接透传技术文本

类别：文案／实现一致性。位置：[Detail](../../packages/app/src/pages/Detail.tsx:115)、[History](../../packages/app/src/pages/History.tsx:94)、[Search](../../packages/app/src/pages/Search.tsx:175)、[Account](../../packages/app/src/pages/Account.tsx:30)、[CoreError](../../packages/core-client/src/index.ts:43)。

页面拼接 `String(error)`；CoreError 继承 Error，携带 code／status，保留服务错误或回退“服务返回 N”。界面可能出现 `Error:` 前缀、HTTP 数字或未经面向用户整理的服务消息；错误原因、操作范围与恢复方式没有统一映射。

建议 `$impeccable clarify`：app 按 code／业务情境提供短文案和实际可用恢复动作，诊断保留原始错误；取消不冒充失败，未确认成功不显示成功。验收离线、超时、服务失败、认证失效与未知错误，不将它们全都归为同一原因；不改底层 DTO 或吞掉异常。

### F6 · P2：同一播放位置在不同页面使用不同格式

类别：文案／数据表达。位置：[History](../../packages/app/src/pages/History.tsx:7)、[Home](../../packages/app/src/pages/Home.tsx:7)、[Player](../../packages/app/src/pages/Player.tsx:40)。

例如 756 秒在历史页是“看到 756 秒”，首页续播和播放器是 `12:36`；首页可访问名称又复用历史的秒数。并非数值错误，但用户跨页面比较进度时需要换算；三个转换入口也容易继续分叉。

建议 `$impeccable clarify`：app 共享播放时间语义和格式化入口，按根 DESIGN 对齐可见格式；读屏可使用对应的自然语言时长。覆盖 0、59、60、3599、3600 秒、完成态及未知时长。

边界核实：Entry DTO 的 episode／position 为可选，但当前 Rust 进度写入均存 Some，数据库读取缺字段会失败，见 [library/mod.rs](../../crates/core/src/library/mod.rs:156)、[store.rs](../../crates/core/src/library/store.rs:153)。本轮没有证据证明真实游客历史把未知变成第 1 集／0 秒；现有 `?? 1`／`?? 0` 仅作为后续接入其他来源时的契约检查，不另列已发生的数据错误。

## 文案与数据表达的维护清单

现行词表与格式只维护在 [DESIGN](../../DESIGN.md#interface-language--data)，本报告记录调用差异，不另复制一份规则。覆盖观看动作、记录作用域、收藏／追更／预约、校验与请求错误、时间／集数、未知与零、日期／统计／单位。新增业务组合需一起提供默认、等待、空、失败和恢复文案，实际没支持的状态不造示例数据。

开发与 Agent 都应从共享 owner 修改：UI 维护语义契约和配对样板，app 维护格式化与错误映射，Rust／contracts 维护事实与单位。不要为消除单页文案差异增加第二份业务状态机或复制服务数据。

## 已有能力与初审建议顺序

保留 base 语义控件、独立 focus、受控选择值、Icon 装饰隐藏、输入只读保护、SelectFocus 和移除后的来源交接。Spinner／Skeleton 已暴露 busy，Progress 区分未知总量，InlineStatus／Notice 有状态反馈基础；Updates 显式 announce 关键阶段是可复用方向。已有这些能力不等于所有业务组合已完整使用。

1. **P1 · `$impeccable harden`**：关闭 F1，先把字段名称、错误、说明和 TV 入口串通，做真实读屏验证。
2. **P2 · `$impeccable harden`**：处理 F2／F4，覆盖请求生命周期、标题定位与隐藏页面。
3. **P2 · `$impeccable clarify`**：处理 F5／F6，收敛 app 的错误映射和时间格式，不改事实数据。
4. **P2 · `$impeccable polish`**：处理 F3，并复核全部修改的浅深配对、长值、焦点与状态交集；修复后重新专项 audit。

以上为初审建议；初审仅补规则与记录，后续实施见修复章节。仍需独立验收 VoiceOver／TalkBack 完整任务、系统大字、真实 Android TV／遥控／IME、物理观看距离、正常动效、媒体与账号流程；它们不能由这两张截图关闭。

## 本轮复现证据

`artifacts/design-system-audit/` 保存 `DesignStateAudit.tsx`、`DesignStateAudit.test.tsx`、`state-combinations.log`、`states-light.png`、`states-dark.png` 和 `source-manifest.json`。这些是 ignored 本地证据，不作为发行资产或永久公共 API。

夹具临时放在 `apps/web/.nsh/`，通过项目的 `tooling/src/process.mjs`、`executable('nsh')` 与 `rustEnvironment()` 运行：`nsh test .nsh/DesignStateAudit.test.tsx --target macos`，cwd 为 `apps/web`。归档后仅移除本次两个临时入口。NSH 版本遵循 `.nsh-version`。

最终 2／2 测试覆盖每主题 11 个 disabled 动作目标的 enabled／press 拒绝、只读值保留，以及 pending 搜索通过输入 submit 不触发回调；截图观察了禁用 Slider，但测试没有操作它。首次夹具误将原生 Input 当 pressable，失败在 `app.press('id:invalid')`；移除该错误操作后重跑通过，不把夹具错误计为产品缺陷。测试未读取完整可访问树，不证明辅助技术输出。

## 修复实施与证据

2026-11-15 在同一工作区实施。六项源码缺口已处理；“已修复”限本表范围，真实读屏与 Android TV 验收继续开放。保留初审快照，避免把新规范或源码属性当作辅助技术已经正确输出的证据。

| 初审项      | 实施结果                                                                                                                                                             | 验收边界                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 字段语义 | TV 未编辑入口显式提供 disabled／invalid／description，编辑时移除入口按钮语义，由输入接管；SearchInput 公开 description，产品校验关联错误并标记 alert；Gallery 同契约 | 回归覆盖 TV 进入／退出编辑、禁用入口、错误目标与草稿；具体读屏名称、说明与播报仍待 VoiceOver／TalkBack                                                                |
| F2 等待表达 | Button pending 默认可见“处理中…”，纯图标使用静态官方 loader-circle，displayLabel 可提供具体动作；SearchField 显示“搜索中…”并在所属 View 暴露 busy                    | 回归覆盖开始、保留新草稿、阻止输入／按钮重复提交与解除等待后提交；base Button 不支持 accessibilityState，沿用可访问名称，不改 CardControls 或焦点适配；无新增循环动效 |
| F3 禁用选择 | Checkbox 勾选／部分选中、Switch 拇指使用 muted-foreground 配对禁用底色；保留值与形状区别；原生和浏览器样板增加对应交集                                               | 禁用未选、已选、mixed 与开启 Switch 均拒绝激活；浅深主题及 macOS 两密度观察。浏览器首次视觉发现 SVG 包装未叠放，已修正容器选择器并复查                                |
| F4 标题语义 | 首页、找剧、分类、历史、账号、演员页等真实主标题显式 header level 1；继续观看、最近搜索、选集等栏目为 level 2；保留现有几何                                          | retained 浏览分区显式隐藏可访问元素并禁用非活动输入；应用回归检查活动标题与隐藏首页标题；真实读屏标题导航待验                                                         |
| F5 错误文案 | app 新增 error-messages.ts，目录／分类／推荐／详情／账号／历史／搜索记录／进度写入等按稳定 code、HTTP 类别与操作范围映射；未知错误短文案，取消不显示失败             | 原始异常保留于 resource／账号状态或 catch-site 诊断；测试 code、认证、限流、服务失败、未知与取消。媒体和宿主专用错误仍由原边界负责，不声称全仓所有错误透传都已迁移    |
| F6 播放时间 | 首页、历史、播放器共用 format.ts 的 playbackTime；未知为 --:--，已知零为 00:00，小时以上 h:mm:ss；本集完成名称为“本集已看完”                                         | 测试 0／59／60／3599／3600、秒的小数、未知／负数／非有限值；同步历史精确名称断言，播放器未知总时长不显示为零；不改事实 DTO                                            |

共享 owner 使用户获得清晰状态和纠错线索，开发者只维护一套规则，Agent 通过命名 Props、配对样板和稳定回归复用同一契约；未新增业务状态机、主题 token、依赖或 DTO。

### 修复后验证

| 检查                       | 实际结果                                                               | 证据（ignored 本地目录）                                |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| 三端 NSH check＋组件 build | 通过                                                                   | artifacts/design-system-fixes/ui-check.log              |
| 产品 build                 | Rust workspace 与三端 App build 通过                                   | build.log                                               |
| 三端产品回归               | Web 54／54、Desktop 56／56、TV 57／57，共 167／167                     | app-test.log                                            |
| 三端组件 headless          | 各 15／15，共 45／45                                                   | ui-test.log                                             |
| macOS 真实开发宿主         | 桌面、TV 密度各 15／15，共 30／30                                      | ui-host.log                                             |
| 浏览器原型模型／契约       | 28／28；样板 CSS 修复后再跑通过                                        | prototype.log                                           |
| lint、格式与 diff          | 通过                                                                   | lint.log、format.log、docs-format.log；git diff --check |
| 根 pnpm verify             | exit 1：doctor、格式及包边界通过后停在既有 contracts/openapi.json 漂移 | verify.log；未改 DTO 或放宽门禁，后续未运行阶段不计通过 |

截图抽查：真实 macOS 的表单／按钮组 × 浅深主题 × 两密度，另看 TV 表单滚动后两张与两密度等待各一张，共 12 张，副本位于 `artifacts/design-system-fixes/screenshots/`。确认等待文字、保留草稿、禁用选择标记、错误、只读与基本对齐；这不是全状态焦点裁切或逐帧动效验收。浏览器组件板另实看桌面浅深禁用选择与开关，临时页和服务已关闭。

新增回归首次在 TV macOS 宿主尝试重复进入仍在编辑中的输入而失败；改为显式返回退出再进入后，完整宿主与 headless 回归通过，不恢复重复入口按钮语义。较早应用回归的失败来自完成态与时间文案的旧断言，已按真实新契约更新并完整重跑，未放宽业务断言。mixed headless 与 TV macOS 开发宿主仍有未展开的构建 warning，不称零警告。

无依赖变化，本批不重跑 security；既有安全发行问题不因此关闭。仍未验：VoiceOver／TalkBack 完整任务与播报频率、系统大字、真实 Android TV／遥控／IME、物理观看距离、正常逐帧动效、真实账号与媒体／解码、独立安装包及正式发行。macOS TV 密度不是 Android TV 验收。未提交、未推送，保留其他工作区改动。
