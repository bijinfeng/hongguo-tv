# 历史与决策索引

这里保留旧方案、阶段状态和完整运行记录，供追溯使用，不作为当前实施指令。现行入口见[文档索引](../README.md)，当前验收见[VALIDATION](../../VALIDATION.md)。重要且仍有效的架构取舍见[ADR](../architecture/adr/)，不把每日运行日志写成ADR。

历史正文里的链接指向当时存在的文件；其中一部分此后被删除或迁移，因此可能出现空链接。这不是遗漏，也不值得逐份回填——要判断某条规则是否仍然成立，读现行文档，不要顺着历史链接找。2026-11-26 删除浏览器设计稿后，历史中所有 `design/prototype/` 与 `visual-redesign-real/` 路径都属此类。

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

2026-11-27 删除了 `docs/design/` 下 14 个只做转发的短页（原文早已在本目录，转发页只重复导航）。原路径不再存在，引用一律直指本目录的原文。现行交接、API 与覆盖分别从[组件设计](../design/component-design.md)、[UI包](../../packages/ui/README.md)、[覆盖矩阵](../design/component-implementation.md)进入。旧简报里已取消的产品内容不重新成为需求。

| 历史材料                        | 原文                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- |
| 浏览器稿规格（稿已删除）        | [历史记录](2026-11-26/design/prototype-system.md)                             |
| 原型组件共源约束                | [历史记录](2026-11-26/design/prototype-components.md)                         |
| 可点击原型简报                  | [历史记录](2026-11-26/design/prototype-brief.md)                              |
| 设计真实性审查（2026-11-14）    | [历史记录](2026-11-26/design/reality-audit.md)                                |
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

OpenSpec变更按自身同步／校验／归档流程管理，不把完整变更再次复制到此目录；主规范与活跃变更从文档索引进入。2026-11-20 已把 21 个任务全完的变更归档并沉淀 20 份主规范，位置为 `openspec/changes/archive/2026-11-20-*` 与 `openspec/specs/`。

## 2026-11-20 批次

| 来源                           | 完整历史                                         |
| ------------------------------ | ------------------------------------------------ |
| 工程门禁、首次发布与账号页构图 | [门禁与发布记录](2026-11-20/gate-and-release.md) |

## 2026-11-27 验收详情归档

从 `VALIDATION.md` 移出的逐轮运行与排查细节，结论仍留在 VALIDATION。

| 来源               | 完整历史                                                |
| ------------------ | ------------------------------------------------------- |
| TV v4 组件化重设计 | [验收详情归档](2026-11-27/tv-v4-acceptance-detail.md)   |
| Linux 平台限制排查 | [平台限制排查归档](2026-11-27/linux-platform-limits.md) |

## 冻结与维护规则

本目录自 2026-11-27 起冻结：只增不改，不再作为规则来源。新增历史一律通过 OpenSpec 归档（`openspec archive`）或在此新建日期目录，不改写既有正文。

历史目录不新增"现行"文档，也不保留与现行文档同名的转发页——那会产生同一个名字下的两套叙事。当前规则、状态与验收分别只在 [DESIGN](../../DESIGN.md)、[台账](../feature-ledger.md) 与 [VALIDATION](../../VALIDATION.md) 维护。

新完整验收记录按批次放在本目录并由根VALIDATION链接；大体积日志／截图继续放忽略的artifact，凭据和运行配置不入库。历史不可用或来源不明时明确标为待补，不据旧文字宣称当前验收通过。
