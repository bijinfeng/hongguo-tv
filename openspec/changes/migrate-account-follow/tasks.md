# Tasks

## 1. Fixed cloud protocol

- [x] 1.1 在现有 Passport 固定云传输中加入追更列表／显式添加取消 endpoint，新增窄 follow parser；用固定 wire fixture 核对 tab_type14、count20、cursor、JSON 字段／类型及 op_type1／2，定向 Rust 测试通过，文档记录 de971 来源且不运行 Go。
- [x] 1.2 实现有界完整拉取与精确身份归一化；测试 nested common／expand、兼容列表键、去重、有效身份缺卡片保留、畸形身份、重复／循环／空游标、重复页、后页失败、预算与取消，确认只产生完整快照且不泄露原 payload。
- [x] 1.3 增加真实可选完结／更新字段，必要时扩展现有 Drama／详情解析的 series_status；测试0／1／未知、缺失字段及已有目录／详情兼容，不以集数或本机进度推算；更新所属模块 README 的字段和边界说明。

## 2. Account-scoped use cases

- [x] 2.1 在 AccountService 增加追更读取／变更及单一 follow 顺序闸门，复用会话、scope 校验和取消；合成测试证明游客零云请求、错 scope 派发前拒绝、A→B→A／logout／shutdown 丢弃旧结果，网络不持账号主锁且不依赖 sync worker。
- [x] 2.2 实现 ACK 后完整对账、unconfirmed／unknown 恢复和 caller 丢失后的任务排空；测试读取不能越过已接纳变更、失响应先GET不重POST、明确拒绝不被重读转成功、读失败／不一致保留未知、显式绝对目标重试；确认不写 history／favorite outbox／离线队列。
- [x] 2.3 补同 scope 并发 read／mutation、旧凭据刷新发布、切号／关闭竞态与超时回归；Account README 写明结果和取消语义，定向 account 测试通过，确认现有账号恢复和历史同步无回归。

## 3. Shared transport contract

- [x] 3.1 为 GET／POST `/api/v1/follow` 接入相同 Rust DTO／用例及 native 分派；HTTP／native parity 测试覆盖正常列表、确认／未确认结果、来源限制、错 scope、畸形输入、取消和安全错误，确认无凭据或任意 endpoint 暴露。
- [x] 3.2 执行 pnpm codegen 与 pnpm codegen:check，提交对应 OpenAPI／generated.ts；core-client 增加必要 wire 校验与导出，测试错 owner／epoch、部分／畸形快照和非法 mutation result 被拒绝，更新所属 API 文档。

## 4. Formal application flow

- [x] 4.1 增加共享 follow-state 并接入 store 的账号／生命周期；状态测试覆盖首次／刷新／空／stale、单个pending／unknown、失响应只读恢复、旧 read 不覆盖新结果、切号清空、离页／background／dispose取消，正式代码不依赖 testing 出口。
- [x] 4.2 接入正式追更 section／账号入口与 Following 页面，复用 ui 的列表／卡片／操作／反馈；宿主回归覆盖真实页面装配、长列表虚拟回收、不可播成员、详情返回锚点、焦点行取消邻项恢复与较新输入取消恢复，保留原历史／收藏导航行为。
- [x] 4.3 详情接入同一份“追更／已追更”和局部恢复入口；测试游客进入现有登录且不自动重放、精确浏览series、不误用播放VID、已完结禁新增但可取消、未就绪禁写及拒绝／未知诚实显示；播放和收藏原回归通过。
- [x] 4.4 在受影响 DESIGN 条目登记本 design 的动效清单及组件用法，页面文档说明账号归属／在线结果／恢复；三端同时 check＋build、定向 NSH 测试通过，正式入口无预约／提醒假标签或虚构计数。

## 5. Integration and real acceptance

- [x] 5.1 对固定协议／scope与失响应，以及正式 UI／焦点分别做交叉审查；集成者串行运行 pnpm verify，保留初轮失败与最终源码身份，依赖未变则不扩展工具链，依赖变化按规范另跑 security。
- [ ] 5.2 从已登录正式入口读取实际追更列表并打开真实条目详情／返回；按端记录源码、入口／包、数据源、时间、分页／空／失败事实、封面和限制，不复制凭据、不自动退出，缺真实数据保持待验。
- [ ] 5.3 核对现有授权是否明确覆盖账号、具体series与追更加／取消；只有适用授权存在才在正式入口执行添加→完整列表观察→同库重开→取消→再观察及获准恢复，保留失败，不用合成结果代证；没有授权仍继续只读／工程工作并保留本项待验。
- [ ] 5.4 在真实宿主按Web／Desktop native／Android TV分别检查浅深、键盘／DPAD、长列表／返回／删除焦点、大字／减少动态及清单中的动效；更新当前验收所有者的受影响条目，分别记录未覆盖的物理TV／读屏／跨设备／平台流程，不宣称完整MVP或正式发行通过。

2026-11-16：3.1 已完成。test-support 仅由 HTTP/native 的开发测试依赖启用，loopback 认证 fixture 不进入默认 release；新增共用 AccountService 的 HTTP/native 正向 parity，覆盖空列表、ACK 未确认和后续读回。追更页面同步修正内容标题层级与 TV 行密度；5.2–5.4 真实账号／宿主验收保持未完成。
