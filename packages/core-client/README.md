# Core client

共享 HTTP/native 传输与生成契约的入口。公开 DTO 只从 `@hongguo/contracts` 导出；Rust 是模型来源。

`createLibraryWriter(request, canDispatch?)` 为 history 和 favorites 共用一个惰性注册会话；`LibraryChange` 的 `favorite` 必须携带精确 series 的紧凑 `drama` 和明确 `value`，不能发送 toggle。`libraryDrama()` 从详情提取同一紧凑摘要，移除选集等载荷。

每次写入捕获不可变请求和十进制 operation ID。丢失／坏回执保留原操作，只有显式 `resolve()` 重放同一身份和载荷；GET 快照不证明写入终止。明确 failed 回执后才可用新 ID 重试；`reset()` 拒绝未确认和进行中的操作。调用者提供的派发检查在会话创建前后执行，防止迟到会话跨应用生命周期或账号 epoch 派发。

`validLibrarySnapshot()` 校验可发布的紧凑历史、必需收藏数组及正安全整数毫秒收藏时间；同一校验用于 registered receipt 和共享状态读取，拒绝完整选集载荷。与 Rust 远端历史契约一致，可读快照允许 `episode: 0` 和缺失 VID，表示尚无可续播身份；这不改变本机 `Progress` 的 1–10000 集、非空十进制 VID 和实际播放写入要求。

Node 边界回归：`node --test tooling/test/library-writer.test.mjs tooling/test/library-owner-transition.test.mjs`。这些证据不等于真实账号、存储、媒体或宿主验收。
