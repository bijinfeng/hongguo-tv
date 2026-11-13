# Proposal

## Why

Web／桌面与 TV 的浏览器原型已由用户确定，但生产 NSH 仍是顶部导航和五个验证页面。下一步需要将既定视觉与输入模型落到真实搜索、详情和游客历史上，建立可持续扩展的双端界面基础。

## What Changes

- 将 `docs/design/prototype-system.md`、`ui-map.md` 及两端复审修复约定作为实现依据；保留视觉方向，完成 NSH 语义 token、控件状态和动效映射。
- Web／桌面使用侧栏与搜索工作区；TV 使用独立顶部导航、内容区、搜索输入和焦点路径。共享业务、契约与记录规则，各端入口保持薄层。
- 迁移找剧／搜索、详情／分段选集、继续观看，并以真实历史组成首页续播区域；推荐等未迁移数据不使用原型样例填充。
- 保留已有播放器和账号流程、错误恢复与旧链路回归。本批不扩展其协议或承诺真实 Rust 播放；完整播放器设计随下一批播放协议落地。
- 增加双端导航、返回恢复、长列表／选集、输入法和能力不可用状态的行为与宿主验收。

本批为首期完整功能计划的第一批交付，未接入栏目不得标记为可用。后续范围与依赖见 `docs/implementation-roadmap.md`。

## Capabilities

### New Capabilities

- `adaptive-navigation`: 按产品端型组织导航，保留来源、滚动和焦点；未迁移能力如实呈现。
- `catalog-browsing`: 双端搜索、详情和分段选集的可操作界面，保留输入、异步隔离与锁定集规则。
- `continue-watching`: 首页与历史页使用同一真实游客历史，准确呈现续播并恢复对应剧集。

### Modified Capabilities

无。主 specs 尚为空；现有 `migrate-rust-catalog`、`migrate-guest-history` 已完成变更保持独立，不重复修改其协议要求。

## Impact

- 主要涉及 `packages/ui`、`packages/app`、`packages/app/test` 和三端薄入口；legacy 脚本复用 `apps/web`，不再保留根级 demo 入口。
- `packages/core-client` 保持现有 HTTP 协议；仅在实际装配需要时增加最小端型参数，不预建原生传输框架。
- 复用 NSH 与现有工具，不引入 React、Vite、DOM 或 npm UI。Rust DTO／数据库无预期变化；若实施发现必须改变契约，应先修订范围并执行生成与漂移检查。
- 生产设计规范按实现批次更新，原型与验证记录保留各自边界。UI 验收需真实 Web／桌面宿主及 Android TV 模拟器；物理电视硬解与正式发行另行验收。
