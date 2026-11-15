# 历史与决策索引

这里保留旧方案、阶段状态和完整运行记录，供追溯使用，不作为当前实施指令。现行入口见[文档索引](../README.md)，当前验收见[VALIDATION](../../VALIDATION.md)。重要且仍有效的架构取舍见[ADR](../architecture/adr/)，不把每日运行日志写成ADR。

## 2026-11-15 文档收敛快照

来源提交eee26ae；每份快照包含原路径、原文SHA256及非当前指令标记，除迁移相对链接及Markdown排版外保留原文。旧失败和局部成功保持各自源码／平台／数据边界，后来的通过不会抹掉先前失败。

| 来源           | 完整历史                                                |
| -------------- | ------------------------------------------------------- |
| ARCHITECTURE   | [收敛前正文](2026-11-15/ARCHITECTURE.md)                |
| README         | [收敛前正文](2026-11-15/README.md)                      |
| VALIDATION     | [收敛前正文](2026-11-15/VALIDATION.md)                  |
| TV开发流程     | [收敛前正文](2026-11-15/TV_DEVELOPMENT.md)              |
| GitHub分发方案 | [收敛前正文](2026-11-15/github-delivery-and-updates.md) |
| feature-ledger | [收敛前正文](2026-11-15/feature-ledger.md)              |

[早期实施路线](implementation-roadmap-2026-11-15.md)保留第一次路线整理前的全部增量；当前路线只在[implementation-roadmap](../implementation-roadmap.md)维护。

## 设计与组件历史

旧docs/design路径保留简短转接与原章节导航，避免已有引用失效；现行交接、API与覆盖分别从[组件设计](../design/component-design.md)、[UI包](../../packages/ui/README.md)、[覆盖矩阵](../design/component-implementation.md)进入。旧简报里已取消的产品内容不重新成为需求。

| 历史材料                        | 原文                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- |
| 桌面、TV 与组件板综合评估及打磨 | [历史记录](2026-11-15/design/prototype-comprehensive-review.md)               |
| 原生核心收尾审查                | [历史记录](2026-11-16/native-core-review.md)                                  |
| 基础组件覆盖与状态完整度审查    | [历史记录](2026-11-15/design/component-completeness-state-audit.md)           |
| 基础组件覆盖审查                | [历史记录](2026-11-15/design/component-coverage-audit.md)                     |
| 基础组件设计交接                | [历史记录](2026-11-15/design/component-design.md)                             |
| 基础组件实施与验收              | [历史记录](2026-11-15/design/component-implementation.md)                     |
| 基础组件原生视觉独立复审        | [历史记录](2026-11-15/design/component-native-review.md)                      |
| 基础组件设计评审                | [历史记录](2026-11-15/design/component-review.md)                             |
| 高频组件预先设计与演进          | [历史记录](2026-11-15/design/component-roadmap.md)                            |
| 基础组件规范还原修复与补审      | [历史记录](2026-11-15/design/component-spec-conformance-fixes.md)             |
| 无障碍、组件状态与文案专项审查  | [历史记录](2026-11-15/design/design-system-accessibility-state-copy-audit.md) |
| 设计规范历史快照 · 2026-11-15   | [历史记录](2026-11-15/design/design-system-history-2026-11-15.md)             |
| desktop-polish-review           | [历史记录](2026-11-15/design/desktop-polish-review.md)                        |
| 桌面独立复审修复记录            | [历史记录](2026-11-15/design/desktop-review-fixes.md)                         |
| NSH 基础组件与视觉方案          | [历史记录](2026-11-15/design/nsh-components-plan.md)                          |
| 第二轮 UI 设计                  | [历史记录](2026-11-15/design/redesign-brief.md)                               |
| redesign-review                 | [历史记录](2026-11-15/design/redesign-review.md)                              |
| Android TV 独立设计简报         | [历史记录](2026-11-15/design/tv-design-brief.md)                              |
| TV 原型复审修复记录             | [历史记录](2026-11-15/design/tv-review-fixes.md)                              |

## OpenSpec与运行产物

OpenSpec变更按自身同步／校验／归档流程管理，不把完整变更再次复制到此目录；主规范与活跃变更从文档索引进入。本轮没有更改tasks、同步主规范或归档变更。

新完整验收记录按批次放在本目录并由根VALIDATION链接；大体积日志／截图继续放忽略的artifact，凭据和运行配置不入库。历史不可用或来源不明时明确标为待补，不据旧文字宣称当前验收通过。
