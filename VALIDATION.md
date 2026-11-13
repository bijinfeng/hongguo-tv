# 验证记录 · 2026-11-13

## A 批浏览界面 · 定稿还原与业务验收

本批实施 `implement-approved-browsing-ui`。第一版只接近主题与基础结构，未忠实还原定稿，已被用户指出；随后以 `design/prototype` 的实际 CSS／布局为依据重建壳、续播卡、海报、详情、区间 Select 与 TV 影院展示区。下列结果属于当前 NSH 工作区，不把设计原型、HTTP fixture、真实官网协议与真实播放混为一项通过。

| 检查            | 本次结果与复跑入口                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整门禁        | `pnpm verify`：格式、lint／包边界、契约漂移、Rust check／build／Clippy、35 项 nextest、7 项工程测试、三端 NSH check／build、35 项 NSH 用例通过；日志 `artifacts/browsing/verify.log`。NSH mixed headless runner 仍报告 1 条编译 warning，未隐藏   |
| 原型保护        | `node --test design/prototype/prototype.test.mjs` 12 项通过；原型另有品牌／更新任务并行改动，本批不覆盖它们                                                                                                                                       |
| OpenSpec        | `openspec validate implement-approved-browsing-ui --strict` 通过；修复外观 requirement 缺 scenario 的结构问题，未放宽范围                                                                                                                         |
| 实际 Web／macOS | `node tooling/src/browsing-host.mjs web` 与 `macos`，每端 3 项通过。1440×1000 浅深：首页、搜索、详情、历史与键盘返回；1180×780 减少动态效果；1180×1000 控件浅深、禁用输入、失败封面与提示。Web 使用隐藏浏览器，macOS 后台宿主，不进入全屏         |
| 实际 TV 业务    | `node tooling/src/tv-browsing.mjs`，固定 Android TV API34 arm64、1920×1080／density320；light、dark、真实 system font_scale=1.3 共 45 项通过。最终预览 APK 经 loopback fixture＋adb reverse，不能当作独立原生业务产品                             |
| TV 覆盖         | 原生普通输入、InputConnection 合成 composition 的方向键所有权、结束组合后退出编辑、HTTP 查询、59集选段、501错误、系统返回、来源焦点、14步横向回收、项目身份及历史一致；请求记录中无 POST。合成 composition 与真实中文输入法候选选择不是同一项验收 |
| T0 保护         | 默认 `pnpm package:tv` 后 `pnpm test:tv-emulator` 浅深各13项通过。默认仍为包内探针／合成视频；显式外部 API 才打业务入口，未拿 T0 代替业务验收                                                                                                     |
| 契约／依赖      | 本批无 Rust DTO／OpenAPI／generated.ts 或锁文件变更；未引入 React／Vite／npm UI、Go 业务或发行依赖。安全门禁的既有 NSH 依赖问题保留，不把 verify 当作安全／发行通过                                                                               |

修复的真实宿主问题：将原型 TV 1920 参考尺寸映射到 NSH 逻辑宽，避免 density320 后整体翻倍；NavPage 需要显式内容背景；覆盖页保留布局并退出输入／无障碍候选，原生适配层保留被覆盖来源的控件身份，在来源再次可见时恢复；横向虚拟列表每次方向键只前进一张海报。NSH 0.5 的 Android 按压控件 ref 不等同桌面键盘焦点，不能只依赖 headless 来源恢复证明 TV 通过。

打包还发现 NSH `package` 可复用旧 release bundle。自定义 TV 宿主现在复制本次 `.nsh/out` 的 bundle／app.json／assets，并从最终 APK 解出 bundle 校验 SHA256；入口选择随外部 API 明确区分 App 与 T0Probe。先前错误／失败不计通过；后续以上述完整路径重跑。

证据均忽略进 Git：`artifacts/browsing/{web,macos,tv}/` 截图与请求清单，`tv/{light,dark,large-text}.txt`，各 `*-run.log`、`t0-package.log`、`t0-regression.log`。截图使用合成剧目与本地设计资产，仅验 UI 和宿主链路；本次未重新对官网进行真实查询或调用真实账号／媒体。每个入口的运行配置和设备主题／字号在脚本退出时恢复。

尚未通过：Web／macOS 真实系统字体放大（Chrome defaultFontSize 未改变 NSH fontScale，已移除该伪验收模式）、VoiceOver／TalkBack、真实中文候选输入、实体遥控、物理电视／硬解／长播、Windows／Linux、独立原生业务、正式签名／升级／远端 CI。减少动态效果已实际配置并运行主路径；截图不能证明所有动画逐帧表现。OpenSpec 6.2 保持未完成，不以其他项替代。

首页与历史当前先进入详情并验证可用选集，再进入对应续播；尚不声称首页一键直接播放。已保存集缺失／锁定明确恢复，不套用其他集的旧时间；无 duration 的记录只呈现真实已看位置，不伪造比例。B 批 Rust 真实播放仍是 A 收尾后的下一项。

2026-11-14 用户授权提交本批实现；不推送或归档，并行品牌／产品形态／更新设计修改保持原状。

### 最终复审 · 2026-11-14

独立复审基于 32 张实际宿主截图核对定稿：字级、摄影素材、明暗表面、桌面布局、TV 主视觉与控件状态为 match；新品牌、可用能力导航、先详情后续播、原生区间选择及历史动作属于有依据的适配。唯一 material fix 为 TV 普通海报取景；已按 `tv.css` 顶部对齐，影院图保留 `center 28%`、桌面普通封面保留居中，重新打包并捕获全部 TV 浅深／放大文字画面，三组各 15 项业务检查再次通过。

同一复审者的 Verdict Pass 将该修复评为 resolved，disposition 为 ship；此结论仅覆盖列出的修复项，不扩展成全产品或未验证范围通过。最后源码的 `pnpm verify` 退出 0，原型 12 项与 OpenSpec strict、diff check 通过。OpenSpec 6.2 因桌面真实系统字体缩放仍未验证而保持未完成；其余完成项按实际证据更新，不自动开始 B 批。

## TV T0 · Android TV 模拟器验收

本任务按用户确认的边界验收：**Android TV 模拟器通过；连接真实电视、硬件解码与厂商兼容属于另一条验收线，不阻塞本任务。** 这是 T0 技术验证包，不代表 Rust 业务迁移或正式客户端完成。

新增薄 Android embedding 宿主，使用官方固定 NSH 的 Java classes 与本项目 mixed `libnsh.so`，未修改框架或参考项目。补齐 Leanback launcher、banner/icon、非必需触屏、遥控焦点和确认；主题颜色/圆角从共享主题生成，关闭系统 Force Dark 的自动反色。默认 `package:tv` 打包内置 Rust 探针和自制视频；显式配置外部 API 时仍是业务 UI 预览。

| 范围              | 实际结果                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模拟器            | Android TV API 34 r3，arm64-v8a，tv_1080p，1920×1080 / density 320，D-pad enabled；Emulator 37.2.13，Hypervisor.Framework / SwiftShader，2 cores / 2048 MB                                              |
| 工具链            | SDK 35、build-tools 35.0.1、NDK 27.2.12479018、NSH 0.5.0 / f4d68f7；NSH 使用 JDK 25.0.3，Gradle 宿主使用 JDK 17.0.20.1、Gradle 8.14.4 / AGP 8.13.2                                                      |
| 包构建            | `pnpm package:tv` 通过；Gradle Wrapper/distribution、官方 embedding archive 和 Gradle 依赖均固定并校验 SHA256；Android Lint 无问题，保留只读诊断，不自动放宽门禁                                        |
| Bridge / 生命周期 | 受控时钟用例 1/1 headless 通过；TSX → Rust → TSX、class dispose、owner task 取消后超过 500ms 期限无回调，以及未取消对照正常完成。最终 APK 中的 Rust 调用/释放由下列 instrumentation 再验                |
| 最终 APK 验收     | `pnpm test:tv-emulator`：浅色 13/13、深色 13/13；实际安装最终 APK，确认 Rust 调用、内置视频准备、遥控播放/暂停、暂停进度不动、seek、换源、移除/重建 surface、Home 恢复、Activity 重建及系统返回电视桌面 |
| 脱离开发服务      | 验收时 adb reverse 规则为空；技术页仅调用包内 Rust 和包内媒体，不访问电脑 API，不需要电脑开发服务或网络                                                                                                 |
| 界面观察          | 已观察模拟器深浅截图：语义颜色、文字对比度、圆角、字号、间距、对齐、视频比例和焦点边界正常；修复 native 探针深色文字不可读及布局变化后焦点框位置滞后。按钮反馈/播放状态即时更新，无新增动画             |
| 公共回归          | `pnpm verify` 通过：格式、lint/边界、契约、Rust check/build、Clippy、35 项 nextest、7 项工程测试、三端 NSH check/build 与 16 项 headless 测试；`pnpm doctor --target tv` 全部通过                       |
| 现有安全门禁      | `pnpm security` 仍失败：6 项 NSH 间接依赖许可证拒绝，bincode 与 ttf-parser 的停止维护错误；bans/sources 通过。本轮未新增许可例外或降低检查，Gradle checksum 不能代替漏洞/许可证审计                     |

最终技术 APK：`apps/tv/.nsh/out/红果.apk`，98,303,408 bytes，SHA256 `4ad244fd4ba702ccf3bac51cef926ee4cea80369f08b2e25625048b555d54491`；包名 `dev.hongguo.tv`，版本 `0.1.0 (1)`，arm64-v8a，min 26 / target 35，debug 签名，APK v2 签名和 16 KiB zip alignment 校验通过。基于 `34c63b7` 加本次 TV 修改构建，验证时工作区仍包含其他文档修改，不宣称全新 checkout 构建。

可复跑命令与宿主职责见 `apps/tv/android/README.md`。本机忽略的证据位于 `artifacts/tv-emulator/`：`apk.json`、`bridge-headless.xml`、`light-acceptance.txt`、`dark-acceptance.txt`、`t0-light.png`、`t0-dark.png`。自动门禁拒绝手机镜像、非固定 API/ABI、多 adb 目标、开发 reverse 规则和不一致 APK；用例失败会返回失败，不依赖 `am instrument` 的进程退出码判断通过。

此前直接运行 Android development host 的 T0 用例也曾 1/1 通过，记录为 `tv34-t0.xml`。最后的主题文字修正后重装开发宿主失败：固定 CLI 生成包含三个 ABI、约 2.7 GB 的 debug APK，先报存储不足，移除本任务旧开发宿主后传输又挂起，已中止并放弃对应安装 session。最终验收改为直接驱动最终 APK，未把此次开发宿主重装计为通过；取消逻辑未因主题修正改变，受控时钟回归仍在最终门禁执行。

原默认 NSH APK 的手机模拟器启动仅为早期 smoke，不能算 TV 验收；缺少 Leanback 入口及遥控焦点的问题已由应用宿主解决。当前未验证 TalkBack、完整业务页面/弹层/回收列表的遥控流、真实媒体编码矩阵、长播、升级、正式签名与远端 CI；本节结果不扩展为这些能力已完成。

## Rust 游客历史 · 当前结果

OpenSpec：`migrate-guest-history`。游客历史已接入现有 Rust API 与共享客户端，页面布局不变；账号、云同步、收藏/点赞与真实播放解析尚未迁移，原生业务 bridge 未接入。

| 范围      | 结果                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 持久化    | 7 项核心测试通过：精确 ID、重启恢复、最近观看排序、摘要裁剪、独立连接并发、事务失败回滚、删除/清空、owner/输入边界及坏库/未来版本保护                                           |
| HTTP      | 4 项 library 集成测试通过：GET/POST、no-store、capability、生成 schema、错误脱敏、错误来源、32 KiB 与 JSON 边界；未装配存储的 router 保留 library 不可用                        |
| 真实进程  | 4 项进程测试通过（新增 2 项）：实际 binary 写入并重启恢复，坏库启动不输出 ready 且保留文件，原有启动/退出和配置错误保护通过                                                     |
| 完整回归  | `pnpm verify` 退出 0：格式、Oxlint/包边界、Rust locked check/build、Clippy `-D warnings`、35 项 nextest、doctest、7 项工程测试、三端 NSH check/build 与 16 项 headless 测试通过 |
| 契约      | Entry/Library/HistoryChange/envelope 已从 Rust 生成；共享 store 使用生成的请求类型，codegen:check 无漂移；账号与播放仍为兼容手写类型                                            |
| fuzz 兼容 | 更新独立 fuzz/Cargo.lock，稳定版 `cargo check --locked --manifest-path fuzz/Cargo.toml` 通过；未运行实际 fuzz 或覆盖率                                                          |
| 安全      | `pnpm security` 仍因 NSH 间接依赖的 6 项许可证拒绝与 bincode/ttf-parser 停止维护告警失败，bans/sources 通过。单独 npm audit 未发现已知漏洞；本次 SQLite 依赖不新增例外          |

工程脚本明确传入 `.local/data/rust`，binary 直接启动需 `--data-dir`；游客数据不读取或覆盖旧客户端文件。数据库标识/版本不匹配或坏库会失败，不自动重建。写操作在 blocking worker 上执行，只有事务提交成功才返回快照；调用方取消不能撤销已经开始的阻塞事务，重新 GET 确认结果。新建 Unix 目录/数据库使用 0700/0600，已有目录权限不变。

上一切片已提交 `6ae6649`，未推送。提交时隔离 TV 并行改动，其目录迁移快照的 22 项 Rust 测试及离线 cargo-deny 四类检查通过；本节记录游客历史切片的提交前验收。完整工作区仍包含并行 TV T0，保留其 NSH 安全告警与 macOS headless runner 的 unwind 链接警告。未修改设计或自动归档 OpenSpec。

本轮未重新访问真实官网或真实账号，也未验证真实媒体、Android SQLite/JNI/ABI、遥控/解码、独立安装包、Windows/Linux 或远端 CI。历史数据仅用临时数据库与合成播放进度验证，不代表新 Rust 播放链路已完成。

## Rust 匿名目录迁移 · 阶段结果

OpenSpec：`migrate-rust-catalog`。该阶段不修改共享页面或设计稿；官网搜索/详情接入同一 Rust 服务，账号、播放、历史当时仍为 501，业务原生 bridge 尚未接入。

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

SDK 安装完成后，`pnpm package:tv` 已通过预检并生成技术验证 APK；`pnpm doctor --target tv` 的 SDK、NDK、Rust targets、NSH runtime 全部通过，唯一失败项是没有一台 ready adb 设备。APK 为 `/Users/admin/Desktop/hongguo-tv/apps/tv/.nsh/out/红果.apk`，大小 48,960,093 bytes，SHA256 `ad7a1dc83b10caa20bc62f1be9ec1f928c7bfdac21d1a80dc6ce774f21166786`，Git SHA `6ae6649a52fd374144ed7538821e6b25e002c365`，包名 `dev.hongguo.tv`，版本 `0.1.0 (1)`，ABI `arm64-v8a`，compile/target SDK 35，min SDK 26。

`apksigner verify --verbose` 和 `zipalign -c -v 4` 均通过；签名为 NSH debug key，使用 v2/v3 APK Signature Scheme。`aapt2 dump badging` 显示默认 `android.hardware.faketouch` implied feature；未连接真机，因此没有宣称 TV launcher、遥控、解码、独立冷启动或正式签名通过。Homebrew command-line tools、SDK/NDK 和 Rust targets 均为本机工具链准备，不纳入仓库。

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
| 旧行为保护     | `pnpm legacy:verify` 通过：legacy 脚本经 `apps/web` check/build、2 项脚本测试、5 项 NSH 测试和原 Go 核心测试；共享 UI 没有复制一套旧版本                                                                                 |

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
