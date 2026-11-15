# 游客历史管理

## 当前接线

`packages/app/src/library-state.ts` 拥有挂载应用的已提交 Library 快照、读取状态、唯一写队列和失败播放 checkpoint。`store.ts` 保留既有 library／entries／resume／save／shutdown／prepareUpdate 调用边界；Home、History 和详情续播读取同一快照，页面不再各自发布历史数据。正式入口仍在 apps，边界夹具只在 test，不作为产品页面或验收成功依据。

读取在等待当前写 tail **之前**捕获 revision、owner 与 tail，等待后和响应后复查。新写入在接纳时提升 revision 并取消旧读取，即使 transport 忽略取消，旧 GET 也不能覆盖新提交。读取失败保留最后成功快照，同时保留 error／errored 状态，不把失败显示为空历史；再次读取有独立 loading／refreshing 状态。

仅成功读取的 guest 快照允许派发播放进度；未加载成功、未知或非 guest 所有者会明确失败，派发前再次检查 owner。兼容契约的成功快照可省略 owner_id，不能把“完全没有快照”当作省略字段。失败 checkpoint 保留在应用所有者中，后续显式更新重试仍需经过实际 owner 检查。

播放保存和更新重试共用唯一 tail，每项成功直接发布提交响应，失败不会毒化后续队列。错误记录在任务内部更新，drain 等待的是包括该记账步骤的任务。更新先暂停、收集 checkpoint、排空既有写入，再把失败重试排入同一队列；关键词排空后再次等待直到 tail 稳定，并检查是否仍有保存失败。关闭收集 checkpoint、排空关键词，再以相同规则等待 library。接纳边界是最后一次稳定 tail 检查；返回后新派发的工作属于下一次排空，不承诺跨调用的全局冻结。

## 尚未接入

本轮是 E1 状态基础，尚无管理／选择／移除／清空 UI。删除的序号失效、顺序 job、确认、部分失败和焦点交接继续按 OpenSpec 实施。当前失败 checkpoint 还没有删除 supersession 语义，不得据此接入删除按钮。

HTTP 断连或 native cancel 不等于 SQLite 回滚。现有 spawn_blocking 与 Mutex 只能保证互斥，不能证明原派发终结。E1 任务 1.4 仍需共享 core 的操作身份与去重完成屏障或等效的可验证方案；单次 GET、延时或再次幂等删除均不足以消除未决写入。未解决前不声称游客历史管理已验收。

## 验证范围

`registerLibraryTests` 的延迟合成 transport 只覆盖迟到读取、读取失败保留快照、读取等 tail 时被新 mutation 失效、未知／foreign owner 零派发，以及更新重试／新进度共用写序列。夹具经生产 store 读取同一快照；它不证明真实播放、SQLite、native 或管理 UI 验收。三端薄测试入口均复用同一夹具。

E1 主验收仍须从正式入口搜索真实内容并实际播放形成记录，核对持久数据后完成管理、取消、顺序删除与重启；合成长列表和部分失败只补边界。实际运行、源码身份和限制统一记录在 VALIDATION，完整 MVP 的其他功能继续开放。
