# Spec Delta

## Purpose

定义桌面窗口的标题栏行为：隐藏系统标题栏后，应用自绘的顶带如何与三端原生窗口控件共存、如何保持拖拽与窗口菜单、以及在全屏与影院态下如何收束，同时让 Web 无窗口目标保持等价布局。

## ADDED Requirements

### Requirement: The app owns the title bar row

桌面窗口 SHALL 隐藏系统标题栏并由应用绘制唯一一条标题栏，窗口内容从窗口顶边开始；同一行内 MUST 只出现一套品牌与页面标识，不得再叠加系统窗口标题造成的重复。

#### Scenario: Desktop window shows one bar

- **WHEN** 桌面应用启动并显示主窗口
- **THEN** 窗口顶边直接是应用的标题栏，没有系统标题栏，也没有第二条重复顶栏

#### Scenario: First frame has no flash of system chrome

- **WHEN** 窗口首次出现
- **THEN** 首帧即为应用标题栏，不出现先显示系统标题栏再切换的过程

#### Scenario: Web target keeps the same content

- **WHEN** 同一套界面在 Web 目标打开
- **THEN** 标题栏内容行与桌面一致，但不预留窗口控件安全区，也不参与窗口拖拽

### Requirement: Native window controls are reserved, not redrawn

标题栏 SHALL 保留平台原生窗口控件，并按其实际占用宽度让出内容：macOS 为左上角红绿灯，Windows 为右侧 caption 按钮，Linux 为跟随 `gtk-decoration-layout` 的 GTK 控件（可能在左也可能在右）。应用 MUST NOT 自行绘制、替换或模仿这些控件。

#### Scenario: Controls reported at either edge

- **WHEN** 平台把窗口控件放在左侧或右侧，或用户把 GTK 按钮改到另一边
- **THEN** 标题栏内容让出对应一侧的宽度，控件不与品牌、搜索或账号重叠

#### Scenario: Control widths change at runtime

- **WHEN** 进入或退出全屏、切换窗口状态，或控件占用宽度发生变化
- **THEN** 内容让位随之更新，不需要重载窗口

#### Scenario: Content never sits under a control

- **WHEN** 窗口被缩到最小允许尺寸
- **THEN** 品牌、搜索与账号仍在可用区域内，不被原生控件遮挡

### Requirement: Blank title bar area drags and maximizes

标题栏的空白区域 SHALL 作为窗口拖拽区，并保留系统的双击行为；标题栏内的交互控件 MUST 保持可点击，不因整条可拖拽而失效。

#### Scenario: Dragging moves the window

- **WHEN** 用户按住标题栏空白处拖动
- **THEN** 窗口随指针移动

#### Scenario: Double click does what the system does

- **WHEN** 用户双击标题栏空白处
- **THEN** 窗口按该平台的系统标题栏行为最大化或还原

#### Scenario: Controls inside the bar still work

- **WHEN** 用户点击标题栏内的搜索框、账号或品牌相关动作
- **THEN** 该控件按自身行为响应，不触发窗口拖拽

### Requirement: Title bar height stays shared across platforms

标题栏高度 SHALL 由单一共享值给出，并同时满足：容纳控件、让原生控件垂直居中、且不因平台不同而各自变形。原生控件所在高度 MUST 与该共享高度一致。

#### Scenario: All platforms share one height

- **WHEN** 同一构建在 macOS、Windows、Linux 运行
- **THEN** 三端标题栏高度相同，原生控件在该高度内居中

#### Scenario: System text scaling

- **WHEN** 用户放大了系统字号
- **THEN** 标题栏内容不被裁切，行高与控件按可用空间调整而不是溢出

### Requirement: Fullscreen and cinema collapse the bar

全屏时标题栏 SHALL 收起到不占内容高度；窗口模式下的影院／安静观看态 SHALL 只保留一条透明拖拽带，原生控件仍可操作，其余标题栏内容隐藏。

#### Scenario: Fullscreen removes the bar

- **WHEN** 窗口进入全屏
- **THEN** 标题栏不再占用内容高度，播放画面按全屏可用高度布局

#### Scenario: Cinema keeps a drag strip

- **WHEN** 窗口模式播放且开启影院／安静观看
- **THEN** 品牌、页面名、搜索与账号隐藏，仅剩一条透明可拖拽带，窗口控件仍可点击

#### Scenario: Leaving cinema restores the bar

- **WHEN** 用户退出影院或安静观看
- **THEN** 完整标题栏恢复，内容高度相应收回

### Requirement: Page chrome below the bar begins at its edge

删除原顶栏后，侧栏与内容区 MUST 从标题栏下沿开始排布；侧栏顶部不再重复品牌，垂直 chrome 总高度 MUST 因本变更下降，并同步更新依赖该高度的页面常量。

#### Scenario: Content starts under the bar

- **WHEN** 页面在任意桌面宽度渲染
- **THEN** 侧栏与内容区的起点紧接标题栏下沿，不再出现第二条横带

#### Scenario: Dependents follow the new height

- **WHEN** 播放器等页面使用按 chrome 高度推导的画面高度
- **THEN** 该推导使用新高度，并在 1180×780 与 1440×1000 下保持首屏完整

#### Scenario: TV shell is unchanged

- **WHEN** 同一构建运行在 TV 目标
- **THEN** TV 的顶部导航与外壳几何与变更前一致，不受桌面标题栏影响
