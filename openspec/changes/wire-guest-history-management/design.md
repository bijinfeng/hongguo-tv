# Design

## Context

动机与范围见 proposal.md。当前 `packages/app/src/pages/History.tsx` 已有真实虚拟列表、详情来源和滚动锚点；`store.ts` 直接拥有 library resource、progress Promise 队列、`failedProgress`、shutdown 和 prepareUpdate。读取和写入的发布尚未围绕管理动作统一，页面没有管理入口。

`crates/core/src/library/{mod.rs,store.rs,README.md}` 已定义 generated `Library/HistoryChange`：只支持 guest，`remove(kind=history, series_id)` 与 `clear(kind=history)` 幂等，事务 commit 后返回完整快照。HTTP/native 已接相同逻辑，数据库版本为 2；取消 future 不能撤销已经开始的 SQLite 阻塞事务。现有 core/HTTP 测试已覆盖删除、清空、owner 冲突、失败和重启，不重建存储。

固定行为依据为 `upstream/hongguo/core/cmd/hongguotv/library.go` 的分类删除、`ui/app.js::changeLibrary/renderLibrary/confirmClearLibrary` 的写序列和焦点，以及当前 `design/prototype/app.js::historyPage` 的管理选择与确认。原型的统计、账号状态和模拟成功不进入生产。`migrate-guest-history` 与 `implement-approved-browsing-ui/continue-watching` 保持原有语义。

## Goals / Non-Goals

**Goals:** 在既有共享页面和契约上完成管理；删除、旧 checkpoint、迟到 GET 与新观看具有可解释顺序；保留精确身份、失败结果与三端输入／焦点。生产、夹具和 Agent 使用同一小组公开状态方法与稳定 ID。

**Non-Goals:** 新批量 API、数据库迁移、持久删除 tombstone、跨客户端全局事务、账号／云同步、收藏等其他记录成员、统计推算、另一个 UI 系统或宿主业务副本。它们的首期范围不因 E1 完成而关闭。无需为本切片开放登录、媒体或上游请求。

## Decisions

### 1. 单一 library 所有者，保留现有调用边界

将读取快照、读取状态／重试、progress 写入、管理 job、失败 checkpoint 和 drain 收敛到 app 的小型 library controller，或 store 内同等清晰的局部实现。History 只拥有管理显隐、当前选择、确认显示和视觉锚点；长期在途 job 归 app 生命周期，不归回收 cell 或弹窗。

保留现有 `store.library` 的读取／错误／重试用途和 `store.save/resume/entries/shutdown/prepareUpdate` 对外行为；必要适配放在 store，不让每个页面另行发送 library 请求。相比给历史页另建 resource／队列，此方案使首页续播、详情进度和管理发布同一份已提交快照；不建立泛型资源引擎。

### 2. 复用单条／清空契约，所选删除采用顺序 job

请求仍为既有 `POST /api/v1/library`：

```json
{"action":"remove","owner_id":"","kind":"history","series_id":"123"}
{"action":"clear","owner_id":"","kind":"history"}
```

确认时捕获 owner、当前显示顺序中的去重精确 ID 集、来源及一次 operation 身份；selected job 在同一写序列中逐项 remove，每项成功立即发布其快照。首次失败即停止，不发送后项；保存已完成数、失败原因及剩余 ID，显式重试只继续剩余部分。选择后来变化不会扩大已确认范围。完整成功才关闭成功状态；管理操作不会生成 progress。

不加伪原子 batch endpoint，也不把循环中前面已提交的结果回滚。由现有幂等单条请求处理重试；没有 DTO 变化时只检查契约无漂移。

### 3. 读取发布和所有写路径使用同一顺序规则

progress、整个所选 job、clear 和失败 checkpoint 重试共用写 tail，失败由各 job 转为明确结果，不能使后续队列永久拒绝。prepareUpdate 的重试也必须入队，不能在 `await writes` 后另开并行 POST；避免 job 内等待自身 tail。shutdown／更新先触发现有 checkpoint，再排空已接纳工作，更新继续保留保存失败阻止安装的语义。

每次接纳 mutation 即提升读取 revision／取消旧读取；读取请求在等待之前捕获当时的写 tail、owner 与 revision，等待后及响应后均复查，只有仍匹配且没有更新 mutation 时发布。成功 mutation 直接发布响应快照；旧 GET、失败刷新或取消回调不能覆盖它。owner 不能从未加载或失败状态猜为 guest；确认前及真正派发前均验证 guest 所有权，非空 owner 明确拒绝，不自动重放到其他 owner。

### 4. 删除只使旧 checkpoint 失效，不禁止新观看

使用 app 内单调 mutation 序号，为失败 checkpoint 记下原 progress 的序号，并为删除范围记录 supersession 边界。单条／所选成功后清理同 owner、同 series 且不晚于该删除的失败 progress；clear 处理该 owner 的全部旧 progress。重试发送前再次检查记录是否仍是当前失败项且未被更新删除 supersede，防止已排队重试在删除后复活记录。

真正新观看产生的 progress 拥有更晚序号，继续按正常队列保存；不在 Rust 建永久黑名单，不用 title／行索引判断身份。保留现有 progressSession 的“实际播放才记录”、完成态和旧会话取消保护。删除无关剧目不清除其他失败 checkpoint；删除失败不伪装为成功，也不静默丢弃仍需处理的状态。

若 POST 的结果因取消／断连不确定，保留其删除范围和 operation 作为待确认边界，先阻止旧 checkpoint 重试穿越该范围；只有证明原派发操作已经终结，才可通过权威读取或相同幂等删除重试确认结果。当前 SQLite spawn_blocking 与 Mutex 仅保证串行而非请求 FIFO：断连后单次 GET，或另一次 remove／clear 完成，都不能天然证明旧阻塞事务已经结束；不能因快照暂时存在／不存在就释放未决范围或放行同范围新 progress。实现任务 1.4 必须先找到可验证的原操作完成边界，必要时补有操作身份的去重／完成查询并同步 generated 契约；在此之前保留 unresolved、阻止冲突写入及 prepareUpdate 假成功。不能因 abort 宣称 rollback。这个边界是本地在途状态，不改变持久存储协议。

### 5. 选择／确认属于页面，确认后的工作属于 app

复用公共 Checkbox（含 mixed）、Button、ConfirmDialog 和现有行组合。普通观看态不常驻复选框；管理行避免嵌套可点击目标，单条移除与行选择／浏览有明确操作目标。全选指当前完整已加载快照，按 stable series ID 计算 mixed；条目删除后修剪选择，不只处理屏内 cell。退出管理或离页清选择，进入详情仍沿用原有浏览来源。

单条、所选、清空均先确认，默认焦点为取消，描述只说明本机观看位置受影响；没有未实现的收藏／统计数字。pending 阻止重复提交。提交前取消零写入；提交后关闭呈现或 Back 不撤销 job，使用准确的关闭／处理中反馈。已确认的 captured job 继续到完成或首次失败；离页不再恢复页面焦点。剩余 job 信息与页面选择分别保存，重新进入后可查看结果并显式恢复失败工作，不能靠页面重新挂载自动重放。

### 6. 焦点跟随身份与当前意图

管理前记录来源身份、原索引和滚动锚点。取消确认恢复存活来源；删除后仅当当前页面、owner、operation 和 store focusGuard 仍匹配，才依次选择原索引处的下一存活行、前一行或现有空态“去找剧”。批量部分成功使用已提交后的真实列表。回收 cell 的事件和 refs 始终读取当前 accessor，ref 清理校验自身所有权。

先将目标行滚入真实 viewport，等待 ref／布局并揭示完整焦点边界后再 focus；离页、卸载或新输入撤销等待。若焦点已由用户移开，不因后台提交重新滚动。已有 Home/Detail 来源和续播继续共享同一数据，不复制 TV 页面。采用现有动态与减少动态规则，不为每次快照发布重播整页入场。

## Risks / Trade-offs

- [所选删除并非原子操作] → 成功逐项保留，首次失败停止并精确显示剩余项；测试必须制造中间失败，不用整批 mock 成功替代。
- [删除确认响应丢失、future 取消不等于回滚] → 维持待确认范围并读取／幂等重试，阻止更旧 checkpoint 穿越；不承诺撤销。
- [已有 resource 的迟到发布或更新重试绕队列] → controller 控制发布 revision 与唯一写 tail，测试覆盖初次加载、刷新、prepareUpdate 和离页的真实顺序。
- [清空误伤之后新观看或其他记录] → 比较 progress 原序号与删除边界；仅 history/guest，保留 recent_searches；未来账号／收藏迁移另处理其成员关系。
- [虚拟行删除造成错卡或焦点被抢] → 稳定 ID、动态 accessor、布局驱动恢复及新意图围栏；真实宿主检查后段、最后一项、全空与完整外框。
- [夹具成功被写作原生独立业务／完整 MVP] → 分开记录合成数据、实际 SQLite 重启、原生 transport 与宿主交互证据，保留 C3.2、物理 TV、安全和账号等开放项。

## Migration Plan

先完成 library 顺序／失效状态，再接管理页面，随后用现有 Rust 核心和严格 HTTP/native 回归确认契约边界，最后跑共享状态与三端实际宿主。无需数据迁移、导入 legacy 或增加依赖；回退 UI 仍能读取同一数据库，但已确认删除没有“恢复旧记录”的承诺。

开发与验收仅在主项目目录，保留详情切片及基础组件并行改动。批次完成后运行对应 check 和 build、codegen:check、完整 verify、严格 OpenSpec；安全既有阻塞单列，依赖变化才补本批 security。更新台账／路线／VALIDATION 并做范围内本地提交，不推送、归档或发布。

## Acceptance and readiness review · 2026-11-15

按最新用户约束，主验收必须使用正式入口、真实内容实际播放产生的历史及真实 SQLite／重启结果；合成条目仅用于长列表、部分失败和竞态等边界回归，不能单独关闭 E1。独立源码审查已确认读取令牌需在等待 tail 前捕获、owner 不猜测、失败 checkpoint 保留原序号、所有写路径共用序列。原操作完成边界以新增 session／operation 身份及精确终态回执实现，按任务 1.4 同步生成契约；Library／HistoryChange 载荷不变。GET 或幂等本身仍不是客户端完成证明，实际实施与验证进度以 tasks 和 VALIDATION 为准，整体 MVP 不缩减。
