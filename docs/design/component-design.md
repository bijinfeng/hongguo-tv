# 基础组件设计交接

当前视觉、交互与状态契约以[DESIGN](../../DESIGN.md)为准；实际公共API以[UI包用法](../../packages/ui/README.md)及生成NSH类型为准。此页只维护设计板入口和必要组合交接，不复制颜色、控件状态及逐轮实施记录。

## 打开设计稿

运行 `node design/prototype/serve.mjs`。产品原型与组件板共用[同源资源](prototype-components.md)，不是两套独立风格。

- [公共基础](http://127.0.0.1:4178/components/index.html?platform=common)
- [桌面](http://127.0.0.1:4178/components/index.html?platform=desktop)
- [TV](http://127.0.0.1:4178/components/index.html?platform=tv)

每端为基础、按钮与选择、输入与表单、导航、弹层、内容、观看、反馈八组；布局配方及业务组合置于对应组，不按新名称无限扩组。评审标签不进入产品，账号／视频／进度样例不代表真实能力。

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
