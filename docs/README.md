# 文档索引

首次进入任务读 README 和本索引；同一上下文已读且未变时直接定位任务相关章节。下表是文档路由，不要求逐份通读。当前规范描述要求，功能台账描述实现，VALIDATION 描述证据，三者不能互相代替。

## 按任务阅读

| 任务                 | 必要资料                                                                                                                                  | 按需补充                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 功能范围／需求       | [PRODUCT](./PRODUCT.md)、[功能台账](./feature-ledger.md)相关行                                                                            | [页面地图](./design/ui-map.md)、固定上游                                                                                                                                                       |
| 架构／共享状态／跨端 | [ARCHITECTURE](./ARCHITECTURE.md)、相关包／crate README、相关[ADR](./architecture/adr)                                                    | ENGINEERING 对应章节、相关 OpenSpec                                                                                                                                                            |
| 开发工具／依赖／CI   | [ENGINEERING](./ENGINEERING.md)相关章节                                                                                                   | [开发运行](./development.md)、[依赖说明](./dependencies)、目标宿主说明                                                                                                                         |
| UI／基础组件／原型   | [DESIGN](../DESIGN.md)相关章节（含 YAML token、[改界面的做法](../DESIGN.md#改界面的做法)）、[UI 包用法](../packages/ui/README.md)对应 API | 修改组件读[组件交接](./design/component-design.md)对应项；核对覆盖读[实现覆盖](./design/component-implementation.md)；规划读[候选准入](./design/component-roadmap.md)；应用 NSH skills         |
| 产品页面和交互       | PRODUCT 范围、DESIGN 相关章节、相关台账行                                                                                                 | 新页面／重设计读[页面地图](./design/ui-map.md)对应页面与[TV 设计说明](./design/tv-redesign.md)；对应功能交接和活跃 OpenSpec；不把演示数据当真实能力                                            |
| 修复／验收           | [当前验收](./VALIDATION.md)「状态总览」定位范围，再读「未验与阻塞」对应小节；当前代码及相关变更任务                                       | 证据索引指向的历史记录／artifact、相关 fixture README；不通读全部旧轮次                                                                                                                        |
| 安装／TV／发行       | [Android 宿主](../apps/tv/android/README.md)或[分发方案](./github-delivery-and-updates.md)                                                | [客户端更新](./client-updates.md)、[发行摘要](./release-metadata-validation.md)、[Android 宿主](../apps/tv/android/README.md)、[2026-11-20 首发记录](./history/2026-11-20/gate-and-release.md) |
| 继续开发             | [实施路线](./implementation-roadmap.md)、[台账](./feature-ledger.md)状态总览、活跃 OpenSpec                                               | 台账「当前缺口」对应小节；当前阻塞与证据；复用未受影响的已完成检查                                                                                                                             |

## 唯一事实来源

| 内容                       | 维护位置                                                        |
| -------------------------- | --------------------------------------------------------------- |
| 做什么／排除什么           | PRODUCT；设计与实现引用范围，不复制一套产品清单                 |
| 依赖、装配和状态所有者     | ARCHITECTURE；实际 API／使用方式归包或 crate README             |
| 工具、协作、安全和验收标准 | ENGINEERING；AGENTS 只留必要硬约束与阅读路由                    |
| 视觉、交互和组件状态       | DESIGN；颜色／尺寸的可执行源与 API 按其来源表维护               |
| 当前实现／剩余缺口         | feature-ledger；不追加逐轮进度叙事                              |
| 开发顺序／批次退出条件     | implementation-roadmap；不重复运行结果                          |
| 当前验收／开放失败         | `docs/VALIDATION.md` 的矩阵与证据索引；历史运行不直接覆盖新源码 |
| 需求演进                   | OpenSpec 主规范＋活跃变更；任务勾选和格式校验不等于真实验收     |
| 旧方案、审查与逐轮证据     | [history](./history/README.md)；只作追溯，不作为当前指令        |

## 功能资料与就近说明

- 功能契约：[详情](./features/detail-discovery.md)、[日历](./features/calendar-browsing.md)、[系列／季](./features/season-browsing.md)、[排行榜](./features/rankings-browsing.md)、[榜单雷达](./features/radar-snapshots.md)、[历史管理](./features/guest-history-management.md)、[追更](./features/following.md)、[观看记录与收藏](./features/library-favorites.md)、[预约](./features/reservations.md)。每个页面一份，承接该页的接线、数据边界、动效清单与验证边界，不重复维护全局状态。
- 核心实现：[历史存储](../crates/core/src/library/README.md)、[播放](../crates/core/src/playback/README.md)、[媒体](../crates/core/src/media/README.md)、[Mobile-v5 取源](./playback-v5.md)。fixture 说明留在 [contracts](../contracts/fixtures) 旁，包用法留在包内。
- 设计参考：[页面地图](./design/ui-map.md)、[参考产品](./design/ui-reference-products.md)。历史简报、早期调研与原型规格从 [history](./history/README.md) 进入。
- 依赖核查：[原生发行依赖](./dependencies/native-release-security.md)、[目录 HTTP/TLS](./dependencies/catalog-tls.md)、[游客 SQLite](./dependencies/guest-sqlite.md)。记录固定版本的原因与许可证边界，不复制 `deny.toml` 规则。
- TV 重设计：[设计说明](./design/tv-redesign.md)、[竞品研究依据](./design/tv-reference-research.md)、[组件化技术方案](../openspec/changes/compose-tv-v4-from-shared-components/design.md)、[分批任务](../openspec/changes/compose-tv-v4-from-shared-components/tasks.md)。设计值、外部证据和实施决策各有唯一来源；当前组件与页面已接线，验收和阻塞统一见 [VALIDATION](./VALIDATION.md#tv-v4-组件化重设计)。
- OpenSpec：[主规范](../openspec/specs)、[活跃变更](../openspec/changes)。2026-11-20 已把 21 个任务全完的变更归档并沉淀 20 项主规范；归档和任务勾选只表示该变更交付范围结束，不等于功能通过真实验收，状态仍以台账和 VALIDATION 为准。

维护时先更新唯一来源，其他文件链接到具体章节；不新增另一本重复承载规则和进度的“总规范”。历史记录保留来源、时间和限制，不提交凭据、运行配置或大体积 artifact。

写文档时守住四条：

1. **一个事实一个家。** 需要别人引用时给 `路径#锚点`，不复制一段再各自维护。
2. **结论与过程分开。** 当前状态只写结论和证据入口；逐轮读数、排查过程和失败原文进 [history](./history/README.md)，由 VALIDATION 链接过去。
3. **不建转发页。** 文件搬走后直接改引用，不在原路径留一个只做导航的短页——同名两处会产生两套叙事。
4. **默认删除。** 只是复述别处、只剩一行导航、或实现后不再指导阅读的，删；Git 保留历史。

读取预算、NSH 指南的适用范围、检查输出与批次交接统一见 [ENGINEERING：上下文与工具输出](./ENGINEERING.md#上下文与工具输出)。
