---
name: 红果短剧
description: 官网式的黑色观看空间，以红果橙承担发现与播放动作。
colors:
  bg: "#000000"
  surface: "#131414"
  raised: "#1d1e1e"
  hover: "#292a2a"
  fg: "rgba(255,255,255,.92)"
  muted: "rgba(255,255,255,.58)"
  border: "rgba(255,255,255,.12)"
  accent: "#fa7705"
  accent-hover: "#ff9233"
  ink: "#111111"
  soft-accent: "rgba(250,119,5,.18)"
  teal: "#ff9233"
  error: "#ff6b57"
  focus: "#ff9233"
  light-bg: "#ffffff"
  light-surface: "#ffffff"
  light-raised: "#f7f7f7"
  light-hover: "#f0f0f0"
  light-fg: "#171717"
  light-muted: "#686868"
  light-border: "#e5e5e5"
  light-soft-accent: "rgba(250,119,5,.1)"
  light-teal: "#db6500"
  light-error: "#c93727"
  light-focus: "#c85e00"
typography:
  display:
    fontFamily: '"Songti SC", "STSong", "Noto Serif CJK SC", serif'
    fontSize: "clamp(34px, 3.5vw, 52px)"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  headline:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
    fontSize: "12px"
    lineHeight: 1.6
    letterSpacing: "0.015em"
  keycap:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "11px"
    lineHeight: 1.4
rounded:
  tag: "4px"
  chip: "5px"
  poster: "6px"
  control: "7px"
  continue-card: "8px"
  hero-dialog: "12px"
spacing:
  row: "12px"
  stack: "20px"
  grid-column: "24px"
  dialog-padding: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.ink}"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  navigation-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: "6px 13px"
  poster-card:
    textColor: "{colors.fg}"
    rounded: "{rounded.poster}"
---

# Design System: 红果短剧

本文件是官网风格预览的素材与页面组合说明；基础组件的公共规范以仓库根目录 [DESIGN.md](../../../DESIGN.md) 和 `packages/ui` 为准。桌面与 TV 预览只提供真实内容、构图和端型密度参考，不得在本文件中另造一套按钮、输入框、选集或状态规则。

## Overview

**Creative North Star:「红果短剧官网」**

黑色与炭灰层级贴近官网内容区，红果橙（`#fa7705`）标记搜索、播放、选集和更新等关键动作。浅色模式保留，播放器始终使用深色。

系统中文黑体承担操作与阅读，宋体承担故事标题。用留白、对齐和克制的边界解释结构，避免重复的次级标签与描述。

**Key Characteristics:** 黑色内容区；红果橙动作；系统黑体优先；小圆角；完整真实封面；跨端保持交互语义。

## Colors

前置 token 为规范值，提取自 `assets/theater.css`。无 `light-` 前缀为默认暗色；`light-` 是浅色主题对同名 CSS 变量的覆盖，`accent`、`accent-hover` 与 `ink` 跨主题沿用。

- **红果橙**：`accent` 用于关键动作与选集边界；`accent-hover` 表示主按钮悬停；`soft-accent` 用于选中底色。导航与筛选的常规选中态使用中性色。
- **黑色与炭灰**：`bg` → `surface` → `raised` 建立官网式层次，`hover` 表示交互反馈；`fg`、`muted`、`border` 分别承担正文、辅助信息与边界。
- **暖灰纸张**：浅色主题使用 `light-bg`、`light-surface` 和 `light-raised`，保留墨蓝正文。
- **状态色**：`teal` 沿用明亮红果橙用于观看进度与成功提示，`error` 用于错误，`focus` 用于键盘与遥控器焦点。焦点优先服从可辨识性。

## Typography

字体栈与层级见前置 token，不下载额外字体。宋体故事标题字重 400，CJK 标题行高不低于 1.3；正文沿用系统中文黑体。时间、键帽与集数通过等宽字体或 `tabular-nums` 保持稳定。

桌面主视觉标题使用 `display`；详情标题为 `clamp(27px, 3vw, 40px)`、行高 1.4；TV 主视觉为 74px，详情为 34px。长标题允许换行，使用 `overflow-wrap: anywhere`，不以省略掩盖内容。简介保持约 56ch、行高 1.9 的阅读宽度。

## Layout

桌面采用 12 列对齐网格、24px 列间距，内容最大宽度 1660px；侧栏 176px，顶栏 86px，横向内边距 `clamp(24px, 3.5vw, 64px)`。内容海报轨道默认六列，继续观看默认三列。基础行间距 12px、纵向堆叠间距 20px；这些是实际布局值，并非统一的等比间距量表。

桌面断点为最小 1600px，以及最大 1190px、940px、650px；分别调整内容规模、侧栏与列数。TV 为 1920×1080 固定画布，水平安全内边距 88px，控件与字级独立放大。组件板断点为最大 1100px、720px、390px。

## Elevation & Depth

以表面色差和细边框建立静态深度，阴影服务于悬浮、弹窗和明确的焦点反馈。暗色浮层阴影为 `0 20px 60px oklch(0.08 0.02 255 / 0.28)`；浅色为 `0 20px 60px oklch(0.25 0.025 255 / 0.12)`。海报悬停抬升 4px，使用 `0 12px 22px oklch(0.08 0.02 255 / 0.2)`。

默认状态变化 160ms，海报与开关 200ms，TV 180ms，沿用 CSS 默认 `ease`。遵循 `prefers-reduced-motion: reduce`：关闭过渡，动画时长降至 0.01ms，滚动恢复 `auto`。

## Shapes

标签 4px、筛选与集数 5px、封面与选择框 6px、按钮/输入框/侧栏导航 7px、继续观看卡片 8px、主视觉与对话框 12px。TV 主按钮 8px。边框通常 1px；圆形仅用于头像等既有语义。

## Components

- **按钮**：主按钮熔金橙底、墨蓝字，最小高度 44px、内边距 10px 18px；默认、描边与幽灵按钮共用基础形状。按下位移 1px；禁用透明度 0.38，仍保留原生 `disabled`。TV 主按钮最小高度 62px。
- **输入框**：表面底、细边框，最小高度 44px、横向内边距 14px；焦点同步改变边框并显示 2px 外轮廓，错误使用 `error`。
- **导航与筛选**：默认辅助字色，悬停与选中使用 `raised`、`fg` 和边框；通过 `aria-current`、`aria-selected` 或 `aria-pressed` 表达实际状态，避免依赖颜色。桌面筛选最小高度 36px，集数分组 44px。
- **卡片与封面**：开放排布，标题置于图下。官网海报使用项目内 `assets/media/`，`object-fit: contain` 保留原始比例与完整画幅；失效时隐藏图片，显示剧名与中性 `raised` 占位，不合成替代海报。
- **官方 Logo**：使用 `assets/media/brand-logo.png` 原图，原始比例 216:64；完整显示，不裁切、不改色、不替代或改绘。浅色主题使用深色底托。桌面宽 108px、TV 156px。
- **焦点与浮层**：基础轮廓 2px、偏移 4px；TV 轮廓 3px、偏移 7px，卡片封面轻抬升 2px。长集数使用可操作的分组与分页，不将全部集数塞入不可达区域。

### 桌面播放页

播放页整体是暗色观看带：进入该路由时外壳同步切换为影院配色（`body[data-route="player"]`），浅色主题也不例外；离开后恢复原主题。结构按观看顺序自上而下：

| 区域     | 组合                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 顶部     | 返回详情的轻量文字操作（箭头 + 目的地名，无静止表面），与播控主动作区分                                                     |
| 画面     | 竖片按原始比例 `contain` 居中，剩余两侧用同一海报的模糊放大层（`blur(46px)`、`brightness(.42)`、缩放 1.25）填充，不生成假画面 |
| 标题层   | 剧名用宋体叠在画面下沿的渐隐层上，元信息在其下；不另占画面外的一整块高度                                                   |
| 播控带   | 画面下方的独立黑带：进度条在上、按钮一排在下；不使用叠在画面上的浮层，也不遮住标题                                          |
| 操作     | 收藏／追更／预约后续一行，右侧是键盘提示                                                                                   |
| 选集栏   | 右侧 316 宽、吸附滚动的独立面板，四列 40 高集数按钮，独立分页                                                               |

画面高度取 `clamp(340px, calc(100vh - 372px), 680px)`，与播控带、标题和操作一起在 1180×780 与 1440×1000 的首屏内放完。桌面使用 `.watch-transport` 承载播控；TV 播放器仍使用叠加在画面内、可隐藏的控制层（`.player-controls`），两者共享按钮与滑杆语义但不共享定位。

## Do's and Don'ts

- **Do** 复用 `assets/theater.css` 的主题变量与原生组件语义；新界面同时检查浅/暗主题、键盘与遥控器状态。
- **Do** 保留真实内容、完整图片和长标题；来源与尺寸以 `assets/media/sources.json` 为准。功能图标统一使用 Lucide。
- **Do** 通过布局与控件状态解释操作，文案只补足必要信息。
- **Don't** 添加评分、热度、点赞、评论等社交指标或入口，也不补造未知内容信息。
- **Don't** 使用远程图片热链、替换官方 Logo、裁切封面或用装饰性假海报掩盖加载失败。
- **Don't** 在播放器中套用浅色背景。
