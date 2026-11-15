# Tasks

## 1. 统一 library 发布与写入顺序

- [x] 1.1 在 app 层收敛 library 快照、读取 revision、owner 检查和唯一写 tail，保留 store 的现有读取／保存／续播边界；加入迟到 GET、读取失败保留快照、未知／非 guest owner 拒绝派发的状态回归，并更新对应模块说明；验证定向状态测试通过且 History/Home/resume 读取同一已提交快照。
- [x] 1.2 将 progress、prepareUpdate 的失败 checkpoint 重试与 shutdown drain 纳入同一写序列，避免等待自身 tail 和队列失败后永久拒绝；加入 progress→remove、更新期间新入队工作与失败后继续执行的顺序回归，并记录 drain 的接纳边界；验证无并行 library POST、无自等待且更新仍受真实保存失败阻止。
- [x] 1.3 为失败 progress 保留原 mutation 序号，实现 remove／clear 的范围失效与派发前复查；加入旧 checkpoint 不复活删除、无关剧目不受影响、删除后真实新观看可重新保存的回归，并记录序号规则；验证实际播放才写、完成态和旧会话取消保护继续通过。
- [x] 1.4 处理已派发删除的断连／取消不确定结果，保留 operation 与待确认范围，先证明原派发已终结再通过权威读取或幂等显式重试消除不确定性，不把 Mutex／单次 GET／幂等本身当完成屏障，必要时补操作身份契约并 codegen；加入存储已提交但响应丢失、旧 checkpoint 被阻止、prepareUpdate 不假报成功的回归，并说明取消不等于回滚；验证状态可恢复且不会因关闭呈现自动重放。

## 2. 管理 job 与精确选择

- [x] 2.1 实现 app 生命周期的单条、所选和清空 job，确认时捕获 owner、显示顺序中的去重精确 ID 集及 operation 身份；加入选择变化不扩大确认范围、重复确认只产生一个 job、每次派发复查 owner 的回归，并记录公开状态方法；验证仅使用现有 generated remove／clear 契约且无 DTO 漂移。
- [x] 2.2 实现所选 job 顺序执行、每项成功发布、首次失败停止及显式重试剩余项；加入四项中第三项失败、成功项不回滚、重试不重发成功项的状态回归，并记录 pending／partial／unresolved／complete 的含义；验证中途失败后 Home/History/resume 与持久结果一致。
- [x] 2.3 在 History 页面实现管理显隐、稳定 ID 选择、全选／mixed／全不选与快照变化后的选择修剪，页面 selection 与 app job 分离；加入虚拟回收、离页清选择、离页后 job 完成及返回后显式恢复的回归，并更新页面交互说明；验证无选择时不能删除所选，退出管理恢复原有浏览与滚动上下文。

## 3. 公共控件、确认与虚拟焦点

- [x] 3.1 使用公共 Button、Checkbox 和 ConfirmDialog 接入三类确认及失败反馈，普通观看态不常驻 checkbox，行内操作避免嵌套可点击目标；加入默认取消、提交前 Back 零写、pending 防重、提交后关闭不宣称撤销的交互回归，并更新稳定操作目标／Agent 选择器说明；验证键盘与 TV 输入可完成同一共享流程。
- [x] 3.2 基于当前 accessor 与稳定 ID 维护回收行事件和 ref 所有权，实现取消回源、删除后下一项→上一项→空态的滚动／布局／焦点交接；加入后段删除、最后一项、批量部分成功、clear 空态和回收槽激活身份的回归，并记录恢复顺序；验证焦点外框完整可见且目标身份正确。
- [x] 3.3 将焦点恢复绑定当前 owner、页面生命周期、operation 与 focusGuard，新输入／离页取消旧等待；加入延迟响应、较新焦点意图和隐藏页完成的回归，并更新焦点／减少动态约定；验证后台完成不抢焦、不跳页、不重播整页入场，既有详情来源与续播交互继续通过。

## 4. 跨层集成与验收

- [x] 4.1 使用真实 guest SQLite，经 HTTP 与 native transport 验证 remove／clear、owner 冲突、精确 ID、失败恢复和重启持久性；复用并按缺口补集成回归，检查 recent_searches 保留、未读取 legacy、无账号／云端／目录／媒体副作用；验证 generated 契约与现有 core 语义一致，并将证据关联至前述模块说明。
- [ ] 4.2 以正式入口及真实内容实际播放形成的历史／实际持久化主流程为主验收，另以合成数据补边界；在 Web、macOS 和 Android TV 实际宿主完成长列表、管理选择、取消、部分失败重试、离页 pending、清空与完整焦点边界的集成验收；分开记录夹具、真实存储、原生 transport 和宿主证据，更新 VALIDATION、feature ledger 与实施路线的本切片结果及剩余范围；验证不把 E1 等同完整 MVP、C3.2、物理 TV 或正式发行通过。
- [ ] 4.3 在最终源码上完成对应端 check 和 build、codegen:check、完整 pnpm verify、严格 OpenSpec 校验与独立范围评审；如依赖变化则运行 pnpm security，并将既有阻塞与本次失败分开记录；核对文档与真实证据一致、所有未验证项明确、仅本切片文件进入本地提交且未推送／归档／发布。

## Workflow follow-up

- 2026-11-15 已按持续 MVP 目标启动 apply，先实施共享 library 状态基础；进度以任务勾选和实际证据为准。此目录不纳入此前详情切片提交。
- 实施时统筹共享工作区的宿主与 NSH 执行，串行运行 NSH／宿主验证，保留详情及公共控件并行改动。
- 归档、推送与发行均不属于本 change 的当前执行授权。
