# 验证记录 · 2026-11-13

## Rust 匿名目录迁移 · 当前结果

OpenSpec：`migrate-rust-catalog`。不修改共享页面或设计稿；官网搜索/详情已接入同一 Rust 服务，账号、播放、历史仍为 501，业务原生 bridge 尚未接入。

| 范围           | 结果                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 离线目录契约   | 5 项解析/校验测试通过：数值大 ID 精确字符串化、32 位 ID、搜索去重/分页/空页、详情身份、router JSON 与选集锁定；样本为合成数据，固定参考 SHA 见 contracts/fixtures/catalog/README.md |
| 有界客户端     | 6 项测试通过：生产 TLS 初始化、loopback 限制、编码/页码、无 Cookie/授权、重定向拒绝、403 挑战、5xx/截断响应有限重试、两类大小上限、单次/总超时、drop 关闭连接且不重试               |
| API 与进程     | 新增 4 项集成测试通过；原有来源、请求体、路由和真实进程启动/停止测试通过。client/router 在 ready 输出之前初始化；未实现端点仍 501                                                   |
| Rust/工程      | 全工作区 locked check/build、rustfmt、Clippy `-D warnings`、22 项 nextest、doctest 通过；7 项 Node 工程测试通过                                                                     |
| 契约           | OpenAPI 和 generated.ts 已更新；codegen:check 无漂移，目录 TS 类型改为生成 alias；账号/历史/播放兼容类型仍手写                                                                      |
| NSH 共享回归   | Web/Desktop/TV check/build 通过；headless 分别 5/5/6 项通过，共 16 项，含 TV T0 bridge、资源释放及异步任务取消/正常完成验证；headless 不等于 Android 真机                           |
| 官网显式 smoke | `cargo run --locked -p hongguo-core --example catalog_probe -- 重生` 成功：10 项结果、has_more=true，首项详情 166 集。只检查当时匿名官网，不证明 App 搜索、播放或账号               |
| fuzz 兼容      | 因 core 新增依赖刷新独立 fuzz/Cargo.lock；稳定版 locked check 通过。未声称已运行 nightly fuzz 或覆盖率                                                                              |
| 供应链         | npm 官方 registry audit 未发现已知漏洞。已审查并限定四项 TLS 依赖许可证例外，见 docs/dependencies/catalog-tls.md；全工作区安全检查仍失败，见下文                                    |

本机直接执行 `pnpm verify`，无需手动设置 PATH 或 RUSTUP_TOOLCHAIN。工程脚本向 NSH 构建、测试和开发子进程传入已解析的 Rust 工具目录，遵循仓库固定工具链；受限 PATH、环境不变及重复调用有工程测试。TV 的 T0Session 增加 Default 以满足 Clippy；取消测试使用手动时钟推进 1000ms，超过 Rust 任务的 500ms 定时器，并用未取消任务正常完成作为对照。

**完整 `pnpm verify` 已通过：** 格式、Oxlint/包边界、契约无漂移、Rust/NSH check/build 和全部上述测试通过。此前 TV T0 探针失败已修复，并在完整回归中通过，未删除或过滤测试。macOS mixed headless runner 链接仍有一项 warning：`__eh_frame section too large (max 16MB)`，链接器提示异常处理性能可能受影响；它不是 TSX bundler 警告或测试失败，未全局屏蔽。安全检查单列如下，不能据 verify 通过推定全部发行门禁通过。

**安全门禁仍失败：** `pnpm security` 中 cargo-deny 阻止了 TV NSH 依赖的许可证（foldhash/zlib-rs 的 Zlib、webpki-roots 的 CDLA-Permissive-2.0、winx 的 LLVM exception），并报告 bincode 1.3.3（RUSTSEC-2025-0141）和 ttf-parser 0.25.1（RUSTSEC-2026-0192）停止维护，无安全升级建议。这些不等同已证实可利用漏洞，但当前政策仍阻止合入；没有添加 advisory ignore 或放宽全局许可证策略。cargo-deny 的 bans/sources 通过，重复版本仍有 warning。

当前没有重新验收视觉设计、Android ABI/JNI/TLS、真实遥控/解码、正式安装包、Windows/Linux 或远端 CI。未自动提交、推送、发布或归档 OpenSpec。

## TV T0 Android 打包 · 当前结果

TV 的 mixed/native T0 已在 headless runner 验证：`PATH="$HOME/.cargo/bin:$PATH" RUSTUP_TOOLCHAIN=1.97.0 pnpm check --target tv`、`pnpm build --target tv`、`pnpm test --target tv`、`pnpm fmt:check` 和 `pnpm lint` 均通过；6 项 TV 测试包含 bridge 调用、class dispose、owner 任务取消及原有搜索/播放/账号/历史行为。

`pnpm doctor --target tv` 和 `pnpm package:tv` 均在打包前置检查处失败。NSH 0.5.0（`f4d68f7`）、JDK 25.0.3、adb 和 Android runtime 已就绪；缺少 `platforms;android-35`、`build-tools;35.0.1`、NDK `27.2.12479018`、`aarch64-linux-android`/`armv7-linux-androideabi`/`x86_64-linux-android` Rust targets，且没有 ready adb 设备。当前没有生成 APK。

准备工具链时，Homebrew 的 `android-commandlinetools` 下载在 Google 源无进展后中止（缓存留下约 96 MiB 的 `.incomplete` 文件，未安装 SDK）；`rustup target add` 又因已有不完整 target 文件报告 `detected conflict` 并回滚。没有把这些环境残留纳入仓库，也没有伪造 Android、遥控、解码或正式安装包通过结论。

## pnpm / Rust 工程基线

环境：Apple Silicon macOS；Node 26.12.1、pnpm 11.1.3、NSH 0.5.0（f4d68f7）、Rust/Cargo 1.97.0。nextest 0.9.151、cargo-deny 0.20.2 使用官方预编译包并校验官方 SHA256；安装过程未修改 shell PATH 配置。

| 范围           | 本次结果                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工作区与初始化 | 10 个 pnpm workspace，frozen install、doctor、setup 通过；从仓库外目录、排除 Go 的 PATH 再次 setup 通过；重复配置初始化保留数据有测试                                                                              |
| JS 与包边界    | Oxlint、Oxfmt、共享包依赖方向检查通过；禁止反向依赖、跨包相对路径和 Node/React 导入有失败测试                                                                                                                      |
| Rust 基线      | Cargo locked check/build、rustfmt、Clippy `-D warnings` 通过；7 项 nextest 全部通过（Range 规则、来源/请求体/路由边界、真实二进制启动/配置错误/退出）；doctest 执行完成，目前无文档测试用例                        |
| 三端入口       | Web/Desktop/TV 分别 NSH check/build 通过、无 bundler 警告；每端运行同一套 5 项行为测试，共 15 项通过。TV 此处为 headless 入口，不是真机                                                                            |
| 完整门禁       | `pnpm verify` 通过：格式、lint/边界、契约无漂移、Rust/NSH check/build、工程/Rust/NSH 测试                                                                                                                          |
| 契约           | Rust DTO → utoipa OpenAPI → openapi-typescript 生成与漂移检查通过；仅健康/状态端点。旧内容 DTO 仍为兼容手写类型                                                                                                    |
| 开发生命周期   | 从仓库外启动真实 dev:web；NSH Web 页可访问，Rust status 与精确 CORS 通过；SIGTERM 后 API 监听关闭，无遗留 NSH/API 进程                                                                                             |
| Git            | Lefthook 已安装；hooks:check 通过，Conventional Commits 的通过/拒绝路径有测试；发现并关闭 Lefthook 默认隐式 stash，新增实际 wrapper 的部分暂存回归，检查期间未暂存内容可见、成功/失败后 index/工作区不变且无 stash |
| 安全           | `cargo deny --locked check` 的漏洞、许可证、来源、依赖策略通过；官方 npm registry 上 `pnpm audit` 未发现已知漏洞。机器默认镜像不支持 audit，项目已固定官方 registry                                                |
| 旧行为保护     | `pnpm legacy:verify` 通过：旧入口 check/build、2 项脚本测试、5 项 NSH 测试和原 Go 核心测试；共享 UI 没有复制一套旧版本                                                                                             |

当前新增 6 项工程自动化测试。旧播放的真实网络/界面证据保留在下文，本次结构迁移未重新做真实账号扫码和全量视频验收。

工程基线时仍未完成：Rust 内容/账号/存储协议迁移；NSH mixed/native bridge；桌面/TV 独立安装包；公网身份与会话隔离。Android doctor 实际因缺少 build-tools 35.0.1 失败，且无连接设备。cargo-llvm-cov/fuzz 的命令与手动 CI 已配置，fuzz 的独立锁文件及稳定版编译检查通过；本机尚未完成 LLVM/nightly 安装与覆盖率/实际 fuzz 运行。GitHub CI 配置尚未远端执行；Windows/Linux 的实际运行结果不作本机通过声明。签名、更新、SBOM、secret scan 与发行保护按后续阶段落实，未宣称工业化发行已完成。

## 迁移前真实功能验证

环境：Apple Silicon macOS 26.3；NSH 0.5.0（f4d68f7）；Node 26.12.1；Go 1.27.3。Go 核心固定提交 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。

## 已验证

| 范围         | 证据与结论                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| NSH 模板基线 | 使用官方 CLI `init --template ts`，先完成模板 check/test，再扩展                                                                                      |
| 工程初始化   | `.nsh-version` 固定 CLI；`doctor`、`setup`、`verify` 全部通过；临时干净目录中重建 NSH 类型、配置和 Go 二进制，再次 setup 保留自定义连接配置与数据哨兵 |
| 工程脚本     | 工具诊断测试覆盖无效 NSH 路径、错误版本、缺失 Go；与网关测试共 2 项通过；`npm run dev` 自动选择 macOS 并收到原生宿主连接，验证后停止服务              |
| 共享 UI      | 最终 `npm run check`、`npm run build` 通过，无 bundler 警告                                                                                           |
| 网关         | 1 个 Node 集成测试：拒绝错误 Origin、Host、跨站来源及非 JSON 写入；仅允许所需路由；正确转发 Range/206                                                 |
| NSH 业务     | 5 个测试：搜索→详情→播放→切集→返回；失败重试/过时结果；模拟账号恢复/历史续播；大详情记录裁剪；实际播放前不写进度、完成状态不被退出覆盖                |
| Go 核心      | `go test ./core/cmd/hongguotv` 全部通过                                                                                                               |
| 上游一致性   | `npm run upstream:sync` 验证 235 个文件，未改写核心                                                                                                   |
| 真实 Web     | 搜索“重生”返回真实结果；打开 73 集详情；实际播放视频，暂停、自动连播进入第 2 集；本地核心返回实际集数/播放秒数；刷新后能读取历史并恢复到相应选集      |
| 真实 macOS   | 原生窗口、NSH `.app` 前端包均能启动；真实搜索、详情和视频画面已观察；另用 NSH 原生驱动验证播放与暂停并保存截图                                        |
| 前端打包     | Web 静态资源、macOS `.app` 打包通过；都仍依赖外部启动的本地核心/网关                                                                                  |
| 界面检查     | macOS 1180×780 浅色/深色、460×780 窄窗口已生成截图；统一圆角、字号、间距、对齐与主题色；修正主按钮 hover 的文字对比度，固定焦点边界宽度               |

真实内容的标题、封面和集数随上游变化；不作为固定测试断言。封面异步加载，截图中的灰色块可能是尚未下载完成的占位。

测试时发现并修复：完整详情包含大量附加字段，超过核心 32 KiB 的历史请求上限。持久记录改为必要字段，简介限制 1000 字符，标签最多 8 项；保留播放器完整选集不变。进度写入串行执行，失败显示提示并提供重试。

截图位于忽略进 Git 的 `artifacts/`：[浅色](artifacts/macos-search-light.png)、[深色](artifacts/macos-search-dark.png)、[窄窗口](artifacts/macos-search-narrow.png)、[实际播放](artifacts/macos-playback.png)。

## 未完成的验收与交付

- **Android TV**：`adb devices` 无设备；Android runtime 已下载并校验 SHA256，`nsh package --target android` 实际报缺少 `build-tools;35.0.1`。SDK 下载站连接也失败。没有生成或安装 APK，没有验证遥控确认/返回、完整焦点迁移或硬件解码。
- **独立客户端**：本版只有 Node 启动器管理 Go 子进程。macOS 正式包需加入 sidecar 启停/恢复；Android 需原生宿主管理 Go 服务和 TV manifest（Leanback 入口、非必需触屏等）。开发时的 `adb reverse` 不代表独立运行。
- **公网 Web**：当前网关只绑定 loopback，允许精确的开发 UI Origin。不能直接改成公网监听；需要单独设计服务端身份、会话隔离、访问控制和部署。
- **账号**：扫码界面和本地状态轮询已实现，模拟账号恢复有测试；未使用真实账号完成扫码授权、MFA 或云端记录同步。
- **兼容性**：仅验证一个实际短剧的部分集数，不能证明全部编码、清晰度、长时间播放或异常网络可用。Windows/Linux、webOS/Tizen/tvOS 均未实测。
- **功能覆盖**：首批搜索结果、选集与连续播放、历史、扫码登录入口；排行榜、推荐流、追更、评论、弹幕、下载等旧功能未迁移。
- **输入与动效**：桌面/Web 保留语义 Button/Input 和焦点样式、搜索上下键与播放器 Toolbar；已在浏览器验证方向键→确认打开→Escape 返回原卡片焦点；尚未完成所有键盘路径、屏幕阅读器和 TV 遥控的完整验收。减少动态效果有测试配置，所有动效尚未逐帧验证。

结论：共享 NSH TSX UI + 保留 Go 核心的路线已在 Web/macOS 真实视频链路上得到验证。Android TV 应作为下一道决定性验收门槛；目前还不能宣称三端独立交付完成。
