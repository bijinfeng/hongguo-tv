# Tasks

本批预估 12–20 个实施时段，授权真实验收另计，不作为完成日期承诺。先冻结 1.1 的 Rust 契约；存储与协议可按下列路径分配，coordinator／宿主／完整门禁由集成者串行使用。现有账号批次的真实验收独立保留。

## 1. 契约与原地迁移（契约／存储负责人）

- [x] 1.1 在 core/library、account 定义单一 LibraryChange、FavoriteEntry、sync/import 状态和命令；保留 entries 历史语义及必要类型别名。以 Rust DTO 序列化／未知字段／owner 测试验证字段与错误码，再冻结给其他实施者；不维护手写 TS 镜像。
- [x] 1.2 在 library/store.rs 实现 v1/v2 guest、v3 account→v4 的一致性备份、Immediate 迁移和 owner 校验；保留历史／搜索／账号身份，新增 design 的独立表和首次对账候选。用填充 v2/v3、错误 owner、坏 JSON、未知版本、迁移中失败、重开及超过2000条历史验证无重建／丢失；更新 library/README。

## 2. 收藏、outbox 与导入（存储负责人；依赖 1）

- [x] 2.1 在 library/favorites.rs 接入游客／账号收藏与现有注册操作；history、favorites 分离，明确取消与本机 clear。以重启、两类独立删除、写盘失败、lost receipt／替换回执测试验证，不破坏既有 history operation 用例。
- [x] 2.2 在 library/sync.rs 实现原子 outbox、2000上限、同 kind＋series 替换、精确 sequence ACK、hidden 与完整快照 merge；逐批处理首次对账候选。测试旧 ACK、新写期间拉取、严格时间冲突、空／坏快照、部分上传后重启、本机隐藏不复活及满队列替换；同步更新 library/README 的事务约定。
- [x] 2.3 在 library/guest_import.rs 实现候选数量、原时间导入、独立 watermark、部分 imported/remaining；不改游客库、不导入收藏。测试新旧／相等时间、非法 VID、删除后重启、新游客播放、超过2000条、保存失败和并发 checkpoint；记录内部 API 及剩余项重试约定。

## 3. 固定云协议（协议负责人；依赖 1，可与 2 并行）

- [x] 3.1 在 account/passport/cloud.rs 增加固定 full-signature JSON／GET 传输和有限错误分类；按 design 引用保留 SDK／Cookie／token、精确数字和 code=0＋nested error 判定。用 loopback 检查签名覆盖实际 JSON、头／ID 类型、凭据缺失、超时、正文上限及重定向拒绝，不访问真实账号。
- [x] 3.2 实现完整历史／收藏／进度拉取与每批20的卡片补取。迁移固定上游去敏 wire fixture，测试超过5页、200页上限、重复／空分页、500 fallback、季号、元数据缺失／错身份、收藏完整性；返回类型仅在完整校验后可用于合并。
- [x] 3.3 实现历史＋进度双写和收藏添加0／取消1；测试秒／毫秒、数字／字符串 ID、固定布尔字段、第一写失败／第二写失败、nested reject 与重试，不把任一失败当 ACK。方法文档说明局部成功和凭据保密边界。

## 4. 账号同步协调（集成负责人；依赖 2、3）

- [x] 4.1 在 account/sync.rs 接入先 pull／merge 再 upload／ACK 的单轮流程、scope 内凭据保存及成功时间；使用测试专用 loopback 注入贯通真实 coordinator＋协议＋SQLite。验证旧 owner／epoch、A→B→A、logout during pull/upload、双写失败、ACK存储失败，不以协议层 fixture 代替服务集成。
- [x] 4.2 接入单 worker、2秒合并／90秒周期／3分钟整轮截止、显式 sync、宿主 shutdown 和 owner 切换取消；确认不持协调锁做网络，重复唤醒不重入，无迟到状态／凭据发布。以可控时钟／阻塞响应和关闭回归验证；更新 account/README 的生命周期。
- [x] 4.3 将 import 命令及 sync/import 状态接入现有 account＋library 返回和权威 state 对账；导入前排空已接纳 checkpoint。测试过期 scope、重传、丢失响应、部分导入与退出恢复游客，不给网络取消虚构回滚。

## 5. HTTP/native 与共享状态（适配负责人；依赖 4）

- [x] 5.1 HTTP、native bridge、Web／Desktop／TV 宿主装配同一服务与 worker 生命周期，保留 origin／private data／注销边界；运行 account/library adapter parity 与取消／重复销毁用例，执行 pnpm codegen 并提交可再生 OpenAPI／generated.ts，pnpm codegen:check 无漂移。
- [x] 5.2 core-client、library-writer、library-state/store 复用同一注册写队列处理 favorite，捕获 owner epoch，同步刷新不被旧 read／receipt 覆盖；测试 lost receipt、切季 exact series、A→B→A、后台及更新／关机排空，保持现有 checkpoint／历史管理回归通过；更新相应包 API 说明。

## 6. 正式 UI 与动效（共享 UI 负责人；依赖 5）

- [x] 6.1 账号页接同步／失败重试、可导入数量和安全确认／部分结果，历史与收藏入口明确当前 owner；按 design 动效清单用现有共享控件，测试无自动合并、拒绝重复提交、离页后结果对账和焦点回源；维护就近动效说明，不新增技术标签墙。
- [x] 6.2 在正式详情接当前 series 收藏；沿用 history 路由建立片库“观看记录／收藏”共享 Tabs 和虚拟列表、单项取消／本机清空确认。验证只收藏不生成历史、离线待同步、封面失败、未确认回执、切季、返回锚点及邻项焦点；复用历史管理，不复制 desktop／TV 业务实现。
- [ ] 6.3 三端分别 check 和 build，运行相关共享状态／NSH 用例；在真实 Web、Desktop native、Android TV 宿主观察浅深、窄窗／大字、键盘／DPAD、减少动态、长列表与弹窗层级，逐项检查 design 动效清单并保存实际证据。未观察的平台／物理TV保留未验，修复不得放宽身份与断言。

## 7. 授权真实数据与批次收尾（集成／验收负责人；依赖 6）

- [ ] 7.1 真实云写前取得用户对账号、目标剧集、收藏／取消、进度上传和导入的明确授权，包含 worker 启动即可能上传的历史候选／outbox；保存去敏授权范围和数据计划。缺授权仅阻塞对应真实步骤，继续离线工作；既有扫码授权不能代替云写授权。
- [ ] 7.2 从正式入口用真实观看记录验收拉取、收藏重启、授权双写、取消、本机清空后拉取、显式导入／再导入、失败恢复及退出恢复游客；对照远端读取确认写入结果，保留原始失败。跨设备冲突／平台限制分别记录，不用合成数据计为真实通过；由文档所有者更新单一验收记录和缺口。
- [ ] 7.3 独立审查存储／凭据／功能与实际 UI 证据，冻结本批源码后由一人运行完整 pnpm verify；依赖若有变化再跑 pnpm security。整理真实流程、边界回归、工程门禁各自结果及未验项；核对不相关改动未纳入，不擅自提交／推送／发布。

## Workflow follow-up

- 已实施并记录实际通过范围；剩余真实操作与平台验收继续按上述未勾任务推进。实施与真实证据满足后再处理主规范同步／归档，不自动关闭本批或其他活跃变更。
