# Shared application

`src/store.ts` 持有三端共享页面状态；正式页面只调用 store，不建立自己的可写片库缓存。Rust 负责持久化、账号 scope 和云同步；本包不实现云协议或启动第二个 worker。

片库 API：

- `store.library()` 是唯一已提交快照；`entries()`／`resume()` 只读取观看历史，`favorites()` 按收藏时间排序，`isFavorite(drama)` 按精确 series ID 读取。
- `setFavorite(drama, value)` 发送紧凑卡片和明确布尔状态。它与播放 checkpoint、历史管理、收藏管理共用一条注册写队列；提交前不改 membership。`favoriteOperation()` 提供 pending／complete／failed／unresolved 和保留的 desired state，`retryFavorite(id)` 确认原回执后重试相同意图。
- `historyManagement` 保持原 remove／clear／retry；`favoritesManagement` 使用相同操作状态和队列。单项 remove 是取消收藏；clear 仅从此设备移除，两者都不清空观看历史。确认与文案由页面负责。
- `refreshLibraryState()` 只读取片库和账号状态，不触发云写。`library.refetch()` 等待当前写尾，未确认回执期间仅记录待刷新；原操作确认后再读取，避免重放旧 receipt 覆盖新观察。较早 read、background、owner 切换和应用替换均取消旧发布权；回到前台补读，不撤销已接纳写入。
- `refreshAccountLibraryState(shouldRun?)` 从 `/account/state` 原子发布账号、同步状态、游客历史统计和片库，复用账号命令尾及读取屏障。同一 owner／epoch 的观察等待写尾，保留 writer 身份、未确认回执及部分管理结果；读取失败不封锁后续写入。排队、等待写尾和发布时检查页面所有权，较新写入或后台状态撤销旧观察；只有未确认账号命令的权威恢复才重建 writer 代次，不启动云任务。
- `importGuestHistory()` 排空已有写入后发送当前 owner／epoch 的显式导入命令，返回原始 `GuestHistoryImportResult`。失响应且已成功对账时返回 `undefined`，不依据现有统计重建导入计数；无法确认状态时仍拒绝。
- `libraryKind` 只保存历史／收藏的页面选择，默认 `history`；`openLibrary(kind)` 切换该选择后进入共享片库页面，不复制持久数据。
- 入队保存应用代次、内部 owner 代次及已知 `Account.owner_epoch`。A→B→A 仍是新代次；派发前、延迟会话后和回执发布前校验，重试不借新 epoch 继续旧意图。`transitionOwner` 排空并确认已接纳操作后才原子发布账号和片库。
- 更新使用 `drain()`／`retryFailed()`／`assertSaved()`；关机先由 `beginShutdown` 接纳最终 checkpoint 并封闭新操作，再排空已接纳队列。`drain` 仅证明队列执行结束，调用者若要声明保存成功仍须 `assertSaved()`。

`test/` 是合成边界和宿主回归入口，不是产品入口。Node 队列测试使用最小信号端口，仅证明顺序、身份和错误屏障；三端 check/build、实际宿主、真实数据及云写授权必须另行验证。

详情收藏、共享片库 Tabs／管理与 AccountLibrary 的公共组件和动效交接见[观看记录与收藏](../../docs/design/library-favorites.md)。两端共用状态与交互，页面只持有确认、选择和阅读锚点，不复制片库 membership。
