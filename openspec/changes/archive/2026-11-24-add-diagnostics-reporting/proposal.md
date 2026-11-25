# Proposal

## Why

TV 端的应用错误现在只有一条出路：`MainActivity` 的 `setErrorListener` 把 NSH 的致命错误文本打到 `Log.e`。设备离开开发机后，这条线和未捕获异常日志都停在 `adb logcat` 里没人看，等于线上没有异常可见性。同时 TSX 层没有全局错误钩子，业务侧真实的失败（播放取源、账号、存储）散落在 `console.warn` 里，也没有稳定字段可供聚合。

NSH 官方对此没有推荐产品，只给了接缝：TSX 用 `host.post` 把数据交给宿主，宿主用自己的 SDK 上报，崩溃靠日志与 native 符号兜底。本变更把这个接缝用在 TV 宿主上，先让一条真实的、用户同意后才上报的链路跑通。

## What Changes

- 新增 `diagnostics.report` host 通道：TSX 以 `host.post` 单向送出脱敏后的诊断事件，宿主注册同名 handler 接收。
- TSX 侧定义诊断事件的最小契约（类别、稳定错误码、操作名、发行版标识、会话标识），并在现有失败点接入；不上传堆栈以外的自由文本。
- TV Android 宿主集成 Sentry SaaS：仅使用不依赖 AndroidX 的 `io.sentry:sentry`，接管未捕获异常，接收 `diagnostics.report` 事件并作为消息上报。
- DSN 从构建环境注入（`TV_SENTRY_DSN`），缺失时整条链路关闭并保持现有 `Log.e` 行为，绝不把 DSN 写进仓库。
- 设置页新增「发送诊断数据」开关，**默认关闭**；关闭状态下不初始化 SDK、不产生任何网络请求。
- 明确不收集项：令牌、二维码凭据、签名媒体 URL、完整账号数据、评论与选集详情、原始用户输入。

## Capabilities

### New Capabilities

- `diagnostics-reporting`: 用户同意后的客户端诊断上报——事件契约与脱敏边界、TV 宿主的接收与上报、默认关闭的开关与关闭时的零副作用。

### Modified Capabilities

无。现有规范未覆盖任何客户端诊断或遥测行为。

## Impact

涉及 `apps/tv/android`（Gradle 依赖与校验元数据、`MainActivity`、新 handler 类）、`apps/tv/nsh.json`（`capabilities.host` 增加通道名）、`apps/tv/App.tsx` 与 `packages/app`（诊断事件构造与设置项）、`packages/app/src/settings.ts`（偏好结构与旧数据兼容读取）、`packages/ui` 无需改动（复用 `SettingsRow`、`SettingsSection`、`Switch`）。

新增首个第三方运行时依赖 `io.sentry:sentry`，需同步 `gradle/verification-metadata.xml`、`THIRD_PARTY_NOTICES.md` 与 SBOM；`pnpm security`、`pnpm verify` 与 TV 打包门禁都受影响。不修改 `upstream/hongguo/`，不引入 Rust 依赖，不扩展到 Desktop/Web。
