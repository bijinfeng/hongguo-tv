# Design

## Context

见 proposal。当前 `AccountService` 已拥有活动账号、owner／epoch、私有会话与同步生命周期；`account/passport/cloud.rs` 已有固定 endpoint、签名、有界响应、账号凭据校验和安全错误。`packages/app/src/store.ts` 的账号状态、导航／焦点意图与 Detail／Account 可直接扩展，但还没有 follow 状态或页面。

本批固定来源是 `upstream.lock.json` 的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。本地 `follow.go`、`notifications.go`、`lists.go`、`library.go`、`ui/app.js`、`ui/index.html` 的 blob 匹配锁文件。`docs/reference-product-inventory.md` 引用的较新版本不替代本批 wire；不运行或修改 vendored Go。

## Goals / Non-Goals

**Goals:** 用一个有界完整成员表支撑列表和详情按钮；用显式目标状态及读取对账处理远端不确定性；共享正式 UI 与 transport 契约。

**Non-Goals:** 不扩展 library 数据库、favorite outbox 或同步 worker 的定时任务；不持久化离线追更、不创建通知快照，不预建通用订阅／任务框架。预约、提醒、关注频道和批量操作留给独立变更。

## Decisions

### 1. 固定 wire 与内容身份

| 操作       | 精确行为                                                                                                                                   | 固定源码                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 列表       | GET `/reading/user/subscribe/list/v1/`；`tab_type=14,count=20,cursor`                                                                      | `follow.go:13–55`                           |
| 列表形状   | `mix_data` 优先，兼容 `follow_update_list/subscribe_items`；cursor／next_cursor 及 follow_list_info／comment_list_info 的真实 continuation | `follow.go:27–45`                           |
| 卡片       | 可有 video_data；合并 common、expand、expand.extra、expand.update_info；外层 video_id 可为 series ID                                       | `follow.go:58–109`                          |
| 添加／取消 | POST `/reading/user/subscribe/delete/v`，JSON `{series_id,book_id:series_id,book_type:2,op_type:1或2}`；身份均为字符串                     | `follow.go:112–126`、`follow_test.go:53–76` |
| 登录／切号 | GET／POST 均校验当前账号及 generation                                                                                                      | `main.go:342–393`                           |
| 完结约束   | 实际 series_status 0＝ongoing、1＝ended；已完结不能新增，已追更仍可取消                                                                    | `ui/app.js:3613–3624,3740–3755`             |

在 `account/passport/follow.rs` 放解析及完整拉取；为现有 cloud 固定 endpoint 枚举增加 FollowList／SetFollow，最小调整 crate-private 可见性供兄弟模块复用。不开放任意 URL／method／签名参数，不复制签名或刷新凭据实现。复用现有摘要／封面归一化帮助函数，仅调整必要可见性。

`FollowItem` 明确拥有 `series_id`、可选紧凑 `drama`，以及真实可选的 `series_status`、`latest_watched_episode`、`has_watched_latest_episode`、`show_update_frequency`、`follow_update_time`。摘要不含 episodes／vid_list。有效成员缺少卡片或属于不支持的内容时保留其 series 身份，显示“内容暂不可用”，不提供虚假播放；有效 ID 不因过滤卡片而从成员表消失。无法确定成员身份的 row 或无效 envelope 导致整次读取失败。重复 series 按首次有效条目保留，不能按列表位置／预约 ID 生成身份。

如详情原始响应含明确 series_status，为共享 Drama／解析器添加这一可选归一化字段；缺失保持未知。仅凭集数、已看进度或文案猜测完结会制造禁用，故不采用。服务端继续校验精确 ID／scope，远端业务拒绝为最终失败；UI 不以 caller 提供的“未完结”保证远端可写。

### 2. 完整拉取后发布，不公开第二套分页状态机

正式 GET 返回完整快照；`List` 虚拟化呈现，不把上游游标暴露成新的业务分页控制器。这样详情可可靠查询成员关系，也不会把“还没翻到”显示为未追更。读取按需发生：追更页进入／刷新、详情首次需要状态、变更对账；store 创建和账号恢复不暗中触发跟踪写入或定时请求。

初始 cursor 为空；每个继续页必须有非空、未访问且推进的 cursor，按上游原值传递。只有明确 terminal 的有效 envelope 才结束；`has_more=true` 且游标空／停滞／成环或没有新成员时返回 `ACCOUNT_FOLLOW_INCOMPLETE`。不要照搬旧 `follow.go:52–54` 把停滞改成 has_more=false 的宽松做法。

采用明确工程上限：每页沿用现有云响应大小上限及最多128条 raw rows，整轮最多100页／2000个唯一成员、完整响应 JSON 序列化聚合最多8MiB（含重复行及未知字段）、总截止60秒；单次沿用现有25秒 transport timeout。达到上限仍需继续时失败，不截断成成功。上限是保护预算，不冒充上游产品限制。合成测试注入小预算，不延时一分钟取证。

Rust 只返回完成快照；TSX 可保留同 scope 的旧快照并显示 stale／失败，不能把它当刷新已成功。刷新失败与初始空表严格分开，首次未就绪时详情按钮禁用并提供读取重试。

### 3. AccountService 承接 scope 与在线变更

在现有 account 模块中增加窄的 `follow.rs` 协调逻辑，复用私有会话和 owner／epoch 校验。一个 service 内用单一 follow 顺序闸门串行读取、变更和后续对账；不持账号主锁做网络。锁内捕获已验证 scope／会话，锁外请求，每次 dispatch、下一页、凭据保存及结果发布前重验 scope；沿用账号切换／退出／shutdown 的取消通知。跟踪能力不依赖 sync worker 正在运行，也不唤醒历史同步。

每 scope 最多一个变更，目标是 `enabled=true|false`，不接受 toggle。变更已受理后，其有限网络任务由 service 拥有；调用方失联不能使另一个 GET 越过仍在运行的旧变更。闸门释放后才开始完整读取对账。切号／shutdown 取消旧 scope 的后续步骤并排空本地接纳任务；对端已收到的请求可能生效，取消不是远端回滚。

成功云 ACK 后立即完整重读：观察到目标状态才 confirmed；ACK 后读失败或观察暂不一致，返回 acknowledged 但 unconfirmed，保持恢复入口。明确业务拒绝保留拒绝类别，不能由稍后读取转换为“原操作成功”。网络错误／取消／失响应进入 unknown，先等待同 scope 已接纳工作再只读恢复；不自动重发 POST。重读只能证明观察到的成员状态，不能证明恰好一次执行或永久回滚。仍不一致时显示“结果待确认”，用户可刷新；再次写入必须新的显式选择，仍以绝对目标发送。

不为此建立 durable operation registry：本批没有本机持久事务或离线队列。重启后重新读取远端，而不是重放未知意图。旧 epoch 的响应、快照和恢复 callback 均丢弃；A→B→A 重新读取。未来如果需要离线队列，必须独立规格。

### 4. HTTP／native 同 DTO

| 契约                    | 字段／用途                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `FollowQuery`           | `owner_id,owner_epoch`，仅当前账号前置条件，不能选择任意账号                                                                           |
| `FollowSnapshot`        | `owner_id,owner_epoch,items:FollowItem[]`，只代表完整有效快照                                                                          |
| `FollowMutationRequest` | `owner_id,owner_epoch,series_id,enabled`                                                                                               |
| `FollowMutationResult`  | `owner_id,owner_epoch,series_id,enabled,acknowledged:true,confirmed:boolean,snapshot?:FollowSnapshot,reconciliation_error?:安全错误码` |

GET／POST `/api/v1/follow` 分别调用同一 AccountService 读取／变更用例。正常确认带完整 snapshot；云 ACK 后对账失败使用 unconfirmed 结果及安全错误码；明确拒绝、未知网络结果、scope 失效使用现有 error envelope。不能返回 acknowledged=false 的伪成功。snapshot 若存在必须完整，confirmed 只在它含目标成员状态且 scope 一致时为真。

HTTP OpenAPI 由 Rust DTO 导出，执行 codegen／codegen:check；native 路径分派引用同一 DTO，不自行解析为另一套类型。扩展现有 CoreClient 路径与边界校验，拒绝畸形／错 scope 快照。错误不得包含响应体、凭据、cookie、签名 URL；继续现有来源策略和固定 host／禁止 redirect 防线。

### 5. 共享状态与正式 UI

`packages/app/src/follow-state.ts` 是一个窄控制器：完整快照、loading／stale／error、单个 pending／unknown 目标；复用 captureRequest、AbortSignal、owner／epoch、revision、active／focus intent。读取失败不清空旧列表；旧 read 不能覆盖更新的变更快照；切号清空数据并取消恢复。不要复制 library writer，也不 import testing 出口。

为现有 browse 增加 `following` section，桌面现有导航增加“追更”，TV 使用现有导航／账号入口进入同一页面，不为它新建一套顶栏；账号页增加“追更”入口。仅这一个已实现列表，不展示预约／提醒占位标签、未读点或虚构计数。

`pages/Following.tsx` 使用现有 UiText、Button、Notice／Empty、PosterCard／Cover、CardControls 和 List。标题“追更”，局部“刷新”；每行以真实剧名／状态作阅读内容，主动作打开现有详情，独立可达“取消追更”。详情继续使用既有播放入口，不从追更 progress 生成本机续播。无 playable 摘要的成员保留读取／取消能力。没有数据时不填热度、更新计划或“已追平”。

Detail 中播放仍为主操作，收藏与“追更／已追更”并列为辅助动作，共享相同 confirmed 状态；pending 保持标签宽度并阻止重复提交。未登录激活后进入现有账号页，登录后返回由用户再次确认写入，不自动重放。已明确完结但未追更时不提供新增，已追更仍能取消。失败／unknown 在动作附近用现有 Notice 和明确“刷新状态”恢复，不堆持续成功 toast。

滚动锚点使用 series ID＋offset；行虚拟回收不持有成员状态。打开详情保存来源；返回到存活项，移除焦点行后揭示相邻项，再按仍有效的 focus intent 恢复。新输入／导航／background／owner epoch 失效都取消旧恢复。桌面 Tab／方向键／Enter／Space，TV DPAD／确认／返回走同一语义，差异仅由现有 ui 输入适配处理。

本节为实施前动效清单，实施时按项目要求同步相关 DESIGN 的受影响条目，不新造 token：

| 变化                                         | 工具／token                                 | 减少动态／焦点                 |
| -------------------------------------------- | ------------------------------------------- | ------------------------------ |
| 导航、刷新、追更／取消 hover／press／pending | 现有 Button fast 反馈                       | 关闭缩放，保留独立焦点         |
| 导航选中、追更标签／图标变化                 | 现有导航选中及 Button selected／Lucide bell | 即时切换，不位移邻项           |
| 首次内容到达                                 | ContentArrival 180ms／8pt                   | 无位移；刷新和回收不重播       |
| 取消后列表改变                               | 确认后提交列表，现有邻项 reveal／focus      | 无额外布局动画，按意图保护恢复 |
| loading／error／unknown                      | 共享 pending／Notice；原区域保留内容        | 无装饰循环，不抢焦点           |
| 页面进入／返回                               | 既有 NavStack／页面过渡                     | 复用 reduced-motion，无新弹层  |
| 手势、声音、连续播放效果                     | 本页无                                      | 不新增                         |

### 6. 真实验收与授权

先用已登录正式入口只读确认现有追更数据、详情身份与分页；保留正常应用私有目录和登录，不复制凭据到测试目录、不自动退出。授权证据应明确账号、具体 series、添加／取消及最终恢复目标。旧收藏写入授权、扫码登录或“继续实施”不自动等于本批追更云写授权；已有明确且适用的授权不重复索取。实施／离线回归／只读核对继续推进，未获写授权只保留真实写往返为待验。

正式流程为：账号→追更→真实条目详情→返回；授权剧目添加→完整列表观察→重开恢复→取消→列表观察，记录原成员状态并仅执行获准的恢复。Web／Desktop native／Android TV 分别记录实际入口／包、源码、数据源、平台、时间、失败和限制；至少实际宿主浅深主题、键盘／DPAD、长列表、返回／移除焦点、大字／减少动态按端补证。物理 TV、读屏及无第二端的跨设备观察保持未验，不由模拟器或 fixture 代证。

## Risks / Trade-offs

- 完整读取比单页慢 → 有界、按需及复用当前 scope 快照；超限明确失败，不伪造完整。
- 上游写后列表可能暂时不一致 → acknowledged／confirmed 分开，先读后显式重试，不自动循环云写。
- 原生调用方中断与对端提交无法原子撤销 → service 顺序闸门及有限任务排空防本地竞态；对端未知结果保留事实，不承诺 exactly-once。
- 增加 completion 可选字段可能影响摘要契约 → 保持 optional、只依据实际字段解析，生成 DTO 并跑既有目录／详情回归。
- 新功能与并行播放／原型改动共存 → 只改本批所属文件，集成者最后串行完整 verify，保留其他工作树修改。

## Migration Plan

先落地固定协议／scope 用例及合成边界，再统一 HTTP/native／生成契约，再共享状态和正式入口；独立审查后执行对应 check＋build 和工程验证，最后补授权真实流程。没有数据库迁移、旧数据读取或后台任务升级；回滚本批源码／路由／生成契约即可，不清理用户账号或片库。
