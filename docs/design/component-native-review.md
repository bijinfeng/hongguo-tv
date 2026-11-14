# 基础组件原生视觉独立复审

2026-11-15。复审对象为单一 `@hongguo/ui` 与 macOS 可见宿主中的桌面／TV 组件验收页。依据为 `DESIGN.md`、`component-design.md`、共享设计 CSS，以及 impeccable 和 NSH Design Guides。采用原生截图审查；没有运行浏览器 detector，没有修改组件源码、运行并发宿主测试或提交。

## 结论

**ship**：本轮三项发现均已通过定点截图复核关闭；没有剩余阻塞发现。结论仅覆盖本次共享基础组件还原与 macOS 截图抽样范围，不代表产品、媒体链路或 Android TV 已整体验收。无需重造组件或另建桌面／TV API。

| 问题                         | 最新截图证据与来源                                                                                                                                                                                                                                                  | 状态与最小后续                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 海报宽度与封面高度失配       | `web/components-desktop-content-dark.png` 现为 180×243，`tv/components-tv-content-light.png` 现为 260×240；`Gallery.tsx:466`、`:475` 用固定父宽，桌面 `width={180}`。与 `shared/content.css:7`、`:279` 一致。                                                       | **已关闭**。仅改 Gallery 装配，生产集合父容器与公共卡片 slot flex 契约保留。标题、辅助文字、选中底色与续播均未观察到遮挡。                                                                                            |
| 选集样例网格未达四列         | 最终重拍的 `web/components-desktop-cinema-light.png` 与 `tv/components-tv-cinema-light.png` 均为四列：第一排 1／2／3／4，第二排 5／6；间隔与第三集选中态可辨认。`Gallery.tsx:584` 已用 `(unit(316, 640) - 2 - unit(36)) / 4` 扣除左右边框，不再把第四项挤到下一行。 | **已关闭**。仅修 Gallery 内宽计算，保留 `EpisodeRail` 容器契约。这里是有界选集面板，按既有面板四列装配即可；首轮报告要求必须六列过严，予以更正。TV 第二排在当前首屏下沿继续，可滚动内容被视口裁切不等于组件内容丢失。 |
| 影院封面失败混入普通浅色表面 | `tv/components-tv-content-light-lower-4.png` 与对应深色截图均显示影院表面的失败占位与可读文字；`content.tsx:42`、`:48` 在已有 feature variant 内使用 `cinema-control`／`cinema-muted`。                                                                             | **已关闭**。浅深主题下不再出现亮灰半屏，标题、按钮、渐变和失败文字保持可辨认。                                                                                                                                        |

## 已观察结果

- TV 影院浅深主题：舞台内标题与底部绝对控制层没有重叠；进度、播放、上一集禁用、下一集、时间和倍速均可见。`Gallery.tsx:528` 的有界相对舞台承接 `CinemaControls` 的绝对定位。此处截图证明布局，不证明媒体播放。
- 最新桌面／TV `input-editing.png`：输入值“春山”、搜索图标、清空和提交同时可见；输入区保持单一外边界，焦点外轮廓可辨认，未观察到重复内框。TV 沿用 60 参考单位高度。静态图不证明进入／退出编辑、中文 IME 和提交路径。
- 最新 TV `slider-preview.png`：显示“音量：36”，滑杆与外层焦点轮廓可见；该图只证明预览时的可见状态，不独立证明确认提交、返回回滚和焦点数量。
- 最新桌面／TV `confirm-safe-focus.png`：标题、不可恢复说明、取消与危险动作均可见；危险动作没有主色填充。截图没有明显的取消焦点轮廓，不能仅凭文件名宣称默认安全焦点已独立视觉验证；焦点落点及键盘行为以 Root 的宿主测试为证据。
- 深色表单底部：Checkbox 普通／部分选择／禁用与 Switch 状态有区分，选择项与滑杆的数值可读；没有观察到文本与控件重叠。
- 基础、按钮、导航、弹层入口和反馈样例：所观察截图的文字、语义颜色、边界、对齐和恢复动作可辨认，没有发现新增横向溢出。空状态和失败状态分别保留明确动作。
- 内容图像失败时，剧名、集数与续播动作仍可见。续播与结果行没有观察到遮挡；本轮海报问题属于验收页几何装配，不建议改动生产集合的宽度分配。

## 实看截图清单

首轮下列 16 张曾通过 `view_image` 实际查看，目录统一为 `artifacts/ui-components/macos/`。同名路径现已被最新重拍覆盖；首轮八组抽样结果不冒充对全部最新截图的复核。**不是全部截图、全部状态或两端全部组合通过**。

1. `tv/components-tv-cinema-light.png`
2. `tv/components-tv-forms-light.png`
3. `web/components-desktop-content-dark.png`
4. `tv/components-tv-content-light.png`
5. `tv/components-tv-content-dark-lower-2.png`
6. `tv/components-tv-content-light-lower-3.png`
7. `web/components-desktop-cinema-light.png`
8. `tv/components-tv-cinema-dark.png`
9. `tv/components-tv-foundation-dark.png`
10. `web/components-desktop-controls-light.png`
11. `tv/components-tv-navigation-dark.png`
12. `tv/components-tv-layers-light.png`
13. `tv/components-tv-forms-dark-bottom.png`
14. `web/components-desktop-feedback-dark.png`
15. `tv/components-tv-feedback-light-bottom.png`
16. `tv/components-tv-content-light-lower-4.png`

2026-11-15 定点复核的最新 11 张：

1. `web/components-desktop-content-dark.png`
2. `tv/components-tv-content-light.png`
3. `web/components-desktop-cinema-light.png`
4. `tv/components-tv-cinema-light.png`
5. `tv/components-tv-content-light-lower-4.png`
6. `tv/components-tv-content-dark-lower-4.png`
7. `tv/input-editing.png`
8. `web/input-editing.png`
9. `tv/slider-preview.png`
10. `tv/confirm-safe-focus.png`
11. `web/confirm-safe-focus.png`

最后一次仅对上述第 3／4 张影院浅色图重拍后再次实看，确认四列；没有扩大截图范围。对应深色图虽由 Root 重拍，本次没有再次查看，不将其算作最终四列的独立视觉证据。

## 验证边界

本次独立复审只读取现有截图与源码，没有重新执行行为、check、build 或根验证。Root 最新报告组件 headless 39/39、macOS 宿主 26/26、产品回归 Web 52／desktop 54／TV 55 均通过；这些不是本复审独立重跑结果。最后影院定点复验日志 `artifacts/ui-components/cinema-final.log` 已读取，两端各 1/1 通过。Notice 小窗口修正由 Root 单独回归，默认截图不作为所有布局与交互行为的证明。

截图未展示的聚焦／编辑／弹层打开／长文极值组合，不能由默认态推定通过。Android TV 真机、真实遥控与 IME、读屏、系统大字、减少动态的逐帧效果、真实图片加载、媒体链路与独立安装包均不由本次 macOS 截图审查确认；这些限制不要求重造现有组件。

Questions skipped: 本次为已有任务中的独立最终复审；采用 Root 提供的明确范围，修正与复验由 Root 统一执行。
