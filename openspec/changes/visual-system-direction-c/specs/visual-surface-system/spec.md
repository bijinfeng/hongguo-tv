# Spec Delta

## Purpose

定义产品视觉系统的可执行契约：表面阶梯如何保证内容可辨、浮层如何获得深度、文字与图标如何同重、间距如何落在档位；使浅色与深色主题在真实宿主中都成立，而不是只有 token 数值不同。

## ADDED Requirements

### Requirement: Surfaces form a visible ladder

系统 SHALL 按 `background → card → muted → popover` 排列表面，相邻两级必须可辨；`card` MUST 与 `background` 不同，`popover` MUST NOT 比它所覆盖的 `muted` 更暗。

#### Scenario: Light theme keeps cards visible

- **WHEN** 浅色主题下内容卡或 hero 位于页面背景之上
- **THEN** 卡片表面与页面背景肉眼可辨，不依赖边框或阴影才看得出边界

#### Scenario: Dark theme keeps the same order

- **WHEN** 深色主题下页面、卡片、悬停区与浮层同时出现
- **THEN** 四者从暗到亮保持同一顺序，没有哪一级与相邻级同色

#### Scenario: Border is not the layering mechanism

- **WHEN** 两个内容区需要区分层级
- **THEN** 用表面差与留白区分；`border` 只出现在装饰性分隔（表格行、分组线）上

### Requirement: Floating layers get depth, plain surfaces do not

菜单、建议层、Popover、Dialog、Sheet 与 Tooltip SHALL 使用共享的浮层投影；普通内容表面 MUST NOT 加投影。

#### Scenario: Overlays share one shadow

- **WHEN** 任意浮层出现
- **THEN** 它使用与其他浮层相同的两层投影，不各写一套

#### Scenario: Content surfaces stay flat

- **WHEN** 页面渲染普通卡片、hero 或列表行
- **THEN** 它们不带投影，层级只由表面与留白表达

### Requirement: Icons and text share optical weight

图标 SHALL 保留官方 24 网格与路径，描边取值使 20 档的渲染线宽与相邻 14–16 号中文正文的竖笔同重；MUST NOT 为个别页面改路径或线宽。

#### Scenario: Icon rows read as labels

- **WHEN** 图标与其文字标签并排出现在导航或按钮中
- **THEN** 图标不显得比标签更重，整行读作一条带图标的标签而不是图标列表

#### Scenario: Decorative icons stay silent

- **WHEN** 图标仅作装饰或与相邻文字重复语义
- **THEN** 它不产生重复的可访问名称；纯图标动作仍保留明确名称

### Requirement: Type roles stay on the scale

文字 SHALL 只使用共享角色（display／page／section／title／content-title／body／meta／caption／numeric），低于 `meta` 的辅助文字 MUST 使用 `caption`，不得就地写 12 或 13 号。

#### Scenario: Large display text is not tracked out

- **WHEN** 显示大字号剧名或精选标题
- **THEN** 它使用收紧的字距与紧凑行高，不出现正向字距把字撑散

#### Scenario: Auxiliary labels use the caption role

- **WHEN** 角标、密集表格或辅助标注需要小于 `meta` 的字号
- **THEN** 它引用 `caption` 角色，字号与行高来自 token

### Requirement: Spacing comes from the scale

内容边距与区域间距 SHALL 取自共享间距档位；MUST NOT 用视口宽度分数或页面自有魔法值替代档位，使不同页面落在同一节奏上。

#### Scenario: Top bar and pages share one gutter

- **WHEN** 同一窗口宽度下比较顶栏内容与下方页面内容
- **THEN** 两者的左右边界对齐，不出现几像素的错位

#### Scenario: Window width crosses a step

- **WHEN** 窗口宽度增大并跨过档位边界
- **THEN** 边距按档位跳变一次，而不是连续微调成非档位值

### Requirement: Both themes and both surfaces are checked

本契约 SHALL 在浅色与深色两种主题下都成立，并在桌面与 TV 两个主题源中保持同义；TV 的数值可以不同，但表面阶梯、浮层与描边规则 MUST 一致。

#### Scenario: Token regeneration stays consistent

- **WHEN** 修改 `DESIGN.md` 中的颜色、排版或间距
- **THEN** 生成的 token 文件与设计源一致，漂移检查通过

#### Scenario: TV keeps desktop semantics

- **WHEN** TV 目标渲染同一组件
- **THEN** 表面阶梯与浮层深度规则与桌面相同，仅尺寸档位按 TV 主题取值
