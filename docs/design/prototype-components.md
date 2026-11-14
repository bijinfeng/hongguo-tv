# 原型与基础组件共源

本次基础组件提交包含组件板与共享资源；下述产品原型整页接入仍留在工作区，另行提交。接入规范继续适用于后续原型。

产品原型 `design/prototype/index.html` 和基础组件板 `design/prototype/components/index.html` 使用同一套浏览器设计组件。颜色由 `packages/ui/theme.json` 生成到 `components/assets/theme.css`；图标由固定版本 Lucide 官方资源生成到 `shared/icons.js`，不在页面内另画路径。

## 源码边界

| 来源                                                                                                            | 职责                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/foundations.css`、`shared/form-extras.css`、`shared/account-extras.css`、`shared/collection-extras.css` | 头像、身份、表单补充、账号和片库组合                                           |
| `shared/controls.js`                                                                                            | `HongguoComponents.button/icon`，两边共用的按钮标记、图标映射和属性转义        |
| `shared/controls.css`                                                                                           | 公共尺寸、按钮、输入、搜索边界、选择触发、勾选、切换、标签页、弹层、滑杆与焦点 |
| `shared/content.css`                                                                                            | 海报、续播卡、结果行与观看进度                                                 |
| `shared/feedback.css`                                                                                           | 提示、进度、空状态、骨架、Toast、Tooltip                                       |
| `shared/discovery-extras.css`                                                                                   | 日期、季、筛选、排序、榜单与目录续取组合                                       |
| `shared/frequent-extras.css`                                                                                    | 折叠、链接、键提示、标签、分页等高频组合                                       |
| 页面 CSS 的 `prototype-layout` 层                                                                               | 页面网格、宽度、列数、位置、内容排版和宿主壳；不能覆盖公共控件的皮肤           |

组件板保留的旧 CSS 入口仅导入对应共享文件，避免旧链接失效。产品的 `btn/nav-button/episodes` 等类可继续承载事件或页面布局；基础操作同时使用 `ui-button`，内容类直接使用 `content-*`，反馈使用 `fb-*`。不靠复制一份视觉值来维持一致。

## 后续原型约束

1. 新页面先从基础组件板选择已有组件，加载上述公共资源，不在页面内新增另一套按钮、输入或弹层样式。
2. 新的基础能力先加到共享组件并在组件板展示状态，再用于产品原型；没有真实产品需求的组件只作为规划样板，不强行加入页面。
3. 按钮通过 `HongguoComponents.button` 创建。变体限默认、`primary`、`quiet`、`destructive`、`selected`、`compact` 和 `iconOnly`；旧 `danger` 名称在适配层归一化。
4. 搜索采用 `input-with-icon` 包住 `ui-input`，提交按钮为相邻的公共按钮。外壳拥有唯一边界和输入焦点环，输入的实际外框与按钮同高；清除按钮保留独立焦点。
5. 桌面与 TV 共用语义、组件结构和状态，平台通过 `data-platform` 选择尺寸。输入法、方向导航、确认与返回属于宿主输入差异，不另造两套业务动作。
6. 页面只能调整布局参数，例如续播卡 `--content-width`；不能单独修改控件的颜色、圆角、焦点、描边或高度。新尺寸需要同时更新公共令牌、组件板及 NSH 对应规范。

```js
const { button, icon } = globalThis.HongguoComponents;
button('继续观看', { variant: 'primary', glyph: 'play', action: 'resume', value: dramaId });
```

| 核心规格                 | 桌面        | TV          |
| ------------------------ | ----------- | ----------- |
| 普通按钮、输入、选择触发 | 44px        | 60px        |
| 紧凑操作                 | 36px        | 60px        |
| 图标                     | 20px        | 26px        |
| 切换轨道                 | 48×28px     | 64×36px     |
| 勾选框                   | 22px        | 28px        |
| 选集按钮                 | 至少48px    | 至少80px    |
| 对话框 / 侧面板          | 480 / 440px | 800 / 640px |
| 焦点线宽 / 偏移          | 2 / 4px     | 3 / 4px     |

## 覆盖与验收

当前原型使用的基础操作、搜索、分类标签、导航选中、日期、季、选集、设置选择器与切换、历史勾选、海报、续播、结果行、反馈和播放控件已接到上述公共来源。折叠、链接、键提示等高频组合可复用同一来源，未为示例组件编造产品入口。

`node --test design/prototype/*.test.mjs` 包括既有24项交互回归和4项共源契约测试：入口资源一致、按钮无障碍/动作属性、产品所有图标均能解析到生成的官方资源、滑杆比例与实际值同步。JavaScript 语法与 Oxfmt 检查同步执行。

视觉验收需比较桌面/TV、浅色/深色及924px窄窗口，检查输入与按钮实测高度、单一焦点边界、弹层焦点恢复和页面溢出。截图与浏览器尺寸矩阵由本轮主验收记录汇总；源码/模型回归通过不替代这些观察，也不代表真实 NSH、TV 遥控器或媒体解码通过。

产品原型中的 `<select>` 保留原生选项与键盘交互，触发面的尺寸和语义色与组件稿一致；展开后的系统选项面板由浏览器/操作系统绘制。组件板中的自定义 Listbox 仍展示目标控件的完整状态，不能以浏览器原生选项面板宣称 NSH Listbox 还原完成。
