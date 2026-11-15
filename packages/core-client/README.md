# Core client

共享 HTTP/native 传输与生成契约的入口。公开 DTO 只从 `@hongguo/contracts` 导出；Rust 是模型来源。

`createLibraryWriter(request, canDispatch?)` 为 history 和 favorites 共用一个惰性注册会话；`LibraryChange` 的 `favorite` 必须携带精确 series 的紧凑 `drama` 和明确 `value`，不能发送 toggle。`libraryDrama()` 从详情提取同一紧凑摘要，移除选集等载荷。

每次写入捕获不可变请求和十进制 operation ID。丢失／坏回执保留原操作，只有显式 `resolve()` 重放同一身份和载荷；GET 快照不证明写入终止。明确 failed 回执后才可用新 ID 重试；`reset()` 拒绝未确认和进行中的操作。调用者提供的派发检查在会话创建前后执行，防止迟到会话跨应用生命周期或账号 epoch 派发。

`validLibrarySnapshot()` 校验可发布的紧凑历史、必需收藏数组及正安全整数毫秒收藏时间；同一校验用于 registered receipt 和共享状态读取，拒绝完整选集载荷。与 Rust 远端历史契约一致，可读快照允许 `episode: 0` 和缺失 VID，表示尚无可续播身份；这不改变本机 `Progress` 的 1–10000 集、非空十进制 VID 和实际播放写入要求。

Node 边界回归：`node --test tooling/test/library-writer.test.mjs tooling/test/library-owner-transition.test.mjs`。这些证据不等于真实账号、存储、媒体或宿主验收。

追更 DTO 同样只来自生成契约。`readFollow(request, scope, abort?)` 与 `setFollow(request, intent, abort?)` 使用当前 store 捕获的同一 HTTP/native request；读请求带当前 `owner_id/owner_epoch`，写请求只有精确 series 和显式 `enabled`。这两层 wrapper 不缓存、不建队列、不重试 POST；失响应由共享状态先完整读取恢复。

`validFollowSnapshot(value, scope)` 仅接受同 scope 的完整成员表，拒绝重复身份、分页标记、未知字段及含选集的摘要；没有卡片的有效 series 仍是成员。`validFollowMutationResult(value, intent)` 必须匹配原请求且 `acknowledged=true`。`confirmed=true` 还要求完整同 scope 快照观察到目标成员状态；对账失败则保留 unconfirmed 和安全错误码。wrapper 在 await 前捕获原 scope／目标，取消或坏回执不得发布。

追更边界回归：`node --test tooling/test/follow-client.test.mjs`。Rust 路由测试另覆盖本机来源、严格 DTO、游客／错 scope 与取消；没有生产登录态 fixture 注入，因此不能把这些测试当作 authenticated 成功读取、ACK 对账或真实云写验收。

预约使用生成的 `Reservation*` DTO，独立于追更。`readReservations` 读取同 scope 的完整已上线／待上线成员；`setReservation` 发送显式 `enabled` 和 `{kind:'item'|'series',id}`，两种 ID 均保持 canonical 正十进制字符串且不超过 i64::MAX，绝不经 JS number 转换。请求前捕获嵌套目标，响应丢失和取消不自动重发 POST。

`reservationMembership(snapshot,target)` 只比较对应类型的真实身份。匹配为 true；不匹配且任一成员缺少该类型身份为 undefined；全部身份已知且不匹配才为 false。待上线转已上线后缺失旧 item 身份，不能据此确认取消。`validReservationMutationResult` 在精确目标和同 scope 完整快照上执行相同判断，ACK 仍独立于 confirmed。

预约边界回归：`node --test tooling/test/reservations-client.test.mjs`。来源、请求解析、游客／旧 scope、取消和安全错误由 Rust 适配回归覆盖；登录态正向 HTTP／native parity、真实云读写及宿主验收另记。
