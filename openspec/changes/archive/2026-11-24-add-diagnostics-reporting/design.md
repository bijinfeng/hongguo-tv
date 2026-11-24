# Design

## Context

TV 宿主是唯一的真实错误出口。`apps/tv/android/app/src/main/java/dev/hongguo/tv/MainActivity.java:21` 已注册 `nsh.setErrorListener(message -> Log.e("HongguoTV", message))`，`NshView.reportError` 在 UI 线程回调；NSH 的 unhandled rejection 只写 `log` facade，不进入这个回调，也不进入 JS。因此 TSX 能主动知道的失败只有自己 `catch` 到的那些。

TSX 侧已有可复用的 host 通道机制：`apps/tv/updates.ts` 用 `host.call('update.info')` 之类调用宿主的 `nsh.handle(...)`，`apps/tv/focus.ts` 用 `host.on(...)` 接收宿主事件。`host.post(name, data)` 是同一机制下的单向发送，NSH 文档把它作为第三方上报通道的官方示例。TV 的 `nsh.json` 已声明 `capabilities.host` 白名单只含四个 `update.*`，新增通道必须显式加入。

三个既有约束决定设计形状：

1. `apps/tv/android/gradle.properties` 设 `android.useAndroidX=false`，而 `io.sentry:sentry-android` 的传递依赖包含 `androidx.core`、`androidx.lifecycle`。开 AndroidX 会连带影响 NSH 的 `nsh-classes.jar` 装配与现有 `warningsAsErrors` lint。
2. `gradle/verification-metadata.xml` 有 283 个 component 且 `verify-metadata=true`，任何新 artifact 都要补校验和，否则构建直接失败。
3. `packages/app/src/settings.ts` 的 `isPreferences` 是严格全字段校验，新增字段后旧 `settings.v1` 数据会被判为“无法识别”并回退默认值——这会让所有既有用户丢掉已保存的偏好。

## Goals / Non-Goals

**Goals:**

- TSX 与宿主之间有一个稳定的诊断事件契约，可在不改 JSON 形状的前提下扩展类别。
- 同意状态是唯一开关；关闭时 SDK 根本不被初始化，网络零请求。
- 上报失败对产品行为完全透明。
- 新增依赖走完仓库既有的供应链门禁。

**Non-Goals:**

- 不做 Desktop、Web、iOS 端。桌面打包版没有 error handler 回调，接入方式完全不同，留给后续变更。
- 不上报性能指标、会话追踪、面包屑或用户行为事件，只上报失败。
- 不做 native（Rust/NDK）崩溃符号上传与 `ndk-stack` 集成。
- 不做上报内容的服务端存储、查询界面或告警规则。
- 不引入 `android.useAndroidX=true`。

## Decisions

### 用官方 `sentry-android`，并因此开启 AndroidX

> 本节由真机验收改写。原设计选纯 Java `io.sentry:sentry` 以避免 AndroidX，实测在 Android 上失败。

`Sentry.init` 内部有硬性检查（`sentry-java` `Sent.java:311-315`）：当 `Platform.isAndroid()` 为真且选项类不是 `SentryAndroidOptions` 时直接抛 `IllegalArgumentException: You are running Android. Please, use SentryAndroid.init.`。所以纯 Java artifact 在 TV 上根本无法初始化——这条路在规格上是关闭的，不是配置问题。

因此改为官方 `io.sentry:sentry-android`，并把 `apps/tv/android/gradle.properties` 的 `android.useAndroidX` 设为 `true`。这个开关此前为 `false` 是"不迁 Kotlin"的间接结果（见 `docs/implementation-roadmap.md` 关于 TV 宿主保持 Java 的说明），与 AndroidX 库本身无关：核验 `nsh-classes.jar` 不含任何 `androidx/` 引用，开启它只影响依赖解析。

`io.sentry:sentry-android` 还通过 manifest 注册了 `SentryInitProvider`，会在进程启动时自动初始化。这与"默认关闭"直接冲突，且 DSN 为空时会抛 `DSN is required`。解法是 manifest 中声明官方开关 `<meta-data android:name="io.sentry.auto-init" android:value="false" />`，把初始化权完全交给同意开关。

被否决的方案：自写 Sentry envelope POST。协议本身可用（直连端点返回 200 与 event id），但等于自己维护信封格式、重试、限速与缓存——只有当官方 SDK 确实无法在 Android 上初始化时才值得，而 `auto-init=false` 已经解决了唯一的阻塞点。

### 同意开关放在共享设置，执行点在宿主

偏好存进现有 `settings.v1`（`packages/app/src/settings.ts`），因为三端共享同一个设置页，且偏好需要重启后保留。但 SDK 的初始化必须在 Java 侧完成。

开关变化通过 `host.call('diagnostics.consent', enabled)` 通知宿主，宿主据此初始化或关闭 SDK。用 `call` 而不是 `post`，因为用户点了开关需要知道宿主的真实结果：初始化失败时设置页要显示错误而不是假装成功。

> 真机验收补充：只在用户点开关时下发是不够的。宿主没有持久记忆，重启后不会自己初始化——`cache/sentry` 在重启后消失证明了这一点。所以 `load()` 读到已存的同意值时必须再重放一次 `applyDiagnosticsConsent`，否则同意在下次启动时静默失效。

### 事件契约用稳定枚举，不用自由字符串

诊断事件携带 `category`（`catalog`、`playback`、`account`、`storage`、`engine`、`ui`）、`code`（复用 `packages/app/src/error-messages.ts` 已有的稳定错误码，如 `UPSTREAM_TIMEOUT`）、`operation`（界面动作名，如 `打开详情`）。这三项构成聚合维度，必须是枚举或既有稳定值。

`message` 与 `stack` 只在失败对象自带时携带，且在 TSX 侧就先过滤：URL 查询串剥离、路径中的数字 ID 保留但查询参数丢弃。宿主不做二次脱敏——单一脱敏点比两处各写一半更可验证。

被否决的方案：让宿主解析原始错误对象并在 Java 侧脱敏。这样 TSX 的失败点无法预演最终载荷，测试只能覆盖宿主，且 Java 侧要为每种失败类型重新理解语义。

### DSN 与版本元数据从构建环境注入

`TV_SENTRY_DSN` 由 CI secret 或本地环境提供，经 Gradle `buildConfigField` 注入。缺失时 `BuildConfig.SENTRY_DSN` 为空字符串，reporter 整体短路。`release` 字段用 `BuildConfig.VERSION_NAME` 与 `buildConfigField` 注入的 build number，`environment` 固定 `production`。

被否决的方案：把 DSN 写进 `nsh.json` 或 `build.gradle` 常量。DSN 虽非密钥，但属于部署标识，进仓会让分支与自建实例混用。

### 兼容旧偏好数据

`isPreferences` 改为逐字段带默认值的宽松解析：缺失字段取默认值，类型错误的字段取默认值并保留其余字段，只有整体非对象或 JSON 解析失败才回退全部默认。新增字段默认 `false`（关闭）。这样旧数据不会因缺少新字段被判为损坏。

被否决的方案：升 `settings.v2` 并写迁移。现有 `settings.ts` 只有 247 行且没有迁移框架，为一个布尔字段引入版本迁移机制不划算；宽松解析同样能保证未来加字段不破坏旧数据。

## Risks / Trade-offs

- **开启 AndroidX 改变了宿主的一项既有约定** → `useAndroidX` 原文意图是"不迁 Kotlin"，与依赖无关；`nsh-classes.jar` 无 androidx 引用，实跑 `assembleDebug` 与 lint 通过。若将来真要回到 `false`，Sentry 必须换成自写 envelope 上报。
- **`sentry-android` 的 `SentryInitProvider` 会绕过同意** → 以官方 `io.sentry.auto-init=false` 关闭自动初始化；真机验证了启动时 `cache/sentry` 不出现、开关打开后才出现。
- **SDK 常驻有内存成本** → 关闭 traces、replays、session tracking、NDK 与 ANR；同意关闭时 SDK 完全不初始化。
- **`UncaughtExceptionHandlerIntegration` 接管默认处理器可能与 NSH 的崩溃路径交互** → SDK 内部保存并调用前一个 handler；需真机验证崩溃后进程表现与未接入时一致（**未验证**）。
- **新增 Gradle 依赖会让 `verification-metadata.xml` 增加条目** → 由 `gradle --write-verification-metadata sha256` 生成而非手写。
- **上报路径本身可能抛异常** → 所有调用包在 try/catch 内并吞掉异常。
- **同意开关是全局而非按事件类别** → 首期刻意保持简单。

## Migration Plan

1. Gradle 依赖与校验元数据先落地，跑一次 `assembleRelease` 确认构建与 lint 通过，但不初始化 SDK。
2. 偏好字段与设置开关上线，默认关闭，此时行为与现在完全一致。
3. `diagnostics.report` 契约与 TSX 调用点接入，宿主仅打日志，验证载荷形状。
4. 宿主真正初始化 Sentry，先用开发 DSN 在模拟器验证，再换生产 DSN。
5. 回滚：删除开关即回到现状；DSN 置空可在不发版的情况下关闭上报（若配置走远端则更灵活，但本次不做远端配置）。

## Open Questions

- 上报配额（月度事件量）与采样率是否需要设置，取决于首轮真实流量；首期先按全量上报，观察后再定。

## Resolved

- Sentry 组织 `kebai` 下的项目 `hongguo-tv` 已创建，平台选 Android，对应本变更的 TV-only 范围。DSN 由 `TV_SENTRY_DSN` 环境变量注入，CI 侧使用同名 GitHub Actions secret；仓库不保存 DSN。
