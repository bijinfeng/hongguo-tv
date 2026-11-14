# 基础组件设计评审

2026-11-14 · 浏览器设计交付 · 最终复核

本文件先保留搜索与复选框修正的定向复核，下方记录本轮覆盖补全的独立完整复审。

## Capture validity

有效。已人工检查公共基础、桌面／TV 的八组设计截图，以及浅深主题、确认对话框、选集侧面板和影院样例。旧四组截图只补充未变化的正文控件，不作为八组覆盖证明。新增基础、导航、内容、反馈与锚点弹层区域已人工检查；没有重跑 detector。

最终定向证据位于忽略目录 `.impeccable/review/components/`：`user-924-search-final.png`、`user-924-edit-final.png`、`user-924-clear-final.png`、`desktop-forms-final.png`、`desktop-content-final.png`、`tv-content-final.png` 和 `checkbox-enter-proof.json`。924×873 截图保留视口上下文；较大的 full-page 截图用于核对完整组件区域。查看工具缩小长图不改变原始截图的证据范围。

本评审读取设计文件、源码与截图；交互及像素测量由主任务在真实浏览器执行并提供结果，复核者未另开浏览器。截图不能独立证明键盘、读屏或原生行为通过。

## Contract / fidelity

符合既有暖白／深灰绿、红色主动作、系统字体、12 圆角与官方 Lucide 图标体系。没有 approved comp，本轮按现有视觉体系延伸评审，无需重建风格。

公共基础独立，桌面与 TV 均含基础、按钮与选择、输入与表单、导航、弹层、内容、观看、反馈八组。演示身份与数据边界清楚，没有新增评论、弹幕、点赞或离线剧集任务。共用控制器持有状态和行为，TV 的确认编辑、方向导航及滑杆预览／提交／取消具有输入设备依据。

## Craft findings

浏览器样板的层级和表面克制，主动作、危险动作、选中与焦点可区分；禁用、等待、错误、只读、空内容及恢复路径均有样例。确认对话框默认取消，代码明确保留关闭后来源焦点恢复。当前八组覆盖及已检查截图未发现需要重做视觉方向的问题。

上一轮列出的三个 material 问题均已定向修复。最终截图显示搜索普通、编辑与清空焦点分别只有各自应有的边界和外轮廓，搜索输入与按钮边界同高；两端管理行的复选框、封面、标题和动作列保持同一轴线。

## Material fixes

| 问题                                         | 最终评分 | 修正与证据                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 搜索外壳与实际输入区域高度不同               | resolved | `components.css` 的 `.input-with-icon` 改为 `border: 0`，以主题 token 的 inset 边线绘制边界，内部输入和清空按钮填满高度。主任务浏览器量测 TV 外壳／输入／清空／搜索按钮均为 60，桌面均为 44，顶部差为 0；内部输入边框为 0。924×873 三态及桌面最终截图与修正一致。                         |
| TV 确认键不能切换 checkbox                   | resolved | `components.js` 的共享 keydown 仅为 TV、Enter、启用 checkbox 映射原生 `click()` 并阻止默认行为，桌面与 Space 路径保留。`checkbox-enter-proof.json` 记录普通未选 false→true、部分选中 false→true、已选 true→false；主任务另验证内容第二条记录确认后计数为 2。                              |
| 记录选中态改变 padding，导致列和操作目标移动 | resolved | `content.js` 给管理行稳定的 `content-record-row`；`content.css` 由该类固定桌面 16／TV 24 内距，`content-row-selected` 只改变背景、前景与圆角。最终两端内容截图列对齐；主任务按桌面 Space／TV Enter 切换后量测行及子项 x、width、height 不变，以 `rect.y + scrollY` 比较的文档坐标也一致。 |

本次最终复核只关闭上述三项，没有继续扩充问题范围。

## Disposition

**ship** — 可交付浏览器基础组件设计稿。三项均为 resolved，无待修 material 项，也不需要 recapture 或 rebuild。

该结论不代表产品实施完成；产品代码仍暂停。本轮没有执行 NSH check/build，不宣称 macOS 原生、TV 遥控／输入法／真机、系统大字号、读屏或媒体链路验收通过。

## 覆盖补全独立复审 · 2026-11-14

### Capture validity

全新独立评审者逐一打开 20 张平台／主题整页图及 7 张边界状态图，未使用已过期的 `coverage-tv-records-924.png`。证据为 `.impeccable/review/components/coverage-desktop-light-{forms,navigation,content,cinema,controls,layers}.png`、`coverage-desktop-dark-{forms,navigation,content,cinema}.png`、`coverage-tv-dark-{forms,navigation,content,cinema,controls,layers}.png`、`coverage-tv-light-{forms,navigation,content,cinema}.png`，以及 `coverage-user-924-forms-final.png`、`coverage-user-924-content.png`、`coverage-tv-keypad-924.png`、`coverage-edge-menu-924.png`、`coverage-record-confirm.png`、`coverage-cinema-error.png`、`coverage-tv-long-select-924.png`。花括号代表对应的多个独立文件。截图有效，覆盖本轮新增组合及关键边界。

### Contract / fidelity

符合既有暖白／深灰绿、红主动作、系统字体与统一圆角方向。无 approved comp，按现有规范与样板一致性判断。源码确认新增模块接入同一 `components.js` 工厂、状态与事件入口；桌面／TV 差异集中在密度、布局与输入适配。账号、媒体、预约及统计均明确为演示，未扩入已排除功能。

### Craft findings

本轮未发现需要阻止浏览器样板交付的实质问题。深浅主题层级一致；焦点与选中可区分；924px 搜索组合对齐、记录选择几何稳定；边缘菜单与长 Select 均在窗口内承载。影院错误、危险确认和独立累计统计表达清楚。

### Material fixes

无。

### Disposition

**ship** — 限本轮浏览器组件样板。交互操作与 24 项回归结论来自主任务证据，并非评审者独立实测；评审者只读取文件和截图。本次审查不证明生产 NSH／Rust、读屏、大字号、真实遥控／输入法或媒体链路通过。

## 高频基础预先设计独立复审 · 2026-11-14

### Capture validity

全新独立评审者检查 21 张最终截图：`frequent-{desktop,tv}-{light,dark}-{foundation,controls,forms}.png`、`frequent-{desktop,tv}-924-{foundation,controls,forms}.png`，以及 `frequent-tv-disclosure-expanded.png`、`frequent-tv-preference-error.png`、`frequent-tv-chips-menu.png`。全部位于忽略目录 `.impeccable/review/components/`，花括号代表多个文件。新组件区域完整可辨；部分截图保留旧组件上下文，无需重新截图。

### Contract / fidelity

八类新增设计覆盖 [演进规划](component-roadmap.md)，保持暖白／深绿灰、红色状态、系统字体及平面边界。桌面和 TV 共用状态与动作，仅尺寸和输入导航适配。浏览器样板与生产导出边界明确，没有扩入已排除的产品能力。

### Craft findings

层级、对齐、组内间距与分组留白一致；长文折叠、链接、条件移除和操作栏容易识别。焦点与选中区分清楚，TV 不依赖 hover 揭示操作。924 下新区域没有可见横向截断，错误靠近字段组，菜单与触发器关联明确。独立复审未发现本轮阻断性视觉或语义问题。

主任务已在浏览器检查文本展开保留焦点、折叠分组多开、条件移除和清空交接、桌面操作栏跳过禁用项、TV 方向导航、菜单确认／返回恢复，以及偏好失败回滚。三组在桌面 1440、TV 1920 和两端 924 窗口量测无整页横向溢出；当前验收标签页未记录控制台警告或错误。

### Material fixes

无必须修复项。沿用已有 detector 结果，未重复运行；既有 advisory 不构成本轮新增组件的阻断项。

### Disposition

**ship** — 限本轮高频基础浏览器设计。交互结果来自主任务操作，独立评审者只读取源码、文档与截图。既有 24 项回归通过，不计为新增模块的完整自动化覆盖；JS 语法、定向格式与 diff 检查通过。减少动态效果仅检查 CSS，未切换系统设置。未验证原生 NSH／Rust、读屏、大字号、真实 TV 遥控／IME 或媒体；产品实施继续暂停，未提交／推送。
