# 文档索引

首次进入任务读 README 和本索引；同一上下文已读且未变时直接定位任务相关章节。下表是文档路由，不要求逐份通读。当前规范描述要求，功能台账描述实现，VALIDATION 描述证据，三者不能互相代替。

## 按任务阅读

| 任务                 | 必要资料                                                                               | 按需补充                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 功能范围／需求       | [PRODUCT](../PRODUCT.md)、[功能台账](feature-ledger.md)相关行                          | [页面地图](design/ui-map.md)、[真实性审查](design/reality-audit.md)、固定上游                                                                                                                                                          |
| 架构／共享状态／跨端 | [ARCHITECTURE](../ARCHITECTURE.md)、相关包／crate README、相关[ADR](architecture/adr/) | ENGINEERING 对应章节、相关 OpenSpec                                                                                                                                                                                                    |
| 开发工具／依赖／CI   | [ENGINEERING](../ENGINEERING.md)相关章节                                               | [开发运行](development.md)、[依赖说明](dependencies/)、目标宿主说明                                                                                                                                                                    |
| UI／基础组件／原型   | [DESIGN](../DESIGN.md)相关章节、[UI 包用法](../packages/ui/README.md)对应 API          | 修改组件读[组件交接](design/component-design.md)对应项；核对覆盖读[实现覆盖](design/component-implementation.md)；规划读[候选准入](design/component-roadmap.md)；修改原型读[原型共源](design/prototype-components.md)；应用 NSH skills |
| 产品页面和交互       | PRODUCT 范围、DESIGN 相关章节、相关台账行                                              | 新页面／重设计读[原型规格](design/prototype-system.md)对应页面；对应功能交接和活跃 OpenSpec；不把原型演示数据当真实能力                                                                                                                |
| 修复／验收           | [当前验收](../VALIDATION.md)对应项、当前代码及相关变更任务                             | 索引指向的历史记录／artifact、相关 fixture README；不通读全部旧轮次                                                                                                                                                                    |
| 安装／TV／发行       | [TV 流程](../TV_DEVELOPMENT.md)或[分发方案](github-delivery-and-updates.md)            | [客户端更新](client-updates.md)、[发行摘要](release-metadata-validation.md)、[Android 宿主](../apps/tv/android/README.md)                                                                                                              |
| 继续开发             | [实施路线](implementation-roadmap.md)、台账相关行、活跃 OpenSpec                       | 当前阻塞与证据；复用未受影响的已完成检查                                                                                                                                                                                               |

## 唯一事实来源

| 内容                       | 维护位置                                                    |
| -------------------------- | ----------------------------------------------------------- |
| 做什么／排除什么           | PRODUCT；设计与实现引用范围，不复制一套产品清单             |
| 依赖、装配和状态所有者     | ARCHITECTURE；实际 API／使用方式归包或 crate README         |
| 工具、协作、安全和验收标准 | ENGINEERING；AGENTS 只留必要硬约束与阅读路由                |
| 视觉、交互和组件状态       | DESIGN；颜色／尺寸的可执行源与 API 按其来源表维护           |
| 当前实现／剩余缺口         | feature-ledger；不追加逐轮进度叙事                          |
| 开发顺序／批次退出条件     | implementation-roadmap；不重复运行结果                      |
| 当前验收／开放失败         | 根 VALIDATION 的矩阵与证据索引；历史运行不直接覆盖新源码    |
| 需求演进                   | OpenSpec 主规范＋活跃变更；任务勾选和格式校验不等于真实验收 |
| 旧方案、审查与逐轮证据     | [history](history/README.md)；只作追溯，不作为当前指令      |

## 功能资料与就近说明

- 发现与播放：[详情](detail-discovery.md)、[日历](calendar-browsing.md)、[系列／季](season-browsing.md)、[榜单雷达](radar-snapshots.md)、[历史管理](guest-history-management.md)。这些资料用于对应模块，不重复维护全局状态。
- 核心实现：[历史存储](../crates/core/src/library/README.md)、[播放](../crates/core/src/playback/README.md)、[媒体](../crates/core/src/media/README.md)。fixture 说明留在 [contracts](../contracts/fixtures/) 旁，包用法留在包内。
- 设计参考：[页面地图](design/ui-map.md)、[原型规格](design/prototype-system.md)、[参考产品](design/ui-reference-products.md)、[更新界面](design/update-ui.md)。历史简报与历次审查从 history 进入。
- OpenSpec：[主规范](../openspec/specs/)、[活跃变更](../openspec/changes/)。当前主规范仍待沉淀；不能因 changes 显示 complete 就自动归档或标成功能已验收。

维护时先更新唯一来源，其他文件链接到具体章节；不新增另一本重复承载规则和进度的“总规范”。旧路径的历史转接页只导航，不继续追加当前规则。历史记录保留来源、时间和限制，不提交凭据、运行配置或大体积 artifact。

读取预算、NSH 指南的适用范围、检查输出与批次交接统一见 [ENGINEERING：上下文与工具输出](../ENGINEERING.md#上下文与工具输出)。
