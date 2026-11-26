# @hongguo/ui

红果桌面与 TV 的共享 NSH 样式层。业务页面从包根导入；NSH `nsh/base` 提供行为，本包拥有主题、尺寸、图标、部件样式与必要输入适配。它不依赖 `packages/app`、网络、存储、媒体会话或其他应用入口。

基础组件规范还原、打开弹层、真实封面与动效的本轮结果见[修复与补审记录](../../docs/design/component-spec-conformance-fixes.md)；当前规则仍以根 DESIGN 为准。

## 两端使用

只有一个 package、一份公共 API。端型主题由各 app 的 `nsh.json` 选择：桌面用 `theme.json`，TV 用 `theme.tv.json`，两者由 DESIGN.md 经 `pnpm design:codegen` 生成；组件只读主题里的 `--space-*`／`--radius-*`／`--text-*`／`--control-*`，不读端型，不复制 DesktopButton／TvButton。`desktop` 与 `tv` 是产品端型，不是操作系统；无头验收宿主 `apps/harness` 采用桌面样式。

```tsx
import { View, signal } from 'nsh';
import { SearchField, Button } from '@hongguo/ui';

export function Example() {
  const query = signal('');
  const submit = () => {
    /* app owns the request */
  };
  return (
    <View class="gap-6 p-6">
      <SearchField
        label="搜索短剧、演员"
        value={query()}
        onChange={({ value }) => query.set(value)}
        onSubmit={submit}
      />
      <Button label="搜索" variant="primary" onPress={submit} />
    </View>
  );
}
```

TV 入口只需在 `nsh.json` 指向 `theme.tv.json`（已配置）。控件档位由 [DESIGN 的尺寸契约](../../DESIGN.md#组件架构与尺寸契约)统一维护；`size` 只描述几何，TV 的确认输入、行焦点、覆盖控制层由调用方传 `activation`／`focusMode`／`variant` 等显式 props。几何全部读主题 token，不把 1920 参考值直接当作 dp。大字号允许按内容增长，不固定裁切高度。

真实差异集中在输入边界：桌面键鼠；TV 由 app 传 `activation="confirm"`，确认进入输入／滑杆调整、返回保留或取消草稿；必要的 macOS Select 与来源焦点适配保留。不得复制业务状态机。NSH Menu 的承载由真实宿主 idiom 决定，不能伪造锚点行为。

## 模块与接口

| 模块                                                | 责任                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| foundation                                          | `controlMetrics(size)`、`space(name)`、`radius(name)`、`border`；数值来自 app 的主题文件（桌面 `theme.json`／TV `theme.tv.json`），名称与使用规则见 [DESIGN](../../DESIGN.md)           |
| icon / assets/lucide                                | `Icon`：包装 `nsh-icon` 的 `<Icon>`，调用方传 `nsh-icon-lucide` 常量；`tone` 映射文本色类，尺寸取 `size` 档位；`assets/lucide` 保存官方 SVG 源与逐图 SHA，供 `pnpm ui:icons:check` 校验 |
| button                                              | Button／IconButton，有限 variant 与 size；`navigation` 变体让当前目的地保持 foreground、其余降一档                                                                                      |
| back-button                                         | 页面级返回：箭头加目的地名，无静止表面，页面／影院两档色调                                                                                                                              |
| text-input / field                                  | 文本输入、搜索组合、字段标签与说明                                                                                                                                                      |
| select / checkbox / switch                          | 受控选择、复选与开关；开关支持隐藏可视标签并按端缩放                                                                                                                                    |
| choice-group / tabs / slider                        | 选项组、分页签与数值滑杆（含 TV 调整模式）；Tabs 的标签由 `UiText` 绘制，未选中项使用 muted 色调                                                                                        |
| overlay                                             | Dialog／Confirm／SidePanel、Menu／Popover、提示、操作栏、折叠、链接                                                                                                                     |
| display / frequent                                  | 字级、静态表面、反馈与高频基础组合                                                                                                                                                      |
| settings-row / settings-section                     | 设置行与分区：分隔列表或独立卡片，控件和值由调用方提供                                                                                                                                  |
| content / player                                    | 既有内容与影院控件：`CinemaStage`（竖片居中＋同图模糊补边）、`CinemaControls` 的 bar／band／overlay、`CinemaEpisodeButton`、影院变体的 `EpisodeRange`／`EpisodeRail`                    |
| card-controls / select-focus / focused-removal-root | 已有宿主焦点问题的内部适配                                                                                                                                                              |
| dev / test                                          | 显式验收入口和行为测试，不挂载到产品路由                                                                                                                                                |

`src/index.tsx` 只做公共导出。内部文件直接导入拥有者，禁止反向导入 barrel 造成循环。只有包根用于产品；`./preview` 与 `./testing` 是开发入口，不能用于业务页面。新增控件与 Props 同名、公开事件用对象载荷，值由调用方控制，行为局部状态只保留一份。props 和信号在绑定／回调读取，不在组件 body 解构为快照。

控件只接受有意义的有限变体和布局契约，不接受任意颜色、圆角、内距、字体覆盖。旧 `primary`／`compact` 保留为同实现兼容选项，新代码使用 `variant`／`size`。不要删除已验证的焦点适配来换取表面一致。

动作层级与状态优先级见 [DESIGN.md](../../DESIGN.md#动作层级与状态组合)：Button 的 disabled／pending 外观覆盖 selected，再覆盖 variant；文字与图标跟随同一配对，focus 独立。重复 ContinueCard 使用普通动作，StoryFeature 内的主动作使用 Button primary，辅助动作复用 CinemaButton。无需新增端型组件或页面自定义颜色。

文字角色由内部 `typography.ts` 统一供 UiText 与内容组合消费；`content-title` 是卡片剧名（字级见 DESIGN），不自动增加标题层级。Cover 的默认 poster、inline、feature 分别负责独立海报、贴边续播与影院取景；封面保留可读语义但不拦截指针，由所属卡片承接点击；页面只提供来源、身份和布局，不复制裁切。Surface 的四种变体、间距关系和图片安全区见根 DESIGN；普通栏目先用留白，四种表面作为同层选择，不层层套卡。影院表面显式搭配影院文字和控件。

普通布局用 `View` 的配方，不给每个原语建立改名包装。日期条、账号验证、榜单和媒体状态仍是 app 组合与业务，不因设计样板存在就进入基础包。

字段与状态契约见 [DESIGN](../../DESIGN.md#无障碍语义与状态验收)：Field 不自动向 children 注入名称或错误说明，调用方给 TextInput 显式传入一致的 label、invalid 与 description；具名组合负责完整传递。TV 入口在编辑前传递相同说明、invalid 与 disabled，编辑后由输入持有语义。`SearchInputProps.description` 由 app 提供当前校验原因。Button pending 默认显示“处理中…”，可用 displayLabel 提供具体动作；纯图标等待使用静态 loader-circle。SearchField 显示“搜索中…”并在所属区域暴露 busy，保留草稿并阻止重复提交。选择控件禁用后保留可辨认的当前值。完整导出家族矩阵、初审与修复证据见[专项审查](../../docs/design/design-system-accessibility-state-copy-audit.md)，读屏输出按目标宿主另验。

### SettingsRow

`error` 在所属行显示失败，`onRetry` 可提供由调用方拥有的恢复动作，`retryLabel` 默认为“重试”。恢复按钮的 testID 为行 testID 加 `-retry`；没有错误时不显示。组件不保存值或调用存储，重试结果、失败字段和原设置意图仍归业务 owner。

### DateChoice

包根导出 `DateChoice`／`DateChoiceProps`，用于一个真实 Gregorian 日期的选择目标；不提供日历查询、今天推断、日期补全、预约或日期条控制器。`value` 是完整 YYYYMMDD，`label` 由调用方提供“今天”或星期，`selected` 由调用方控制，`onPress()` 只报告激活；`buttonRef`／`onFocus`／`testID` 用于来源恢复和稳定定位。非法日期不渲染目标，包括非闰年 2 月 29 日、1900 年闰日、月份／天数越界及非 YYYYMMDD；2000 年与 2024 年闰日合法。

```tsx
<DateChoice
  value="20240229"
  label="周四"
  selected={selected() === '20240229'}
  onPress={() => selected.set('20240229')}
/>
```

默认使用“日标签／大日期／月份”三层；`presentation="inline"` 将月日与日标签合为一行，TV 日历用它保留内容视口。完整年月日的可访问名称和受控选择行为相同，不拆组件。尺寸由当前主题的 `controlMetrics` 与 spacing 派生，不在包文档维护第二份数值表。默认中性表面、选中 accent 前景配对、焦点独立外轮廓，hover／pressed 不位移；减少动态效果时取消颜色过渡。日期条的横滚、完整日期名称、选中值、今天／星期和离页恢复由 app 组合管理；放入 `CardControls` 后方向键移动焦点、Enter／Space 激活，方向移动不自动提交。

独立验收例为 `dev/CalendarChoices.tsx`，经 `@hongguo/ui/preview/date-choice` 暴露，各入口为 `apps/{desktop,tv,harness}/DateChoicePreview.tsx`，产品不导入 testing。对应 `DateChoicePreview.test.tsx` 覆盖外部拒绝／接受选择、合法闰日与非法日期、键盘焦点和一次激活，以及浅深色选中文字配对。该测试独立于 `ui:test` 的 Gallery 测试入口，使用 `cd apps/desktop && nsh test DateChoicePreview.test.tsx`（另对 tv／harness 执行）运行；类型与预览构建分别执行 `nsh check` 和 `nsh build DateChoicePreview.tsx`。

### RankingCard

包根导出 `RankingCard`／`RankingCardProps`。它是受控的榜位媒体行，不持有榜单请求、筛选、分页、导航或账号状态。`title`、`cover`、`subtitle`、`metadata`、`rank` 和 `actionLabel` 都由调用方提供；只有真实正整数 rank 显示，缺失／非法值保留空榜位 lane，不补破折号、不按行号推算。`kind="actor"` 使用共享 Avatar lg，默认 drama 使用 Cover。剧目和演员的目的地由 app 决定。

桌面与 TV 共用一个整行动作、selected 和焦点契约。`subtitle` 渲染为标题下方两行说明，`metadata` 与标题同行弱化呈现。桌面封面 86×116、行内间距 20、名次 lane 42；TV 行更紧凑：封面 70×94、行内间距 12、行内边距 14、名次 lane 36，数值由主题 token 决定。演员沿用 Avatar lg 尺寸，不在行内覆盖基础头像尺寸。标题、简介和元信息各最多两行，完整文本保留在无障碍名称／说明中。hover 使用 muted，selected 使用 accent 成对前景，pressed 加深／降低透明度，键盘焦点使用独立外环；颜色过渡读取 fast token，减少动态时关闭。

`buttonRef`、`testID` 和 `onFocus` 只提供通用输入与定位接口；kind:id、虚拟行安全区、滚动锚点、受控选择、来源恢复和较新输入意图保护归 app。不要在页面重画榜位、头像或动作，也不要把整行拆成多个可聚焦目标。

独立样例为 `dev/RankingRows.tsx`，经 `@hongguo/ui/preview/ranking-card` 暴露；行为测试经 `@hongguo/ui/testing/ranking-card` 暴露。各入口为 `apps/{desktop,tv,harness}/RankingCardPreview.tsx` 和相邻 `.test.tsx`，与产品路由分离。样例覆盖外部接受／拒绝选择、同原始 ID 的演员／剧目、名次缺失与非法值、长标题及同一目标的端型切换。

### SeasonChoice

包根导出 `SeasonChoice`／`SeasonChoiceProps`。它只承载一个受控选季目标：`title`、可选 `status`、`selected`、`onPress`，以及有限 `size` 和通用定位／焦点接口。季号、可播资格、实际播放、观看历史、请求和预约均由 app 提供；不能从 selected 推断播放中，不能把待上线等同 disabled。

桌面与 TV 使用同一组件和 `CardControls` 方向寻焦语义：左右移动焦点，确认才报告选择，外部 owner 决定是否接受。标题与状态使用独立字级；状态可换行并自然增高；单一无障碍名称组合两者，内部文本不重复成为朗读目标。选中 accent 前景配对，焦点独立外环，按压不移动布局；颜色变化使用 fast token，减少动态效果时关闭过渡。TV 尺寸读取 `controlMetrics` 与主题 token，不建立另一个 package。

app 的 `SeasonPicker` 负责完整服务顺序、实际 playingId／resume 标签与横滚安全区，`createSeasons` 负责浏览选择及严格相邻后继，`createSeasonDetail` 负责身份与类型绑定的详情缓存。预告与不可播仍可浏览摘要，但不能读可播选集、准备媒体或写观看历史。独立组件样例为 `dev/SeasonChoices.tsx` 与各入口的 `SeasonChoicePreview.tsx`；组合样例为各入口的 `SeasonComponentsPreview.tsx`，测试经相邻 `.test.tsx` 运行，不进入产品路由。

### Pagination

包根导出 `Pagination`／`PaginationProps`，承接已知总页数的受控翻页。`page` 从 1 开始，`totalPages` 是总页数；`onChange({ page })` 只报告目标页，不自行改页、不发请求、不写 URL。`visiblePages` 是页码窗口，base 按至少 5 处理，奇数窗口让当前页居中；`compact` 只保留上一页、位置与下一页；`disabled` 冻结整组动作但保留当前位置；`size` 接受 `sm`／`md`／`lg`。`page` 与 `totalPages` 会按整数限制到合法范围；总页数不足 2 时不渲染，避免只剩禁用的首尾箭头。

桌面与 TV 共用同一套语义和几何：高度、内距、间距、圆角、字级与图标来自 `controlMetrics`，与同档 `Button` 等高，TV 边界与尺寸读取主题 token。普通档的上一页／下一页显示方向图标与文字，紧凑档只显示图标但保留无障碍名称；页码使用等宽数字，当前页使用 `accent` 表面与配对前景，悬停 `muted`、按下 `border`，焦点使用独立外环。省略号不是按钮、不进入焦点。禁用时动作不可激活，当前页仍以边界和前景保留位置；减少动态效果时取消颜色过渡。上一页／下一页的可见文字固定为中文，完整无障碍名称由 base 提供。

```tsx
<Pagination
  page={page()}
  totalPages={21}
  visiblePages={7}
  onChange={({ page: next }) => page.set(next)}
/>
```

已知页数的样例在 Gallery 的“已知页数／紧凑分页／分页禁用”，单页开关验证不足 2 页时不渲染；行为回归在 `ui:test` 的 composition recipes。未知总数和游标追加仍由 `Button` 的 pending／`displayLabel` 或列表加载状态承接，不把“加载更多”伪装成总页数，也不代替产品自己的滚动锚点与返回恢复。

### ActionRow

包根导出 `ActionRow`／`ActionRowProps`，承接整行目的地或命令：名称在起始端，箭头在末端，整行是唯一的输入目标，行内没有第二个可聚焦动作。`label` 同时是可见文字和无障碍名称，可选 `description` 作为第二行并进入无障碍说明，`trailingIcon` 默认 `forward`，`divided` 画与上一行之间的 hairline，`disabled` 降为 `muted-foreground` 且不可激活；`buttonRef`／`testID`／`onFocus` 用于定位与来源恢复，导航、请求和权限判断仍由调用方负责。

几何读主题：最小高度为 `controlMetrics().height + space('sm')`（桌面 52，TV 更高），名称用 `body`、说明用 `meta`，悬停 `muted`、按下 `border`、焦点为独立外环，颜色过渡读取 fast token 且减少动态时关闭。它替代的是“带尾箭头的导航行”这一类重复手写 View，不是新的列表虚拟化；成组使用时由调用方放进 `AccountCard` 或平台组合，并按需要传 `divided`。

```tsx
<ActionRow label="观看记录" divided onPress={() => openLibrary('history')} />
```

产品中的首个用途是账号页的“我的内容”与“本机片库／我的片库”行；同一页面在 TV 960×540 的折叠高度下改用 `CardControls` 的按钮带承载相同目的地，两处共享同一份组合与文案。

### BackButton

包根导出 `BackButton`／`BackButtonProps`／`BackButtonTone`，承接页面级返回入口，不持有路由、历史或请求。受控输入只有 `label`（同时作为可见文字和无障碍名称，由调用方按真实目标命名，如“返回发现”“返回详情”）和 `onPress`；`tone` 取 `page`（默认）或 `cinema`，`size` 取 `sm`／`md`／`lg`，`disabled`、`testID`、`buttonRef`、`onFocus` 与布局用 `class`／`style` 按通用约定。

外观固定为前导 `arrow-left` 加目的地名，不开放变体：静止态无表面和边界，悬停／按下沿用 `Button quiet` 的 `muted`／`border` 底色（影院语境换成 `cinema-hover`／`cinema-active`）；箭头本身对齐页面文字轴（左侧不设内距），因此放在内容列第一行即可与下方正文同轴，不需要页面另开返回栏或在页面里覆盖内距。文字色：普通页面 `foreground`，`cinema` 用 `cinema-muted`，禁用用 `muted-foreground`（影院为 `cinema-muted`）。焦点沿用 `Button` 的独立外环（影院语境用 `cinema-focus`），减少动态效果时取消颜色过渡。默认 `alignSelf: flex-start`，在居中排布的行里由调用方传 `style={{ alignSelf: 'center' }}`。

宿主、路由栈与返回后恢复由 app 负责：调用方决定目标、按导航栈生成标签，并保证弹层内的关闭动作不使用本组件。样例见 Gallery“导航与内容组织”的返回行与影院色调一行；`ui:test` 的 composition recipes 覆盖两档色调的激活与可访问名称。

### PosterCard 的可用高度

`availableHeight` 是调用方扣除列表焦点安全区后的卡片可用高度。桌面在空间充足时保持常规海报比例；有限视口按当前字号的实际标题／元信息高度收缩封面，封面最小 96，不压缩文字。标题和元信息最多两行，完整标题与说明保留在无障碍语义中。紧凑模式由宽度决定封面比例，不因局部视口压扁封面；长行交给所属列表滚动。调用方仍负责滚动区域和外焦点环的安全区，不能把整个窗口高度传入局部列表。

父滚动容器中的自然高度网格只传 `width`，不传 `availableHeight`，两端封面均按宽度 × 1.35 生成高度；文字自然换行。独立有限视口继续传入实际 `availableHeight`，TV 使用 `density="compact"`，卡片宽度由 `width` 约束，图片不随文字倍率放大。两种布局复用同一 PosterCard，不增加端型组件或自由外观参数；内容验收页同时使用实际端型宽度。

## 资源与演进

安装图标共用 [品牌资源](assets/brand/README.md)，由各 NSH manifest 与 Android TV 宿主消费；品牌图形不经过 Lucide 的界面图标生成器。

主题唯一源是 `theme.json`。所有可操作控件共用 `input` 边界：浅色取与分隔线同族的浅灰，深色比分隔线高一档，让按钮、选集、输入框与 Select 读作同一种线；识别由表面、文字与 3:1 焦点环承担。内容分区、禁用边界与装饰使用 `border`。修改主题后跑 `pnpm design:codegen` 重新生成两份 theme 与 `tokens.generated.ts`；不手改生成文件，也不为某一份稿另补颜色。

图标经 `nsh-icon-lucide`（Lucide 1.43.0）绘制，三端 `nsh.json` 的 `dependencies` 声明、`nsh.lock` 锁定。调用方从图标集导入常量再传给 `Icon`（`<Icon icon={Search} />`、`icon={Search}`）；`packages/ui` 不维护名称清单，打包内容等于源码实际导入的常量，未引用的图标不进包。原始 SVG 和生成结果都不能手工改图形；升级时同步 `nsh upgrade` 的锁文件。

组件板就是生产组件本身：`pnpm ui:host:desktop`／`ui:host:tv` 在各宿主观察，`pnpm ui:preview` 在浏览器里跟改。不可把 DOM/CSS 运行时导入 NSH。新增状态同步更新 [设计交接](../../docs/design/component-design.md)、[覆盖清单](../../docs/design/component-coverage-audit.md)、[演进规划](../../docs/design/component-roadmap.md) 与原生验收页。

## 验证

- `pnpm ui:check`：对全部组件验收入口（desktop、tv、harness）执行 NSH check **和** build。
- `pnpm ui:test`：各入口的真实引擎行为测试。
- `pnpm ui:host:desktop`／`pnpm ui:host:tv`：macOS 可见宿主中的深浅主题与两端密度验收，证据写入 ignored artifacts；它不代表 Android TV。
- `pnpm ui:preview --target desktop`：显式组件预览；可选 harness／tv。每个端固定一个端口，重复启动替换上一次预览窗口而不是再开一个；`--display 2`、`--window-size 1440x960` 原样传给 `nsh run`。
- 完整工程仍运行 `pnpm verify`；依赖变化运行 `pnpm security`。缺工具必须失败。

还原度检查比较原设计与宿主中的颜色、字级、几何、对齐、状态、图标及动效；完整度检查逐项映射公共导出、样例、状态和行为证据。编译通过或 headless 通过均不能替代视觉与真机。待验收项如读屏、系统大字、真实遥控、输入法、物理电视必须明确记录。

### RadarTable

包根导出 `RadarTable`、`RadarTableProps`、`RadarTableColumn`、`RadarTableRow` 和 `RadarTableRef`。它是只读比较表，不是可编辑网格；桌面与 TV 共用列、受控状态与恢复契约，仅通过 `focusMode` 与主题密度调整尺寸。桌面把标题作为唯一的行内动作；TV 把整行做成同一个焦点动作（完整标题仍是无障碍名称），DPAD 只上下移动行。数值列靠右，其余列靠左。横向按钮始终可见，不依赖拖动或 hover 才能查看后面的列；调用方可用 `columnControls="external"` 把列按钮放进自己的控件带，并通过 `RadarTableRef.scrollColumns('start' | 'end')` 驱动同一偏移。

表格不使用卡片容器：表头上方只有一条 hairline，行与行之间是 hairline 分隔，表头底色即页面底色。内部由独立的表头水平 `Scroll` 和垂直虚拟 `List` 组成，二者为兄弟节点。桌面表头真实横向滚动的 offset 同步到各行宽内容的 `translateX`；行外框保持列表视口宽度，表头与行共用列宽和两侧 inset。TV 按视口权重分配列宽、内容不横向滚动，行内合并为单个可聚焦按钮。NSH 0.5.0／0.5.1 的 `DataTable` 自定义行位于零尺寸原点容器之下，在 Android 原生树可见而 Accessibility 树无法到达（0.5.1 只改动 web 缩放滚动条，未涉及该结构）；把虚拟 List 放入水平 Scroll 又出现后续行子树零尺寸，因此列表直接拥有独立垂直视口。这里使用公开原语保留真实标题按钮，不修改引擎或绕过可访问性验收。纵向仍按稳定字符串 ID 回查当前索引，回收行的事件始终读取 `item()`；后段恢复使用 `ListRef.scrollToIndex`，横向恢复只移动到完整显示标题列的位置。该替换仍需实际 check／build、行为与宿主回归验证。

`columns` 提供稳定 key、标题与 `numeric`，`rows` 提供稳定且唯一的字符串 `id`、完整 `title` 和已格式化的字符串 `cells`。组件不解析、排序、连接或补造业务指标；缺失 cell 显示“—”，调用方传入的“0”、负数及超出 JavaScript 安全整数范围的字符串原样显示。`selected` 与 `pending` 由同一外部 owner 提供；`onOpen({ id })` 只报告打开请求，`onSource({ id })` 只报告获得焦点的准确身份，外部拒绝请求不会改变 selected。读取中改变标题的视觉文案，完整可访问名称仍保留。

```tsx
<RadarTable
  collection={collectionKey()}
  columns={columns()}
  rows={rows()}
  selected={selected()}
  pending={pending()}
  active={active()}
  columnControls="external"
  tableRef={(ref) => {
    table = ref;
  }}
  onOpen={({ id }) => requestOpen(id)}
  onSource={({ id }) => rememberSource(id)}
  onNavigate={() => markNewIntent()}
/>
```

`columnControls` 默认 `"header"`，在表格上方渲染列按钮；预览与独立样例保持该默认值。传 `"external"` 时组件不渲染列按钮，由调用方在控件带里组合并使用 `tableRef.scrollColumns(...)`，桌面产品页采用后者。

`tableRef` 取得的 `restore(id, owns)` 会定位标题列与目标行；调用时和异步挂载后都核对 `active` 与 `owns()`，拒绝缺失行、失效 owner、已卸载或非活动表格的恢复。`active` 仅约束焦点恢复，不等同 disabled；业务宿主仍负责隐藏／禁用非活动页面并拒绝后台请求。`onNavigate()` 通知调用方横向操作或读取期间的焦点变化，取消读取及较新输入意图归调用方。数据日期、来源、错误、空表说明及详情返回路径也归 app，基础包不导入业务服务。

可选 `collection` 标识当前比较集合（例如榜单维度、类型和列集）；它变化时回到首行、首列并撤销旧的等待恢复，受控 `selected` 不变，也不产生打开请求。同一集合的刷新或 `pending` 文案变化保持滚动位置。独立样例传入 `wide`／`compact`，行为测试在后段行验证读取文案仍可见，再验证切换集合后首行重新可见；这些可见性断言不替代真实宿主的滚动坐标与焦点检查。

标题复用 `Button` 的可选 `labelLines={2}`，在父容器宽度内两行省略，完整 `label` 仍是无障碍名称；TV 整行动作以 `artwork` 承载行内容，`label` 仍是完整标题。普通按钮不传此属性时保持原布局。返回在可行范围居中显示目标行，保留相邻上下文和焦点安全区；横向列按钮、表头原生滚动条与正文横向滚轮共用列偏移。

独立样例 `dev/RadarTables.tsx` 经 `@hongguo/ui/preview/radar-table` 导出；测试经 `@hongguo/ui/testing/radar-table` 导出。各入口为 `apps/{desktop,tv,harness}/RadarTablePreview.tsx` 及相邻 `.test.tsx`，不进入产品路由或 Gallery。样例提供 32 条合成数据、外部接受／拒绝、相邻大 ID、完整长标题、缺失／零／负数／极值、读取中、空表、列集切换、横向按钮与可重复的后段行恢复；不发请求、不写历史或媒体状态。样例不增加动效，沿用基础按钮状态和表格原有滚动行为。

运行每端的 `nsh check`、`nsh build RadarTablePreview.tsx` 与 `nsh test RadarTablePreview.test.tsx`。测试覆盖受控动作、精确 ID／来源、列集及空表切换，以及 inactive／过期 owner 的恢复围栏；真实宿主的表格对齐、长标题、横滚、浅深主题、大字号与遥控仍须单独观察。文件存在不表示还原度或宿主验收已通过。

## TV v4 的有限组合

- `NavigationItem` 的 `presentation="bar"` 使用栏目字级与主导航高度；默认 `rail` 保留桌面表现。`current` 标识目的地，方向移动只改变焦点，确认才执行 `onPress`。
- `RemoteKeyboard` 受控地接收 `value`，报告字母／数字、退格和清空；`columns` 为 6 或 5，省略 `onSubmit` 时由外部输入表单提供唯一提交入口。它不持有查询、联想或最近搜索。
- `SafeFrame` 接收实际 insets，作为根内容的唯一内距拥有者。全屏媒体可用 `enabled={false}` 铺满；原生浮层和影院操作层仍从同一上下文读取安全策略，在各自表面应用一次。
- `Cover.fit="contain"` 保留完整图片，默认取景不变。`PosterCard` 的 `width` 决定封面槽高度，常规模式的 `availableHeight` 为有限列表视口预留文字空间；紧凑模式保持图片比例与独立卡宽。`ContinueCard.density="compact"` 是紧凑续播，`RankingCard.presentation="poster"` 是排名海报；两者旧默认均保留。
- `ResultCard.onPress` 缺省时是静态内容行，不显示“查看详情”或整行按钮语义；管理模式只聚焦选择、明确的详情入口与删除动作。`ChoiceList.orientation="vertical"` 复用同一稳定选项和焦点契约，供有界侧栏使用。
- Android TV 每个原生窗口共用 `TvRemote` 作为焦点轮廓拥有者；内部 `RemoteFocusScope` 通过公开 `nativeComponent` 注册弹层窗口，其他宿主为空视图。内层 Select 先处理返回，关闭弹层再恢复原入口；控件不重复画父子焦点环。禁用／等待阻止激活与程序恢复焦点，恢复后重新可达。

业务组合与列数规则见 [TV 技术方案](../../openspec/changes/compose-tv-v4-from-shared-components/design.md)，实际验证范围见 [VALIDATION](../../VALIDATION.md)。画廊中的宿主度量读取真实环境，仅供开发验收，不进入产品界面。

`textLineHeight(role)` 是只读的语义行高度量，供业务集合计算文字槽位与虚拟化估计；它不改变字号、主题或系统缩放，也不是页面绘制覆盖参数。
