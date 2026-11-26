---
version: alpha
name: 红果 NSH
description: 内容优先、清晰克制的多端观看界面；桌面与 Android TV 共用一套语义 token、一个组件包。
---

# Design System: 红果 NSH

## Overview

视觉方向为“红果官网式观看空间”：深色与白色内容区都以封面、剧名、明确操作和连续观看建立层级；黑／白表面、炭灰层级和红果橙主动作由语义 token 表达，系统字体、平面表面与稳定几何保持跨端一致。减少装饰、重复副标题和工程说明。

适用桌面与 Android TV。桌面用键鼠布局，TV 适配遥控与观看距离；无头浏览器验收宿主渲染桌面端型，不是独立产品。明确使用 `desktop`／`tv` 端型，不以 Android OS 推断。产品不增加手机或窄窗布局。

基础组件只接收 `size`，不读端型；`sm`／`md`／`lg` 只描述几何，TV 的确认编辑、行焦点、影院控制层等行为用显式 props。端型到主题、尺寸和行为的映射只在 app 根发生。

### 来源与维护

| 内容                 | 唯一职责与入口                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 产品范围与真实能力   | [PRODUCT.md](PRODUCT.md)；固定上游只作行为证据，不因原型样例新增能力                                                                                         |
| 公共视觉与交互规则   | 本文件；任务相关的原型、组件交接补充组合细节，不能覆盖公共规则                                                                                               |
| 运行时主题           | [theme.json](packages/ui/theme.json)（桌面）与 [theme.tv.json](packages/ui/theme.tv.json)（TV），由本文件经 `pnpm design:codegen` 生成；组件不写裸色、裸数值 |
| Token 名称、值与用法 | 本文件各节的 YAML 块；YAML 是唯一编辑源，运行时以生成的两份 theme 为准                                                                                       |
| 普通控件档位／文字   | [foundation.ts](packages/ui/src/foundation.ts)、[typography.ts](packages/ui/src/typography.ts)、[display.tsx](packages/ui/src/display.tsx)                   |
| 实际公共 API         | [UI 包规范](packages/ui/README.md)及包根导出；NSH API 以各端生成类型为准                                                                                     |
| 已验证行为与限制     | [VALIDATION.md](VALIDATION.md)、[组件实施验收](docs/design/component-implementation.md)                                                                      |

规则有明确所有者，示例使用真实 API，修复在共享源生效。规范与实现不一致时先明确差异，不把实现偶然值或旧快照默认为新规则。机器可读值只保留在 YAML 块。

### 真实能力边界

- 安静观看：排除评论、回复、弹幕、剧评、点赞及其入口／设置；保留收藏、追更和预约。
- 评分、热度、演员、相关推荐、榜单和日期只显示实际数据。第三方榜单快照仍按真实字段单独迁移。
- 待上线季、预约 ID、列表位置、未知季号不能当作可播依据。收藏、追更、预约、历史和实际累计观看统计分别表达。
- 清晰度、全屏、解码、预取和更新按真实宿主能力提供；不虚构离线剧集队列、任意缓存容量或统一 1080P。
- 登录、合并、同步及保存按实际结果反馈；保留游客记录，本机清空不表述为云端全部删除。更多边界以 PRODUCT 为准。

## Colors

页面和控件只消费语义 token，裸色只定义在生成的 theme 中。浅色、深色分别配对，影院语境独立于页面外观。YAML 中不带后缀的是浅色值，`-dark` 是深色覆盖；组件引用基础名，深色模式按同名 `-dark` 替换。深色页面使用 `background`／`card`／`popover` 的黑到炭灰层级，浅色页面使用白色页面与浅灰辅助表面。

| 角色                                          | 用途                                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `background`／`foreground`                    | 外壳、正文与标题                                             |
| `card`／`card-foreground`                     | 普通内容与控件表面                                           |
| `popover`／`popover-foreground`               | 菜单、选择列表与弹层                                         |
| `muted`／`muted-foreground`                   | 弱化表面、次要信息和禁用内容                                 |
| `primary`／`primary-foreground`               | 当前区域的主要观看或提交动作                                 |
| `primary-strong`／`primary-strong-foreground` | 复选、部分选中与开关的小面积选中实底及其标记                 |
| `accent`／`accent-foreground`                 | 选中项与轻量强调，不能替代焦点                               |
| `border`                                      | 内容分区、装饰性边界与禁用控件边界；不承担可操作识别         |
| `input`                                       | 输入、下拉、复选、按钮、选集共用的控件边界；与内容分隔线分开 |
| `ring`                                        | 独立可见焦点，可与选中或错误同时出现                         |
| `destructive`                                 | 错误与危险动作，必须伴随明确文案                             |
| `skeleton`／`skeleton-surface`                | 骨架块与承载骨架的表面                                       |
| `cinema-*`                                    | 影院背景、文字、控制层、轨道、焦点和透明渐变配对             |

`primary-strong` 只用于复选、部分选中和开关这类需要与浅色标记成对的小面积实底；`accent` 只承担选中和轻量强调。组件不直接写品牌色，具体值只存在于 theme。组件稿的 `components/assets/theme.css` 由 theme 生成，运行 `node design/prototype/visual-redesign-real/components/sync-theme.mjs` 同步；不手改生成 CSS，不在页面另补颜色。

普通文字及占位文字至少 4.5:1；大文字至少 3:1。识别控件和状态所必需的边界、图标和焦点至少与相邻颜色达到 3:1。选中实底与它的勾选标记、开关轨道与拇指同样按 3:1 成对量测，不用过浅的实底换取白色标记。装饰分隔线不套用控件边界要求，禁用态保留可理解文案。依据：[WCAG 非文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。

控件边界（`input`）在浅色取与分隔线同族的浅灰，在深色比分隔线高一档，让输入框、下拉、复选和按钮读作同一种线；可操作识别由表面、文字、形状和独立的 3:1 焦点环承担，边界不单独承担识别。禁用控件边界与内容分隔线使用 `border`；进入 `muted` 表面的控件按禁用处理。影院滑杆和焦点使用影院角色另验。对比度计算验证 token 配对，真实宿主还要观察细线、缩放、焦点裁切和状态组合。

```yaml
colors:
  background: '#ffffff'
  background-dark: '#000000'
  foreground: '#171717'
  foreground-dark: '#f5f5f5'
  card: '#ffffff'
  card-dark: '#131414'
  card-foreground: '#202020'
  card-foreground-dark: '#f5f5f5'
  popover: '#ffffff'
  popover-dark: '#1d1e1e'
  popover-foreground: '#202020'
  popover-foreground-dark: '#f5f5f5'
  primary: '#fa7705'
  primary-dark: '#fa7705'
  primary-foreground: '#111111'
  primary-foreground-dark: '#111111'
  primary-strong: '#ea6400'
  primary-strong-dark: '#ea6400'
  primary-strong-foreground: '#ffffff'
  primary-strong-foreground-dark: '#ffffff'
  muted: '#f7f7f7'
  muted-dark: '#292a2a'
  muted-foreground: '#686868'
  muted-foreground-dark: '#a0a0a0'
  skeleton: '#e8e8e8'
  skeleton-dark: '#2d2f2f'
  skeleton-surface: '#f3f3f3'
  skeleton-surface-dark: '#1c1d1d'
  border: '#e5e5e5'
  border-dark: '#2a2c2c'
  input: '#d9d9d9'
  input-dark: '#424242'
  ring: '#c85e00'
  ring-dark: '#ff9233'
  accent: '#fff1e8'
  accent-dark: '#3a2415'
  accent-foreground: '#a34b00'
  accent-foreground-dark: '#ffb36d'
  destructive: '#c93727'
  destructive-dark: '#ff6b57'
  cinema: '#000000'
  cinema-dark: '#000000'
  cinema-foreground: '#f7f7f7'
  cinema-foreground-dark: '#f5f5f5'
  cinema-muted: '#9a9a9a'
  cinema-muted-dark: '#9a9a9a'
  cinema-control: '#1d1e1e'
  cinema-control-dark: '#1d1e1e'
  cinema-hover: '#292a2a'
  cinema-hover-dark: '#292a2a'
  cinema-active: '#3a3c3c'
  cinema-active-dark: '#3a3c3c'
  cinema-track: '#676b6b'
  cinema-track-dark: '#676b6b'
  cinema-focus: '#ff9233'
  cinema-focus-dark: '#ff9233'
  cinema-transparent: '#00000000'
  cinema-transparent-dark: '#00000000'
```

## Typography

使用宿主系统 UI 字体。文字、图标、间距和目标尺寸由同一档位协调，不为单个页面复制字号。TV 使用 `theme.tv.json` 给出的 dp 值，与桌面同量级。

| `UiText` 角色 | 桌面         | TV           | 字重 | 行高 | 用途                          |
| ------------- | ------------ | ------------ | ---- | ---- | ----------------------------- |
| display       | 44           | 44           | 400  | 1.4  | 首页／精选主标题；字距 0.06em |
| page          | 32           | 28           | 600  | 1.3  | 页面标题                      |
| section       | 24           | 22           | 600  | 1.5  | 栏目标题                      |
| title         | 20           | 20           | 600  | 1.5  | 小节／面板标题                |
| content-title | 18           | 20           | 600  | 1.5  | 海报与续播卡剧名              |
| body          | 16           | 16           | 400  | 1.5  | 正文                          |
| meta          | 14           | 14           | 400  | 1.5  | 元信息、说明、错误            |
| numeric       | 16，等宽数字 | 16，等宽数字 | 400  | 1.5  | 时间、进度、榜位              |

`title` 用于小节／面板标题，`content-title` 用于海报与续播卡的剧名；内容标题不因字号自动成为页面标题层级。时间、进度和榜位使用等宽数字。长剧名采用明确限行或换行；完整内容需要阅读时提供展开，不用无意义副标题补充。系统字号放大时允许容器增长，不固定高度裁掉文字。

控件文字不另造句级角色：字号由 `controlMetrics(size).fontSize` 取 14／16／18，字重按 Button 的 variant／selected／current 决定，行高 1.5；不要用 `text-sm`、`text-xs` 或 `text-xl` 绕过。

```yaml
typography:
  display-desktop:
    fontFamily: system-ui
    fontSize: 44px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.06em
  display-tv:
    fontFamily: system-ui
    fontSize: 44px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.06em
  page-desktop:
    fontFamily: system-ui
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.3
  page-tv:
    fontFamily: system-ui
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.3
  section-desktop:
    fontFamily: system-ui
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.5
  section-tv:
    fontFamily: system-ui
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.5
  title-desktop:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.5
  title-tv:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.5
  content-title-desktop:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.5
  content-title-tv:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.5
  body-desktop:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-tv:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  meta-desktop:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  meta-tv:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  numeric-desktop:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum" 1'
  numeric-tv:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum" 1'
```

## Layout

### 页面与密度

桌面保持侧栏、搜索与主内容工作区；TV 保持顶部导航和内容区。正式桌面检查 1180×780 与 1440×1000，不设计窄窗替代导航。弹层和控件仍需适应所在容器，不能用“不支持窄窗”掩盖容器内部溢出。

| 组合       | 沿用的布局约束                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 桌面外壳   | 176 侧栏、86 顶栏、360 搜索区、内容最大宽 1660                                                                   |
| 桌面内容   | 12 列网格；继续观看三列；片库为流体海报网格（最小卡宽 180、2–8 列；1180 为 4 列、1440 为 5 列）；详情最大宽 1000 |
| 详情选集   | 桌面每段 24 集／八列；TV 每段 12 集／六列；播放器侧面板独立四列，不混为同一布局                                  |
| 桌面播放器 | 整页暗色观看带；画面高 `clamp(320, 视口高−428, 660)`、选集栏 316、间距 24；画面下方独立播控带                    |
| TV 外壳    | 内边距 44、顶栏高 66                                                                                             |
| TV 播放器  | 可用舞台等比容纳竖片；方向／确认／返回操作控制层和选集                                                           |

集合可增长时使用 `List`，小而有界的面板可用 `Scroll`；列表按稳定 ID 保存锚点，回收不串状态。

桌面内容页滚动整页：页头、筛选与分页操作随内容一起移动，卡片页不做“页头固定、下方窄窗内滚”。实现用外层 `Scroll` 加 `List viewport="parent"`（NSH 对“一个页面滚动包含页面 chrome 和一个或多个长列表”的推荐写法）；列表的 `header` 只放列表自身内容，页面 chrome 放在外层 `Scroll` 里。TV 保留有界车道：遥控在车道间移动焦点，不拖动整页。海报网格的列数与卡宽由 `shell/poster-grid.ts` 统一给出，首页、找剧与演员作品共用一套几何。

### 间距

普通间距从 4、8、12、16、24、32、40、48 选择；TV 参考档位为 8、12、16、24、32、48，其他已有布局值如 20、28、96 保留在明确组合内，不擅自全仓归一。相关控件近、分组次之、区域最远；同排输入和操作等高。

```yaml
spacing:
  none: 0px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  none-tv: 0px
  xxs-tv: 6px
  xs-tv: 10px
  sm-tv: 14px
  md-tv: 20px
  lg-tv: 28px
  xl-tv: 36px
  2xl-tv: 48px
  3xl-tv: 56px
```

| 关系           | 桌面／TV 参考值 | 使用条件                                       |
| -------------- | --------------- | ---------------------------------------------- |
| 同一对象的文字 | 4／4            | 剧名与元信息；TV 的 4 只保留在既有卡片组合内   |
| 相关内容       | 12／12          | Surface 内的连续内容、进度与操作的距离         |
| 同组控件       | 16／24          | 独立操作之间；可换行，不压缩目标尺寸           |
| 区域分隔       | 32／48          | 两个独立栏目；不在每个子项间重复               |
| 普通表面内距   | 24／24          | Surface 的固定配方；续播卡 20／28 由该组合维护 |

这些是选择依据，不是逐项增加公共 token。先复用共享组合；页面只决定排列与区域关系。PosterCard 图文间距 12／14、影院左内距 44 等既有配方例外由所属组件维护，不能扩散为页面自由值。

### 端型边界

几何值只有两个来源：theme 里的 `--space-*`、`--radius-*`、`--text-*`、`--control-*`，以及组件自己的布局常量。组件不读端型，也不做运行时缩放；换端只换主题文件。

## Elevation & Depth

平面优先：背景、留白与细边界表达层级，不增加装饰投影、发光或玻璃效果。菜单、建议层、Dialog、Sheet 和 Popover 使用统一语义表面与 NSH 承载，模态需要明确遮挡与焦点边界。影院以暗色内容区建立层级，视频保持等比显示，不因弹层重建。

| `Surface` 变体  | 何时使用                       | 内容配对                                          |
| --------------- | ------------------------------ | ------------------------------------------------- |
| content（默认） | 需要独立承载的内容对象或操作组 | 普通 UiText／控件                                 |
| muted           | 所属区域中的次要状态或辅助内容 | 正文可读，次要文字用 muted；不是禁用整个区域      |
| page            | 与页面同色但确需边界的独立区域 | 普通文字，单层细边界                              |
| cinema          | 播放或精选内容的持续暗色承载   | CinemaText／CinemaButton，或 UiText tone="cinema" |

普通栏目先用留白分组，不为每段文字加 Surface。四种变体是同层选择，默认不嵌套内容卡；确需子区域时使用分隔线或留白。外框负责裁切，贴边图片不再绘制内圆角；不要同时叠加边框和装饰阴影。Surface 不自动改变子控件语义或文字色，影院内容必须显式配对。

## Shapes

普通控件及内容表面的基准圆角为 `xl`（12）；紧凑控件、密集组合和 `Button sm` 使用 `lg`（8）；Badge 与局部小表面使用 `md`（6）；骨架文字行、封面内元素使用 `sm`（4）；头像与滑杆拇指为 `full`。不向页面开放任意圆角覆盖。

```yaml
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
```

| Token         | 用途                                                             |
| ------------- | ---------------------------------------------------------------- |
| `radius-sm`   | 骨架文字行、封面内元素、紧凑内部块                               |
| `radius-md`   | Badge、局部小表面                                                |
| `radius-lg`   | 紧凑影院控件、Button sm、有限组合                                |
| `radius-xl`   | 控件、Surface、Dialog/Sheet/Popover 的默认圆角（NSH `--radius`） |
| `radius-full` | 头像、滑杆拇指、进度条胶囊                                       |

边界通常 1 单位，焦点使用独立轮廓；TV 使用自己的主题值。hover、pressed、selected 和 focus 不改变占位。嵌套表面圆角与内距协调，内容裁切服从容器边界，外侧焦点轮廓不得被裁掉。Button 焦点 offset 4、输入焦点 offset 3 暂作组件配方保留。

## Motion & Micro-interaction

| 变化                                 | 工具与节奏                                                      | 减少动态效果     |
| ------------------------------------ | --------------------------------------------------------------- | ---------------- |
| hover／pressed、开关拇指             | 100ms 有限反馈；focus 与 selected 即时                          | 即时状态反馈     |
| 首次内容到达                         | 显式 ContentArrival，180ms／最多位移 8；静态 Surface 不自动入场 | 即时可见、无位移 |
| Dialog／Sheet／Menu／Popover／Toast  | 复用 NSH 承载、关闭与来源恢复；不等待业务请求后才关闭           | 去掉自定义过渡   |
| 列表追加／筛选／时间／进度／续播文字 | 原位即时更新，不重播整列表或回收单元入场                        | 相同             |
| 播放控制层                           | 共享短透明度过渡；隐藏后不可聚焦，暂停／错误／编辑时保留操作    | 即时显隐         |
| Spinner／不确定进度                  | 只表示实际等待，不能虚构完成比例                                | 静态可读状态     |

不增加界面音效、装饰循环、海报缩放或逐条错峰动画。每个新流程编码前补状态／动效清单，实际宿主逐项观察；旧批次记录和静态截图不证明逐帧表现。功能级动效清单归属于各功能文档，不在这里复制：发现与播放见[日历](docs/calendar-browsing.md#状态与动效清单)、[系列／季](docs/season-browsing.md#动效清单)、[榜单雷达](docs/radar-snapshots.md#动效清单)、[排行榜](docs/rankings-browsing.md#动效清单)、[详情演员与相关作品](docs/detail-discovery.md#动效清单)、[历史管理](docs/guest-history-management.md#动效清单)、[追更](docs/design/following.md#动效与交互清单)与[预约](docs/design/reservations.md#动效与交互清单)。

## Voice & Content Strategy

目的地用对象名，操作用结果动词，状态用简短事实。布局已说明的上下文不再重复；只有影响决策的范围、后果、前提或恢复方法需要额外说明。文案不展示组件、传输或存储实现细节。

| 对象／数据         | 表达规则                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 观看               | “播放”开始观看，“继续观看”使用已保存进度，“重播”从头播放；不把进入详情写成直接播放                                                                             |
| 记录               | 区分“观看记录”与“搜索记录”；“移除”影响单项，“清空”说明当前作用域，不能将本机操作写成清空云端                                                                   |
| 收藏／追更／预约   | 分别对应保存剧目、后续更新、待上线提醒；只在实际支持并确认成功时显示对应结果，不互作同义词                                                                     |
| 输入错误／请求失败 | 前者说明如何修改；后者说明未完成的操作与真实恢复动作。应用按错误类别生成文案，原始 Error、HTTP 状态和堆栈留给诊断，不直接拼入界面                              |
| 时间／集数         | 可见播放位置统一 `mm:ss`，达到一小时用 `h:mm:ss`；读屏可用“12 分 36 秒”等自然表达，含义与可见值一致。集数用“第 N 集”，数量用“N 集”；本集完成表达为“本集已看完” |
| 未知／空／零       | 未知不当成 0、首集或失败；零是已知数值，空是已确认无内容。未知时长不显示伪造比例；确无必要的元信息直接省略                                                     |
| 日期／统计／单位   | 日期只消费真实来源，跨日文案依据同一明确时区；计数使用同一精度与单位。观看累计不从历史条数推算，比例不冒充绝对量                                               |

格式与错误映射由 app 的共享格式化／业务边界负责，UI 只渲染值与状态；不为单个页面复制转换函数，也不为未支持能力新增状态。首页、历史与播放器共用 `packages/app/src/format.ts`；目录、记录与账号等请求错误共用 `error-messages.ts`，保留原始诊断，取消不显示失败。

## Components

单一 `@hongguo/ui`，一个 API、同一受控值和行为。`nsh/base` 提供语义与基础交互，UI 层拥有样式和必要输入适配，app 拥有业务、副作用、来源身份与导航，apps 只装配宿主。普通页面从包根导入，不直接给 base 控件补一套外观。

### 组件架构与尺寸契约

`packages/ui/src` 不出现端型判断；基础组件只通过 `size` 取得几何。数值来自 app 级主题：桌面（含验收宿主）用 `theme.json`，TV 用 `theme.tv.json`，组件只读 `--space-*`、`--radius-*`、`--text-*`、`--control-*` 这些 token。

| 档位 | 高度 | 字号 | 水平／垂直内距 | gap | 圆角 | 图标 |
| ---- | ---- | ---- | -------------- | --- | ---- | ---- |
| sm   | 32   | 14   | 12／4          | 6   | 8    | 16   |
| md   | 40   | 16   | 16／8          | 8   | 12   | 20   |
| lg   | 60*  | 22*  | 24／12*        | 12  | 12   | 26*  |

- `size` 只决定几何，不决定交互；不能写 `if (size === 'lg')` 触发遥控行为。
- 40 是桌面鼠标密度：16 号字、1.5 行高（24）加 8×2 垂直内距正好 40；44 是移动端触控目标，桌面偏大。32 容纳 14 号字、1.5 行高（21）加 4×2 垂直内距，并留 3px 余量。
- TV 表面实测是 960×540dp（1080p 与 4K 电视的 dp 宽都归一到这里）。`theme.tv.json` 因此给 TV 自己的值：控件统一 48dp（18 号字、20／10 内距、10 gap、12 圆角、22 图标），sm／md／lg 三档同值，组件传任何 `size` 都不改变 TV 视觉。
- `lg` 的桌面值只在确有超大动作时使用；标 * 的值在 TV 上不生效。
- `controlMetrics(size)` 读 `--control-<size>-*`；`space(name)`、`radius(name)`、`textSize(role)` 读对应 token。没有 `unit()`／`adaptive()`／`Scale`。
- 选集是组件配方，不新增档位：桌面详情 48、播放器面板 42、TV 48。Badge 28、RankingCard 42 也归配方。
- `Avatar` 的 `sm`／`md`／`lg` 分别取 32／40／64，与 `control sm`、默认控件高度和大号卡片同档；头像与其他控件同排时与它们同高、同中线。三档都是正圆；无图、加载中或失败显示首字，未登录显示轮廓图标而不是臆造的首字。账号头像只接受核心校验过的公开 HTTPS 图片；本机不自行拼接或信任上游原始字段。

```yaml
controls:
  sm-desktop:
    height: 32px
    fontSize: 14px
    paddingHorizontal: 12px
    paddingVertical: 4px
    gap: 6px
    iconSize: 16px
    rounded: '{rounded.lg}'
  md-desktop:
    height: 40px
    fontSize: 16px
    paddingHorizontal: 16px
    paddingVertical: 8px
    gap: 8px
    iconSize: 20px
    rounded: '{rounded.xl}'
  lg-desktop:
    height: 60px
    fontSize: 22px
    paddingHorizontal: 24px
    paddingVertical: 12px
    gap: 12px
    iconSize: 26px
    rounded: '{rounded.xl}'
  sm-tv:
    height: 48px
    fontSize: 18px
    paddingHorizontal: 20px
    paddingVertical: 10px
    gap: 10px
    iconSize: 22px
    rounded: '{rounded.xl}'
  md-tv:
    height: 48px
    fontSize: 18px
    paddingHorizontal: 20px
    paddingVertical: 10px
    gap: 10px
    iconSize: 22px
    rounded: '{rounded.xl}'
  lg-tv:
    height: 48px
    fontSize: 18px
    paddingHorizontal: 20px
    paddingVertical: 10px
    gap: 10px
    iconSize: 22px
    rounded: '{rounded.xl}'
```

TV 行为用显式 props，不从 size 推导：

| 组件             | TV 行为                                        | 默认                  |
| ---------------- | ---------------------------------------------- | --------------------- |
| `TextInput`      | `activation="confirm"`，`onCommit`／`onCancel` | `activation="direct"` |
| `Slider`         | `activation="confirm"`，确认提交／返回回滚     | `activation="direct"` |
| `RadarTable`     | `focusMode="row"`                              | 单元格／指针          |
| `Tooltip`        | `disabled`                                     | 可用                  |
| `KeyHint`        | `remote` 取 `remoteLabel`，不用等宽字体        | `keyLabel`            |
| `CinemaControls` | `variant="overlay"`                            | 内联控制条            |
| `Button`（导航） | `align="start"`                                | 居中                  |
| `FilterChoices`  | `variant="select"`                             | `variant="chips"`     |

### 标签列表

筛选标签只有两个组件：`ChoiceList`（纯标签行）与 `LabeledChoiceList`（同一行加名称列）。首页、找剧、排行榜、上新日历与榜单雷达全部由这两者构成，页面只提供值与回调，不写自己的圆角、最小宽、间距或换行策略。

- 选项取 `Button sm quiet`：32 高、圆角 8、间距 8，选中用 `accent` 配对，未选正文色，禁用 `muted-foreground`。不设最小宽，宽度由文字决定；页面不覆盖这些值。
- 选项**换行**而非横向滚动：横滚会把大部分选项藏在不可见边缘之后，读者既不知道有多少项，也不知道还能往哪滚。行内为焦点轮廓预留上下各 6（2 轮廓 + 4 offset），不再靠固定 56 容器留位。
- `LabeledChoiceList` 的名称列 72 宽，放得下服务端最长的中文组名（“服务端时段”五字）。名称与首行选项同中线，不随多行块漂移，也不因折叠而消失。
- 列表以位置为槽位而非以值为键：`CardControls` 按挂载顺序登记成员，值键会让重排或收缩后的 Home/End 与方向键沿旧顺序移动。每次槽位读取新的值时要重新登记引用。
- 聚焦组、方向键、来源恢复与遥控语义仍归 `CardControls`；页面可选的 `onOptionFocus`（滚动到可视区）和 `restoreFor`（守卫过期来源）只表达行为，不影响样式。

```yaml
components:
  button-sm:
    height: 32px
    padding: 12px
    rounded: '{rounded.lg}'
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  button-md:
    height: 40px
    padding: 16px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  button-lg:
    height: 60px
    padding: 24px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  button-primary:
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
  input-md:
    height: 40px
    padding: 16px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  surface:
    padding: 24px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  dialog:
    width: 480px
    padding: 32px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.popover}'
    textColor: '{colors.popover-foreground}'
  side-panel:
    width: 440px
    padding: 32px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.popover}'
    textColor: '{colors.popover-foreground}'
  popover:
    width: 320px
    padding: 24px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.popover}'
    textColor: '{colors.popover-foreground}'
  menu:
    width: 200px
    padding: 8px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.popover}'
    textColor: '{colors.popover-foreground}'
  tooltip:
    width: 320px
    padding: 12px
    rounded: '{rounded.xl}'
    backgroundColor: '{colors.cinema}'
    textColor: '{colors.cinema-foreground}'
  badge:
    height: 28px
    padding: 10px
    rounded: '{rounded.md}'
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
```

这些是配方参考值，不是页面可自由覆盖的 props。`button-primary` 只固定颜色配对，几何随 `sm`／`md`／`lg`；`button-md` 等几何 token 只描述尺寸。Dialog 宽先取 480／800，再夹到 `视口宽 − 48／96`；SidePanel 440／640；Popover 320／480，夹到 `视口宽 − 24／48`；Menu minWidth 200／280，maxWidth 为 `视口宽 − 24／48`。遮罩使用 `cinema/40`，不新增第二种遮罩色。

### 动作层级与状态组合

- `primary` 属于当前决策区的默认观看或提交动作，不因操作常用、只有一个按钮或位于卡片内就使用红色。全局搜索为普通／轻量操作；独立搜索页的搜索提交可为 primary。重复续播卡使用普通按钮，详情／TV 推荐主区保留主要观看动作；不要求每页必须有红色按钮。
- 页面级返回统一使用 `BackButton`：前导箭头加目的地名（“返回发现”“返回详情”），静止态无表面与边界，悬停／按下沿用 `Button quiet` 的 `muted`／`border` 底色；箭头本身对齐页面文字轴，不另加左侧内距，也不在页面上方单开一条带内距的返回栏。它位于页面内容列的第一行，随该页滚动；影院语境用 `tone="cinema"`，底色改为影院配对。标签由目标决定，不用泛化“返回”掩盖去向。
- 深色内容区的辅助操作使用已有 `CinemaButton`；普通页面使用 `Button`。TV 推荐区即使位于浅色页面也保持影院配对，不让辅助操作变成白色实底。播放主动作仍使用 primary。
- Button 外观优先级为：disabled／pending → selected → variant 的默认／hover／pressed。选中背景、文字和图标必须成对使用 accent／accent-foreground；不能保留 primary-foreground。禁用／等待覆盖选中外观但保留调用方的选中值；可用性恢复后仍显示原选择。
- focus 是独立轮廓，可与以上状态并存，不替代选择、不改变尺寸。选中项的 hover／pressed 不覆盖选中配对；危险操作始终通过动作名称表达后果，选中不能成为执行危险动作的确认。
- 选中与可用性切换即时更新；未选中按钮沿用 100ms 颜色反馈；焦点即时；减少动态效果时去掉颜色过渡。层级调整不增加入场、位移、缩放或新状态机。

| 状态              | 必须保持的行为与外观                                   |
| ----------------- | ------------------------------------------------------ |
| hover／pressed    | 轻量颜色反馈，几何稳定；TV 必要操作常显                |
| focus             | 即时独立轮廓，与选中／错误同时可辨；隐藏控件不接焦点   |
| selected／checked | 选中底色、可读文字与适用的勾选标记；不依赖颜色独自传义 |
| disabled          | 不响应操作，保持可理解文字；不整体淡出周围内容         |
| pending           | 防重复动作，保留上下文、可见状态与取消／返回路径       |
| error／empty      | 邻近对象说明问题与恢复动作，保留输入、已加载结果和位置 |

### 默认边框控件规范

基础组件和产品设计稿使用同一条边界规则：普通按钮、选集按钮和导航外的可操作选项使用 `card` 表面、正文色和 `input` token 的 1px 边框，与输入框、下拉共用同一条控件边界；默认态不使用品牌色边框。悬停使用 `muted`，按下使用 `border`，焦点使用独立 `ring` 轮廓，不改变控件尺寸。`primary` 仅使用品牌色实底；`selected` 使用 `accent` 表面和配对文字。输入框、Select 和错误字段继续使用 `input`／`destructive` 边界。

| 控件状态     | 表面／文字                                    | 边界                        | 说明                                     |
| ------------ | --------------------------------------------- | --------------------------- | ---------------------------------------- |
| 默认边框按钮 | `card`／`foreground`                          | `input`，1px                | 普通动作、选集、可操作选项               |
| 悬停／按下   | `muted`／`foreground`                         | `border`                    | 只改变颜色，不位移或放大                 |
| 选中         | `accent`／`accent-foreground`                 | `accent` 或透明             | 必须保留可读文字和语义标记               |
| 主要动作     | `primary`／`primary-foreground`               | 透明                        | 当前区域唯一主要决策动作                 |
| 页面返回     | `foreground`；悬停沿用 quiet 按钮             | 透明（悬停变 `muted` 表面） | `BackButton`；影院语境改用 `cinema-*`    |
| 复选／开关   | `primary-strong`／`primary-strong-foreground` | `primary-strong` 或透明     | 标记、横杠与拇指和实底成对 ≥3:1          |
| 输入／Select | `card`／`foreground`                          | `input`，1px                | 与按钮共用控件边界，搜索组合只有一条外框 |

### 内容图片

封面用于识别内容，不承载唯一剧名、状态或操作。只使用实际内容源；样板图片不冒充业务素材。共享 Cover 持有裁切与失败状态，页面不自定义遮罩或取景。

| Cover 组合                | 裁切与几何                                         | 内容安全区                                                                                                                                               |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认海报                  | object-cover；桌面 center 30%，TV top；独立圆角 12 | 桌面常规比例 2:2.7；有限视口按实际文字高度收缩封面，最小 96，空间充足保留比例；TV 沿用可用高度约束。剧名与两行元信息在图外，完整内容保留可访问名称／说明 |
| inline（续播）            | object-cover、top；内圆角 0，由外框裁切            | 固定左图宽，右侧文字与操作不覆盖图片                                                                                                                     |
| feature（精选／详情影院） | object-cover、center 28%；内圆角 0                 | 沿用右侧 48% 图片、左侧文案与影院渐隐；不把文字压在主体脸部上                                                                                            |

缺失或加载失败显示中性占位，保留标题、选集与操作；src 变化后重新尝试，列表身份与焦点不因此重置。不得从图片颜色推导界面主题。图片允许裁切，实际视频必须等比 contain；封面规则不应用到播放画面。

### 输入、导航与弹层

- 搜索组合只有一条边界；输入和提交同高，清空是独立动作，不能双重描边。字段提供名称、错误关联，IME 编辑优先。
- Select 的当前值靠起始端，箭头在末端，中间允许文字收缩；普通触发器使用 input 边界，影院触发器保留影院配对；箭头使用 muted-foreground，比当前值低一层。两端共用此内部结构，保留来源焦点适配。Menu 与 Popover 的触发器共用这条结构：标签靠起始端、chevron 在末端，打开时触发器和 chevron 一起换成 accent 配对并转向上。
- 打开态只由 accent 配对、chevron 朝向与候选光标表达，不再叠加焦点轮廓：指针打开也会落焦点，画环等于把键盘提示发给鼠标用户，且 4 单位 offset 的轮廓正好被贴边弹层裁掉下弧。键盘 Tab 到关闭的触发器仍使用独立 `ring` 轮廓。这与 Menu／Popover 触发器的打开态一致。
- 候选行内容垂直居中：行自身居中并读取档位行高（1.5 比例），使文字盒落在行中线上；不靠上下内距硬凑，档位变化时仍居中。已选行只保留 `accent-foreground` 勾选标记和正文色文字，不使用选中底色；`accent` 只属于指针与键盘光标所在的候选行，因此刚打开时不会同时出现两种“选中”观感。未选行文字保持正文色，禁用行降为 muted-foreground。
- Tabs 用 2 单位品牌下划线标出选中项，下划线压住整行分隔线；可用未选项使用正文色和常规字重，不用药丸底色，hover 才出现 muted 填充。禁用项只用 muted-foreground 文字、不填充表面，保留名称；选中且禁用时保留下划线，配对改为禁用色。ChoiceGroup 禁用同样覆盖强调配对，但保留勾选标记；标记槽始终占位，切换不移动文字。focus 始终独立，不以降低整个区域透明度表示禁用。
- TV 顶栏导航的当前项不用下划线：`Button` 以 `currentSurface="contrast"` 把当前配对换成 `foreground` 实底与 `background` 文字的反色胶囊，三米距离可辨；桌面侧栏当前项保持 `muted` 共享表面。两种表达共用同一 `current` 语义，读屏一致。TV 头部动作统一为默认边框控件——搜索带字，设置与账号为图标钮，时钟是栏内唯一裸文本；头部与内容之间靠间距分层，不加表面或分隔线。
- 账号只有一个带名字的入口：桌面在侧栏底部与设置同组，顶栏右侧只放头像（未登录时是轮廓图标），不再重复账号名。顶栏是固定高度的条，账号名可能是服务端给的“用户”加一长串数字，写在那里既与侧栏重名又会撑开条宽；头像本身已经表明身份，名称在账号页和侧栏承担。
- 滚动承载为外轮廓留安全区，覆盖首末行及两侧；安全区按实际 outline 与 offset 取足够值，不能因 TV 缩放而小于轮廓范围。
- 桌面 Tab 进入区域，方向键依控件语义处理。NSH Tabs 方向激活；Select 候选移动不提交，确认才选择。
- `activation="confirm"` 的文本框：确认进入编辑，返回保留草稿；编辑时不抢左右光标。`activation="confirm"` 的 Slider：确认进入调整、左右预览、确认提交、返回回滚；媒体定位和预览会话仍归 app。
- 返回先处理最上层弹层／选集／定位，再处理控制层与页面；关闭后恢复有效来源。较新用户输入优先于迟到回调。页面级返回一律用 `BackButton`，目标名由导航栈决定（上一路由，或浏览根返回的栏目），弹层内的关闭仍用各自的关闭动作，两者不混用。
- Dialog、Sheet、Select、Menu、Popover 使用对应语义；搜索建议为非模态。危险确认默认安全动作，失败不销毁原输入。隐藏层、非活动页面和离场内容不继续接焦点。

### 无障碍语义与状态验收

- 每个操作具备名称、角色、当前值和适用状态；纯图标由所属操作命名，装饰图形隐藏。真正的页面／栏目标题使用标题语义与层级，卡片剧名不因字号大就成为标题。
- 字段的可见名称与可访问名称一致；错误不仅变红，还提供具体原因并关联到输入。`Field` 负责排版和可见反馈，不自动向任意 children 注入属性；调用方给 `TextInput` 显式传入相同 label、invalid 和 description（优先错误，其次帮助）。组合控件负责完整传递。
- TV 的进入编辑目标与编辑中的输入保持名称、值、禁用、错误和说明的一致性。禁用阻止操作；只读允许阅读当前值；两者不能互代。实际读屏遍历与遥控焦点分别验收。
- pending 是动作正在进行，disabled 是当前不可操作。等待需有可见状态和可访问忙碌表达，既可由按钮也可由所属状态区域提供；仅把按钮变灰不够。保留输入与选择、防止重复提交，结束后表达实际结果和可用恢复动作，不宣告尚未完成的成功。
- 选择控件禁用后仍能辨认既有选中／部分选中／开关值；标记、前景与底色成对验证。禁用选中使用 `accent` 实底与 `accent-foreground` 标记／拇指，禁用未选中使用 `muted` 表面与 `border` 边界，禁用开关关闭态使用 `border` 轨道与 `muted-foreground` 拇指，保留开关结构。禁用态不直接套用可操作控件的对比度合规结论，但不能因此隐藏用户已有值。
- 错误、加载完成等关键状态在适当时机播报，不抢焦点；进度变化不逐帧播报。隐藏与非活动内容退出焦点和可访问遍历，弹层关闭、列表删除后恢复有效来源。

状态按组件职责验收，不给所有组件硬加 pending／error 等 API：动作检查 selected＋disabled／pending 和恢复；输入检查错误＋焦点、只读、禁用和 IME；选择检查 checked／mixed＋disabled；弹层检查打开、取消、失败、来源消失与焦点返回；反馈检查未知总量与减少动态效果；内容检查长文、缺图和稳定身份。浅深主题与适用端型都要覆盖，行为、外观和语义分开记录。

### 加载与占位

加载区域只回答“数据还没到”，不把未开始推断成空或失败；只有请求成功返回后才允许出现空状态或数量。

| 数据状态                           | 表达                                          | 恢复         |
| ---------------------------------- | --------------------------------------------- | ------------ |
| 未开始／首次加载（无数据、无错误） | 该区域显示骨架，几何与真实内容一致            | 无           |
| 刷新／筛选切换（已有数据）         | 保留旧内容原位，计数位置显示“正在更新…”       | 无           |
| 失败且无数据                       | 原位 `Notice`，说明未完成的操作与真实恢复动作 | 重试         |
| 成功且无内容                       | 空状态，说明无内容原因与下一步                | 筛选／去浏览 |
| 成功                               | 真实内容                                      | —            |

- 骨架只画几何，不做 shimmer、脉冲、入场或逐条错峰；骨架换真实内容不叠加 `ContentArrival`。
- 每个加载区域只播报一次“正在加载…”，区域提供可访问忙碌语义；占位块退出无障碍遍历与焦点。错误与完成状态按无障碍规则播报，不抢焦点。
- 骨架块使用 `skeleton` token，承载骨架的表面（如精选区图版）使用 `skeleton-surface`；不以 `muted`／`border` 拼骨架。
- 区块标题保留；网格计数更新时显示“正在更新…”。分页使用 `Button` 的 pending 与 displayLabel，不另造 Spinner。
- 桌面与 TV 共用同一状态模型；TV 骨架不进入遥控焦点。策展区（首页精选）跟随目录数据：目录失败或确认空时不显示空壳。

### 统一图标

固定 `lucide-static@0.468.0` 官方 SVG，唯一资源、许可证和 SHA 位于 `packages/ui/assets/lucide/`。生产只经 UI 的 `Icon` 消费；设计稿、原型和 NSH 共享官方来源、名称及语义映射。禁止手写、临摹或修改 SVG/path，不混图标库、emoji 或字符图标；缺图先用文字。

保留官方 24×24 网格、几何与 2 单位描边，显示尺寸使用共享档位，不为页面改路径或线宽。颜色由语义 token 提供，纯图标动作有可访问名称，装饰图标不重复朗读。品牌、内容封面和系统原生控件自带图标除外。运行 `pnpm ui:icons` 再生，`pnpm ui:icons:check` 检查漂移，不手改生成结果。

## Do's and Don'ts

- 先复用公共组件与已有页面组合；确有差异时在共享层增加有限变体，不创建 DesktopButton／TvButton 或重复业务状态机。
- 基础组件只接收 `size`，不读端型；主题选择、尺寸和 TV 行为只在 app 根装配。不要把 `lg` 当遥控开关，不要把端型判断藏进组件内部。
- 尺寸只取 `sm`／`md`／`lg`；不要在页面写 44／36 等旧档位，也不要用 `style` 改控件内距、字号或圆角。
- token 名称和值以本文件 YAML 与表格为准；改 YAML 后跑 `pnpm design:codegen` 生成两份 theme 与 `tokens.generated.ts`，组件里不写裸 hex、`dark:` 补丁或第二套字号。
- 以真实数据组织找剧、详情和安静观看；保留输入、卡片身份、列表位置、实际播放进度和精确来源焦点。
- 变更同步规则、主题／组件源、浏览器样板和原生验收页。可操作样板见[组件板](design/prototype/visual-redesign-real/components/index.html)，组合细节见[设计交接](docs/design/component-design.md)。
- UI 修改执行各入口 check **和** build、现有组件行为回归与相关真实宿主观察；根门禁按工程规范执行。依赖变化另跑 security，缺工具不能静默跳过。
- 视觉检查覆盖浅深主题、字级、边界、对齐、长文、状态叠加、焦点裁切、字号放大和减少动态效果。保存实际源码／宿主／尺寸与证据，未验项明确记录。
- 不将浏览器、headless、macOS TV 密度、Android 模拟器和物理电视相互替代；组件通过不等于整页、真实账号、媒体解码、独立安装包或正式发行通过。
