> 历史记录：文档收敛前的 `docs/design/component-spec-conformance-fixes.md`，保存于 2026-11-15，来源提交 `eee26ae`。原文 SHA256：`c58da792072c67ef28c687bb63a0ac99086b78202277ed65f8d951040ea3274e`。除迁移相对链接及Markdown排版外保留原文；其中的当前状态、下一步和早期方案不作为现行指令，现行入口见[文档索引](../../../README.md)。

# 基础组件规范还原修复与补审

2026-11-15。范围为设计规范、公共基础组件及其样板的还原。保留“日常片库”、同一套浅深主题和两端密度；没有重设计业务页面。

## 初审六项修复

| 编号           | 修复结果                                                                                                    | 实现 owner                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| R1 下载字级    | 使用 numeric 角色，桌面 16、TV 22；间距随密度换算                                                           | `download-progress.tsx`、`display.tsx`         |
| R2 展开正文    | 使用 body 字级与 1.5 行高，折叠／展开不改变字级                                                             | `frequent.tsx`                                 |
| R3 Select 结构 | 当前值靠起始端、箭头在末端，文字可收缩；普通边界为 input，影院保留影院配对                                  | `button.tsx`、`player.tsx`、`select-focus.tsx` |
| R4 焦点裁切    | 画廊滚动内容保留至少 8 单位安全区，不缩小外焦点                                                             | `dev/Gallery.tsx`                              |
| R5 状态组合    | Tabs 可用未选与禁用有区别；选中后禁用保留字重／标记，恢复仍保留值；ChoiceGroup 使用等宽勾选槽，禁用覆盖配对 | `form.tsx`、根 DESIGN                          |
| R6 弹层角色    | 普通 Dialog／Sheet／Menu／Popover／Tooltip／Toast、选择列表使用 popover 配对；影院选集保留 cinema           | `overlay.tsx`、选择列表 owner                  |

R6 的 card 与 popover 在当前主题中同值。本次修复语义归属，不声称产生新的可见色差。浏览器参考同步相应 token、Tabs 禁用下划线与 ChoiceGroup 勾选槽。

浏览器默认窗口实际点击并复看桌面浅色与 TV 配方深色的 ChoiceGroup：勾选只随当前值显示，标记槽保持占位，焦点与选中独立。截图为 `browser-choice-light.jpg`、`browser-choice-tv-dark.jpg`；它们不是物理 TV 截图。

补审另发现未知总量 DownloadProgress 的默认指示条占满轨道，容易读成完成。已复用共享 Progress：已知总量为实际比例，未知总量为 28% 往返片段，减少动态效果时静止；不再维护第二套轨道／范围／等待动效。字节文字保持原位，不添加副标签。Progress 增加可访问名称参数，避免为了命名进度而强制显示额外标题。

## 打开后的弹层

在 macOS 图形宿主检查桌面 1440×1000、TV 密度 1920×1080，浅深主题及正常／减少动态效果。每组实际打开 Dialog、ConfirmDialog、Sheet、Menu、Popover，检查标题、动作层级、留白、边界、菜单禁用／危险分组和遮罩，随后关闭并检查消失。另查 Toast 与 Tooltip；TV 不以 hover Tooltip 承担操作说明。

所查样例没有新增的重叠、出屏或配对偏差。右侧 Sheet 保持单一滚动主体；确认框保留安全动作及明确危险动词。没有根据只有入口的截图宣称弹层已审。

证据：`artifacts/design-spec-review/visual/{web,tv}/` 的 `*-settled.png`、`toast-*`、`tooltip-*`；总览为同目录上一级的 `web-layers-contact.jpg`、`tv-layers-contact.jpg`。`run-visual-review.mjs` 可重建 ignored 夹具，具体文件名和调用见脚本。

## 真实封面与正文

使用匿名公开目录的两张实际封面：《我李长生重回八零，赶山狩猎养妻女》《穿越八零，我把娘俩宠成宝》。来源和下载摘要保存在 `artifacts/design-spec-review/cover-sources.json`；审查时以本地副本加载，证明原生成功显示和裁切，不代表持续网络可用。

- PosterCard：人物与图内题字在竖图中可辨，长剧名留在图外并按两行规则处理；选中和焦点不改变图片尺寸。
- ContinueCard：贴边封面随外框裁切，无额外内圆角露缝，剧名与进度独立于图片。
- StoryFeature：宽图会裁掉竖图下部题字，符合 feature 用途；所查样本主体脸部仍可辨，文字与辅助操作位于左侧渐隐区。封面图内题字不承担剧名信息。
- ExpandableText：显式溢出的正文实际展开，维持 1.5 行高；失败占位、来源切换与恢复后图片均可见，容器不跳高。

两张样本不能证明任意封面的人脸／题字都安全。额外横向 Cover 仅用于来源切换诊断，不是新的海报比例规范；TV 顶部取景与桌面 30% 取景是既有有限配方，不为这两张样本增加专用偏移。

证据：`visual/{web,tv}/covers-*`、`source-*-{failed,recovered}.png` 与 `*-imagery-contact.jpg`。早期夹具正文仅两行，未溢出而等待展开按钮失败；改为一行折叠后通过，不将夹具失败记作产品缺陷。

## 动效补审

先检查实际配方与减少动态效果分支，再使用系统真实时钟、延迟改变受控信号并连续截图。没有使用会结束有限原生动画的手动时钟作为过渡证据。

| 范围          | 观察与判断                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dialog        | 捕获淡入／淡出中间帧；位置与占位稳定，减少动态效果直接显示／消失                                                      |
| Sheet         | 捕获右侧进入／退出与遮罩中间帧；未见内容随面板重排或终态出屏                                                          |
| Menu／Popover | 连续采样打开状态及终态，关闭行为通过；短透明度过渡不推动周围内容                                                      |
| Toast         | 底部消息出现，保持固定锚点；phase 由调用方管理，100ms ending 配方不代表所有调用方都播放离场                           |
| Cover         | 捕获图片来源切换中的淡入帧，固定容器中更换图片；减少动态效果为 0ms                                                    |
| 快速开关      | Dialog／Sheet／Menu／Popover 依次打开、关闭、再打开、再关闭，最终没有残留表面；检查的是收敛结果，不是每一帧的中断轨迹 |

证据：`artifacts/design-spec-review/motion/{web,tv}/`、`motion-review.log` 与 `run-motion-review.mjs`；夹具源码另外保存在同一 artifacts 目录。截图调用和编码有开销，日志记录实际墙钟偏移，不能把文件序号当作精确帧号，也不能据此声明 60fps、精确 100ms 或全组件动效性能通过。Tooltip 的延迟／显隐在弹层矩阵检查，未做单独连续帧采样；ContentArrival、所有控件 pressed、播放器控制层不在本次连续采样范围。

## 验证与证据身份

最终三端 `ui:check`（含 build）、`ui:test` 48／48、`ui:host` 32／32、弹层／图片补审 16／16、真实时钟动效补审 8／8、浏览器参考测试 28／28 通过。根 `pnpm verify` 通过：格式、lint、生成契约、Rust 197、工程 30、三端 check／build、App 测试 Web 64／Desktop 66／TV 67、发行基础检查。日志为 `final-ui-{check,test,host}.log`、`visual-review.log`、`motion-review.log`、`prototype-tests.log`、`final-verify.log`；结果同时记入根 [VALIDATION](../../../../VALIDATION.md)。

收尾检查：当前视口的字级、间距、对齐、浅深配对、图片边界和外焦点已观察；所涉键盘选择、禁用保护与弹层返回由定向宿主回归覆盖。状态值与业务 owner 保持原处，公共变更只涉及必要类型／命名。没有新依赖、图标或装饰动效；没有增加第二套主题或页面样式接口。系统大字、其他窗口尺寸、真实辅助技术与所有业务组合没有据本轮样例补写为通过。

三端 check 同时包含 build；headless 行为、macOS 图形宿主及连续帧样本分别记录，不把 TV 密度替代观察写成 Android／物理电视验收。mixed headless／macOS development host 有 NSH 汇总但未展开的构建 warning，根测试另有预期合成失败日志，不称零警告。

初审快照保留在 `artifacts/design-spec-review/source/`，基于当时提交 `06d4723`。本次从 `11f1c02` 的工作区实施；最新文件摘要另存 `fix-source-manifest.json`，不覆盖初审快照。日历等并行修改继续保留，最终工作区并非只包含本任务。无依赖变化，不提交、不推送。
