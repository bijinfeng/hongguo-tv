# 游客历史管理

## 当前接线

`packages/app/src/library-state.ts` 拥有挂载应用的已提交 Library 快照、读取状态、唯一写队列和失败播放 checkpoint。`store.ts` 保留既有 library／entries／resume／save／shutdown／prepareUpdate 调用边界；Home、History 和详情续播读取同一快照，页面不再各自发布历史数据。正式入口仍在 apps，边界夹具只在 test，不作为产品页面或验收成功依据。

读取在等待当前写 tail **之前**捕获 revision、owner 与 tail，等待后和响应后复查。新写入在接纳时提升 revision 并取消旧读取，即使 transport 忽略取消，旧 GET 也不能覆盖新提交。读取失败保留最后成功快照，同时保留 error／errored 状态，不把失败显示为空历史；再次读取有独立 loading／refreshing 状态。

仅成功读取的 guest 快照允许派发播放进度；未加载成功、未知或非 guest 所有者会明确失败，派发前再次检查 owner。兼容契约的成功快照可省略 owner_id，不能把“完全没有快照”当作省略字段。失败 checkpoint 保留在应用所有者中，后续显式更新重试仍需经过实际 owner 检查。

播放保存和更新重试共用唯一 tail，每项成功直接发布提交响应，失败不会毒化后续队列。错误记录在任务内部更新，drain 等待的是包括该记账步骤的任务。更新先暂停、收集 checkpoint、排空既有写入，再把失败重试排入同一队列；关键词排空后再次等待直到 tail 稳定，并检查是否仍有保存失败。更新返回前以稳定 tail 检查确定此次接纳边界，返回后新增工作属于下一次排空。

正常关闭通过同步 `beginShutdown(checkpoint)` 取得排空许可，收集最后 checkpoint 后立即封闭新工作接纳，依次排空关键词和已接纳的 library 工作，再释放许可。共享 App 无论是否提供宿主关闭回调，都调用 `store.shutdown()`；原生宿主另外等待其 Promise 后释放核心。直接卸载而未取得许可的旧 controller 不允许懒建 session 或派发排队写入；同一引擎 VM 的新 controller 使旧 token 失效，writer 在 session 请求前和 await 返回后均复查 token／许可。已在 Rust 注册的操作仍独立完成，不因 JS 卸载宣称撤销。这只保证当前单主引擎路径，不承诺多个仍活跃 VM 或跨进程的全局写入顺序；系统强杀不保证执行 JS 清理。

## 确认范围与删除顺序

`store.historyManagement` 公开 `operation()`、`remove(ids)`、`clear()` 和 `retry(operationId)`。确认时按当前显示顺序捕获去重精确 ID 与 guest owner；在途／未完成 job 阻止重复创建，不因页面选择变化扩大范围。所选删除在同一 tail 中顺序执行，每项成功立即发布；首次失败停止，已完成项不回滚，显式重试只处理剩余项。清空只影响观看历史，关键词另行保存。

progress 在接纳时取得单调序号，失败后保留原序号。成功 remove 只废除同 owner／series 的较旧 checkpoint，clear 废除该 owner 的全部较旧 checkpoint。重试派发前再次核对当前失败项与范围边界；真正的新观看可正常建立记录。业务删除重试取得新的序号边界；若只确认原派发成功，则保留原派发边界，避免误伤之后的新进度。

operation 的 `pending` 表示当前排队或执行，`partial` 表示已取得确定失败终态且仍有剩余项，`unresolved` 表示原操作结果尚未确认，`complete` 才表示全部完成。关闭确认呈现不撤销已确认 job。未决范围阻止旧 checkpoint 穿越，更新仍受未决写入或保存失败阻止；job 内不得等待自己的 drain。

## History 页面交互与稳定目标

正式共享页面为 `packages/app/src/pages/History.tsx`。普通模式保留封面、进度和“查看详情”；只有进入“管理”后才显示单条复选框、单条“移除”、全选、删除所选和清空本机记录。“管理”要求已有 guest 快照且存在记录；未知／非 guest owner 的按钮禁用。未完成 job 禁用新的选择和删除，仍可“完成”管理。全选和计数使用完整可用记录集合，精确字符串 ID 的选择不依赖已挂载的虚拟行，已移除记录从选择中剔除。完成管理、离开 History 或 owner 改变会清除页面选择；已经确认的 job 继续由应用所有者执行，返回页面可见相同 owner 的剩余工作。

三类删除均使用共享 `ConfirmDialog`，说明本机记录与已保存观看位置的删除范围，初始焦点为“取消”。未提交时取消／Back 不写入；提交后不乐观关闭，确认按钮处于 pending，安全动作改为“关闭”，仅关闭呈现。`partial` 显示已完成与剩余数量，动作是“重试剩余（n）”；`unresolved` 的动作是“确认删除结果”，先确认原派发终态，不能把这次点击解释为必然重新删除。只有 `complete` 才关闭仍属于本次操作的确认呈现，已关闭或离页的旧 job 不夺回焦点。

源码焦点顺序为：未提交取消回到仍存在的来源；已提交的 pending 关闭回到可用管理入口，partial／unresolved 关闭回到显式重试；来源消失时回到管理入口或空态行动。成功删除后，取确认时首个目标在列表中的位置，优先聚焦该位置的下一存活记录，越过尾部时聚焦前一条，无记录时聚焦“去找剧”。页面级显式重试按剩余记录当前首位置捕获邻项，完成后同样移交焦点；清空到空态时同时退出管理。虚拟行先按精确 ID 找到当前位置并滚到中心，等待 ref／layout，再 `reveal(center)` 后聚焦详情按钮；同一身份保留候选 ref 集合，回收过渡的旧槽只移除自身 ref；真实测量排除隐藏槽和焦点外圈被裁切的候选，测量后再次核对当前意图。恢复同时检查页面是否活动、owner、页面 epoch 和 `focusGuard`；更新输入、离页、owner 改变或卸载会使旧恢复失效。进入 background 会递增独立焦点 epoch、清除等待／来源并取消帧；异步测量和 job 完成使用捕获版本，回 active 不复活旧计划。inactive 可见窗口不被禁用。普通详情返回使用页面活动许可，guest 删除另用更严格的管理许可。

以下 `testID` 是自动化稳定目标；`{seriesId}` 始终使用原始字符串，不转换为 Number。`history-{seriesId}` 保持“查看详情”动作的既有边界，复选框和移除是独立控件。

| 目标                               | testID                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| 页面与虚拟列表                     | `history-page`、`history-list`                                                 |
| 管理／完成、全选                   | `history-manage`、`history-select-all`                                         |
| 查看详情、选择、单条移除           | `history-{seriesId}`、`history-select-{seriesId}`、`history-remove-{seriesId}` |
| 删除所选、清空本机记录             | `history-delete-selected`、`history-clear`                                     |
| 确认弹窗、安全动作、确认／重试动作 | `history-confirm`、`history-confirm-cancel`、`history-confirm-confirm`         |
| 操作反馈、显式恢复                 | `history-operation`、`history-operation-retry`                                 |
| 空态去找剧                         | `history-empty-discover`                                                       |

`HistoryManagementStatePreview.test.tsx` 三端薄入口共用生产 History 与显式合成端口。当前共享合成交互回归补至 14 项，覆盖精确 ID、安全取消、mixed／全选／全不选、快照修剪、虚拟回收、部分完成、未知结果确认、pending 防重／关闭和离页、owner 禁用、尾行删除／清空回焦、页面级重试、较新焦点意图及后台完成／回前台不抢焦；最终各端执行结果见 VALIDATION。这只补充受控边界，不是正式入口真实内容、实际播放、SQLite 持久化、重启或真实宿主的 E1 验收证据；其余端的执行结果也不能由 Web 合成通过推定。

## 原派发完成边界

生产 progress／remove／clear 均由 `createLibraryWriter` 发送：先按需创建 `POST /api/v1/library/session`，再通过 `POST /api/v1/library/operation?session_id=…&operation_id=…` 提交原 generated `HistoryChange`。新增 session／operation DTO 已生成；Library 与 HistoryChange 的载荷保持原样。序号以连续十进制字符串传输，精确匹配身份的回执才证明原派发终结。

HTTP 断连或 native cancel 不等于 SQLite 回滚。Rust 在同步注册和启动后独立完成事务；相同身份和载荷只等待／返回原终态，不重新执行，旧序号和冲突载荷拒绝。显式确认使用原身份；若得到原失败回执，先转 partial，再由新的业务重试取得新身份。失败回执丢失、普通 HTTP 错误或单次 GET 都不被当作完成证明，不自动新建 session 绕过未决操作。

同进程对同一规范 SQLite 路径共享在途注册表；新 session 先封闭旧 session，再等待已注册操作终结。重开后的公开快照等待其读取时已注册的 tail，事务内部同步快照不等待自身。这不承诺跨进程或旧直接写接口的全局顺序；旧 API 仅保留兼容，正式共享应用的全部历史写入使用新协议。

## 验证范围

`registerLibraryTests` 的延迟合成 transport 覆盖读取所有权、统一写顺序、删除范围／clear 失效、部分成功、丢失的成功／失败回执、更新阻止及新观看进度；三端薄测试入口复用同一夹具。这些测试不证明实际视频播放或管理 UI 验收。Rust／HTTP／native 专项使用真实 SQLite，内容仍为受控输入，持久化证据与正式入口的真实内容流程分开记录。

显式运行 `node tooling/src/live-history-host.mjs macos --anonymous-live`，从正式 Web 入口搜索当前真实内容、实际播放形成记录，再取消／单删、真实重播、播放第二部、保留两条时重启 Rust API 和应用、选择删除首条保留第二条、清空并再次重启。只读持久结果由 Node 在各宿主阶段之间读取；产品网络保持 live，不注入响应或直接写入历史。2026-11-15 新增浅深各 9 段真实主链通过，驱动 Enter 打开正确保留剧目，独立功能与新增 12 张真实截图复核见 VALIDATION；后续真实重跑失败另行保留。

这只覆盖 macOS 可见宿主中的正式 Web／HTTP 主链。两条真实记录跨 API 重启／应用重开保留、精确选择删除与邻项身份已验证；完整虚拟焦点、浏览器 Web、Desktop native 与 TV 主流程继续待验。浏览器尝试因精确来源配置缺失而失败；最终 macOS 重跑浅色通过，深色准备播放日志出现真实上游数据错误并超时，未记为通过。合成长列表和部分失败只补边界，不据此关闭 E1；完整 MVP 的其他功能继续开放。

浏览器补验使用 `node tooling/src/live-history-host.mjs web --anonymous-live`，当前限 macOS 上安装的 Chromium。启动器在导航前获取 NSH 的实际随机来源，Rust API 仅允许这个精确 Origin；每段验证该来源 200／其他来源 403，再由正式 App 使用真实 HTTP／媒体。API 为每段来源在同一端口／独立数据目录重启，和明确的持久化重启分开记录。预检最多读取前八条真实搜索结果的详情，记录失败及无开放集的条目；它不能代替正式 UI 独立加载与实际观看。Chrome 由 execve 保持 NSH 所属 PID，Web 验收进程组在超时／退出时清理，配置恢复。

2026-11-15 Chromium 补验浅色 9 段真实主链通过，深色前三段通过，重播详情连接超时后整体失败；没有用合成替换或把部分通过写成全通过。浅色邻项详情只验证身份，截图仍显示加载失败。独立功能与实际 12 张截图复核、来源、SQLite 和失败记录见 VALIDATION；浏览器完整浅深、原生 Desktop／TV、完整焦点与真实后台仍待验。

2026-11-15 后续终轮已完成 Chromium 浅深各 9 段真实主链，证据 `artifacts/live-history/2026-11-15T07-55-30-330Z/`。保留项详情现在等到真实选集加载完成才记录成功，两主题均有 102 集、可用续播按钮及 24 格选集；两条真实记录的持久化、选择删除、清空与重启结果均核对。18 段无合成响应／直接历史写入／手动时钟，独立复核 14 张关键图；此前间歇失败未被抹去或归因。清理工具逐阶段收集错误、保留失败句柄和原阶段错误，错误会进入最终 cleanupErrors；三项真实子进程故障回归仅证明这部分工程边界。完整键盘焦点、虚拟长列表、真实后台、Desktop native／TV 及 E1 其他缺口仍开放，当前 7／13。
