# Proposal

## Why

定稿找剧页包含最近搜索，但当前共享页面没有可恢复的关键词入口，重新打开应用也无法复用以前提交的搜索。D2 接通本机最近搜索，降低重复输入成本，尤其是 TV 遥控场景。

## What Changes

- Rust 保存最近10条规范化关键词，重复提交移到最前；支持读取与显式清空。只保存提交的关键词，不保存编辑草稿、不发送到官网、不读取旧客户端数据。
- HTTP/native 使用同一生成契约和提交后快照；失败明确可重试，清空不影响观看历史。
- 共享找剧页按定稿显示最近搜索按钮与清空操作；点击关键词进入真实搜索，保留已有分页、详情返回和焦点行为。
- 空白输入页展示最近搜索；已提交结果页保留现有布局，提供清除搜索以返回发现状态。无假热搜或推荐占位。

## Capabilities

### New Capabilities

- `recent-searches`: 本机关键词去重、有限持久化、明确清空与跨端复用。

### Modified Capabilities

无；已归档 specs 库为空，不修改其他切片的 requirements。

## Impact

涉及 Rust SQLite、HTTP/native 路由、OpenAPI/generated types、共享 store/Search/UI 和显式宿主验收夹具。沿用固定上游 search_history.go 的本机/最多10条/100 UTF-16长度语义；实际官网搜索仍遵守现有80字符限制，UI不放宽该边界。无依赖、账号、Go或发行变更。Mac、辅助技术、物理电视和安全门禁继续单列，完整MVP仍按原路线实施。
