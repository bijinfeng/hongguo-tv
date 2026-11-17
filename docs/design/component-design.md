# 基础组件设计交接

当前视觉、交互与状态契约以[DESIGN](../../DESIGN.md)为准；实际公共API以[UI包用法](../../packages/ui/README.md)及生成NSH类型为准。此页只维护设计板入口和必要组合交接，不复制颜色、控件状态及逐轮实施记录。

## 打开设计稿

运行 `python3 -m http.server 4178 --directory design/prototype`。当前设计稿位于 `design/prototype/visual-redesign-real/`，组件板与桌面／TV稿同属这一版。

- [公共基础](http://127.0.0.1:4178/visual-redesign-real/components/index.html?platform=common)
- [桌面](http://127.0.0.1:4178/visual-redesign-real/components/index.html?platform=desktop)
- [TV](http://127.0.0.1:4178/visual-redesign-real/components/index.html?platform=tv)

每端为基础、按钮与选择、输入与表单、导航、弹层、内容、观看、反馈八组；布局配方及业务组合置于对应组，不按新名称无限扩组。评审标签不进入产品，账号／视频／进度样例不代表真实能力。

## 设计规范与桌面／TV稿对齐

根目录 [DESIGN.md](../../DESIGN.md) 是设计规范的唯一来源。新的桌面稿和 TV 稿只提供端型构图、真实目录和尺寸参考；基础组件稿必须从同一组语义 token 和状态规则派生，不在页面 CSS 里另造按钮、输入框或选集边界。

两端共用以下控件规则：普通边框按钮使用 `card` 表面、`foreground` 文字和 `border` 1px 边界；悬停与按下只改变表面颜色；选中使用 `accent` 配对；主动作使用 `primary`；焦点始终使用独立 `ring` 轮廓。搜索输入和 Select 保留 `input` 边界，搜索组合只有一条外框。桌面稿的 44px 控件、TV 稿的 60px 控件，以及 TV 更强的焦点轮廓属于端型密度，不改变这套语义。

桌面稿中的搜索栏、描边操作、选集网格和 TV 稿中的主舞台、导航、选集面板都要回到 `design/prototype/visual-redesign-real/shared/controls.css` 与 `packages/ui/src` 的对应组件。组件稿只消费由 `packages/ui/theme.json` 生成的 `components/assets/theme.css`；两处状态规则必须同时修改，不在页面另补颜色。

## 公共设计与平台适配

一份受控值／事件／状态契约，一个package；桌面／TV只在尺度、输入和宿主承载边界适配。端型尺寸、输入高度／单边界、Select候选确认、Tabs激活、TV编辑及slider预览／取消，以DESIGN对应章节为准，不建立两套业务交互。

| 组合补充             | 桌面  | TV参考值 |
| -------------------- | ----- | -------- |
| Dialog               | 宽480 | 宽800    |
| SidePanel／选集Sheet | 宽440 | 宽640    |

这些是已有组合的设计约束；TV参考值须经tvUnit换算，系统大字与可达性仍需实际观察。DateChoice／SeasonChoice／RankingCard／RadarTable的公开契约和几何直接查UI包对应章节，不在此再抄一份API。

## 从设计到NSH

浏览器工厂与事件处理保持一份，HTML弹层／空间寻焦只服务原型，不进入NSH。nsh/base承接语义与基础交互，UI层承接有限样式／输入适配，app拥有请求、媒体、导航和持久化意图。禁止用绝对定位View重造通用弹层。

NSH 0.5适配按实际生成类型：Slider提交映射onChangeEnd({value})；Tabs由各Tab的selected／onPress承接；Dialog内容用class／style，Sheet／Popover内容用popupClass／popupStyle。项目Button的variant／size／pending是包装契约，不能直接传给base。保留现有SelectFocus与来源移除交接，不为视觉一致删掉已验证适配。

新增组件前查[当前覆盖](component-implementation.md)和[候选准入](component-roadmap.md)，先确认真实用途／状态／焦点路径及NSH承接。原型更新先改公共资源，NSH只使用公共UI，不能为未确认业务补造协议或成功状态。

## 验证与追溯

浏览器渲染／交互、NSH check和build、真实宿主、Android TV遥控／IME、系统大字／读屏及真实媒体分别验收。924×873评审视口暴露的搜索双边框／58与60高度问题是历史修复依据，不是新的窄窗产品规格。

已实现家族、设计还原与剩余限制统一见[覆盖矩阵](component-implementation.md)；原始组合、用户反馈及历次设计观察保存在[历史交接](../history/2026-11-15/design/component-design.md)。后续不在本页追加运行计数和日期日志。
