# @hongguo/ui

红果桌面与 TV 的共享 NSH 样式层。业务页面从包根导入；NSH `nsh/base` 提供行为，本包拥有主题、尺寸、图标、部件样式与必要输入适配。它不依赖 `packages/app`、网络、存储、媒体会话或其他应用入口。

基础组件规范还原、打开弹层、真实封面与动效的本轮结果见[修复与补审记录](../../docs/design/component-spec-conformance-fixes.md)；当前规则仍以根 DESIGN 为准。

## 两端使用

只有一个 package、一份公共 API。应用根注入 `Product.Provider`，普通页面不判断平台，不复制 DesktopButton／TvButton。`desktop` 与 `tv` 是产品端型，不是操作系统；Web 采用桌面样式。

```tsx
import { View, signal } from 'nsh';
import { Product, SearchField, Button } from '@hongguo/ui';

export function Example() {
  const query = signal('');
  const submit = () => {
    /* app owns the request */
  };
  return (
    <Product.Provider value="desktop">
      <View class="gap-6 p-6">
        <SearchField
          label="搜索短剧、演员"
          value={query()}
          onChange={({ value }) => query.set(value)}
          onSubmit={submit}
        />
        <Button label="搜索" variant="primary" onPress={submit} />
      </View>
    </Product.Provider>
  );
}
```

TV 入口仅将 `value` 换为 `tv`。普通控件使用同一尺寸表：桌面 md 44／sm 36、TV 60 参考单位；TV 的字号、图标、间距、面板同步通过 `tvUnit()` 转换，不能直接把 1920 设计数值当作 dp。大字号允许按内容增长，不固定裁切高度。

真实差异集中在输入边界：桌面键鼠；TV 确认进入输入／滑杆调整、返回保留或取消草稿；必要的 macOS Select 与来源焦点适配保留。不得复制业务状态机。NSH Menu 的承载由真实宿主 idiom 决定，不能伪造锚点行为。

## 模块与接口

| 模块                                                | 责任                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| foundation                                          | Product 上下文、端型尺寸表、TV 换算                                 |
| icon / assets/lucide                                | 官方 Lucide 资源、稳定语义别名、原生渲染                            |
| button                                              | Button／IconButton，有限 variant 与 size                            |
| form                                                | Input／Field／SearchField、Select、多选／单选、Tabs、Slider         |
| overlay                                             | Dialog／Confirm／SidePanel、Menu／Popover、提示、操作栏、折叠、链接 |
| display / frequent                                  | 字级、静态表面、反馈、行与高频基础组合                              |
| content / player                                    | 既有内容与影院控件的兼容组合                                        |
| card-controls / select-focus / focused-removal-root | 已有宿主焦点问题的内部适配                                          |
| dev / test                                          | 显式验收入口和行为测试，不挂载到产品路由                            |

`src/index.tsx` 只做公共导出。内部文件直接导入拥有者，禁止反向导入 barrel 造成循环。只有包根用于产品；`./preview` 与 `./testing` 是开发入口，不能用于业务页面。新增控件与 Props 同名、公开事件用对象载荷，值由调用方控制，行为局部状态只保留一份。props 和信号在绑定／回调读取，不在组件 body 解构为快照。

控件只接受有意义的有限变体和布局契约，不接受任意颜色、圆角、内距、字体覆盖。旧 `primary`／`compact` 保留为同实现兼容选项，新代码使用 `variant`／`size`。不要删除已验证的焦点适配来换取表面一致。

动作层级与状态优先级见 [DESIGN.md](../../DESIGN.md#动作层级与状态组合)：Button 的 disabled／pending 外观覆盖 selected，再覆盖 variant；文字与图标跟随同一配对，focus 独立。重复 ContinueCard 使用普通动作，StoryFeature 内的主动作使用 Button primary，辅助动作复用 CinemaButton。无需新增端型组件或页面自定义颜色。

文字角色由内部 `typography.ts` 统一供 UiText 与内容组合消费；`content-title` 是卡片剧名（桌面 18／TV 24），不自动增加标题层级。Cover 的默认 poster、inline、feature 分别负责独立海报、贴边续播与影院取景；页面只提供来源、身份和布局，不复制裁切。Surface 的四种变体、间距关系和图片安全区见根 DESIGN；普通栏目先用留白，四种表面作为同层选择，不层层套卡。影院表面显式搭配影院文字和控件。

普通布局用 `View` 的配方，不给每个原语建立改名包装。日期条、账号验证、榜单和媒体状态仍是 app 组合与业务，不因设计样板存在就进入基础包。

字段与状态契约见 [DESIGN](../../DESIGN.md#无障碍语义与状态验收)：Field 不自动向 children 注入名称或错误说明，调用方给 TextInput 显式传入一致的 label、invalid 与 description；具名组合负责完整传递。TV 入口在编辑前传递相同说明、invalid 与 disabled，编辑后由输入持有语义。`SearchInputProps.description` 由 app 提供当前校验原因。Button pending 默认显示“处理中…”，可用 displayLabel 提供具体动作；纯图标等待使用静态 loader-circle。SearchField 显示“搜索中…”并在所属区域暴露 busy，保留草稿并阻止重复提交。选择控件禁用后保留可辨认的当前值。完整导出家族矩阵、初审与修复证据见[专项审查](../../docs/design/design-system-accessibility-state-copy-audit.md)，读屏输出按目标宿主另验。

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

桌面与 TV 共用“日标签／大日期／月份”三层，不拆组件。桌面最小 86×96、内距 12；TV 最小 164×132、内距 16，TV 数值均经 `tvUnit()` 换算。默认中性表面、选中 accent 前景配对、焦点独立外轮廓，hover／pressed 不位移；减少动态效果时取消颜色过渡。日期条的横滚、完整日期名称、选中值、今天／星期和离页恢复由 app 组合管理；放入 `CardControls` 后方向键移动焦点、Enter／Space 激活，方向移动不自动提交。

独立验收例为 `dev/CalendarChoices.tsx`，经 `@hongguo/ui/preview/date-choice` 暴露，三端显式入口为 `apps/*/DateChoicePreview.tsx`，产品不导入 testing。对应 `DateChoicePreview.test.tsx` 覆盖外部拒绝／接受选择、合法闰日与非法日期、键盘焦点和一次激活，以及浅深色选中文字配对。该测试独立于 `ui:test` 的 Gallery 测试入口，使用 `cd apps/desktop && nsh test DateChoicePreview.test.tsx`（另对 web／tv 执行）运行；类型与预览构建分别执行 `nsh check` 和 `nsh build DateChoicePreview.tsx`。

### RankingCard

包根导出 `RankingCard`／`RankingCardProps`。它是受控的榜位媒体行，不持有榜单请求、筛选、分页、导航或账号状态。`title`、`cover`、`subtitle`、`metadata`、`rank` 和 `actionLabel` 都由调用方提供；只有真实正整数 rank 显示，缺失／非法值保留空榜位 lane，不补破折号、不按行号推算。`kind="actor"` 使用共享 Avatar lg，默认 drama 使用 Cover。剧目和演员的目的地由 app 决定。

桌面与 TV 共用一个整行动作、selected 和焦点契约。桌面封面 64×86／行内间距 20，TV 封面 96×128／行内间距 28，TV 值均经 `tvUnit()` 换算；演员沿用 Avatar lg 的 68／84 尺寸，不在行内覆盖基础头像尺寸。标题、简介和元信息各最多两行，完整文本保留在无障碍名称／说明中。hover 使用 muted，selected 使用 accent 成对前景，pressed 加深／降低透明度，键盘焦点使用独立外环；颜色过渡读取 fast token，减少动态时关闭。

`buttonRef`、`testID` 和 `onFocus` 只提供通用输入与定位接口；kind:id、虚拟行安全区、滚动锚点、受控选择、来源恢复和较新输入意图保护归 app。不要在页面重画榜位、头像或动作，也不要把整行拆成多个可聚焦目标。

独立样例为 `dev/RankingRows.tsx`，经 `@hongguo/ui/preview/ranking-card` 暴露；行为测试经 `@hongguo/ui/testing/ranking-card` 暴露。三端显式入口为 `apps/*/RankingCardPreview.tsx` 和相邻 `.test.tsx`，与产品路由分离。样例覆盖外部接受／拒绝选择、同原始 ID 的演员／剧目、名次缺失与非法值、长标题及同一 Product 的端型切换。

### SeasonChoice

包根导出 `SeasonChoice`／`SeasonChoiceProps`。它只承载一个受控选季目标：`title`、可选 `status`、`selected`、`onPress`，以及有限 `size` 和通用定位／焦点接口。季号、可播资格、实际播放、观看历史、请求和预约均由 app 提供；不能从 selected 推断播放中，不能把待上线等同 disabled。

桌面与 TV 使用同一组件和 `CardControls` 方向寻焦语义：左右移动焦点，确认才报告选择，外部 owner 决定是否接受。标题与状态使用独立字级；状态可换行并自然增高；单一无障碍名称组合两者，内部文本不重复成为朗读目标。选中 accent 前景配对，焦点独立外环，按压不移动布局；颜色变化使用 fast token，减少动态效果时关闭过渡。TV 尺寸读取 `controlMetrics`／`tvUnit`，不建立另一个 package。

app 的 `SeasonPicker` 负责完整服务顺序、实际 playingId／resume 标签与横滚安全区，`createSeasons` 负责浏览选择及严格相邻后继，`createSeasonDetail` 负责身份与类型绑定的详情缓存。预告与不可播仍可浏览摘要，但不能读可播选集、准备媒体或写观看历史。独立组件样例为 `dev/SeasonChoices.tsx` 与三端 `SeasonChoicePreview.tsx`；组合样例为三端 `SeasonComponentsPreview.tsx`，测试经相邻 `.test.tsx` 运行，不进入产品路由。

### PosterCard 的可用高度

`availableHeight` 是调用方扣除列表焦点安全区后的卡片可用高度。桌面在空间充足时保持常规海报比例；有限视口按当前字号的实际标题／元信息高度收缩封面，封面最小 96，不压缩文字。标题和元信息最多两行，完整标题与说明保留在无障碍语义中。TV 沿用既有可用高度与字体缩放规则。调用方仍负责滚动区域和外焦点环的安全区，不能把整个窗口高度传入局部列表。

## 资源与演进

主题唯一源是 `theme.json`。必要控件边界使用 `input`，在浅深色的 background／card／muted／popover 上至少 3:1；装饰分隔使用 `border`。修改主题后运行 `node design/prototype/components/sync-theme.mjs`，同步浏览器共用主题；不手改生成 CSS。官方 Lucide 0.468.0 SVG、ISC 许可证及每图 SHA256 位于 `assets/lucide/`。`pnpm ui:icons` 从这些源生成 NSH 几何和浏览器图标；`pnpm ui:icons:check` 检查漂移。原始 SVG 和生成结果都不能手工改图形。升级时从同一官方版本更新源与校验，再生成三方输出。

浏览器产品原型与组件板复用 `design/prototype/shared`。HTML 与 NSH 使用各自渲染适配，共享视觉契约和图标来源；不可把 DOM/CSS 运行时导入 NSH。新增状态同步更新 [设计交接](../../docs/design/component-design.md)、[覆盖清单](../../docs/design/component-coverage-audit.md)、[演进规划](../../docs/design/component-roadmap.md) 与原生验收页。

## 验证

- `pnpm ui:check`：三端对组件验收入口执行 NSH check **和** build。
- `pnpm ui:test`：三端入口的真实引擎行为测试。
- `pnpm ui:host`：macOS 可见宿主中的深浅主题与两端密度验收，证据写入 ignored artifacts；它不代表 Android TV。
- `pnpm ui:preview --target desktop`：显式组件预览；可选 web／tv。
- 完整工程仍运行 `pnpm verify`；依赖变化运行 `pnpm security`。缺工具必须失败。

还原度检查比较原设计与宿主中的颜色、字级、几何、对齐、状态、图标及动效；完整度检查逐项映射公共导出、样例、状态和行为证据。编译通过或 headless 通过均不能替代视觉与真机。待验收项如读屏、系统大字、真实遥控、输入法、物理电视必须明确记录。

### RadarTable

包根导出 `RadarTable`、`RadarTableProps`、`RadarTableColumn`、`RadarTableRow` 和 `RadarTableRef`。它是只读比较表，不是可编辑网格；桌面与 TV 共用列、标题动作、受控状态与恢复契约，仅通过 Product 调整尺寸。标题是唯一的行内动作，完整标题保留为无障碍名称，视觉摘要不改变 ID；数值列靠右，其余列靠左。横向按钮始终可见，不依赖拖动或 hover 才能查看后面的列。

内部由独立的表头水平 `Scroll` 和垂直虚拟 `List` 组成，二者为兄弟节点。表头真实横向滚动的 offset 同步到各行宽内容的 `translateX`；行外框保持列表视口宽度，表头与行共用列宽和两侧 inset，所有宿主共用此结构。NSH 0.5.0 的 `DataTable` 自定义行位于零尺寸原点容器之下，在 Android 原生树可见而 Accessibility 树无法到达；把虚拟 List 放入水平 Scroll 又出现后续行子树零尺寸，因此列表直接拥有独立垂直视口。这里使用公开原语保留真实标题按钮，不修改引擎或绕过可访问性验收。纵向仍按稳定字符串 ID 回查当前索引，回收行的事件始终读取 `item()`；后段恢复使用 `ListRef.scrollToIndex`，横向恢复只移动到完整显示标题列的位置。该替换仍需实际 check／build、行为与宿主回归验证。

`columns` 提供稳定 key、标题与 `numeric`，`rows` 提供稳定且唯一的字符串 `id`、完整 `title` 和已格式化的字符串 `cells`。组件不解析、排序、连接或补造业务指标；缺失 cell 显示“—”，调用方传入的“0”、负数及超出 JavaScript 安全整数范围的字符串原样显示。`selected` 与 `pending` 由同一外部 owner 提供；`onOpen({ id })` 只报告打开请求，`onSource({ id })` 只报告获得焦点的准确身份，外部拒绝请求不会改变 selected。读取中改变标题的视觉文案，完整可访问名称仍保留。

```tsx
<RadarTable
  collection={collectionKey()}
  columns={columns()}
  rows={rows()}
  selected={selected()}
  pending={pending()}
  active={active()}
  tableRef={(ref) => {
    table = ref;
  }}
  onOpen={({ id }) => requestOpen(id)}
  onSource={({ id }) => rememberSource(id)}
  onNavigate={() => markNewIntent()}
/>
```

`tableRef` 取得的 `restore(id, owns)` 会定位标题列与目标行；调用时和异步挂载后都核对 `active` 与 `owns()`，拒绝缺失行、失效 owner、已卸载或非活动表格的恢复。`active` 仅约束焦点恢复，不等同 disabled；业务宿主仍负责隐藏／禁用非活动页面并拒绝后台请求。`onNavigate()` 通知调用方横向操作或读取期间的焦点变化，取消读取及较新输入意图归调用方。数据日期、来源、错误、空表说明及详情返回路径也归 app，基础包不导入业务服务。

可选 `collection` 标识当前比较集合（例如榜单维度、类型和列集）；它变化时回到首行、首列并撤销旧的等待恢复，受控 `selected` 不变，也不产生打开请求。同一集合的刷新或 `pending` 文案变化保持滚动位置。独立样例传入 `wide`／`compact`，行为测试在后段行验证读取文案仍可见，再验证切换集合后首行重新可见；这些可见性断言不替代真实宿主的滚动坐标与焦点检查。

标题复用 `Button` 的可选 `labelLines={2}`，在父容器宽度内两行省略，完整 `label` 仍是无障碍名称。普通按钮不传此属性时保持原布局。返回在可行范围居中显示目标行，保留相邻上下文和焦点安全区；横向列按钮、表头原生滚动条与正文横向滚轮共用列偏移。

独立样例 `dev/RadarTables.tsx` 经 `@hongguo/ui/preview/radar-table` 导出；测试经 `@hongguo/ui/testing/radar-table` 导出。三端显式入口为 `apps/*/RadarTablePreview.tsx` 及相邻 `.test.tsx`，不进入产品路由或 Gallery。样例提供 32 条合成数据、外部接受／拒绝、相邻大 ID、完整长标题、缺失／零／负数／极值、读取中、空表、列集切换、横向按钮与可重复的后段行恢复；不发请求、不写历史或媒体状态。样例不增加动效，沿用基础按钮状态和表格原有滚动行为。

运行每端的 `nsh check`、`nsh build RadarTablePreview.tsx` 与 `nsh test RadarTablePreview.test.tsx`。测试覆盖受控动作、精确 ID／来源、列集及空表切换，以及 inactive／过期 owner 的恢复围栏；真实宿主的表格对齐、长标题、横滚、浅深主题、大字号与遥控仍须单独观察。文件存在不表示还原度或宿主验收已通过。
