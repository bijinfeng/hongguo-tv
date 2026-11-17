# Design tokens

状态：提案，2026-11-17。用于评审 token 分层、命名和迁移顺序；尚未替换运行值。颜色仍以 [theme.json](../../packages/ui/theme.json) 为唯一源，控件尺度以 [foundation.ts](../../packages/ui/src/foundation.ts) 为准，字级以 [typography.ts](../../packages/ui/src/typography.ts) 为准，视觉关系以 [DESIGN.md](../../DESIGN.md) 为准。本文不复制十六进制色值，避免出现第二份颜色源。

## 1. 结论

现有颜色层已经接近成熟库的语义层；问题在其余四类 token 没有唯一入口：

| 类别 | 当前实际来源                                              | 盘点                                                                   | 主要问题                                                            |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 颜色 | `theme.json`                                              | 浅深各一组语义角色，组件用 class 或 `token()` 消费                     | 语义基本完整；缺状态/遮罩的显式配方，仍有 `bg-cinema/40` 等裸透明度 |
| 间距 | DESIGN 散文、内联 `unit()`、NSH utility class             | 99 处 `unit()`；约 40 处 `text-*`/`gap-*`/`rounded-*`/`p-*` 裸 utility | 没有可执行 scale；页面和组件各自选数                                |
| 圆角 | `theme.json` 的 `radius` 12，加局部 8/6/4/3               | 控件多数走 `controlMetrics().radius`，例外散落                         | 没有命名档位；3 与 6 没有归属                                       |
| 尺寸 | `foundation.ts` 的 md/sm/TV，加组件局部值                 | 普通控件三档清楚；选集 48/42/80、弹层宽度等各自维护                    | 只有控件档位是 token；组件尺寸和布局常量没有登记                    |
| 字体 | `typography.ts`                                           | 8 个角色，TV 经 `tvUnit`；display 桌面为 38–56 流体                    | 角色可用，但 `text-sm`/`text-xs`/`text-xl` 绕过角色                 |
| 端型 | 根 `Product.Provider`，95 处 `Product()`，90 处字符串比较 | 68 处只是纯尺寸换算，7 个文件各写一份 `unit`                           | 端型判断与尺寸换算混在组件里                                        |

目标不是再抄一套 Ant Design，而是建立三层可执行的约定：

1. **primitive**：4px 间距 scale、有限圆角 scale、字级角色、控件档位。只定义值，不描述业务。
2. **semantic**：文字/表面/边界/动作/状态/密度角色。组件和页面只消费这一层。
3. **component**：Button、Input、Surface、Overlay、Player 等固定配方。例外只登记在配方里，不下沉为页面自由值。

## 2. 与成熟库的对照

| 系统       | 分层                                                                      | 间距                                                          | 圆角                                              | 字体                                                                           |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ant Design | Seed → Map（算法派生）→ Alias → Component Token；组件消费 Alias/Component | `sizeUnit` 4，XXS 4 到 XXL 48；另有 padding/margin 命名 token | 基准 6；XS 2、SM 4、LG 8；组件可覆盖              | 基准 14；SM/default/LG/XL；标题 38/30/24/20/16；行高按角色                     |
| shadcn/ui  | CSS variables → Tailwind；语义色成对，dark 覆盖同名变量                   | 不自建 spacing token，直接用 Tailwind 4px scale               | 单一 `--radius` 基准，派生 sm 0.6× 到 4xl 2.6×    | 不自建字体 token，直接用 `text-*` utility                                      |
| MUI        | theme.palette / shape / typography / components overrides                 | `theme.spacing` 基准 8px，`spacing(2)` = 16px                 | `shape.borderRadius` 基准 4px，可扩展 Sm/Md/Lg/Xl | 13 个 variant；基准 14、html 16、pxToRem；每个 variant 固定字号/行高/字重/字距 |

共同点：原始值、语义角色、组件配方分开；间距只有一个 scale 或函数；圆角有基准和有限派生；字体有固定 variant；每个 token 有使用条件，而不是只列值。

本项目采用其中的“三层 + 有限档位”，不采用 Ant 的算法派生：组件规模还不需要运行时调色算法，显式 token 更容易审查，也更适合 Agent 定位。

## 3. 颜色

### 3.1 角色

颜色值只在 `theme.json`。下表规定“用在哪、和谁配对、不能做什么”。

| Token                                          | 配对 / 说明        | 典型用途                                   | 不要用于                              |
| ---------------------------------------------- | ------------------ | ------------------------------------------ | ------------------------------------- |
| `background` / `foreground`                    | 成对               | 页面外壳、正文、普通标题                   | 控件实底；控件用 `card`               |
| `card` / `card-foreground`                     | 成对               | 普通内容表面、按钮/输入默认表面            | 浮层；浮层用 `popover`                |
| `popover` / `popover-foreground`               | 成对               | Dialog、Sheet、Menu、Popover、Select 候选  | 普通卡片                              |
| `primary` / `primary-foreground`               | 成对               | 当前决策区唯一的主动作                     | 选中态；选中用 `accent`               |
| `primary-strong` / `primary-strong-foreground` | 成对，对比度 ≥ 3:1 | 复选、部分选中、开关实底与标记             | 大面积按钮；普通 hover                |
| `muted` / `muted-foreground`                   | 成对               | 次要表面、辅助文字、禁用文字/表面          | 错误；错误用 `destructive`            |
| `accent` / `accent-foreground`                 | 成对               | 选中项、轻量强调                           | 焦点；焦点用 `ring`                   |
| `border`                                       | 单色               | 内容分区、装饰边界、禁用控件边界           | 可操作识别；可操作边界用 `input`      |
| `input`                                        | 单色               | 输入、下拉、复选、按钮、选集共用的控件边界 | 内容分隔线；分隔线用 `border`         |
| `ring`                                         | 单色               | 独立焦点轮廓，可与选中/错误同时出现        | 选中底色；选中用 `accent`             |
| `destructive`                                  | 必须配文字         | 错误、危险动作                             | 单独用红色表达后果                    |
| `skeleton` / `skeleton-surface`                | 成对               | 加载占位与占位表面                         | 空状态；空状态用正文和恢复动作        |
| `cinema` / `cinema-foreground`                 | 成对               | 播放器、精选影院区、影院文字               | 普通页面背景                          |
| `cinema-muted`                                 | 单色               | 影院次要文字、禁用图标                     | 普通页面 muted                        |
| `cinema-control`                               | 单色               | 影院控件默认表面                           | 普通按钮                              |
| `cinema-hover` / `cinema-active`               | 单色               | 影院控件 hover / pressed                   | 普通按钮状态                          |
| `cinema-track`                                 | 单色               | 播放器进度/音量轨道                        | 普通滑杆                              |
| `cinema-focus`                                 | 单色               | 影院焦点                                   | 普通 `ring`；影院必须显式配对         |
| `cinema-transparent`                           | 透明               | 影院渐变终点                               | 普通遮罩；普通遮罩用 `cinema/40` 配方 |

当前没有 `secondary`、`success`、`warning`、`info`、`chart-*`、`sidebar-*`。`muted`/`accent` 已覆盖 shadcn 的 secondary/emphasis 职责；成功/警告/信息只在产品出现真实状态时增加，不能为了“完整”先造 token。

### 3.2 状态配方

状态不新增十六进制，而是固定“表面 + 文字 + 边界”的组合。

| 状态         | 表面             | 文字/图标               | 边界                  | 说明                                               |
| ------------ | ---------------- | ----------------------- | --------------------- | -------------------------------------------------- |
| 默认边框控件 | `card`           | `foreground`            | `input` 1px           | 普通按钮、选集、可操作选项                         |
| hover        | `muted`          | `foreground`            | `border`              | 只换色，不位移、不放大                             |
| pressed      | `border`         | `foreground`            | `border`              | 与 hover 同一几何                                  |
| selected     | `accent`         | `accent-foreground`     | `accent` 或透明       | 必须保留可读文字和语义标记                         |
| primary      | `primary`        | `primary-foreground`    | 透明                  | 当前区域唯一主动作；hover/pressed 用同色透明度配方 |
| destructive  | `card`           | `destructive`           | `input`               | 危险靠动作名称表达，不靠红色实底                   |
| current      | `muted`          | `foreground`            | `input`               | 当前所在目的地，不是选中                           |
| disabled     | `muted`          | `muted-foreground`      | 透明或 `border`       | 不整体淡出周围内容                                 |
| pending      | `muted`          | `muted-foreground`      | 透明                  | 保留上下文、可见状态和取消/返回                    |
| focus        | 不改变           | 不改变                  | `ring` 2px 独立轮廓   | 与 selected/error 可同时出现                       |
| error field  | `card`           | `foreground` / 错误文字 | `destructive`         | 错误必须有关联文案                                 |
| cinema       | `cinema-control` | `cinema-foreground`     | `cinema-focus` / 透明 | 影院控件显式配对，不继承普通页面色                 |

### 3.3 规则

- 页面和组件不写十六进制、`rgb()`、品牌色名，不写 `dark:` 颜色；浅深由 `theme.json` 同名变量切换。
- 颜色必须成对消费：有表面的地方说明前景；`border` 不承担可操作识别，`input` 才承担控件边界。
- 选中只使用 `accent` / `accent-foreground`；焦点只使用 `ring`；两者不能互相替代。
- 普通文字 ≥ 4.5:1，大文字 ≥ 3:1，控件边界/焦点/状态标记 ≥ 3:1；真实宿主还要看细线、缩放和裁切。
- 透明度只允许两类：主题提供的透明 token（如 `cinema-transparent`）和登记在组件配方里的遮罩/动作 alpha（如 `cinema/40`、`primary/90`）。页面不新写 `/60`、`/20`。
- 新状态色必须同时给出浅色、深色、成对前景、对比度和真实使用位置；没有真实状态就不加。

## 4. 间距

### 4.1 primitive scale

采用 4px 数值 scale，而不是 t-shirt 名。理由：现有值本来就是 4 的倍数；NSH/Tailwind 的 `gap-6` 就是 24，数值名和 utility class 可以直接对应；Agent 看到 `space-6` 能算出 24，不需要再查表。

| Token      | 值（参考单位） | 典型用途                                               |
| ---------- | -------------- | ------------------------------------------------------ |
| `space-0`  | 0              | 明确取消间距                                           |
| `space-1`  | 4              | 同一对象的文字与元信息；仅既有卡片配方允许 TV 也保留 4 |
| `space-2`  | 8              | 图标与文字、字段标签与控件、紧凑内部 gap               |
| `space-3`  | 12             | 相关内容、Surface 内连续内容、海报图文                 |
| `space-4`  | 16             | 同组控件（桌面）、表单组、卡片内容块                   |
| `space-6`  | 24             | Surface 内距、同组控件（TV）、区块内分隔               |
| `space-8`  | 32             | 两个独立栏目（桌面）、Dialog 内距、播放器选集栏关系    |
| `space-10` | 40             | 大区块/页面级分隔（桌面）；不做组件内部默认            |
| `space-12` | 48             | 两个独立栏目（TV）、页面级大分隔                       |

`20`、`28`、`44`、`88`、`96` 等不进入公共 scale。它们是明确组合的配方值，由所属组件或外壳登记；页面不能因为“看起来差不多”就取 20 代替 16/24。

### 4.2 语义间距

组件优先消费语义间距，不直接选 `space-*`。语义间距负责桌面/TV 的差异。

| Token           | 桌面 | TV  | 使用条件                                |
| --------------- | ---- | --- | --------------------------------------- |
| `gap-text`      | 4    | 4   | 剧名与元信息；TV 只保留在既有卡片组合内 |
| `gap-content`   | 12   | 12  | Surface 内连续内容、进度与操作的距离    |
| `gap-control`   | 16   | 24  | 独立操作之间；可换行，不压缩目标尺寸    |
| `gap-section`   | 32   | 48  | 两个独立栏目；不在每个子项间重复        |
| `inset-surface` | 24   | 24  | Surface 固定内距                        |
| `gap-inline`    | 8    | 12  | 图标与文字、按钮内部行内关系            |

例外仍由组件配方维护：PosterCard 图文 12/14，ContinueCard 20/28，影院左内距 44，TV 外壳 88/132。它们不是页面可选值。

### 4.3 规则

- 先判断关系（同一对象 / 相关内容 / 同组控件 / 区域分隔 / 表面内距），再选语义 token；不要从数值反推关系。
- 页面布局可以用 `space-*` 排列区域；组件内部优先用 `gap-*` / `inset-*`。
- 同一页面不要混用“16 和 20 都表示同组控件”这类近似值；需要新值时先登记配方，不在调用点写常数。
- TV 的间距经 `unit()` 换算，不把 1920 设计值直接当 dp；TV 需要更大关系时改语义 token，不逐调用点乘系数。
- 允许容器随系统字号增长；不要用固定高度裁掉文字来维持间距。

## 5. 圆角

### 5.1 scale

| Token         | 值   | 用途                                                             |
| ------------- | ---- | ---------------------------------------------------------------- |
| `radius-sm`   | 4    | 骨架文字行、封面内元素、紧凑内部块                               |
| `radius-md`   | 6    | Badge、局部小表面；当前唯一 6 的使用点                           |
| `radius-lg`   | 8    | 紧凑影院控件、有限组合                                           |
| `radius-xl`   | 12   | 控件、Surface、Dialog/Sheet/Popover 的默认圆角（NSH `--radius`） |
| `radius-full` | 9999 | 头像、滑杆拇指、进度条胶囊；6 高轨道 + full 等价于原 3           |

不提供任意圆角。`radius-xl` 是默认，`radius-lg` 只给紧凑组合，`radius-md`/`sm` 只在组件内部使用。

### 5.2 规则

- 普通控件和内容表面用 `radius-xl`；不要因为“更柔和”改成 16 或 20。
- 嵌套表面圆角与内距协调；外框负责裁切，贴边图片不再画内圆角。
- 焦点轮廓独立，不能被容器裁掉；TV 参考值同样经 `unit()`。
- 边界宽度 token 固定 1；焦点宽度 2。当前 Button 焦点 offset 4、输入焦点 offset 3，先作为组件配方保留，后续统一时再评审视觉差异。

## 6. 尺寸

### 6.1 控件档位

| Token        | 高度 | 字号 | 水平内距 | 垂直内距 | gap | 圆角 | 图标 |
| ------------ | ---- | ---- | -------- | -------- | --- | ---- | ---- |
| `control-md` | 44   | 16   | 16       | 8        | 8   | 12   | 20   |
| `control-sm` | 36   | 14   | 12       | 8        | 8   | 12   | 18   |
| `control-tv` | 60   | 22   | 24       | 12       | 12  | 12   | 26   |

- 只有 `md` / `sm` 两个语义档位；TV 忽略 `sm`，始终使用舒适目标，不提供“更小的 TV 控件”。
- 尺寸是最小值；系统大字允许增长，不固定裁切。
- 图标尺寸由控件档位派生，不单独传任意数字。
- 选集是组件配方，不新增档位：桌面详情 48、播放器面板 42、TV 80。

### 6.2 组件尺寸

这些值属于组件配方；页面不能通过 `style` 改内距、字号、圆角。

| 组件      | 桌面 / TV 参考值                                                                       |
| --------- | -------------------------------------------------------------------------------------- |
| Surface   | padding 24；gap 12；radius 12                                                          |
| Badge     | minHeight 28；paddingH 10；paddingV 3；gap 6；radius 6；文字 `meta`                    |
| Dialog    | 宽 480 / 800；最大高 = 视口 − 64 / 96；padding 32；gap 24；radius 12；遮罩 `cinema/40` |
| SidePanel | 宽 440 / 640；padding 32；gap 24；表面 `popover`；遮罩 `cinema/40`                     |
| Popover   | 宽 320 / 480；padding 24；gap 16；radius 12；offset 8 / 12；margin 12 / 24             |
| Menu      | minWidth 200 / 280；padding 8；radius 12；offset 8 / 12；margin 12 / 24                |
| Tooltip   | maxWidth 320 / 480；paddingH 12 / 16；paddingV 8 / 12；字号 14 / 20；TV 禁用           |
| 播放器    | 桌面画面高 456、选集栏宽 316、间距 24；TV 控制层内距 80/32/96/24（按边）               |

- Dialog 宽先取 480／800，再夹到 `视口宽 − 48／96`；Popover 的 320／480 夹到 `视口宽 − 24／48`；Menu 的 `maxWidth` 同样是 `视口宽 − 24／48`。
- `Button`：高度/内距/字号/图标取 `controlMetrics`；radius 12；variant default/primary/quiet/destructive/navigation；默认边界 `input`；primary hover `/90`、pressed `/80`；选集 48/42/80；navigation TV 字号 24。
- `TextInput` / `SearchInput` / `Select`：高度/内距/字号取 `controlMetrics`；radius 12；边界 `input` 1px；focus ring 2、offset 3；invalid `destructive`；TV 编辑态由组件处理。

### 6.3 布局常量（app-owned）

这些是外壳/页面布局，不是 UI 组件 token；放在 app 层，由外壳和页面共同引用，避免每个页面重复 176/86/360。

| Token           | 值                                  |
| --------------- | ----------------------------------- |
| 桌面侧栏 / 顶栏 | 176 / 86                            |
| 桌面搜索区      | 360                                 |
| 桌面内容最大宽  | 1660                                |
| 桌面网格        | 12 列                               |
| 继续观看 / 片库 | 3 列 / 6 列                         |
| 详情最大宽      | 1000                                |
| 详情选集        | 桌面 24 集/8 列；TV 12 集/6 列      |
| 播放器侧面板    | 4 列                                |
| 桌面播放器      | 画面 456 高；选集栏 316 宽；间距 24 |
| TV 参考         | 1920 宽；内边距 88；顶栏 132        |

## 7. 字体

### 7.1 角色

沿用 `UiText` 的有限角色；页面不新增字号。

| Token                | 桌面                  | TV  | 字重 | 行高 | 用途/语义                                       |
| -------------------- | --------------------- | --- | ---- | ---- | ----------------------------------------------- |
| `type-display`       | 38–56 流体（参考 44） | 78  | 400  | 1.4  | 首页/精选主标题；字距 0.06em                    |
| `type-page`          | 32                    | 48  | 600  | 1.3  | 页面标题，header level 1                        |
| `type-section`       | 24                    | 32  | 600  | 1.5  | 栏目标题，header level 2                        |
| `type-title`         | 20                    | 24  | 600  | 1.5  | 小节/面板标题，header level 3                   |
| `type-content-title` | 18                    | 24  | 600  | 1.5  | 海报/续播卡剧名；不自动成为页面标题层级         |
| `type-body`          | 16                    | 22  | 400  | 1.5  | 正文、描述                                      |
| `type-meta`          | 14                    | 20  | 400  | 1.5  | 元信息；默认 `muted-foreground`，可由 tone 覆盖 |
| `type-numeric`       | 16                    | 22  | 400  | 1.5  | 时间、进度、榜位；等宽数字                      |

- 桌面 `display` 使用 `Math.min(56, Math.max(38, width * 0.037))`；TV 固定 78 参考值，经 `tvUnit`。
- 字体族沿用宿主系统 UI 字体；不引入字体包，不为页面单独设 font-family。
- 控件文字不是 `UiText` 角色：Button/Input/Select 使用 `controlMetrics().fontSize`（16/14/22），Field 标签同字号；不要用 `body`/`meta` 代替控件字号。
- `text-sm`、`text-xs`、`text-xl` 等 utility 只允许出现在尚无角色可用的临时组合；迁移时按语义改为 `UiText role` 或控件配方，不再新增。

### 7.2 规则

- 一个文本只选一个角色；标题层级由角色决定，不因字号大就自动加 header。
- 中文不额外加字距；只有 display 使用 0.06em。数字用 `tabular-nums`。
- 长剧名限行或换行；可读内容需要展开，不用副标题硬塞。
- 系统字号放大时容器增长；不固定高度裁字。

## 8. 动效与层级

| Token            | 值/规则                | 用途                            |
| ---------------- | ---------------------- | ------------------------------- |
| `motion-color`   | 100ms                  | hover/pressed/selected 颜色反馈 |
| `motion-overlay` | 180ms ease-out，位移 8 | 浮层/弹层进出                   |
| `motion-reduced` | 0ms                    | 减少动态时移除颜色和位移动画    |
| `elevation`      | 无投影、无发光、无玻璃 | 层级由背景、留白、1px 边界表达  |
| `overlay-scrim`  | `cinema/40`            | Dialog/Sheet/Menu/Popover 遮罩  |

普通卡片不做入场、缩放、布局动画；图片只保留 100ms 淡入。浮层使用 NSH 承载和统一表面，不另造阴影。

## 9. 端型解析

- 端型只有 `desktop` / `tv`，Web 归桌面；根 `Product.Provider` 注入，组件不读 OS 推断。
- 所有参考尺寸都经 `unit(desktop, tv?)`：`unit(16, 24)` 表示桌面 16、TV 参考 24；TV 再经 `tvUnit` 换算。
- `unit` 只应在 foundation/token 层和明确组件配方中调用；页面不写 `Product() === 'tv'`，组件不逐调用点传 `size="tv"`。
- 输入语义差异（TextInput 编辑/返回、Slider 调整/回滚、RadarTable 行焦点、Player 控制层）属于组件行为，不塞进尺寸 token；这类判断只保留在约 5 个适配点。
- 混合密度用局部 `Product.Provider`，不把端型变成每个组件的 size prop。

## 10. 使用规则

1. 页面只消费语义组件和语义 token；primitive 只在 token 定义与组件配方内使用。
2. 不写裸色值、`dark:` 颜色、调色板 class；颜色只从 `theme.json` 角色取。
3. 不写任意间距/圆角/字号；先找语义 token，找不到再登记组件配方，配方必须写使用条件和所有者。
4. 控件用 `variant` / `size`，不通过 `style` 改内距、字号、圆角；布局 class 只负责排列。
5. 状态必须成对：表面 + 前景 + 边界 + 焦点；禁用不整体淡出，选中不依赖颜色单独传义。
6. 普通文字 4.5:1，大文字 3:1，控件边界/焦点/标记 3:1；影院配对单独验。
7. TV 值经 `unit()`，不把 1920 设计值当 dp；TV 不缩小观看操作。
8. 一个新 token 至少满足：跨 3 个组件/页面重复、有语义名、有桌面/TV 与浅/深取值、有对比度结论、有明确所有者；否则留在组件配方。
9. 同一事实只有一个源：颜色 `theme.json`，控件 `foundation.ts`，字级 `typography.ts`，视觉关系 `DESIGN.md`，token 名称/用法本文；不复制第二份运行值。

## 11. 迁移

### 阶段 0：评审（本文）

确认间距命名、圆角 scale、是否新增状态色、透明度配方和焦点 offset。未确认前不改运行值。

### 阶段 1：建立 token 入口，不改视觉

- 在 `packages/ui/src/foundation.ts` 增加 `unit(desktop, tv?)`、`space`、`radius`、`gap` 语义函数；`controlMetrics` 保持现有输出。
- 合并 7 个本地 `const unit`，替换 68 处纯 `Product() === 'tv' ? tvUnit(...)` 换算。
- 保持所有现有数值不变；用 desktop/TV 两个 `Product.Provider` 的测试锁定 `controlMetrics` 和 `unit` 输出。

### 阶段 2：收敛调用点

- 替换约 40 处裸 utility：`text-sm`/`text-xs`/`text-xl` 改 `UiText role` 或控件配方；`gap-2/4/6`、`rounded-lg`、`p-2`、`py-2`、`h-11` 改语义 token。
- 替换组件内联的 24/12/16/8/4 为 `inset-surface`、`gap-content`、`gap-inline`、`radius-*`；不改变视觉。
- 组件例外（Badge 28/10/3/6、ContinueCard 20/28、PosterCard 12/14、影院 44）登记为配方，不从页面传入。

### 阶段 3：组件配方与例外

- 按第 6 节整理 Button/Input/Surface/Overlay/Player 的固定配方；逐步移除 `bg-primary/90`、`bg-cinema/40` 这类裸 alpha，改成命名的动作/遮罩配方（值可仍是 alpha，但只有一个所有者）。
- 对 Badge 6、进度条轨道 3→full 等做视觉对照；有变化先评审。

### 阶段 4：防回流

- 增加检查：`packages/ui/src` 禁止裸十六进制、`dark:` 颜色、`text-xs/sm/xl`（白名单除外）、`Product() === 'tv'`（foundation/输入适配白名单除外）。
- 保留 desktop/TV 预览和 `packages/ui/test/ranking-card.tsx` 的密度切换测试；新增 token 输出测试。
- 全量 `pnpm check`、`pnpm build`，两端预览再看真实宿主；不把 tvUnit 换算通过当成真机通过。
- 迁移完成后把本文从“提案”改为“token 规则”，并把 DESIGN 的数值表改为链接到本文/代码源，消除重复。

## 12. 待决策

| 问题                        | 建议                                                                  | 理由                                                               |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 间距用数值还是 t-shirt      | 数值 `space-1/2/3/4/6/8/10/12`                                        | 与 NSH/Tailwind 4px class 对齐，算得出、搜得到                     |
| 圆角是否保留 6              | 保留 `radius-md=6` 给 Badge；默认 `radius-xl=12`                      | 不改变已验收 Badge 几何；避免为统一而改视觉                        |
| 是否加 success/warning/info | 暂不加                                                                | 当前产品只有 destructive 的真实状态，先造 token 会诱导误用         |
| 状态透明度怎么表达          | 先登记为组件配方（`primary/90`、`cinema/40`），再考虑命名 alpha token | 避免页面自由写 `/60`；但 alpha 值需要真实背景验证                  |
| 焦点 offset 3 还是 4        | 输入 3、按钮 4 先保留，统一前做视觉对照                               | 两者当前都可见且未被裁切；贸然统一会改焦点手感                     |
| 是否给 radius 加 CSS 变量   | 建议加 `--radius-sm/md/lg/xl`，间距继续用 NSH utility                 | 当前只有 `--radius`；class 组件需要有限圆角档位，间距 class 已够用 |

## 参考

- Ant Design：[定制主题](https://ant.design/docs/react/customize-theme)、[Seed/Map/Alias 源码](https://github.com/ant-design/ant-design/tree/master/components/theme)
- shadcn/ui：[Theming](https://ui.shadcn.com/docs/theming)
- MUI：[Spacing](https://mui.com/material-ui/customization/spacing/)、[Shape](https://mui.com/material-ui/customization/shape/)、[Typography](https://mui.com/material-ui/customization/typography/)
- 本项目：[DESIGN.md](../../DESIGN.md)、[theme.json](../../packages/ui/theme.json)、[foundation.ts](../../packages/ui/src/foundation.ts)、[typography.ts](../../packages/ui/src/typography.ts)、[UI 包规范](../../packages/ui/README.md)
