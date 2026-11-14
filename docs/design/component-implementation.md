# 基础组件实施与验收

2026-11-15。范围为已获授权的基础组件还原、包工程规范和设计原型共源；不将全部产品页面迁移、真实账号与媒体接通计入本轮完成项。本文区分公共实现、组合样例、行为证据与宿主观察，不以分组数量或主观百分比代表完整度。

## 单包、双端与使用方式

保留一个 `@hongguo/ui`，不拆 `ui-desktop`／`ui-tv`。`nsh/base` 拥有原生语义与基础行为，`packages/ui` 拥有主题、尺寸、图标、状态样式及必要的输入适配，`packages/app` 拥有业务值、请求、导航和持久状态意图，`apps/*` 只装配端型与宿主。内部按职责拆文件，不按平台复制整套组件或业务状态机。

| 内容                                | 共享方式                                                | 允许的差异                                                |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| API、受控值、禁用、等待、失败和恢复 | 同一组件和事件契约；值由调用方提交                      | 不因端型复制业务流程                                      |
| 主题、图标、圆角、字级角色          | 同一语义角色与官方图标来源                              | 影院固定使用影院角色，独立于页面浅深色                    |
| 普通控件                            | `controlMetrics()` 一次选择高度、字级、图标、内距与间距 | 桌面 md 44／sm 36；TV 60 参考单位，不采用紧凑档           |
| TV 尺度                             | `tvUnit()` 将 1920 参考宽度换成宿主逻辑单位             | 参考单位不是 dp；不能据缩放计算宣称观看距离或系统大字通过 |
| 输入                                | 桌面直接编辑；两端共用值与提交回调                      | TV 区分导航与编辑，返回保留草稿；IME 期间不抢光标         |
| Slider                              | preview／commit／cancel 意图共享                        | 桌面释放完成；TV 先确认进入调整，再确认提交或返回回滚     |
| Select、菜单与弹层                  | 复用原生定位、关闭和来源焦点机制                        | 宿主 idiom 决定的承载按真实结果记录；不伪造锚点或全屏流程 |

应用根只注入一次端型。业务从包根导入，不引用内部实现或开发入口：

```tsx
import { View, signal } from 'nsh';
import { Product, SearchField } from '@hongguo/ui';

export function Example() {
  const query = signal('');
  const search = () => {
    // The application owns the request and its pending/error state.
  };
  return (
    <Product.Provider value="desktop">
      <View class="gap-6">
        <SearchField
          label="搜索短剧、演员"
          value={query()}
          onChange={({ value }) => query.set(value)}
          onSubmit={search}
        />
      </View>
    </Product.Provider>
  );
}
```

TV 入口将 Provider 的值改为 `tv`，页面仍消费相同 API。props 和信号在 JSX 绑定或回调读取；不得在组件 body 解构为会过期的快照。新增事件使用对象载荷；旧 `primary`／`compact` 等调用暂保留兼容，新代码使用有限的 `variant`／`size`。

## 包工程与视觉来源

- [包规范](../../packages/ui/AGENTS.md) 和 [使用说明](../../packages/ui/README.md) 定义依赖方向、模块责任、公共 API、资源与验收要求。包内直接导入拥有者，禁止反向导入自身 barrel；`src/index.tsx` 只导出。
- `./preview` 和 `./testing` 是显式开发入口，分别装配画廊与测试；三个 `BaseComponentsPreview.tsx` 是薄入口，不加入产品导航。画廊数据不访问账号、网络、媒体或设备设置。
- 主题唯一源为 [theme.json](../../packages/ui/theme.json)，普通尺度归 [foundation.ts](../../packages/ui/src/foundation.ts)。页面不开放任意颜色、圆角、内距或字体覆盖。静态 `Surface` 与显式 `ContentArrival` 分离，避免数据更新反复触发入场。
- 官方 `lucide-static@0.468.0` 的 40 个 SVG、ISC 许可证与逐图 SHA256 位于 [assets/lucide](../../packages/ui/assets/lucide/provenance.json)。生成器验证源文件并同步 NSH 几何、组件板图标和产品原型图标；不是手工重画 path，也没有引入 React／DOM 图标运行时。
- 产品原型与浏览器组件板共用 `design/prototype/shared` 的控件、内容和反馈样式。HTML 与 NSH 保留各自渲染适配，共享视觉契约与图标来源；不把浏览器 DOM/CSS 引入 NSH。后续原型规范见 [原型基础组件共源](prototype-components.md)。
- `CardControls`、`SelectFocus`、`FocusedRemovalRoot` 的现有来源停靠、macOS 选择器及移除交接继续保留。为修正外观而删除这些适配，会造成实际键盘回归。

## 八组覆盖矩阵

依据 [基础组件设计](component-design.md)、[覆盖审查](component-coverage-audit.md)、[高频规划](component-roadmap.md) 与当前 [公共入口](../../packages/ui/src/index.tsx)。下表“已实现”只指源码和入口存在，不自动包含每个状态或真实宿主通过。

| 设计组     | 公共实现                                                                                                                                                               | 原生验收样例                                                                                       | 完整度边界                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 基础       | `Product`／`uiScale`／`tvUnit`／`controlMetrics`、`Icon`、`Logo`、`UiText`、`Surface`、`Badge`、`Avatar`、`Separator`                                                  | 文字角色、数字、表面、标签、头像与图标；普通布局直接组合 `View`                                    | Logo 沿用品牌资源；没有为每个布局原语造包装。全部图标几何由生成校验覆盖，不等于每个图标已逐张宿主观察        |
| 按钮与选择 | `Button`／`IconButton`、`Controls`、`CardControls`、`ActionBar`／`ActionBarGroup`／`ActionBarSeparator`                                                                | 主／普通／安静／危险、选中、禁用、等待、紧凑档、操作分组                                           | 原生行为覆盖不能替代 hover／pressed／focus 全部主题截图；TV 不依赖 hover 揭示动作                            |
| 输入与表单 | `TextInput`、`Field`／`FieldGroup`、`SearchField`、兼容 `SearchInput`、`SearchPicker`／`SearchSuggestionRow`、`Select`、`ChoiceGroup`、`Switch`、`Checkbox`、`Slider`  | 搜索、清空、提交、错误、只读、禁用、普通／部分选择、即时偏好、题材选择、演员／剧目建议、数值调整   | 手机号／验证码／扫码完整流程不在基础包内；IME、真实软键盘和读屏仍待专门验收                                  |
| 导航       | `Tabs`、`Accordion`／`Disclosure`、`Link`、`KeyHint`；主导航、返回、路径与分页由已有控件组合                                                                           | 自动激活 Tabs、禁用折叠项、外链不可用；主导航／返回／已知页数／未知总数样例                        | 没有新建路由器或推算未知总数；样例不证明产品所有导航与追加锚点已迁移                                         |
| 弹层       | `Dialog`／`ConfirmDialog`、`SidePanel`、`Menu`、`Popover`、`Tooltip`                                                                                                   | 安全默认焦点、取消／提交、等待防重复、菜单跳过禁用项、Popover 关闭、侧栏返回、来源恢复             | 菜单、选择与任意内容弹层保留各自语义；边缘定位、长内容、所有宿主承载不能仅从默认截图推定通过                 |
| 内容       | `Cover`、`PosterCard`、`ContinueCard`、`StoryFeature`、`ResultCard`／`ResultRow`、`ExpandableText`、`RemovableChipGroup`、`SettingsRow`                                | 缺图、海报选中、续播、结果行、长文、条件连续移除、设置行；本地集合与记录样例                       | 画廊为有界数据，不证明 `List` 回收性能或真实分页。业务身份、详情、提醒与统计留在 app                         |
| 观看       | `CinemaButton`／`CinemaSlider`／`CinemaSelect`／`CinemaControls`／`CinemaText`／`CinemaSettingRow`、`CinemaStageAction`、`EpisodeRange`／`EpisodePanel`／`EpisodeRail` | 有界影院舞台、播放切换、禁用上一集、倍速、区间、选集、舞台动作和播放器面板                         | 样例没有视频或解码器；准备／缓冲／恢复／结束、浏览与播放集区分仍由产品媒体状态驱动，未据此宣布全链路完成     |
| 反馈       | `Spinner`、`InlineStatus`、`Notice`、`Empty`、`Skeleton`、`Progress`、`DownloadProgress`、`Toast`／`ToastRegion`、`ContentArrival`                                     | 加载／成功／失败／重试、空状态、确定／不确定进度、文字／结果／海报骨架、受控提示关闭、更新字节进度 | 关键失败保留原位恢复；未知总量不冒充百分比。更新下载不代表离线剧集队列；完整动效与减少动态逐帧效果未全部实看 |

画廊的 `GalleryExtras.tsx` 为组合示例，不成为新的产品状态层，也不因出现演示标题就要求一个同名公共导出。

## 高频基础与业务组合边界

高频规划中的八类基础均有承接：布局配方用 `View`；长文用 `ExpandableText`；折叠用 `Accordion`／`Disclosure`；外链用 `Link`；输入提示用 `KeyHint`；条件清除用 `RemovableChipGroup`；操作组织用 `ActionBar`；字段组织用 `FieldGroup`。后续候选仍按第二个真实用途或明确不同语义启用，不制作“未来可能用”的空导出。

| 覆盖审查中的组合      | 当前承接                                                                               | 仍需产品或专项验收完成的内容                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Collection 与记录管理 | `CardControls`、Checkbox、Button 组合；画廊展示有界集合、选择与移除；已有 app 集合保持 | 虚拟列表回收、长网格、离屏跳转、分页追加保留锚点、详情返回及当前项移除的全流程                                      |
| DateStrip             | Button 的选中／焦点语义；画廊展示日期选择                                              | 真实日期与空安排、来源时区、加载／失败；不能生成未知安排                                                            |
| SeasonPicker          | Select 与状态标签；画廊展示季选择                                                      | 浏览季／播放季／可续播／待上线分离，真实季身份和可播性；基础 Select 不替产品判断                                    |
| 账号输入组合          | Field、TextInput、Button、Dialog 可组合；浏览器已有设计状态                            | 扫码准备／等待确认／过期／失败、区号和验证码提交／重试、必要短信验证、TV 数字键盘及手机辅助输入，未完整进入原生画廊 |
| SettingsRow           | 已导出；样例含控件行与只读行                                                           | 保存失败回滚、宿主能力不可用、下次播放生效等真实状态由调用方提供                                                    |
| 榜位／演员行          | `ResultRow`、Avatar、数字文字与动作组合                                                | 排位／指标／可播性／演员作品导航的真实身份；示例行不证明数据已接通                                                  |
| 只读榜单快照表        | `Surface`、文字、Badge 展示基础组合；浏览器有完整快照样板                              | 原生列头、数字对齐、缺失值／变化、长标题、来源／采样日期、过期及部分失败的完整表格样例仍未覆盖                      |
| 多维筛选              | 兼容 `FilterChoices` 与多组本地样例                                                    | 更多筛选展开／收起、已选摘要、清空、关键词与分类结果隔离的完整产品流程                                              |
| 提醒／预约与统计      | 开关、标签、数字的静态组合示例                                                         | accepted 不能当成功，预约需显式确认；取消／失败／已读保留和独立累计值需真实业务状态。样例开关切换不构成预约成功证据 |

评论、弹幕、剧评、点赞、无依据的离线剧集任务继续排除。密码、富文本、上传、树、拖拽排序、完整日期选择、命令面板或图表等没有当前需求依据的库能力不计为缺口。

## 还原度检查与修正

2026-11-15 后续收敛：Button 的 disabled／pending、selected、variant 使用明确优先级，选中背景与文字／图标成对切换；移除选中时残留的主按钮描边和 hover 覆盖。ContinueCard 的重复动作降为普通按钮，StoryFeature 验收配方使用 primary 主动作＋已有 CinemaButton 辅助动作。原型全局搜索降为普通按钮，TV 推荐区复用共享影院配对。公共 API、尺寸、图标和行为适配不变；本批证据与根门禁限制见 VALIDATION 的“动作层级与状态组合”。

还原比较设计契约和实际渲染的颜色、字级、几何、图标、边界、对齐、状态与动效；不按浏览器和原生字体渲染的像素差异计算主观分数。

| 检查项         | 已执行与发现                                                                                                                                              | 当前证据边界                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 主题与影院     | 复用暖白／深灰绿／红色主动作及影院语义；补齐弹出表面的前景配对；独立复审发现 feature 缺图落入普通浅色表面，已在既有 variant 内修正                        | 浅深主题的新宿主截图已定点复核，缺图保持影院表面与前景                          |
| 尺寸与对齐     | 输入与相邻按钮共用 44／60 档位；Checkbox 对齐 22／28；Switch 对齐 48×28／64×36；续播、骨架、影院控件和面板按端型收敛                                      | TV 数值是参考单位；海报父宽及扣除边线后的面板四列装配，均由最新宿主截图独立复核 |
| 边界与焦点     | 输入仅一个边界；禁用与选中分离；保留安全默认焦点、来源恢复、Select 适配、条件移除交接；行为回归发现并修复可选 ref 传递和焦点时序问题                      | 所有状态、全部宿主和读屏焦点不能由 headless 或默认态截图推定通过                |
| 图标           | 同一官方 40 图来源、版本、许可证和 SHA；生成检查验证三方输出一致                                                                                          | 不将官方 SVG 校验当作所有宿主绘制逐图审查                                       |
| 响应式与溢出   | 浏览器实测桌面／TV 的 924 与 1440 窗口，未见整页横向溢出；桌面搜索 44、Checkbox 22、Switch 48×28、Select 44、Dialog 480；TV 搜索／Select 60、Switch 64×36 | 浏览器 CSS 几何不替代 NSH 逻辑单位、系统字体或真实电视观看距离验收              |
| 动效与减少动态 | 原生入场、颜色反馈、弹层、加载与影院控件显隐沿用统一意图；测试默认减少动态，避免把动画计时当行为正确性                                                    | 正常动效和减少动态的所有逐帧状态尚未全部人工观察                                |

[原生独立复审](component-native-review.md) 最终结论为 `ship`：三个发现均经新宿主截图定点复核关闭。结论只覆盖报告中的实看范围，不扩大为全部状态、真实 TV 或产品迁移完成。

## 验证快照与证据

证据目录为 ignored `artifacts/ui-components/`。以下结果对应各日志记录的实际源码快照；后续视觉修正需要重跑相关门禁，不将较早日志自动套用到最终工作树。

| 类别                    | 已记录结果                                                                                                              | 日志或依据                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 工具诊断                | Node 26.12.1、pnpm 11.1.3、NSH 0.5.0、Rust 1.97.0 诊断通过                                                              | `verify.log` 的 doctor 阶段；版本仍以项目固定文件为准                                                                          |
| 三端组件 check 与 build | Web、Desktop、TV 的 NSH check 与组件验收入口 build 均通过                                                               | `check-final.log`；不是 Android APK 或独立发行包                                                                               |
| 三端组件 headless       | 每端 13／13，共 39 项通过                                                                                               | `headless-final.log`；mixed runner 各有一条未展开构建警告，不称零警告                                                          |
| macOS 可见宿主          | 桌面密度 13／13，TV 密度 13／13；包含输入、Slider 提交／回滚、禁用、确认、条件交接、组合、菜单、Popover、提示与来源恢复 | `macos-final.log`、独立 runner 文件复验 `macos-runner-final.log`；此处 TV 是 macOS 宿主中的 TV 产品密度，不是 Android 遥控验收 |
| 原型与资源工程          | 浏览器原型 28 项模型／契约回归及 UI 包 2 项工程回归，共 30 项通过                                                       | 原型测试及 `tooling/test/ui-package.test.mjs`；不等于所有新增 UI 状态自动化覆盖                                                |
| 独立视觉复审            | 首轮实看 16 张浅深主题／双密度抽样；最终定点复核关闭三项发现，无剩余本轮视觉阻塞                                        | `component-native-review.md`；其截图清单明确不是每个状态全部通过                                                               |
| 产品回归                | 首轮出现 Notice 文案不可见回归；修正布局后定向回归已过。最终全面重跑 Web 52／52、Desktop 54／54、TV 55／55，全部通过    | `product-notice-regression.log`、`product-regression-final.log`；仅证明现有产品自动回归，不代表全部页面已迁移                  |
| 工程工具回归            | 30 项中 29 项通过；安装钩子夹具的 commit-msg 测试触发 pnpm 自动安装并因无 TTY 失败；未放宽钩子或检查                    | `tooling-final.log`；与 30 项原型／UI 定向测试区分                                                                             |
| 完整 `pnpm verify`      | 失败于契约生成漂移 `contracts/openapi.json`；没有为了组件任务重生成非 UI 契约或关闭门禁                                 | `verify.log`；未跑到的后续阶段不计通过                                                                                         |
| 先前完整 `pnpm check`   | 三个既有 Rust 示例引用当前未导出的榜单／日历／系列 API 而失败                                                           | 保留为与 UI 单独 check/build 不同类别的阻塞，不冒充同一根因                                                                    |
| `pnpm security`         | 失败：许可证门禁及 `ttf-parser` 未维护公告；未放宽检查                                                                  | `security.log`；与 UI 行为和契约漂移分开记录                                                                                   |

常用复验入口：

```sh
pnpm ui:icons:check
pnpm ui:check
pnpm ui:test
pnpm ui:host
pnpm ui:preview --target desktop
```

`ui:host` 会创建真实 macOS 开发宿主并保存证据；`ui:preview --target tv` 的目标由项目工具配置决定，不能用 macOS 截图代替。Android 验收尝试在构建 `libnsh.so` 的 armeabi-v7a 阶段失败，未进入 UI 测试（`android.log`）。随后发现磁盘不足，仅清理可重建的 Rust incremental 缓存以恢复空间；日志不足以断言构建失败唯一原因是磁盘。当前可见 `emulator-5554` 不等于 Android 组件通过。

## 未验证项与后续迁移门槛

Android TV／物理电视、真实遥控、系统输入法、读屏、系统大字号、正常动效全状态、真实图片加载链路、播放与解码、独立安装包和正式发行均未在本文确认。已有原生画廊／headless／macOS 密度结果不能替代这些项目。

后续页面迁移先使用包根公开组件；缺少有限变体时在 UI 层补齐，并同步组件板、画廊、契约及必要回归。每次迁移记录：设计覆盖单元、公共组件、真实业务数据来源、桌面／TV 行为证据、可见宿主截图和未验项。账号、预约、快照和媒体组合只有在真实契约与状态足够时接通；不得用样例状态代替服务结果。

提交边界：本次包含独立组件板、浏览器共享资源、NSH UI 包、验收工具与相关规范。产品原型整页接入及先前的产品设计纠正保留在工作区，另行提交；本文的原型 28 项／合计 30 项定向结果属于完整工作区，不能冒充本次提交已包含产品原型适配。组件 39 项、macOS 26 项与产品 NSH 回归对应的 UI 源码均纳入本次范围。

提交前在已有独立 Rust 构建目录 `/tmp/hongguo-discovery-target` 重新运行契约生成检查通过（`codegen-commit-check.log`），不修改 Rust 或生成契约；默认缓存此前产生的漂移失败作为历史证据保留。Android 与安全等其他限制不因此关闭。仅本地提交，不推送。

## 内容语言收敛 · 2026-11-15

UiText 增加 `content-title`，与内容卡共用内部字号来源；不把卡片字号自动映射为 heading。Cover 使用命名 CoverProps 与 poster／inline／feature 有限变体，续播贴边图由外框统一裁切。基础样板并列四种 Surface，内容样板补长剧名，规则与用途见根 DESIGN。

本轮三端 check＋build、42 项 headless、28 项 macOS 宿主及 28 项原型回归通过，抽看 8 张原生浅深／双密度截图。完整 verify 仍停在现有 OpenAPI 漂移，未改契约。证据、构建 warning 与图片／Android TV 等未验项详见根 VALIDATION 的“字级、封面与表面规则”。

## 无障碍、状态与文案修复 · 2026-11-15

初审六项均已实施：字段说明与 TV 输入入口语义、可见 pending、禁用选择配对、页面标题及隐藏分区、请求错误映射和共享播放时间。UI 维护契约与外观，app 维护业务格式；不改主题、DTO、依赖或已有焦点适配。完整状态与证据集中见[专项审查](design-system-accessibility-state-copy-audit.md#修复实施与证据)。

本批三端 check＋build、组件 headless 45／45、macOS 双密度 30／30、产品 167／167、原型 28／28、lint／格式／diff 检查通过；抽看 12 张原生浅深状态截图。根 verify 仍因既有 OpenAPI drift 失败。warning、测试夹具纠正、读屏／Android TV／真实媒体等限制见根 VALIDATION 的同日修复记录；未提交、未推送。
