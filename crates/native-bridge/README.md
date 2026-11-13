# 原生核心会话

C 批基础切片。当前生产 Desktop／TV 入口尚未切换；Web 和显式外部 API 预览仍使用 HTTP。这个 crate 提供可复用原生装配，不是独立安装包验收结果。

各端薄 native crate 调用 `hongguo_native_bridge::register(registry)`，在自己的 NSH native specifier 下导出 `NativeCore`、`NativeSession`、`NativeCall`。声明由锁定 NSH 生成，不手写或提交 `.nsh/types`。

`NativeCore.open()` 在 NSH engine task 读取公开 `data_dir()`，然后使用同一宿主 Tokio runtime 初始化 CatalogClient、`guest.sqlite3` 与 PlaybackService。不存在宿主数据目录、数据库损坏／不兼容、磁盘或监听失败时拒绝，不读取 legacy、不删文件、不回退内存或外部 API。已有 SQLite 将非数据库字节映射为 `LIBRARY_STORAGE_UNAVAILABLE`，版本／内容不兼容映射为 `LIBRARY_DATABASE_INVALID`；均保留文件，不在本批改动该错误语义。

## 调用与所有权

- `session.start(path, body)` 只接受既有目录／游客历史／播放／状态／未开放账号路由；`null` body 为读，JSON string 为写。请求体最多 32 KiB、路径最多 8 KiB，禁止绝对 URL、fragment 和双斜线路径。业务直接调用 core，路径只是兼容现有共享客户端的操作选择器。
- 每个会话最多八个未接收调用；播放核心仍保留自己的两项准备上限。`call.result()` 返回 `{ status, body: { ok, data | code/error } }` JSON；domain DTO 与 HTTP 一致，不创建另一套剧集或历史模型。
- 成功准备的媒体仍由 call 持有。TS adapter 验证未关闭／未取消和响应成功后同步 `accept()`，才把媒体交给共享 Player。`cancel()`、`dispose()`、丢失调用方或未接收的迟到完成会释放资源；accept 后取消 call 不影响 Player 的媒体，Player 继续用既有 release 路由操作释放。
- `session.close()` 幂等取消所有未接收调用、关闭播放媒体并通知本机监听退出；原生 class drop 同样执行。调用任务意外退出会提供明确失败，避免无限等待。SQLite 已进入阻塞事务的写入不承诺因 UI 取消而回滚；已提交记录保持持久。
- `createNativeTransport(session)` 位于平台无关 core-client，不导入 NSH。App 入口负责创建、注入、关闭；共享页面和 UI 不接触原生 class。

## 媒体边界

每个会话在随机 `127.0.0.1` 端口启动 `http-api::media_router`。仅 GET／HEAD 的不透明媒体路径可用；目录／历史／状态／health 路由不挂载。沿用精确 Host、Origin／cross-site 检查、Range、512 KiB 流块、媒体过期与有界缓存，不接受上游 URL 或文件路径。256-bit 随机会话内媒体句柄是访问凭据，不把 loopback 当作身份认证。媒体字节不经过 TSX／FFI。

## 验证

```sh
pnpm test:rust
pnpm check
pnpm build
pnpm test
pnpm verify
```

本 crate 测试通过显式 loopback 上游提供合成目录、模型和 MP4；覆盖 HTTP 错误／DTO 对照、SQLite 重开、损坏原文件保留、取消与接收竞态、请求上限、监听停止、media-only 404、来源拒绝和真实 Range 字节。这些 Rust 夹具不访问官网，不证明安装包业务、macOS 输入、Android TLS／解码、物理电视或发行；这些由 C 后续任务分别验收。

另有四项 `real_mixed` 测试，使用锁定 `nsh-engine` 的公开 Engine／Bundle／HostChannel，在真实 QuickJS 中调用同一注册函数导出的三个 class/module。覆盖宿主应用目录与 SQLite 重开、缺目录／损坏库明确失败且保留字节、pending result 的 cancel／call.dispose／session.dispose，以及未 accept 媒体释放／accept 后保留／close 后释放。测试专用 BridgeFixture 只在 cfg(test) 注册，用于合成 loopback 上游；生产 NativeCore.open 不接受上游或存储路径注入。

Desktop mixed 与 TV 现有 native crate 只调用共享 register；各端 `pnpm check` 生成的声明验证其真实导出签名。生产页面在此切片仍经 HTTP，真实 engine 测试不等同两端安装包、官网、宿主销毁或物理设备验收。新增 engine 测试依赖的安全结果单独记录于 VALIDATION，不因功能测试通过宣称安全门禁通过。
