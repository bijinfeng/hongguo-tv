# Shared application

`src/store.ts` 持有三端共享页面状态；正式页面只调用 store，不建立自己的可写片库缓存。Rust 负责持久化、账号 scope 和云同步；本包不实现云协议或启动第二个 worker。

片库 API：

- `store.library()` 是唯一已提交快照；`entries()`／`resume()` 只读取观看历史，`favorites()` 按收藏时间排序，`isFavorite(drama)` 按精确 series ID 读取。
- `setFavorite(drama, value)` 发送紧凑卡片和明确布尔状态。它与播放 checkpoint、历史管理、收藏管理共用一条注册写队列；提交前不改 membership。`favoriteOperation()` 提供 pending／complete／failed／unresolved 和保留的 desired state，`retryFavorite(id)` 确认原回执后重试相同意图。
- `historyManagement` 保持原 remove／clear／retry；`favoritesManagement` 使用相同操作状态和队列。单项 remove 是取消收藏；clear 仅从此设备移除，两者都不清空观看历史。确认与文案由页面负责。
- `refreshLibraryState()` 只读取片库和账号状态，不触发云写。`library.refetch()` 等待当前写尾，未确认回执期间仅记录待刷新；原操作确认后再读取，避免重放旧 receipt 覆盖新观察。较早 read、background、owner 切换和应用替换均取消旧发布权；回到前台补读，不撤销已接纳写入。
- `refreshAccountLibraryState(shouldRun?)` 从 `/account/state` 原子发布账号、同步状态、游客历史统计和片库，复用账号命令尾及读取屏障。同一 owner／epoch 的观察等待写尾，保留 writer 身份、未确认回执及部分管理结果；读取失败不封锁后续写入。排队、等待写尾和发布时检查页面所有权，较新写入或后台状态撤销旧观察；只有未确认账号命令的权威恢复才重建 writer 代次，不启动云任务。
- `importGuestHistory()` 排空已有写入后发送当前 owner／epoch 的显式导入命令，返回原始 `GuestHistoryImportResult`。失响应且已成功对账时返回 `undefined`，不依据现有统计重建导入计数；无法确认状态时仍拒绝。
- `libraryKind` 只保存历史／收藏的页面选择，默认 `history`；`openLibrary(kind, returnToMine?)` 切换该选择后进入共享片库页面，不复制持久数据。TV 的个人页面可用 `navigate(section, returnToMine?)` 登记“我的”入口；返回回调归 store，与详情卡片的同层来源分开，切换主入口时清除，执行仍受原焦点意图保护。
- 入队保存应用代次、内部 owner 代次及已知 `Account.owner_epoch`。A→B→A 仍是新代次；派发前、延迟会话后和回执发布前校验，重试不借新 epoch 继续旧意图。`transitionOwner` 排空并确认已接纳操作后才原子发布账号和片库。
- 更新使用 `drain()`／`retryFailed()`／`assertSaved()`；关机先由 `beginShutdown` 接纳最终 checkpoint 并封闭新操作，再排空已接纳队列。`drain` 仅证明队列执行结束，调用者若要声明保存成功仍须 `assertSaved()`。

`test/` 是合成边界和宿主回归入口，不是产品入口。Node 队列测试使用最小信号端口，仅证明顺序、身份和错误屏障；三端 check/build、实际宿主、真实数据及云写授权必须另行验证。

详情收藏、共享片库 Tabs／管理与 AccountLibrary 的公共组件和动效交接见[观看记录与收藏](../../docs/design/library-favorites.md)。两端共用状态与交互，页面只持有确认、选择和阅读锚点，不复制片库 membership。

TV 呈现由 shell 中的局部宽度／字号策略驱动；业务组件继续使用现有 controller。`collection-visibility` 允许大于视口的卡片在充分可见时恢复来源，仍受原 focusGuard 约束；管理行的明确详情动作承接返回，静态容器不承接动作焦点。`./testing/episode-grid` 只组合生产选集控件，验证千集浏览、锁定与播放身份边界，不创建媒体会话或观看记录。

`PosterCollection.layout` 默认为 `grid`；`shelf` 复用同一虚拟列表、作品 ID 与恢复围栏，首页据此展示一页已加载推荐的横向连续行。卡宽按局部可用宽度与密度派生，横向行高度使用公共文字行高，图片仍保持独立尺度。`itemTestIDPrefix` 保留各入口已有自动化身份；来源消失时选择相邻作品，空集合调用 `onEmptyFocus` 返回该页面的真实入口。集合只接收 Drama，演员／剧集混合榜单继续使用既有 `kind:id`。

`collection` 是视口生命周期的身份：新查询／筛选创建新视口，即使作品 ID 重合也从首项开始；同一集合内的分页、重排、减列和详情返回继续使用 ID＋offset，旧集合的异步测量与恢复随其销毁失效。

同行卡片高度不同时，返回先恢复行，再按目标卡片、List 视口及当前滚动位置修正偏移；不能以整行居中代替目标可见。焦点仍须通过原可见范围、集合身份和用户意图检查，不移动外层页面来补偿内层列表。
