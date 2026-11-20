# Proposal

## Why

macOS 实际宿主复验发现：末页返回并移除“加载更多”后，原生焦点落空，Shift+Tab→Enter无法继续打开可见结果。Web和TV通过不能替代这个桌面缺口，需在继续匿名发现功能前修复。

## What Changes

- 只在消失的分页操作仍持焦时，把键盘交回现有搜索输入，保留结果位置与键盘进入结果的路径；用户已移到输入、导航或其他结果时保持其焦点。
- 沿用定稿列表、按钮外观、末页移除和分页请求，不新增状态标签或改动上游NSH。
- 增加真实macOS终页回归与移焦不抢回用例，保留Web、TV、取消／重试和详情返回行为。

## Capabilities

### New Capabilities

- `search-continuation-focus`: 搜索追加操作移除时的有条件焦点移交与用户焦点保留。

### Modified Capabilities

无。已归档spec库为空；本修复落实未归档D1原有焦点约定，不改其官网协议。

## Impact

共享 `packages/ui` 的窄用途可移除操作与 `packages/app` 搜索页、现有显式宿主夹具及文档。不改变DTO、数据库、依赖、原型或发行；C3.2、安全和物理设备缺口继续保留。
