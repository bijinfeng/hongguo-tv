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
| 旧行为保护     | `pnpm legacy:verify` 通过：legacy 脚本经 `apps/web` check/build、2 项脚本测试、5 项 NSH 测试和原 Go 核心测试；共享 UI 没有复制一套旧版本                                                                           |

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

## B 批播放迁移 · 开工基线（2026-11-14）

A 提交为 `9285503`（本任务未推送）；当前并行 release 提交与品牌文档改动保留。A 的 6.2 Web／macOS 系统字号缩放仍未验收。

- `pnpm doctor`：Node 26.12.1、pnpm 11.1.3、NSH 0.5.0、Rust/Cargo 1.97.0 通过。shell 不直接提供 cargo PATH，后续使用项目工具解析或 `~/.cargo/bin/cargo`，不静默跳过。
- `pnpm test --target web`：Rust／工程／Web 既有基线通过，Web 12 项；日志 `artifacts/playback/baseline.log`。
- `pnpm test:rust`：35 项 nextest 与 doc tests 通过；日志 `artifacts/playback/core-baseline.log`。覆盖现有 library／媒体 Range；播放／导航／历史回归由同次 Web 测试覆盖。
- 基线未运行 Go、未读取 legacy 客户端数据、未启动原生 Chrome、未进入全屏；Web 为 NSH 测试宿主。此记录不代表真实媒体／解码／GUI 已验收。

### B1 · 匿名播放模型与协议审查

本批只完成 core 模型候选解析，尚未产生媒体就绪资源，HTTP `/api/v1/play/info` 仍为 501、playback capability 仍为 false。不把协议 fixture 通过写成官网播放成功。B 的任务 1.1、1.2、2.1、2.2、2.3 完成；总预算／共享准备、媒体、HTTP 和两端定稿播放器继续实施。

- 功能审查：按固定 SHA 检查三类来源及独立 single 注册配置；精确 ID、有限 content family／codec／quality、显式业务拒绝、bytevc2 排除、签名 URL 脱敏及同集身份约束均有离线／loopback 测试。自动清晰度按参考选择不高于 720P 的最高项，无此区间时取最高；显式清晰度不静默降级。
- 并发审查发现并修复：只有 HTTP 200 空 body 可刷新；初始注册成功不误用刷新冷却；刷新中的新请求等待同一结果；最后 owner 离开取消网络任务，迟到旧 revision 复用新身份。实例最多三种身份槽、30 分钟 TTL、刷新／失败冷却 10 分钟。legacy POST 身份不与 GET 或账号共享。
- 协议审查：TTEncrypt 解密对照独立 OpenSSL 向量，签名对照固定 Argus／Ladon／Gorgon 向量，URL 解密对照合成向量；fallback 限定域名／fixture 原点、四次 codec 上限、保留原签名 query 字节及视频身份／时长。不运行 Go。受保护内容准备尚未接入，返回不兼容，不返回原始保护材料。
- `cargo test -p hongguo-core --lib playback --locked` 新增 20 项通过；`cargo clippy -p hongguo-core --all-targets --locked -- -D warnings` 通过。最新日志为 `artifacts/playback/provider-tests.log`、`provider-clippy.log`。
- UI 审查：本批未改页面／控件代码，`node tooling/src/browsing-host.mjs web` 图形宿主 3 项通过，检查浅深控件截图的字号、间距、圆角、对齐、颜色、focus／selected／disabled／error 和减少动态效果路径；未发现本批布局回归。截图沿用脚本输出 `artifacts/browsing/web/controls-{light,dark}.png`；图形日志 `artifacts/playback/ui-domain-web.log`。播放器的新视觉、动效、解码、macOS／TV 和真实内容继续单列待验收。
- `pnpm security` 已运行，Cargo gate 被既有 foldhash、webpki-roots、winx、zlib-rs 许可及 NSH bincode／ttf-parser 未维护问题阻塞。新增依赖没有在此次 Cargo 输出出现新的独立问题，后续安全阶段因前置 gate 失败未完成；未增加 allow／ignore。
- 完整 `pnpm verify`：Rust 55 项、工程 15 项、NSH 35 项及三端 check／build 通过；契约漂移与 OpenSpec strict 通过。日志 `artifacts/playback/verify-domain-final.log`、`codegen-check.log`。最后补充的畸形模型身份校验另经同组 20 项与 Clippy 通过。PlayInfo 已定义在 Rust core，但尚未注册 HTTP schema；因此本批 codegen 未产生契约差异，4.3 再随路由生成公开播放 DTO。

### B2 · 有界媒体准备与生命周期

core 新增 MP4 初始化、普通 AVC／HEVC 检查、合法模型携带密钥的 whole-sample CENC CTR、稳定 Range 和完整文件回退。HTTP 仍未装配此服务，播放器和 capability 尚未改变。本段更新 B1 的“保护内容尚未接入”阶段状态，不代表官网内容或真实解码通过。

- 功能审查修复：自动闲置回收、跨实例发布拒绝、关闭后准备结果丢弃、活跃租约计数、初始化／清理锁竞态、目录及文件私有权限；fixture 使用 set_path，防止双斜线媒体路径替换 loopback authority。临时文件、预算和准备许可通过 RAII 在失败／取消后释放；清理只处理本应用匹配且未锁定的目录。规则见 `crates/core/src/media/README.md`。
- 媒体定向 18 项通过：真实 loopback 的精确字节、任意分片、强／弱 ETag、版本变化、错误 Content-Range、重定向、截断、忽略 Range、跨块初始化与后置 moov、超限声明、并发／取消／文件清理、容量／TTL／活跃读和失效 token；CENC 使用自制 MP4 与 NIST AES 明文／密文，未捕获版权媒体或使用账号凭据。另新增合成 spade 向量与畸形／不支持 tag 测试。
- 完整 `pnpm verify` 通过：Rust 71 项、工程 15 项、NSH 35 项，三端 check／build 与契约漂移检查通过。最后的 fixture 双斜线路径修复另经媒体 18 项及 Clippy 通过。日志 `artifacts/playback/verify-media-final.log`、`media-tests.log`、`media-clippy.log`。首次完整验证遇测试服务状态／断言未同步，修正后重跑通过，未删除测试。
- UI 审查：无页面／控件改动，真实 Web 图形宿主 3 项通过；查看浅深控件截图，圆角、字号、间距、对齐、颜色、focus／selected／disabled／error 和减少动态效果路径无本批回归。日志 `artifacts/playback/ui-media-web.log`；截图 `artifacts/browsing/web/controls-{light,dark}.png`。新播放器视觉／动效、系统字号、屏幕阅读器、macOS／TV 与真实解码保持各自待验收。
- `pnpm security` 再次运行，仍被既有 foldhash／webpki-roots／winx／zlib-rs 许可和 NSH bincode／ttf-parser 未维护项阻塞；未放宽 gate。只扩展现有 Tokio 文件／IO features，无新增包，后续安全阶段因前置 gate 失败未完成。日志 `artifacts/playback/security-media.log`。
- 尚未验证：真实官网媒体、真实宿主播放、Windows 文件清理、物理电视与独立原生业务；本批不声称首个 MVP 完成。未推送／发布。

### B3 · 共享准备、HTTP 与生成契约

Rust PlaybackService 已装配实际 web-api，初始化失败不 ready；播放 capability 仅随显式服务装配开启。新增 play/info、幂等释放及同源媒体 GET／HEAD，PlayInfo 已由 Rust 生成；账号 DTO 仍为兼容手写类型。定稿 Player 和客户端退出释放将在 B4 接入。

- 功能审查：相同请求共享带 owner／revision 的准备，成功等待者持有独立句柄；最后 owner、关闭及迟到结果均有取消边界。来源模型预算 30 秒、family 8／14／8 秒，只有媒体准备成功才发布；业务／CDN 拒绝不继续回退。官网探测发现外层数字选集 ID 与内层 CDN 视频 ID 属于不同命名空间，修复为精确外层绑定，保留不同数字集 ID、无绑定 direct CDN ID 与 fallback 身份／时长漂移的拒绝测试。
- 完整 `pnpm verify` 通过：87 项 Rust、15 项工程、38 项 NSH，三端 check／build、契约和 release check 通过；日志 `artifacts/playback/verify-service-final.log`。首次验证发现 CoreError.name 改变既有错误文案，恢复兼容后重跑通过。最后补充 HTTP 取消测试后，6 项 HTTP playback 集成与全工作区 Clippy 通过；日志 `http-tests-final.log`、`service-clippy-final.log`。真实进程 5 项与 codegen:check 通过，日志 `process-tests.log`、`codegen-service-check.log`。
- HTTP 审查：实际字节覆盖 200／206／416、闭区间／开放／后缀、HEAD、长度／Content-Range、no-store、精确 CORS、未知／过期 token 和释放；Body Drop、实际 TCP 读取中断、JSON 响应前断开与关闭取消均通过。客户端同源路径、legacy 只读兼容路径及生成 DTO 有回归。
- 官网准备探测：匿名搜索与详情成功，最终 `prepared codec=hevc quality=1080P bytes=15175371 first=16 tail=16`；日志 `artifacts/playback/live-diagnostic.log`。此前 IdentityMismatch 失败保留在 `live-preparation.log`；成功日志中的临时脱敏来源诊断已从源码移除。没有记录 URL／密钥／设备／cookie，没有将探测当真实首帧／观看／历史验收。
- UI 审查：真实 Web 图形宿主 3 项通过，查看浅深 controls 截图未发现本批回归；日志 `artifacts/playback/ui-service-web.log`，截图 `artifacts/browsing/web/controls-{light,dark}.png`。本批未改 Player 页面，新播放器布局、解码、系统字体、macOS 与 TV 业务仍各自待验收。
- `pnpm security` 仍被既有 foldhash／webpki-roots／winx／zlib-rs 许可与 NSH bincode／ttf-parser 未维护项阻塞，未放宽门禁；日志 `artifacts/playback/security-service.log`。futures-util 已在锁文件中，本批仅加入直接依赖，没有新增包；后续安全阶段未完成。
- 本批不等于 B 或首个 MVP 完成；A 6.2 字体缩放、真实宿主观看／seek／切集／重启续播、物理电视／长播及独立原生业务未验收。未推送／发布。

### B4a · 播放器共享控件（5.1 仍待 macOS 完整输入验收）

- `packages/ui/src/player.tsx` 提供影院按钮、Slider、Select、控制层和 Sheet，沿用现有浅深主题，按桌面／TV 定稿尺度呈现；内部预览明确是合成控件，不是媒体播放。隐藏状态直接禁用所有子控件，避免只隐藏父层仍留下 Tab 目标。
- `pnpm check`、`pnpm build` 三端通过，日志 `artifacts/playback/{check,build}-controls-reviewed.log`；`pnpm test --target web` 通过 88 个 Rust 和 16 个 NSH 测试，日志 `test-controls-reviewed.log`。本批没有依赖变化。
- `node tooling/src/player-controls-host.mjs web` 的浅深／减少动态效果两组通过：实际操作进度与提交值、音量、速度，Enter 重开 Select／Sheet，隐藏后 Tab 跳到预览末尾按钮；`ui-controls-web-interactions.log` 与 `controls-web/` 截图。
- Android TV 模拟器 NSH 开发宿主的同一预览两组触控路径通过（进度拖动／提交、音量、速度、面板与隐藏）；`ui-controls-android-interactions.log` 与 `controls-android/`。Android 原生选择行在 touch-down 后消失可能使测试 touch-up 报 `has no native view`，只在最终速度读数已为 1.5 时接受该测试驱动错误；未忽略选择失败。此结果不代表 DPAD、实体遥控、解码或最终业务 APK 通过。
- macOS 控件尺度、按钮与 Sheet 的早期键盘路径两组通过；最新完整键盘补测已验证进度／commit 和音量，但在 Select 改值处失败，保留 `ui-controls-macos-interactions.log`。原生 CUA 复核报告 Mac 锁屏，无法继续实际输入；此前既有浏览页 pointer／文本自动化也失败，保留 `browsing-macos-controls-diagnostic.log`，不归为播放器单一根因。
- 独立视觉复审要求补全控件输入与焦点证据；Web 已补齐且暴露并修复隐藏子控件问题。macOS Select 与完整隐藏焦点证据、屏幕阅读器／系统字体缩放仍未完成；5.1 和 6.3 保持未勾选。截图目录 `artifacts/playback/controls-{web,macos,android}/`。未修改设计原型／品牌并行工作，未推送、发布或归档。

### B4b · 定稿播放器、真实 Web 观看与会话生命周期（阶段提交）

- 源码：`packages/app/src/pages/Player.tsx` 组合桌面 456＋96 播放器、316×552 选集栏与 24 间隔，24／12 集四列分段；TV 使用 contain 全画面、控制层、定位预览与右侧面板。`packages/ui/src/player.tsx` 沿用共享 cinema 角色。没有接通的收藏、点赞、追更、评论明确禁用，不能据此声称完整 MVP。
- 会话／功能审查：单个按表示 revision keyed 的 Video；暂停、进度、音量、倍速、面板与重播不重建。准备取消、迟到结果释放、换集／质量旧回调拒绝、错误／未加载／后台进度拒绝、完成冻结、明确重新播放与串行历史保持；退出、后台和非当前路由暂停并释放 Rust 64 位十六进制句柄，legacy 路径只读。恢复 seek 在 onLoad 后下一帧执行并再次核对 owner，避免宿主初始 props 覆盖 seek；增加 2× seek 确认容差。只恢复位置或暂停 seek 不算观看，未实际播放零历史写入。
- 自动验证：`pnpm verify` 成功（88 Rust、15 工程、Web 18／desktop 16／TV 17 NSH，三端 check＋build、fmt/lint、codegen:check、release check）。日志 `artifacts/playback/verify-player-reviewed.log`；本批最终源码／文档复验同样成功，见 `verify-player-final-acceptance.log`。原型 12／12 与 `openspec validate migrate-rust-playback --strict` 通过，日志 `prototype-player.log`、`openspec-player.log`。TV headless runner 保留既有构建 warning，不把 headless 视为原生输入验收。本批无依赖变化；B3 记录的 NSH 许可证／未维护安全阻塞仍未解除。
- 正式生产路由的失败 UI 验收：`node tooling/src/player-host.mjs web|android` 各两项通过；日志 `ui-player-{web,android}-final.log` 与 `player-{web,android}/` 截图。包含浅深、Web 1440×1000／1180×780、减少动态效果、准备失败与重试、晚段、锁定集、返回查询与未播放零写入。这是显式 503 fixture，不是解码成功。
- 真实宿主合成解码：`node tooling/src/player-media-host.mjs web|android` 各 1／1 通过，最新日志 `media-{web,android}-reviewed.log`；只服务自制 `t0-a/b.mp4`，API／history 明确 NSH stub。实际暂停稳定、1.5×、Web 静音／取消静音、seek、选集／设置开闭、下一集、完成冻结、重播和两次释放通过。trace 自动核对两个唯一 Video ID（仅换集重建）、rate 1.5 及 Web volume 0；不替代 Rust 持久化或官网证据。Android 退出以系统 Back 逐层返回成功；硬件键盘 Escape 在重播后的失败保留于 `media-android-final.log`，未认定完整遥控通过。
- Rust 实际进程＋官网 Web：精确允许 `http://127.0.0.1:18999`，API 为 18998，独立数据目录 `artifacts/playback/live-browser-data/`；没有放宽 Host／Origin。IAB 正式 1440×1000 实际搜索“重生”→详情→前 3 集竖片首帧和时间推进、暂停、seek、1.5×、1080P 重新准备保留位置／暂停、自动及手动下一集、返回保留查询。第 3 集服务重启前后 Rust 历史均为 9.364238／67.755964 秒，compact=true；后续干净重载续播时实际媒体与 UI 同步推进至 41.836610→57.203662 秒并暂停，Rust 历史对应 57.203662、completed=false。证据 `live-history-{before,after,resumed}.json`、`live-paused-1440.jpg`、`live-seek-1440.jpg`、`live-third-paused.jpg`、`live-return-search.jpg`、`live-resume-verified.jpg`。测试结束已关闭 IAB tab、恢复视口并关闭服务；未输出签名 URL／key／cookie／device ID。
- 官网失败保留：随机测试来源曾被精确 CORS 拒绝（`live-host.log`），改合法固定来源后才验收；两次详情超时和一次无效媒体模型由真实错误／重试恢复。早期曾出现 UI9／媒体0 的不充分续播结果，不以进度条截图判成功；修正恢复 seek 后用实际媒体时间与 Rust 记录重新验证。合成视频与早期准备探测不追溯覆盖这些失败。
- UI 审查／复拍：独立审查 `artifacts/playback/player-independent-review.md` 指出桌面缺少中央播放入口、TV“自动”与裸滑杆不可辨认，已在共享 UI 补暂停中央圆形播放按钮及倍速／清晰度／音量主字段行；不加副说明。同一独立 reviewer 复评分确认两项新增 P2 已解决、未见新增视觉回归，整体 disposition 仍为 fix，已知跨端缺口继续保留。亲自检查 `media-web/paused-{light,dark}.png`、`media-android/settings-{light,dark}.png` 的圆角、字号、间距、对齐、色彩、暂停与设置状态；主构图保持定稿。焦点／pressed／selected／disabled／错误及减少动态效果沿用本批宿主矩阵；系统字体／屏幕阅读器的完整主路径仍未通过。
- 仍未完成：macOS Select 1.5×与完整焦点路径（此前锁屏阻碍 CUA 复核）、macOS 官网观看／重启续播／实际全屏、TV 完整 DPAD／定位确认取消／媒体键／硬件 Escape、跨端系统字号与辅助技术、物理遥控／电视硬解／长播。Web 无已核实公开 fullscreen API，按钮禁用；native 使用公开 currentWindow 模式但交互结果未验。C 原生独立业务、A 字体缩放、安全门禁和其他 MVP 功能继续未完成；不推送、归档或发布。并行品牌文档改动保留，不纳入本批提交。

### B4c · TV 原生输入、模态焦点与生产 APK 回归

- 共享业务：TV 薄入口通过公开 `host.on` 接收 Android `NshView.send` 的有限播放命令；store 在应用生命周期内监听并丢弃浏览页／未知 payload，Player 拒绝非当前、后台和覆盖层输入。幂等 play／pause、媒体下一集、前后 seek、hidden／controls／seek-preview 的确认与取消复用同一会话，不复制宿主业务。EditText 光标、普通输入和 IME composition 保留原生所有权；硬件 Escape 走与系统 Back 相同的逐层返回。
- 原生焦点修复：按公开无障碍 dialog 角色及 expanded Spinner 的 ListView portal 限制焦点；旧 Android 保留命名面板 fallback，但未补验旧系统。NSH 0.5 的 Android SeekBar 实测没有 RangeInfo，使用其公开增减动作，测试观察实际 thumb bounds 位移。方向导航优先同行／同列，避免误入进度 thumb；只恢复一次重新可见层的来源，消耗该层旧来源，保持搜索卡片返回与选集触发器。暂停／唤醒后的失效舞台焦点转向播放按钮，最多一秒寻找，覆盖层不触发此恢复；不调用 NSH 私有字段或方法。
- 最终生产页面 APK：`pnpm test:tv-player` 在固定 Android TV API 34 模拟器、1920×1080、浅／深／深色 1.3 系统字号各 24 项通过，日志 `artifacts/playback/tv-apk-player-final-acceptance.log`。覆盖实际合成媒体解码及暂停稳定、预览 clamp／取消／确认、媒体键幂等、音量调整、选择 1.5× 后菜单关闭的真实 trigger 值、嵌套清晰度 Select／Back 只关一层、设置／选集关闭后的触发器焦点、锁定后继 disabled、最终返回原详情。只服务自制 `t0-a/b.mp4`，API／history 是显式 stub；不是 Rust 官网、独立产品或物理电视验收。请求／实际进度写入另存 `tv-apk/{requests,writes}.json`，已确认实际观看 checkpoint 与两集资源释放。
- 浏览兼容：最终 `pnpm test:tv-browsing` 浅／深／深色 1.3 字号各 16 项通过，日志 `tv-browsing-input-final.log`。包括 composition 保留、退出编辑、搜索／晚段续播、真实失败文案、两层 Back、来源卡片焦点、横向回收列表及第 15 项身份、历史和零进度写入。两套脚本串行运行，恢复 runtime、主题、字号与本次 adb reverse；结束检查 runtime 恢复为原 18997 地址，reverse 无本次规则。UiAutomation 读取前使用固定 API 34 的公开 clearCache，避免缓存旧时钟或旧来源焦点使断言误判。
- 自动验证：完整 `pnpm verify` 通过，88 Rust、16 工程、Web 20／desktop 18／TV 19 NSH，三端 check＋build、fmt/lint、codegen:check 与 release check 均通过；日志 `verify-tv-input-final-acceptance.log`。最终源码由完整 verify、上述两套完整 APK 矩阵及 Android Lint 验证。Web 实际合成媒体回归 1／1，通过两个唯一 Video 宿主和选项 trace，日志 `media-web-tv-input.log`。新增公开 window fullScreen／Escape 回归只在 headless 验证单 Video／单次准备及返回，不等于真实 macOS 全屏；该项仍未勾选。OpenSpec strict 日志 `openspec-tv-input-final.log`。本批没有依赖变化，既有安全门禁阻塞未解除。
- 失败与修复分别保留：旧 UiAutomation clock／focus 缓存、错误 role 属性、Android dialog class 映射和缺失 RangeInfo 均有实际诊断；改用公开 API，没有放宽 seek 断言。`tv-apk-player-{beam,select,selection,final-input}.log` 记录 portal 排除、菜单值误判、初始选项假设及旧来源抢焦点；已以真实 DPAD 定位目标并断言菜单关闭后的值。`tv-browsing-input-reviewed.log` 的 13 项后失败来自返回来源恢复过度收紧，最终 16×3 重跑通过。早期误并发打包造成的 zipalign 缺包单列工具失败，后续全部串行。`verify-tv-input-final.log` 的 no-unsafe-finally 已修复：主验收和逐项清理错误汇总后再抛出，正常 verify 重跑通过；没有关闭规则。
- UI 与独立审查：亲看新 `tv-apk/paused-{light,large-text}.png`、`preview-dark.png`、`settings-{light,large-text}.png`，圆角、字号、间距、对齐、颜色及 selected／disabled 延续定稿；大字号无重叠出屏，设置焦点留在当前字段，暂停焦点环绕播放而非禁用整舞台。预览仍以舞台确认动作显示焦点，确认／取消语义保持。Web／减少动态效果与失败／重试沿用本批回归和 B4b 证据；TV 不制造 hover 行为。独立复审及原问题复评分记录在 `artifacts/playback/tv-input-independent-review.md`，最终 disposition 为 ship，仅覆盖 B4c TV 模拟器输入与焦点；与整体 B 的跨端审查分别记录。
- 仍未完成：本轮 CUA 再次报告 Mac 锁屏；macOS Select／完整键盘焦点／官网观看续播／真实全屏、A 的桌面字体缩放、TalkBack／屏幕阅读器、物理遥控／电视硬解／长播、C 原生独立业务及其他首期功能继续保留。没有自动打开原生 Chrome／进入全屏、读取 legacy 数据、推送、归档或发布；并行品牌文档改动不纳入本批提交。

### C1 · 原生 transport 与 Rust 会话基础

- 已新增平台无关 transport 注入，HTTP 兼容入口保留；原生 adapter 的取消／关闭和 accept 握手阻止迟到准备结果失去所有者。播放准备绑定原 transport 的媒体 origin 及 release 闭包，避免切换配置后错误拼接或释放到新会话；身份拒绝同样经原 transport 释放已准备的合法句柄。生产入口／UI 页面布局和样式本批未改，Player 只改资源释放回调，尚未切换原生默认入口。
- `crates/native-bridge` 直接调用目录、游客 SQLite 与播放核心；仅本机媒体使用 HTTP。宿主公开 data_dir／Tokio 所有权、八个未接收请求上限、幂等关闭、持久写入边界和错误语义见该 crate README。media-only 路由不暴露业务／health，保留 Host／Origin／Range 和原媒体限制。
- 定向验证：原生 Rust 七项夹具测试通过（`artifacts/playback/native-bridge-tests.log`），包括 HTTP 错误与生成 domain DTO 对照、重开续播记录、损坏文件保留、已开始准备的取消、未接收／迟到完成媒体释放、接收后媒体保留、容量与监听停止、GET／HEAD 真实 Range 字节和来源／业务端点拒绝；Clippy 日志 `native-bridge-clippy.log`。均为显式合成 loopback 上游，没有官网或用户账号写入。首轮测试误预期非数据库字节返回 DATABASE_INVALID，实际沿用既有 STORAGE_UNAVAILABLE；修正测试预期，未改变／放宽数据库失败处理，原文件字节断言保留；首轮原始日志被重跑覆盖，仅保留本段诊断记录，不重构造失败输出。
- 三端 transport 回归 check／build／test 已通过（`native-transport-{check,build,tests}.log`，Web22／desktop20／TV21）；覆盖新 adapter 迟到取消、结构错误码、关闭幂等与 origin 隔离，以及既有浏览／播放行为。新增同源 release 和身份拒绝回归后，完整 `native-foundation-final-verify.log` 通过（95 Rust／16 工程／Web22／desktop20／TV21，三端 check＋build、格式／lint／契约／release check）。最后补充任意外部媒体地址不转发 release 的断言后，三端补跑记录分别为 `native-release-final-tests.log` 和 `native-release-final-desktop-tv.log`；没有把 headless 当作真实宿主验收。
- 仍未完成：真实 mixed 导出与原生入口装配、默认开发／打包切换、TV 去电脑 API／reverse 后真实业务和重启续播、macOS 实际宿主以及此前 A／B 字体／全屏／辅助技术／物理设备缺口。并行品牌文档未纳入；未推送、归档或发布。

- 安全检查：`pnpm security` 实际执行 Cargo deny，仍由既有 NSH 间接依赖 advisory／license 阻塞退出（`native-foundation-security.log`），未放宽规则；因此脚本后面的 pnpm audit 未执行，已单独运行且通过（No known vulnerabilities found），日志 `native-foundation-pnpm-audit.log`。本次 Cargo.lock 只增加自有 native-bridge 包及其已锁定依赖关系，未升级第三方版本。

- 独立复评：`artifacts/playback/native-foundation-independent-review.md` 最终 disposition 为 ship，仅 C1 基础切片；所有权修复和记录问题 resolved。没有新可见布局改动，审查确认 Player 仅释放回调变化；真实 mixed 导出／声明／显式 dispose 仍列任务 2.1，不由 Rust 内部测试或 TS fake 替代。

### C2.1 · Desktop mixed／TV 注册与真实导出生命周期

- Desktop 新增薄 native crate，TV 在既有 native module 注册同一共享 bridge 并保留 T0；生产 App 本切片仍经 HTTP，不改页面、主题或布局。两端 `pnpm check` 生成实际 NativeCore／NativeSession／NativeCall 声明，open、start、result、accept、cancel、close／dispose 与平台无关 adapter 相容，生成目录不提交。声明／首次 check 见 `artifacts/playback/native-mixed-check.log`。
- 四项真实 mixed 测试使用公开 NSH Engine／Bundle／HostChannel，在 QuickJS 中实际 import 并调用共享导出：宿主私有目录 SQLite 写入／重开；缺目录与损坏库明确失败且原字节保留；pending result 的 cancel、单独 call.dispose、session.dispose 均 settle 499；未接收媒体 dispose 释放、accept 后保留、session.close 释放并拒绝新业务。测试模块只在 cfg(test) 注册合成 loopback 上游，不进入生产导出；十秒期限与 engine error 通道明确失败。日志 `native-mixed-tests-first.log`，收紧测试 feature 后四项仍通过 `native-mixed-minimal-engine-tests.log`。
- 依赖核对：初版完整 js 引擎 feature 带入 RSA 预发行版并新增 RUSTSEC-2023-0071，见 `native-mixed-security.log`；尝试升级 rsa 0.10.0 被上游所需 sha2 feature 不兼容拒绝，见 `native-mixed-rsa-update.log`。最终改用锁定 NSH 公开 js-core feature，保留同一真实 QuickJS／native 调用，移除测试未使用的 crypto／zlib 模块。最终根锁文件新增 49 个包版本（含自有 Desktop crate），原有版本未删除或替换，无 rsa、nsh-testing、nsh-bundler 或 wgpu；不 patch 上游或放宽门禁。
- 最终 `pnpm security` 仍失败（`native-mixed-minimal-security.log`）：仅剩既有 bincode／ttf-parser 停止维护及 Zlib／CDLA-Permissive-2.0／LLVM-exception 许可证阻塞，新增 RSA 漏洞已不在最终工作区依赖图；bans／sources 通过。安全脚本因此未执行后面的 JS audit，已单独运行通过（No known vulnerabilities found，`native-mixed-pnpm-audit.log`）。功能通过不代表安全门禁或发行通过。
- 真实 engine 测试不替代生产入口原生默认装配、开发／打包模式、无电脑 API／reverse 的 TV 官网业务／重启续播、macOS 实际宿主、A／B 字体／输入／全屏／辅助技术与物理设备验收；这些任务继续开放。并行品牌文档保留，未推送、归档或发布。

- 最终完整 `pnpm verify` 通过：99 Rust／16 工程／Web22／Desktop20／TV21，三端 check＋build、fmt/lint、codegen:check 与 release check，日志 `native-mixed-final-verify.log`。先前完整 js feature 的运行保留 `native-mixed-initial-verify.log`，不能代替最终依赖图验证；新增文档格式检查 `native-mixed-final-fmt.log`、OpenSpec strict `native-mixed-openspec.log` 均通过。

- 独立审查 `native-mixed-independent-review.md` 最终两项均 resolved、disposition 为 ship，仅覆盖 C2.1；未独立操作宿主。新文档与任务进度最终格式／strict 复验见 `native-mixed-docs-fmt.log`、`native-mixed-final-openspec.log`。

### C2.2／C2.3 · 原生生产入口、关闭握手与显式预览模式

- Desktop／TV 薄入口均注入同一个 NativeApp 与公开 NativeCore.open；初始化前只显示既有 Notice／Surface，成功后挂载同一业务 App。失败保留原数据和既有错误文本，提供单一重试，不回退 HTTP。未挂载或卸载后迟到的 session 立即 dispose；HTTP preview 明确选择且不打开 native core。Web 保持 HTTP。
- 正常 JS 卸载先同步收集 Player 最终 checkpoint，再等待所属 store 写队列，finally 关闭 native transport。队列捕获创建 store 时的 transport，换全局配置不会把旧写入送到新 core。四项新增三端测试包含启动失败／重试／关闭、迟到 session、真实 store＋progressSession 的一秒阻塞写入→五秒最终 checkpoint→原 transport 提交→关闭，以及非法模式不回退。队列测试的 commit 由受控 transport 驱动，不能当作真实 mounted Player 的 SQLite 重启证明；OS 强杀／VM 直接销毁仅保障已提交记录，不承诺执行完 JS drain。
- 开发／打包默认 Desktop／TV native，Web http-preview；T0 仅 TV 显式可选。runtime JSON 严格拒绝非法字段／类型，兼容旧 origin-only 预览配置；setup/check 保留合法配置，dev/package 覆盖为本次模式，HTTP 打包必须明确 origin。nativeDev 只拥有本次 NSH 子进程；新增失败退出与 SIGTERM 清理断言。package 先清当前 `.nsh/out`，发行 workflows 显式选择相应模式，TV 启动器名称改为“红果”。没有更改发布权限或执行发布。
- 最终 `pnpm verify` 成功，99 Rust、18 工程、Web 26／Desktop 24／TV 25 NSH，三端 check＋build、格式／lint、codegen:check、release check 通过；日志 `artifacts/playback/native-entry-final-verify.log`。独立工程重跑为 `native-entry-final-tooling-2.log`。没有 Rust DTO 或依赖变化，本批未把 C2.1 的既有未维护／许可证安全阻塞改写为通过；完整安全复验仍属于 C3 收尾。
- Android 启动 UI：`pnpm test:tv-native-startup` 的 NSH 实际开发宿主，在 1920×1080、字号 1.0／1.3 下捕获浅深加载／失败与重试进入共享 App，两组通过；日志 `native-entry-startup-android-final.log`，截图 `native-startup-android/`。`pnpm test:tv-native-retry` 另外使用生产 MainActivity／TvRemote 和合成失败 core，在浅／深／深色 1.3 三组通过公开无障碍焦点断言、实际 DPAD Down／Center 重试；日志 `native-entry-tv-startup-remote-retry.log` 与 `native-startup-remote/` PNG／XML。两者均为合成启动，不是官网或独立原生业务验收。
- 既有 TV APK 回归串行通过：显式 HTTP browsing fixture 16×3，日志 `native-entry-tv-browsing-final.log`；显式 HTTP player fixture＋自制媒体 24×3，日志 `native-entry-tv-player-final.log`，包含遥控、输入／焦点、Select、真实时钟 checkpoint 与释放。脚本恢复主题、字号、runtime 和本次 reverse。亲看启动浅深／大字、遥控焦点、搜索／详情及播放器暂停／设置截图：圆角、字号、间距、对齐和颜色延续现有 ui，未见重叠或出屏；无 TV hover，通过范围及 pressed／动效／辅助技术边界见 `native-entry-ui-review.md`，不把静态截图当作逐帧或屏幕阅读器通过。
- 最终 native 包：macOS arm64 `.app` 与更新归档构建成功（`native-entry-desktop-package-final.log`），归档 SHA256 `0f788ff68d0d93a20305690d64b06fafa0c2c4dd43c34fa890c1112ff6a03fc3`；TV arm64 debug APK 构建／Android Lint 通过（`native-entry-tv-package-final.log`），103385782 bytes，SHA256 `a3067f80306ce9754fca1630e8f17c7975fcccb35eded44dc91af16bf2459217`。`native-entry-{desktop,tv}-bundle-check.log` 检查 native 配置、当前生命周期代码、包内 bytecode／metadata、无默认 18997 地址／T0／旧探针素材。Desktop package 的精简 bytecode 与 debug out 本来不同，归档核对使用实际 `.app` 内容；未把两者直接相等作为标准。构建包不等于独立业务通过，未启动 Mac GUI。
- 原始失败保留：初次 Desktop package／Android startup 因电脑磁盘满失败，日志 `native-entry-desktop-package-first.log`、`native-entry-startup-android-first.log`；只清本仓库可重建 Cargo debug／incremental 缓存，保留源码、用户数据与证据。Android 编译重跑后因 2.9 GiB 开发宿主安装空间不足失败（`native-entry-startup-android-retry.log`）；测试命令 strip debuginfo 后约603 MiB，安装与两组行为通过（`native-entry-startup-android-stripped.log`）。开发宿主 Tab／Enter 未激活重试的失败保留为 `native-entry-startup-android-keyboard.log`，后续生产 TvRemote 的实际 DPAD 矩阵另证通过。临时 fixture 放在 `.nsh/` 时 package 无法找到根 applicationId，见 `native-entry-tv-startup-remote.log`；改为独占创建、finally 删除的根级临时入口后通过，没有改变默认生产入口或放宽断言。
- 仍未完成：C3 无电脑 API／reverse 的原生官网观看、重启已提交位置续播、后台恢复；真实 macOS 输入／Select／全屏／观看、A/B 系统字号／辅助技术、物理遥控／电视硬解／长播，以及其余首期功能与安全／正式发行门禁。本批合成 APK 不替代以上项目；并行品牌文档保留，不推送、归档或发布。
- 独立复评 `native-entry-independent-review.md` 最终三项均 resolved，disposition 为 ship，仅 C2.2／C2.3；已亲看加载／浅深／大字与实际遥控焦点截图并核对 XML，未独立操作设备。最终任务进度 6／9 与 OpenSpec strict 通过，见 `native-entry-apply-progress.json`、`native-entry-openspec-strict.log`；文档格式复验 `native-entry-final-docs-fmt.log` 通过。C3／macOS／安全发行边界没有据此关闭。

### C3 启动修复 · Android 媒体文件锁

- 真实 native business APK 在无电脑 API、无 adb reverse 的 TV API 34 模拟器首次启动失败，显示“播放服务繁忙，请稍后重试”。最小 Android Rust 探测确认 std File::try_lock 返回 Unsupported（`artifacts/playback/native-business-tv/lock-probe.log`）；原错误、截图与树保留为 `initial.png/xml`，没有删除应用数据库绕过故障。
- Unix 三处媒体 registry／instance／stale lease 锁改用已有锁定 rustix 1.1.6 的安全 flock 接口，non-Unix 保留 std；只有 WouldBlock 映射容量，其余映射存储失败。描述符继续持有锁，存活目录与无关目录保护不变；新增竞争／释放后重试回归。Cargo.lock 只增加 core→rustix 依赖边，没有新增、升级或删除包版本。
- 媒体 store 13 项通过（`media-lock-tests-first.log`）；完整 `pnpm verify` 成功，100 Rust、18 工程、Web26／Desktop24／TV25，三端 check＋build、fmt/lint、codegen:check 和 release check 通过，见 `media-lock-final-verify.log`。`pnpm security` 实际执行后仍因既有 bincode／ttf-parser 未维护和六项 license 拒绝失败，bans／sources 通过，未放宽门禁（`media-lock-security.log`）；单独 pnpm audit 为 No known vulnerabilities found（`media-lock-pnpm-audit.log`）。non-Unix 错误转换仅编译接口核对，不算 Windows 实测。
- 修复后的 TV native debug APK 构建／Android Lint 成功（`media-lock-package-final.log`），SHA256 `c91be35dcdb1f8addfb9b2276780db8cb3440f930805c850ebc053a89ad2e405`。实际已安装 base.apk 摘要一致、native runtime／生产入口 bytecode 一致且无18997／T0／合成启动入口，adb reverse 为空（`media-lock-installed-proof.log`）。安装启动进入共享空历史首页，截图／树为 `media-lock-ready.png/xml`，亲看焦点、字号、间距、对齐、颜色与既有布局；本修复没有新增视觉样式，浅深与大字启动状态继续见 C2 的合成宿主矩阵。
- 此切片只解除 Android 原生初始化阻塞；官网搜索、真实媒体、切集、后台和重启续播尚未据此验收，任务3.1仍开放。macOS 锁屏、辅助技术、物理电视、既有安全发行门禁与其他 MVP 功能继续保留；未推送、归档或发布。
- 独立审查 `native-business-tv/media-lock-independent-review.md` 结论为 ship，仅限文件锁初始化修复；已核对失败／ready 截图、实际安装摘要与功能证据。未独立操作设备，也未证明 Android 数据内容前后逐字节或跨进程锁专项；官网观看等 C3 行为继续单独验证。

### C3 网络修复 · Android HTTPS 信任策略

- 默认原生 APK 能启动，但真实中文搜索显示“核心请求失败”。Android 独立 Rust 探针确认 reqwest 默认的 rustls-platform-verifier 因 JVM 未初始化 panic，见 `artifacts/playback/native-business-tv/tls-probe-3.log`；原 UI 和日志为 `watch-dark-second-current.png`、`watch-dark-second.log`。没有将网络失败归为文件锁、目录协议或播放器故障。
- catalog／playback identity／media 三处构造复用私有 `http::client_builder`；仅 Android 采用标准 rustls ClientConfig 与锁定 webpki-roots 1.0.12 的公共根证书，保留证书链及域名校验，没有自定义放行 verifier。非 Android 保持 reqwest 默认信任策略，原 timeout／no_proxy／redirect／重试边界不变。Android 此后不会自动采用系统、用户或企业信任库的增删，根证书更新须随依赖和应用更新维护；不是完整复刻 Android 平台策略。
- Cargo.lock 只增加 core→已有 webpki-roots 的依赖边，没有新增、删除或升级包版本。公开自签 localhost end-entity DER 仅 cfg(test) 使用，不加入生产 roots，也不提交私钥；标准 WebPkiServerVerifier 明确拒绝 UnknownIssuer，见 `tls-policy-test.log`。首次 CA fixture 不符合目标断言，改为 CA:FALSE serverAuth 后通过，未放宽断言。
- Android 使用生产 helper 的固定探针首次握手 EOF 保留为 `tls-probe-fixed.log`；再次取得 HTTP 403（`tls-probe-fixed-retry.log`），只证明该次 TLS 请求成功。当前实际已安装 native APK SHA256 `140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`，包内 bytecode SHA256 `0c8daae65bb084d2f16f66352fb4ec713bec89e66e62c2ed3598fd2a6e410a30`，见 `installed-native.json`；已安装 APK／当前文件及 bytecode 一致，电脑 API 停止、reverse 为空。真实搜索、详情、官网媒体、后台恢复和第二集观看／重启续播另有第六轮三组 18＋7 项及六次 SQLite 核对证据，见下节；TLS 探针不代替这些业务断言。
- 最终完整 `pnpm verify` 通过：101 Rust、21 工程、Web26／Desktop24／TV25，三端 check＋build、格式／lint、codegen:check、release check，见 `tls-final-verify-3.log`。初次工具 lint 失败与后续修复运行分别保留为 `tls-final-verify.log`、`tls-final-verify-2.log`。`pnpm security` 仍有既有两项未维护与六项许可证拒绝（`tls-security.log`），bans／sources 通过，未放宽门禁；单独 pnpm audit 无已知漏洞（`tls-pnpm-audit.log`）。DTO 未改。

- 独立复评 `native-business-tv/tls-independent-review.md` 最终 disposition 为 ship，仅 Android HTTPS 修复范围；已亲看三主题实际内容／错误截图并核对当前安装、最终验证与业务证据，不代替验收工具审查、完整C3或安全发行通过。

### C3.1 · TV 原生官网观看与持久续播

- 新增 `pnpm test:tv-native-business`：唯一固定 Android TV API34 模拟器、native 打包／安装、已安装 APK 与包内 bytecode 摘要检查、电脑 API 18997 关闭和 adb reverse 为空。生产界面、真实匿名官网目录／媒体与宿主私有 SQLite；没有 fixture、旧客户端数据、清库或新增页面。截图和树通过公开 UiAutomation 获取，输入使用实际 InputConnection、DPAD 导航与媒体键；搜索提交及指定选集使用无障碍 click，不声称这两步为纯遥控全链路。既有 DPAD fixture 验收保留 B4c。
- 最终第六轮 `artifacts/playback/native-business-tv/native-business-sixth.log` exit 0：浅色／1.0、深色／1.0、深色／1.3 均为 watch18＋resume7，包含实际首集时钟推进、暂停稳定、从零定位20秒后继续解码、Home后台停止、前台重新准备后继续解码、真实第二集、逐层返回与来源焦点、历史 UI、进程强停／新进程恢复。重启前保存 ≥22 秒，onLoad 后八秒内实际媒体推进至原位置附近，再次推进，排除从零自然播放追上记录的假阳性。
- 六次强停后的新鲜 SQLite／WAL／SHM 快照（每轮 mkdtemp）与 UI 观测相符：light watch22.984／resume26.011；dark watch22.968／resume26.03；large-text watch22.983／resume26.167，均同一真实剧目第2集、未完成。证据 `checkpoint-{light,dark,large-text}-{watch,resume}.json` 与对应 sqlite 唯一目录；只读取停止进程后的副本，不修改设备库。历史中未保存完整评论或选集详情。
- 有限重试按独立 watch／resume phase 各最多一次，不重置60秒总期限，错误截图 `native-*-playback-error-{1,2}-*.png/json`；第六轮 light／dark watch 首集各重试一次恢复，large-text 与三个 resume 没有 RETRY，不能称首次零故障或稳定性认证。错误文案“视频来源数据无效”有多种核心原因，不仅凭 UI 定性根因。早期失败完整保留：首轮准备中按暂停过早（`native-business-first.log`／`native-first-pause-too-early.png/json`），第二／三轮后台测量窗口或准备门禁不足（`native-business-second.log`、`native-business-third.log` 及各自树／截图），第四轮视频来源错误（`native-business-fourth.log`、`native-fourth-upstream-error.png/json`），第五轮 watch18和SQLite成功而resume准备失败（`native-business-fifth.log`、`native-resume-upstream-error-{1,2}-light.png/json`）。没有因这些失败改动生产 Player 或放宽时钟／身份／证书校验。
- 验收工具独立审查要求的五项已修：短续播假阳性、信号跳过恢复、旧WAL混入、缺省字号精确还原、预检失败误停用户应用。命令拥有自己的进程组，SIGINT／SIGTERM转取消，先停止命令树再执行恢复；三个工程测试通过 `owned-command-tests.log`，对实际已开始安装／instrument运行发送SIGTERM，非零退出且runtime逐字节、主题／字号恢复、应用停止（`native-interrupted-run.log`、`native-signal-check.log`）。Windows taskkill分支未实测；SIGKILL无法保证清理。第六轮正常结束后实际读取为night=yes、font_scale=1.0、native runtime、reverse为空、应用已停；本轮未额外保存启动前原值的外部快照，不声称有独立逐字节前后比对。
- UI亲看浅深／大字的搜索、详情、暂停／第二集、历史和重启续播截图（`native-{watch,resume}-*-{light,dark,large-text}.png/json`）。圆角、字号、间距、对齐、颜色、焦点和禁用态沿用定稿共享ui，未见控件重叠或出屏；大字号长标题按既有双行省略，完整名称可从详情和无障碍获取。dark搜索截屏时部分图片尚在加载，不能据该帧声称海报已加载完成；详情、light／large-text与真实视频画面另有完整内容。深色续播详情PNG仍是选集加载态而其JSON已就绪，两者分次采集、不保证同一渲染瞬间；已加载详情由watch detail／return另证，续播由paused、日志和SQLite另证。无TV hover；pressed逐帧、完整动效／减少动态效果、真实屏幕阅读器未在本批重新验证，不由静态截图替代。播放控件为既有B4定稿，本批未新增视觉布局。
- C3.1只覆盖该模拟器的上述独立业务；真实macOS输入／Select／全屏／观看、A/B其余系统字号／辅助技术、物理电视／遥控／硬解／长播、安全与正式签名发行仍开放，首期MVP尚未完成。不推送、归档或发布；并行品牌文档改动继续保留。

- 独立复评：`native-business-tv/native-business-harness-review.md` 最终通过，六份新鲜SQLite副本均另经只读核验；`native-business-tv/native-business-ui-review.md` disposition为ship，仅C3.1模拟器已观察范围，亲看27张截图并核对树、日志与checkpoint。来源焦点由运行断言和其他focused截图支撑，return截图本身仍是详情，不单独当作来源搜索焦点证明。任务3.1据此完成，3.2／3.3仍开放；完整C3与MVP未关闭。

### macOS · Select 原生键盘确认修复（2026-11-14）

- 用户解锁后，真实 macOS 控件宿主首轮两组都暴露 End→Enter 只关闭菜单、未确认高亮项的问题，见 `artifacts/playback/mac-unlocked/controls-first.log`。NSH 0.5 macOS 默认 Press 激活先于开放 Select 的 Listbox Enter，不能用 headless 通过覆盖该失败。
- `packages/ui` 的内部 SelectFocus 只在 macOS 菜单开放期间让非按压内容持有键盘；继续复用 base Select 的导航／确认／取消／恢复。普通 Button 不增加节点或停靠，其他宿主不改变焦点策略；focus-within 使用既有 ring／cinema-focus。播放速度和集数区间共用此适配。
- 原生回归 `controls-focus-fix-third.log`、`controls-focus-fix-final.log` 各两组通过，覆盖减少动态效果开／关、Home／End、Enter／Space、双向 Tab、Escape／恢复及真实受控集数区间值。第二轮在运行中修正了预览夹具 value=0／空 onChange，导致两组使用不同夹具；第三轮及最终轮均为统一版本，不把第二轮计为通过。
- 实际 CUA 在 1180×780 合成控件包完成 End→Enter 切换至 1.5×，AX 仍为有名称的单 combo 并恢复焦点，边框可见，见 `fixed-end-enter.png/txt`。接续手动 Home 检查时工具报告 Mac 再次锁屏；未进入真实全屏、未打开原生 Chrome，未宣称后续手动操作通过。
- `artifacts/search-pagination/verify-second.log` 完整 verify 通过：101 Rust、21 工程，Web29／Desktop27／TV28，含三端 check／build、格式、lint、生成契约与发行基础检查。独立源码复评 `select-fix-review.md` 与 18 张原生图的 UI 审查 `select-ui-review.md` 仅针对本修复；证据根目录为 `artifacts/playback/mac-unlocked/`，控件宿主图在 `artifacts/playback/controls-macos/`。
- 圆角、字号、间距、对齐、颜色与状态沿用设计，浅深与减少动态效果未见本次布局回归。辅助技术、系统大字号、逐帧动效、真实 Desktop mixed 官网观看／重启续播、物理电视与安全发行仍未验证／未解除；A/B/C3.2 不因此整体关闭。此前安全阻塞保留；未推送、归档或发布。

### D1 · 搜索结果分页与阅读位置（2026-11-14）

- 共享 store 接通已有官网 `source=web`／`next_offset`，首屏与追加都使用挂载时捕获的 transport；单请求、推进游标校验、按 series_id 首次顺序去重。查询／重搜／卸载取消所属追加，忽略 abort 的迟到响应也不能回写。失败保留列表和游标，重试仍请求原页，不自动追页。
- 定稿四列网格／TV 横向内容行、海报、身份锚点和详情返回保持复用。分页按钮在用户按下时同步获得焦点；pending 保留同一停靠并由 store 拦截重复请求，错误只显示正文、原按钮变“重试”。末页完成没有异步强制聚焦，等待期间移开的输入焦点不会被抢回。
- TV 实测发现末页移除时，既有恢复策略会选择第一个 selected 导航；`TvRemote` 现在只在原控件已失效时使用有界的最近可用源，仍受当前作用域与 View／身份约束，保留覆盖层和已有原生焦点优先级。海报身份优先取现有 testID（Android 公开 viewIdResourceName），不以同名标题判断剧目；无 ID 的控件沿用既有可访问名称／文字。未额外构造重复标题回收专项场景。
- 三端新增行为覆盖同游标失败／重试、重复身份、非法游标、重复调用、换查询／重搜／移除、忽略取消与 transport 替换、追加详情返回。`artifacts/search-pagination/verify-post-review.log` 在最终身份增量后完整通过：101 Rust／21 工程／Web29／Desktop27／TV28，含三端 check＋build、fmt／lint、codegen:check 与发行基础检查；无 DTO 或依赖变化。
- Web 实际宿主 `host-web-seventh.log` 7/7：1180×780、1440×1000 浅深四组分页，1180 使用减少动态效果；失败后直接 Enter 重试、追加后详情返回、三组终页 pending 转移到输入后实体键 x 仍输入；1440 深色在终页持焦后 Shift+Tab 聚焦当前视口第 69 项，Enter 打开相同身份。该宿主使用 NSH 的后台浏览器测试器，没有打开原生 Chrome 窗口。图在 `artifacts/browsing/web/pagination-*.png`。
- TV 的 `host-tv-third.log` 浅色／深色／深色字号1.3 各29项（87项）通过；末页恢复第64项后可遥控进入新增第65项并回到64。旧播放器 `tv-player-regression.log` 同三组各24项（72项）通过。收紧稳定 ID 后重新串行验收与原 APK 恢复记录在 `tv-final-regression.log`／`tv-final-restored.json`；图在 `artifacts/browsing/tv/pagination-*.png`。这些是显式电脑 HTTP fixture，不能计作 C3 原生独立业务、真实官网播放或物理电视验收。
- 官网 smoke `website-smoke.log` 独立调用 Rust：offset0／1 各10项，第二页8个新增身份，游标推进0→1→2；第一项166集详情可读。只证明当时匿名官网目录分页与详情，不证明账号或实时内容始终可用。探针与样本说明同步，未运行 Go。
- 亲看 Web 两尺寸浅深与 TV 浅深／大字的 pending、错误、追加、返回、终页焦点：圆角、文字层级、间距、对齐、颜色与选中／焦点沿用定稿；Web hover／键盘与 TV DPAD 有对应证据，TV 无 hover 要求；追加不重播整表动画，减少动态保持直接反馈。独立功能／UI 报告为 `function-review.md`、`ui-review.md`，均为局部 ship；UI 复核亲看33张分页图，1440两张错误图处于入场中间帧，不能作为稳定态对比度通过证据。OpenSpec strict、独立 codegen:check 均通过。早期失败原始日志保留，未用新增自动重试隐藏断言失败。
- macOS 实际分页、VoiceOver／TalkBack、物理遥控／电视／解码与正式发行仍未验证；此前 C3.2、安全门禁及 D/E/F/G 其余 MVP 功能继续开放。本批未推送、归档或发布；并行品牌文档保留。

## 2026-11-14 D2 · 本机最近搜索

- Rust 在同一游客 SQLite 所有者中保存最多10条关键词，重复置顶，拒绝控制字符、超过80字符／100 UTF-16单位的输入；v1→v2迁移先校验观看历史与完整性再提交，失败不推进版本、不留下新表。读取、添加和清空均使用严格生成契约，HTTP／native错误一致，媒体监听不开放业务路由；不导入旧数据、不发送本机记录给上游。
- 共享找剧页沿用定稿最近搜索与清空操作，结果页“清除搜索”只返回发现态。提交搜索不等待关键词保存，失败保留最后成功快照与准确重试动作；写队列串行、shutdown排空，取消／revision／dispose阻挡迟到读取。独立功能审查发现的迁移提交顺序、A成功B失败丢快照均已修复并新增直接回归。
- Web 最终 `host-web-fourth.log` 为11/11，1180×780与1440×1000浅深验证关键词复用、长词截断、清空失败／重试、输入焦点和不抢焦、分页／详情返回；最近词通过真实Tab→Enter复用，1180使用减少动态效果。macOS `host-macos-first.log` 为10/11：D2四组全部通过，D1末页1440深色的Shift+Tab→Enter未打开详情，保留原失败及截图，不记整套Mac通过或关闭该焦点缺口。
- TV 最终 `host-tv-fourth.log` 浏览36×3=108、播放器24×3=72通过，覆盖浅深和字号1.3。关键词复用使用DPAD并执行真实搜索，清除查询／清空／重试使用原生Accessibility ACTION_CLICK；不声称后者已全部DPAD到达或直接证明清空后的输入持焦。早期三轮失败保留：两次旧焦点路径／旧编译夹具，一次清空跨主题保留后空列表路径不同；修正真实路径后仍保留原结果与焦点断言。
- 原native安装包恢复后重新从设备拉取并比对，SHA256为`140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`；设备恢复night=yes、font_scale=1.0、reverse为空。`tv-restoration-verified.json`为实际字节与状态核对，非仅备份声明；运行配置恢复，未修改持久观看数据。
- 圆角、字号、间距、对齐、颜色与状态复用现有ui；Web／Mac各16张最近搜索图、TV9张图分别复核。hover／pressed／focus／disabled与reduceMotion沿用Button，清空前保留内容、成功后自然重排，无逐词入退场或异步抢焦；截图不能证明逐帧动画、辅助技术或物理输入。功能／UI独立审查位于`artifacts/recent-searches/{function-review,ui-review}.md`。
- 最终 `artifacts/recent-searches/verify-final.log` 完整通过：106 Rust（0跳过）、21工程测试、Web33／Desktop31／TV32，含新增A成功B失败后保留快照专项、三端check／build、格式／lint／生成契约与发行基础检查；`codegen-final.log`、OpenSpec strict及最终diff检查通过。未新增依赖，不把verify当作既有安全阻塞已解除。
- 本批验收为本地夹具宿主与隔离Rust持久化测试，未进行真实Mac mixed独立官网观看／重启续播、VoiceOver／TalkBack、物理电视／遥控／解码或正式发行。D1 Mac焦点、C3.2及其余D/E/F/G、安全门禁（既有2项停止维护与6项许可证阻塞）继续开放；未推送、归档或发布，并行品牌文档保留。

### D1 · macOS 末页焦点修复验收

- 实现：仅 macOS 的可移除独立分页操作观察实际 focus/blur；仍持焦的 owner 清理时同步交回现有搜索输入，并核对活动搜索页、同一查询、ready、成功末页和无追加错误。普通按钮／Toolbar 继续使用 BaseButton。输入位于 List 外，交接不重置阅读位置；之后 Tab 进入结果是用户主动导航，可触发原生焦点可见区域调整。
- 完整 `pnpm verify` 通过（`artifacts/mac-pagination-focus/verify-first.log`，exit 0）：Rust 106 项、0 skipped，tooling 21 项，Web／Desktop／TV UI 36／34／35 项，三端 check/build、fmt、lint、契约和发行元数据基础检查通过。`codegen-first.log`、`openspec-first.log`、`fmt-first.log` 通过；不含安全／签名／正式发行放行。
- macOS 图形宿主第四轮 16/16（`host-macos-fourth.log`）：两种批准尺寸浅深与减少动态、失败后 Enter 重试、追加详情返回、最近搜索回归。实际确认 Enter／Space、按 role 查询的禁用 press 拒绝、单 Tab 停靠、失焦不交接；1440 深色末页输入可继续输入，再六次 Tab／Enter 打开结果。无既有卡片 selection、箭头改变行内 roving stop 和 pending 移至卡片后终页不抢焦均通过。真实 Search 专项最终 1/1（`search-focus-macos-final.log`）还覆盖换查询／刷新／导航／owner 移除、新查询复用分支后再次末页交接。固定截图在同目录 `macos/`。
- Web 图形宿主最终 15/15（`host-web-final.log`），两种批准尺寸浅深及既有原生键盘恢复通过，固定截图 `web/`。Mac 专属 Search 交接专项仅在实际 macOS 注册，浏览器不会因 open 的 platform 参数启用 macOS 生产分支。TV fixture 浅／深／字体1.3三组浏览108项、播放器72项通过（`host-tv-first.log`）；最近词使用 DPAD，清除／重试等仍为 Accessibility ACTION_CLICK，不扩大为全链 DPAD。恢复后重新拉取设备 APK 比对实际 SHA256 `140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`，night yes／font_scale 1.0／reverse 空，与保存状态一致（`tv-before.json`、`tv-restored.json`）。
- 原始失败保留：Mac 第一轮测试读取运行器平台走错 Web 分支，第二轮五次 Tab 落到清除搜索；显式 host 与实际六次 Tab 后，第三轮末页已过但新增夹具在完成时点击驱动按钮先失焦，第四轮改为先预约驱动、再聚焦真实操作后全过。早期 headless type/paste 不可靠地产生 blur，已以真实 Shift+Tab／逐键输入替代，后续控件专项2/2及完整 verify 全过。Web 首轮误注册 Mac 专项导致15/16，按实际 host 限定后最终15/15；这些失败均不记通过。
- 独立功能与 UI 审查报告在 `artifacts/mac-pagination-focus/{function-review,ui-review}.md`。按钮半径、字号、间距、对齐、浅深颜色与 hover／pressed／selected／disabled／loading／error／focus 沿用同一 Button，未新增标签、布局或位移动效。图形宿主行为和截图不等于独立鼠标设备、VoiceOver／TalkBack、逐帧动画或物理遥控验收。C3.2 真实 Mac 独立官网观看／重启续播、字体缩放、辅助技术、实际全屏、安全阻塞及正式发行继续开放。

### D3 · 匿名搜索发现核心与 API（2026-11-14）

- 本批只完成 Rust 匿名 public-plan、Medusa 签名、受限发现 DTO 与 HTTP/native `/api/v1/search/discovery`，没有改共享页面、原型或 NSH 控件；消费端发现 UI、输入联想／推荐频道仍开放。注册使用独立临时设备；只重新构造 install_id Cookie，不发送账号、历史、搜索词或注册返回的其他 Cookie，不借用播放身份／失败冷却。
- 固定合成签名向量覆盖 IV／SM3／F13／protobuf／Helios／Gorgon、四个 AESV3 分支及最终 Medusa。只复用匹配的 crate-private 原语，既有播放测试保留。来源文件哈希与向量说明在 `contracts/fixtures/discovery/`；JSON 仅格式化，值与只读参考一致，未运行 Go。
- 解析只访问已知 wrapper／cell，精确保留数字 ID、原始排名和关键词非播放身份；每类榜最多6条、建议最多4条。2MiB body／字符串预算、深度8、单数组128、遍历1024、封面HTTPS域名白名单均有回归。独立功能审查发现 code=0 内部 error_code 失败会被误当空结果，已修复并补回归；失败不回显上游正文。
- 单一6秒期限覆盖锁等待、注册和 plan；实例 clone 共享缓存并合并并发读取，有内容600秒，空／错误60秒。锁等待超时不改其他请求的缓存；持锁抓取超时缓存为稳定错误，drop／abort不写取消缓存。fixture 验证注册／plan取消关闭连接与后续重试、超时缓存到期恢复、签名请求隐私，以及HTTP/native成功／403／500响应一致；非空query、POST／native body和HTTP GET body均在联网前拒绝。
- 显式 Rust 匿名探针 `discovery_probe -- --anonymous-live` 成功：3条建议、1个榜单（短剧0、漫剧6），仅打印计数，不记录原始数据／身份；见 `artifacts/search-discovery-core/live-probe-first.log`。这是一次真实可用性证据，不代表所有推荐频道、账号或真实宿主消费已验收。
- 自动验证与独立审查证据集中于 `artifacts/search-discovery-core/`。首次 verify 仅因复制向量的JSON格式失败，修正空白后重跑，未改向量值；clippy-first 因shell未发现Cargo未执行，随后使用固定工具路径且零警告通过。完整工程最终状态见本段下方记录。
- 本批没有可见UI变化，UI审查仅核对范围／定稿后续映射，未重跑鼠标、TV或安装包，不计为新增宿主验收。C3.2真实Mac独立官网观看／重启续播、字号／辅助技术、物理电视与遥控、实际全屏、安全和正式发行继续开放；不推送、归档或发布，并行品牌／设计文档保留。
- 完整 `verify-second.log` exit0：Rust 116/116（0跳过）、工程工具21/21、Web／Desktop／TV UI 36/34/35，三端check与build、fmt／lint／codegen和release基础检查通过。独立功能与UI范围审查结论在同目录review文件；无未解决本批阻塞。该结果不扩展到上述未验证宿主／安全／发行项。

### D3 · 定稿搜索发现共享 UI（2026-11-14）

- `wire-approved-search-discovery` 接通同一 Search 的匿名建议与精确系列卡片：桌面紧凑建议／四列海报、TV“试试这些故事”横向 shelf。公共建议置于发现标题后，与最近搜索分区；按最终关键词去重并排除最近词，执行普通搜索。跨榜单卡片按系列 ID 去重，仅发现态所属 comic board 标“漫剧”，不将普通搜索 DTO 的 content_type 推断为漫剧。
- store 捕获同一 transport，仅活动且空查询时读取固定无参数 GET；NSH resource 负责取消／迟到隔离，离页、提交、覆盖详情及销毁均有回归。挂载内最后成功快照仅供显示与来源恢复，TTL 仍归 Rust。失败／重试／空态保留手动搜索和最近词，无假内容、历史上送或观看写入。
- `CardControls` 在共享 ui 管理稳定槽位的单 Tab 停靠、方向／Home／End／Enter／Space、外部精确 ref.focus 及清理；组外 PosterCard 保留 BaseButton 路径。它不支持任意 keyed 成员重排。Search 回收清理只删除仍由自身拥有的 ref，且不再以另一张卡冒充缺失来源。Android 只在公开导航深度下降时重连精确公开 ID，返回后恢复一次；正常 DPAD／确认操作可取消待恢复，无变化不自激重绘。该结论不扩大到所有输入／媒体键或所有确定性异步排列。
- 最终 `artifacts/search-discovery-ui/verify-second.log` 完整运行至 release `ok:true`：Rust116/116（0跳过）、工具21/21、Web／Desktop／TV UI40/38/39，三端 check **和** build、fmt／lint／codegen、release基础检查通过。旧 PTY 收尾未再返回 exit 字段，因此这里记录完整命令输出与最终结果，不另造退出码；`verify-first.log` 早于最后焦点修复，不替代最终证据。
- Web 与 macOS 均在1180×780、1440×1000浅深四组宿主检查；最终精确来源回归分别为 `host-web-exact-second.log` 4/4、`host-macos-exact-final.log` 4/4，返回后 Enter 必须重开剧41／52。早期只检查“进入了某个详情”的4/4不能证明恢复原卡。广回归 Web19／Mac20在最后 ref guard前运行，后续专项才用于证明最终身份恢复。unavailable各2/2覆盖浅深 loading／error／retry／empty及手动搜索。
- 真实 macOS 可见窗口已用鼠标滚动并打开末卡52→Escape返回→Return精确重开52；原生 Select 的鼠标打开→Down→Return切到25–48集并回焦 trigger。`macos/cua-mouse-return.png` 只用于输入／焦点证据，标题分组以随后矩阵新图为准；窗口内容为1180×780。未进入实际全屏或启动可见原生 Chrome。
- TV `tv-matrix-ninth.log` 在模拟器浅色、深色、字号1.3各47项浏览、24项播放器全部通过。浏览含首卡41／末卡52的详情返回、Right移动至42后500ms仍保持42、建议普通搜索；首屏截图已隐藏系统IME。这里只证明已运行序列，不将500ms检查当作所有迟到排列的证明。测试使用显式HTTP fixture，播放器使用既有合成媒体，不替代原生独立官网／硬件解码验收。
- wrapper最终重新安装原 native APK，实际pull回字节；`native-before.apk`／`native-restored.apk` 的SHA256均为 `140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`。`tv-before.json`／`tv-restored.json` 均为night yes、font_scale1.0、reverse空。
- 原始失败保留：Web exact第一轮1180浅色的headless Chrome SIGBUS属宿主启动失败，其余三组通过，随后4/4；TV第一／二轮测试没有建立正确首卡焦点，第三及第五至七轮则暴露真实View替换／迟到布局返回缺陷，分别修复后以第九轮复验；第四轮深色recent稀疏行导航步骤已纠正；第八轮缺Java import属runner编译错误。不同类别不合并成单一根因。
- 独立功能／UI审查及截图见同目录 `function-review.md`／`ui-review.md`；修正了公共建议分组、Web错卡、TV返回及取消竞态。finishing清单逐组记录了圆角／字体／间距／对齐／色彩／hover／状态等已观察结果；静态图不能证明所有pressed、逐帧动效和辅助技术。VoiceOver／TalkBack、macOS系统字号、更窄布局／RTL、物理TV与遥控、实际全屏、C3.2官网独立业务、安全和正式发行继续开放。
- 本批无DTO、数据库或依赖变化，无新Go、不改upstream；保留并行品牌／设计文档，只分批本地提交，不push／归档／发布。typed输入联想、其余D/E/F/G与完整MVP仍未完成。

### D4 · 输入联想核心与类型契约（2026-11-14）

- `migrate-typed-search-suggestions` 将固定上游 `SearchSuggestions` 协议迁至Rust，同一官网匿名client读取 `/incent_resource/suggestion`，参数仅app_id8662／count10／当前词。trim后空词本地返回，最多100 Unicode字符，剩余控制字符拒绝；无账号、Cookie、历史、发现注册调用、输入词缓存或持久写入。复用最多两次、单次5秒／总12秒的请求界限，响应256KiB；redirect／verification／坏数据／超限不重试。
- 新生成SearchSuggestions／SearchSuggestion／SuggestionKind、HTTP `/api/v1/search/suggestions?q=…` 和同一native入口，只有q，未知／重复参数、非法词和非空GET body在联网前失败；native Some body按既有bridge代表POST，返回405。沿用Axum自动HEAD和全局CORS预检，不声称所有非GET方法都拒绝。提交OpenAPI、generated.ts及公开alias，codegen:check无漂移。
- 合成input／expected固定样本和边界测试覆盖剧名／演员／关键词、display_words及剧名回退、大整数精确保留、kind+语义身份去重、前128行／最多10条、元信息／封面／支持内容类型／无效envelope。只有short_play_name的合法video_data带Drama，actor独立ID、未知类型降普通词；不从keyword推断系列、不输出详情集／简介或原始payload。public_cover只从discovery移动到parse复用，判断未变。
- 独立审查发现numeric keyword绕过字符串上限，已统一限制100字符，并补201位数值key退回name、20位合法actor ID原样保留的回归。早期parser5／core8及定向121项都早于最后修复；最终完整验证包含新增修复测试，不能以旧结果代替。
- `artifacts/search-suggestions-core/gates-result.json` 记录 `clippy-final`、`verify-first` 均exit0。最终Rust127/127（0跳过）、工具21/21、Web／Desktop／TV UI40/38/39，三端check **和** build、fmt／lint／codegen、release基础检查通过；随后strict OpenSpec、codegen drift及diff检查通过。新native专项验证cancel／session close后499、pending清空、不重试、不写观看／最近词、close后410；HTTP/native成功、坏JSON、verification、5xx的状态与body一致，no-store及请求计数准确。
- core真实socket测试证明drop未完成联想future会关闭上游连接且不重试，native专项覆盖其owner取消／关闭。超时由core专项直接验证，HTTP/native的504映射共用代码；没有独立运行本接口的HTTP客户端真实断开或HTTP/native超时对照，不把core/native证据扩大成这些路径已验。
- 显式匿名官网探针 `suggestions_probe -- --anonymous-live` 本次返回items10／drama10／actor0／keyword0／合法summary9，日志仅数量。证明当次固定官网请求与解析可用，不能据此宣称10条均可打开、真实演员分支、UI或官网观看已验；混合类型由离线fixture验证。
- 独立功能／UI范围报告见同目录 `function-review.md`／`ui-review.md`。本批没有app/ui/apps可见代码变化，因此只做定稿／数据含义范围审查，不重复计宿主截图、鼠标、TV矩阵或安装包验收。optional字段和kind须共同判断，key不能当搜索词、系列ID或全局UI身份；meta不推断排名／分类。100字联想与既有80字搜索／最近词、输入防抖／IME／弹层焦点和演员作品仍需后续实施与真实宿主验收。
- 台账单列演员作品，不以普通关键词搜索替代该功能；其余D/E/F/G、C3.2、辅助技术、物理TV、全屏、既有安全阻塞与正式发行仍开放，完整MVP未完成。本批无新依赖／数据库／Go／upstream变化，仅分批本地提交，不push／归档／发布；并行品牌／设计文档保留。

## D4 · 演员作品核心与严格契约（2026-11-14）

- OpenSpec `migrate-actor-works-core` 单独交付匿名演员摘要与选定官网页面内的有序支持作品。Rust 固定请求 `/character/<actor_id>`，只读 `loaderData["character_(id)/page"]`；请求ID为trim后1–32位非零ASCII十进制，所有已给出的actor_id／actor_id_str／person_id须逐字一致，不从姓名、keyword或系列ID推断演员。无账号／数据库写入／发现注册／新依赖／Go或upstream改动。
- `ActorSummary`／`ActorWorksResult` 与 `/api/v1/actors/works?actor_id=...` 已接通HTTP/native及生成OpenAPI／TS aliases。拒绝缺失／非法／重复／未知参数、HTTP非空GET body、native body及普通POST；保留Axum自动HEAD和全局OPTIONS语义。共用匿名传输，5秒单次／12秒总限、最多两次，禁止Cookie／Authorization／重定向。
- HTML12MiB、videoList最多2048原始行，超限整页失败而不静默裁成“全部作品”。缺失／非数组videoList失败，合法空数组成功。归一化direct／video_data、精确系列ID、支持内容族、去重顺序；名称／剧名100字符、简介1024、标签3×24，图片复用既有HTTPS白名单。只带摘要与正集数，不返回episodes或原始视频列表；“完整”仅指该页面内有效支持的作品，未证明全网全集或新分页协议。
- 最终证据位于忽略目录 `artifacts/actor-works-core/`：`targeted-wire-final.log` 为133/133、0skip；`verify-wire-final.log` 实际exit0，Rust138/138、工具21/21、三端UI40/38/39、三端NSH check和build、fmt／lint／codegen／release基础检查通过。`clippy-first.log`、`codegen-check.log`、`strict-final.log` 和diff check通过；`gates-result.json`记录实际退出码。最终fixture已恢复严格wire JSON并沿用detail的单文件格式排除规则，避免HTML格式化器把JSON改成JavaScript。
- 早期失败分别保留：`targeted-first.log` 并发cargo test中既有discovery40ms测试超时，单独重跑及最终全套通过；`targeted-nextest.log` 132/133，新actor取消测试恢复请求少放一次模拟gate，修复后通过；`verify-first.log` 两个fixture格式检查失败，随后`verify-final.log` 中HTML格式化改写wire JSON，parser正确拒绝，修复后最终完整验证通过。没有放宽解析或跳过失败测试。
- native取消／close验证499、pending清空、无后续重试及无观看／最近词写入，close后410、取消后可恢复。core丢弃future的真实socket关闭／不重试及deadline有专项；演员接口HTTP客户端真实断开、HTTP/native端到端timeout对照未单独测，不能用共用映射或播放器断开回归替代。
- 显式匿名 `actor_works_probe -- --anonymous-live <public-actor-id>` 本次返回82部支持作品、82精确系列摘要、avatar／description均存在、episodes0；只输出数量，不记录姓名／身份／简介／URL／作品原文。此证据仅为该公开演员页当次读取，不代表其他演员、全网全集、实际界面或播放验收。
- 独立功能／UI产品范围报告见同目录 `function-review.md`／`ui-review.md`。本批无packages/app／packages/ui／apps可见改动，不重复计宿主截图／鼠标／TV矩阵；typed联想入口、演员作品共享UI、防抖／IME／焦点、100字联想与80字普通搜索／100 UTF16最近词边界仍待后续实现及真实宿主观察。C3.2、辅助技术、物理TV／遥控／解码、全屏、安全阻塞、其余D/E/F/G及正式发行继续开放，完整MVP未完成。本批仅本地提交，不push／归档／发布，并行品牌／设计dirty保留。

### D4 · 定稿输入联想与演员作品共享 UI（2026-11-14）

- `wire-typed-search-suggestions` 接通同一顶栏输入下的非模态建议层，复用主题、动效、语义按钮与定稿海报 grid／TV shelf。只有 kind 与合法显式 ID 共同支持时打开剧集详情或演员作品，其余以完整 name 普通搜索；不把 opaque key 当身份。按最终动作身份去重，避免不同原始 kind 回退为同名 query 后重复注册。
- App 独立 controller 拥有240ms防抖、组合输入、活动／交互归属、取消、generation／raw迟到隔离、当前词缓存、关闭、重试与销毁。离页／后台取消，不由异步完成导航或抢焦；不写观看记录。普通提交统一 Unicode 空白、拒绝 C0/C1，最多80 scalar／100 UTF16；联想最多100 scalar，均不截短原文。无效提交关闭建议、保留完整草稿与旧结果，错误紧邻输入，修改后可再提交；仅合法普通提交进入最近词。
- SearchForm 使用公开 Input／Overlay，支持 Down／首项 Up／Enter／Escape／Tab／outside。blur 仅延后一帧判断输入与列表归属；重试先聚焦输入，避免行卸载关闭浮层。演员／剧集动作激活前 blur，避免原生 Enter 连带提交；返回恢复服从最新用户意图。Actor 使用 typed 作品接口及页面局部 snapshot，详情覆盖期间保留数据，隐藏取消请求；复用 List 虚拟化、精确 series ID、offset 和 refs ownership，提供加载／失败重试／空态，无假分页、总数或全网作品承诺。
- Android 薄宿主转发公开焦点身份和按键／指针意图，程序 focus 不作新意图。公开 `focus-surface-*` 仅过滤其遮挡范围内的背景焦点，包括浮层行间空隙；没有全局 toolbar 排除。返回来源绑定具体 navigation-page View、depth 与稳定 ID，隔离同深度新页面；原生滚动回调检查 intent epoch 与 attached，防止迟到恢复覆盖更新的导航。
- 最终工程结果见 `artifacts/typed-search-ui/gates-result.json`，均为工具实际 exit0：`verify-latest.log` 含 Rust138/138、工具21/21、Web／Desktop／TV UI45/43/44，三端 check **和** build、fmt／lint／codegen 与 release 基础检查；`clippy-final.log` 为 workspace／all-targets／-D warnings。`focus-final.log` 1/1覆盖共享／宿主新意图优先、hostFocus传递和订阅清理。没有依赖、Rust DTO 或数据库变化，本批不重跑 security，不代表既有安全阻塞解除。
- 可重复图形宿主入口为 `node tooling/src/browsing-host.mjs web suggestions` 与 `node tooling/src/browsing-host.mjs macos suggestions`。最终 `host-web-command-second.log`／`host-macos-command-final.log` 各4/4：1180×780、1440×1000浅深，1180组 reducedMotion。82项演员列表滚动后首次打开和返回 Enter 均断言同一具体较后作品，包含两级来源、建议焦点、error／retry／empty、81字完整草稿、350ms后错误仍无弹层及缩短提交。Mac driver 使用 foreground，不能将后台 NSApplication inactive 的运行当可见窗口验收。
- macOS另有实际可见窗口鼠标／键盘检查：演员→第二部详情→返回 Enter 同部；82项中的第15部 drama137 精确返回／重开；两级来源、Up返输入、Tab、Escape、重试、完整长词编辑、empty／outside。证据为同目录 `macos/manual-*`。手动1440组受屏幕限制实际高969；自动正式矩阵为1440×1000，二者不混用。未重新要求解锁或将所有历史失败归于锁屏。
- `tv-browsing-third.log` 最终模拟器浅色／深色／字号1.3各71项通过（213项），`tv-player-second.log` 各24项通过（72项）。可复现入口 `node tooling/src/tv-browsing.mjs suggestions` 的专项为各25项，最终完整浏览已覆盖其更新后的pageRoot实现。包含 InputConnection 原生 composing／commit、演员首部／第15部精确返回、第16部新遥控意图、两级来源、同一UI turn返回并用原生 MotionEvent点击精选的新指针优先、三种动作、校验、重试与系统返回。播放器保留原24项媒体／定位／设置／返回断言，首个搜索改为原生 Enter 提交。
- TV wrapper 每轮恢复原 native APK并实际pull回核对：`tv-before.json` 与 `tv-restored.json` 均为 SHA256 `140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`、night yes、font_scale1.0、reverse空。HTTP fixture／合成媒体和模拟器不替代官网独立业务或物理电视验收。
- 历史失败分类保留：Mac早期锁屏与默认后台 inactive是两类条件，foreground后4/4；Web command首轮Chrome启动SIGBUS为3/4，未改业务的第二轮4/4。TV完整首轮52项后的演员返回是真实同depth来源隔离缺陷，已修pageRoot；第二轮59项后的旧label断言误匹配背景同名海报，改公开精确ID后第三轮通过。player首轮2项后的HTTP fixture失败在解码前发生，补新增联想／发现的合法空响应后全72项通过。早期retry涉及IME关闭异步与focus重开，原生等待WindowInsets后分开验证系统键盘Back和应用浮层Back。早期格式／控制正则lint已修；既有mixed headless linker `__eh_frame section too large` 警告保留，未屏蔽。
- 独立功能及UI终审报告位于同目录 `function-review.md`／`ui-review.md`，结论为本切片已观察范围通过。圆角、字体、间距、对齐、浅深表面、焦点、长名及错误可见性均有截图核对；实际hover／pressed逐帧、加载帧、全部动效、人工系统IME候选、VoiceOver／TalkBack、Mac系统字体缩放、物理TV／遥控／硬解仍未逐项验收。减少动态配置及静态图不等同动态过程通过。
- 本批只完成D4当前UI切片，不关闭C3.2真实Mac独立官网观看／重启续播、全屏、推荐／筛选等其余D、E/F/G、安全和正式发行，完整MVP仍未完成。保留并行品牌／设计dirty，精确分批本地提交，不push／归档／发布。

### D5 · 匿名分类核心、筛选与独立游标（2026-11-14）

- `migrate-category-core` 迁移固定上游 `Category`／`categorySelection`／`normalizeCategoryFilters`，请求固定匿名POST `/reading/distribution/category/landpage/v/`，复用已验证Passport原语并将Gorgon／Medusa／X-SS-STUB绑定实际发送body字节。保留四种分类场景、limit15、selector default／only_content及client_req_type3；分类与搜索分页、推荐feed独立，不本地筛当前搜索页冒充服务端分类。
- core同一 `CategoryParams` deny-unknown decoder和 `CategoryQuery`供HTTP/native复用。八种筛选按固定允许值校验，省略genre／sort保留场景默认，明确空值为全部；0–100000 offset、1024字节无控制session和最多128个精确decimal shown ID有界。非法场景／重复或未知参数／GET非空body／native Some body联网前拒绝；保留Axum自动HEAD与全局OPTIONS，不宣称所有非GET都拒绝。
- 精确解析code0/data/video_data并拒绝业务error_code，4MiB body／128原始作品／32 selector行及每个已支持维度128选项超限整页失败。复用演员作品的有界摘要归一化，仅调整该helper可见性；大整数ID保持字符串，支持作品按ID保序去重，无episodes。动态选项按合法ID和有界label去重，字符串／数字筛选ID归一；固定状态行补齐已完结／连载中，缺失时位于时间前，不造其他选项。原服务next_offset／session优先，仅缺失／零游标时采用固定参考的offset+有效作品数，has_more不推进明确失败；空作品但服务游标推进仍有效。
- 分类使用独立匿名transport、无注册／账号／Cookie／持久身份或播放cache。仅确认空200body重试，最多三次新临时身份，间隔100ms，单次5秒／总12秒；网络／重定向／验证／协议／超限不借其他身份重试。drop关闭真实socket且不继续重试、取消后恢复、总／单次deadline及body摘要和实际Gorgon重算均有loopback回归；既有固定独立非空body签名向量继续通过。新GET `/api/v1/category`及response／selector OpenAPI、generated TS和aliases已提交候选，其他兼容DTO未因此迁移。
- 最终证据 `artifacts/category-core/gates-result.json` 记录实际工具exit0：`targeted-stable.log` 跨包143/143；`verify-final.log` Rust148/148、0skip、工具21/21、Web／Desktop／TV UI45/43/44，三端check **和** build、fmt／lint／codegen／release基础检查均过；`clippy-latest.log` workspace／all-targets／-D warnings、`codegen-check-final.log`均通过。HTTP/native专项覆盖相同成功fixture、坏JSON／403／500错误映射与脱敏、重复／非法输入无上游请求、no-store及同一session cancel／close后499／pending清空／close后410、取消后可恢复；观看及最近词均未写入。分类HTTP客户端实际断开及HTTP/native端到端超时对照未单独测，不扩大core/native证据。
- 显式 `category_probe -- --anonymous-live` 当次exit0，输出15作品／8筛选维度／has_more与advancing为true／episodes0。仅做一个匿名首屏查询并输出计数，不记录作品、session、身份或签名URL；不能据此证明所有场景、实际切换过滤、在线续页序列、作品详情／播放或可见筛选UI通过。合成fixture与固定上游文件SHA在 `contracts/fixtures/category/`，无新依赖／数据库／Go／upstream改动，本批不重跑security且不解除既有安全阻塞。
- 独立功能审查修复P2：坏label不能先占selector ID并吞掉后续合法同ID选项；新增空label后合法label及numeric0／string0去重回归。历史失败分别保留：`targeted-first.log` 的新增schema测试直接索引OpenApi导致编译失败，已序列化成JSON；second／third为既有discovery40ms恢复预算超时，`targeted-final.log`在初次注册尚未赶上40ms时计数断言失败。该测试现使用2秒测试deadline，server gate仍强制超时，缓存／TTL／计数／取消原断言全部保留，产品6秒deadline不变；`discovery-isolated.log`此前单项已过，修复后跨包及最终nextest全过。`verify-first.log`虽exit0但早于最后兼容／测试修复，不替代final；既有mixed headless构建警告保留，未屏蔽。
- 独立功能／UI产品范围报告位于同目录 `function-review.md`／`ui-review.md`，核对固定协议及定稿承接边界。此批无app/ui/apps可见改动，不借前一联想切片截图或宿主数量作新增UI验收。后续UI须区分省略默认与全部，按动态ID映射类型／题材／排序、筛选变化重置分页所有权，且本接口没有q，搜索结果筛选组合仍开放。共享筛选UI、推荐feed及其余D/E/F/G、C3.2、人工IME／辅助技术／物理TV／逐帧动效、独立安装和安全发行仍待验收，完整MVP未完成。保留并行品牌／设计dirty，只分批本地提交，不push／归档／发布。

### D5 · 定稿分类找剧共享 UI（2026-11-14）

- `wire-category-browsing` 将匿名分类接入共享 Discover：桌面三行类型／题材／排序和四列海报，TV 三个原生 Select 与横向 shelf。主导航“找剧”进入分类；关键词搜索保留桌面顶栏现有图标与 TV 顶部工具，进入后聚焦输入，不增重复侧栏。题材为真实 category_dim_theme ID，类型仅映射服务返回的真人剧／漫剧；综合为显式空 sort，最新 online_time、热度 hot_score，仅在支持时显示，不把收藏量当热度。分类没有 q，关键词组合筛选和刷剧 feed 仍开放。
- 页面 controller 独立拥有选择、已完成页、动态选项、session／offset／末128唯一 shown、当前来源。首屏 selectors=1，续页=0；取消与 revision 双守卫覆盖隐藏、详情覆盖、后台和 dispose。去重保序、坏游标拒绝、空作品但游标推进可继续、续页失败保留原卡并重试同一路径、首屏动态选项收缩及已选合法项保留均有定向回归。清除筛选与取消置于同一事务，防止未完成首屏在新选择写入前重新读旧条件；不写观看进度或清空搜索草稿。
- 分类→较后详情→返回，以及分类→独立搜索→返回保持选项、页、锚点和精确ID；来源和通用 NavStack 恢复共用同一表，避免旧 root→root onChange 覆盖搜索返回。根页不再无意义 popToRoot；隐藏来源的“全部记录”／“去找剧”与根级 Back 明确交回目标。主导航／可恢复筛选复用已有 CardControls/CardRoot 的先激活停靠项再 focus；跳过禁用项，当前项失效可转移。动态题材按稳定槽位布局、按 value 建 ref 映射，重排／收缩后方向键与来源不串位，较新输入意图优先。
- TV Select Back 曾将实际焦点落到 NSH root；薄宿主仅在 root 真正持焦且当前目标仍可操作时修复，不修改身份／意图、不延迟抢焦，并排除主动 blur 的 EditText，保留提交后进入结果的路径。验收使用真实 DPAD 确认／Back；不能用不转移键盘焦点的 Accessibility ACTION_CLICK 推断弹层来源。TV 搜索工具的遥控进入步骤与新的输入自动聚焦一致，组合输入测试保持真实 composing span，不能先隐藏 IME 结束组合再声称仍在组合。
- 最终 `verify-accepted.log` 实际 exit0：Rust148／148、tooling21／21、Web49／49、Desktop47／47、TV48／48，零失败／跳过；三端 check 与 build、格式／lint／边界／codegen及release检查通过。Web／macOS `host-*-terminal.log` 各4／4，TV `tv-browsing-restoration.log` 71×3、`tv-player-restoration.log` 24×3、`tv-restoration.log` 分类25×3均实际exit0；强化禁用来源用例 `source-targeted.log` 1／1。完整结果见本批 `artifacts/category-ui/gates-result.json`。可复现命令为 `pnpm verify`、`node tooling/src/browsing-host.mjs web category`、其后串行运行 `node tooling/src/browsing-host.mjs macos category`，及 `node tooling/src/tv-browsing.mjs category|browsing|player`（分别执行，需 pinned API34 模拟器）。两个桌面脚本共享 apps/web/runtime.generated.json，禁止并行；TV 是显式只读 HTTP fixture APK，不能计作新增原生独立官网业务。TV 临时 wrapper 实际 pull 原 APK，恢复后再 pull 核对 SHA256／night／font／reverse；原包 SHA256 为 140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327。
- 实屏按定稿检查圆角、字阶、间距、对齐、主题表面、hover／pressed／selected、焦点、空／加载／失败、长题材和大字；复用现有控件、颜色／状态过渡、Notice entrance 和 NavStack 转场，不加逐海报入场。Web／macOS 各1180×780与1440×1000浅深，1180减少动态；TV浅深及1.3字号弹层／Back／错误／空态／分页／精确返回分别截图。CUA 本轮已实际观察 Mac 1180 可见窗口分类、长题材、家庭空态及清除后全部恢复，未再以锁屏阻断；此观察不等于逐帧动效、辅助技术或全平台人工键盘完成。
- 历史失败均保留：fixture变量重名与早期测试Text不当prop／超出视口；测试按旧Select合成label定位；ACTION_CLICK未持焦而误期待trigger/card恢复；建议未打开就 Back 导致已返回分类；输入草稿错用 texts/shows 而非 value；隐藏IME结束组合；按旧导航多按Down离开新自动聚焦输入；root原生焦点恢复曾重开输入建议；首屏 clear 事务竞态；主导航非当前停靠 ref.focus no-op及动态来源风险。另有 Web／Mac 并行改同一 runtime 导致连接失败、单次 Chrome SIGBUS 启动失败，均与产品断言分列。旧失败与中间通过不得替代最终源码门禁；独立审查报告位于同目录 function-review.md／ui-review.md。
- 两份独立终审已核对最终源码、加强后的禁用／重排焦点测试、各宿主矩阵与原 APK 恢复，均无剩余实质功能／视觉问题。报告保留实际已观察范围和下列未验项，不据 fixture 扩大完成范围。
- 本批无 Rust DTO／数据库／依赖／Go／upstream 变化，不重跑 security、不解除已有安全阻塞。在线分类完整筛选／续页／播放、人工 IME 候选、VoiceOver／TalkBack、逐帧动效、物理 TV／遥控／硬解／长播、Windows／Linux、C3.2 macOS 独立官网观看与字体／全屏、其余 D/E/F/G、安全及正式发行继续开放。仅提交本切片并保留并行品牌／设计修改，不推送、归档或发布；完整 MVP 未完成。

### D6 · 匿名推荐频道核心（2026-11-14）

- `migrate-anonymous-feed` 将固定参考客户端的推荐16、漫剧36、真人剧39迁至 Rust catalog；GET `/api/v1/lists/recommend` 为同一严格HTTP/native只读契约。关注45明确拒绝并保留到E账号批次；本批没有前端消费者、刷剧页面或自动播放，不把分类／热榜当推荐来源，不以核心通过关闭完整刷剧、D或MVP。
- 16固定cell／plan；36／39先匹配真实tab，再带准确cell／plan／session从offset0切入cell。cell续页使用服务offset，非视频行和被过滤内容不改变游标，空但推进的页仍可继续；停滞、错类型、超限和不配对上下文拒绝，不伪造终页。摘要仅取已知video_detail／video_data／cell_data，精确decimal ID、正集数、可播和已支持内容族、去重保序、无episodes，聚合diagnostics不含标题或身份。
- 输入限制offset100000、session1024无控制字符、shown128个合法ID、cell／plan成对非零decimal且最多30位；未知／重复参数、坏字段与方法在网络前失败。响应4MiB、每数组128、深度8和总cells／records1024，超过整页失败不截断。显式非法disable_play保守过滤；terminal tab允许上下文同时空，有任一则必须成对有效，bookstore_id显式坏类型不能折叠为空。
- 分类与推荐复用提取后的匿名签名传输：category仍是原固定endpoint／body-bound POST，feed是固定GET tab/v或cell/change/v；每尝试新临时ID、不注册、不读保存身份／账号／历史、不发cookie／token，不改数据库。12秒总时限／5秒尝试，只有已确认空200最多3次，非空坏JSON／业务失败／403／重定向／500不追加重试；取消关闭读，媒体监听不开放业务route。
- 离线向量源与可复现探针见 `contracts/fixtures/feed/README.md`；向量为固定Go行为合成，无凭据／live原包。Rust定向 `core-feed-final.log` 7／7、`parity-final.log` 3／3、`schema-second.log` 1／1；共享category原签名／隐私／retry／deadline／drop用例仍由完整门禁执行。HTTP/native parity包含严格输入、body／方法、no-store、脱敏错误、39阶段0→6、取消／close无pending／无history；既有真实媒体监听用例断言recommend404。生成OpenAPI与generated.ts及独立codegen:check一致。
- 历史失败保留在 `artifacts/feed-core/`：直接cargo调用因shell PATH未含rustup失败，后续用仓库已解析的工具绝对路径；最初“缺失offset”测试实际未删原字段，纠正夹具后通过；新增schema测试漏宏命名空间导致编译失败，已修；审查新增terminal配对用例暴露一次未命中的文本替换，已按实际源码修复并直接回归。独立审查提出的非法禁播标记和终页context两项均已收紧，不删除旧失败冒充全程通过。
- 最终 `pnpm verify`（verify-first.log）实际exit0：Rust159／159、tooling21／21、Web49／49、Desktop47／47、TV48／48，零失败／跳过，三端check／build及格式／lint／边界／codegen／release通过；`cargo clippy --locked --workspace --all-targets -- -D warnings`、文档后的fmt:check及独立codegen:check均实际exit0。最新显式匿名 `live-accepted.log` 实际exit0：16首屏5／续页4，cursor6→12；36与39各首屏3／续页6，tab→cell0→6，全部无episodes。数量只代表本次时点，不能推定完整目录或持续可用。独立功能复审与UI边界审查均无剩余问题，保留未接前端及平台边界。
- 最终完整门禁、显式匿名探针及独立审查数量在本批 `artifacts/feed-core/gates-result.json` 和后续记录中列明。本批仅核心变化，未新增真实宿主截图或重装TV；上一分类矩阵不能计作推荐UI验收。后续共享UI按定稿接频道／播放／下一部／返回和失败恢复，再做实际Web／Mac／TV观察与独立UI／功能审查。人工IME／辅助技术／逐帧动效、物理TV／解码／长播、Windows／Linux、C3.2、安全、其余E/F/G与正式发行继续开放；无依赖变化不重跑security、不解除已有安全阻塞。仅本地提交，不推送、归档或发布。

### D6 · 定稿刷剧共享 UI（2026-11-14）

- `wire-approved-feed-ui` 接通共享频道会话与定稿 desktopPlayer(true)／tvFeed。桌面保留频道、520高画面、316选集栏、剧名／当前集／下一部；TV归“精选”，预览同一 StoryFeature，明确进入既有全屏播放器。首页／TV找剧提供入口，关注保留真实登录门槛，不匿名替代；收藏／点赞／追更／评论仍为后续账号批次。
- 16／39／36各自保留当前剧、精确cell／plan／session／offset和保序去重作品；tab→cell0、空但推进、同路径重试、末128 shown、频道／隐藏／后台／销毁取消与迟到隔离均有确定性回归。Feed只保存页面生命周期内的摘要、选择与同步checkpoint；同一Player继续拥有媒体／进度，按频道／剧／video捕获身份，覆盖详情与隐藏释放媒体，返回暂停恢复位置，TV预览不prepare、不写观看。实际播放历史请求额外检查剧／video有对应prepare、位置前进、无完整episodes／comments。
- 实际图形宿主：Web `host-web-guarded.log` 与Mac `host-macos-final.log` 各4／4，两种批准尺寸1180×780／1440×1000浅深，1180减少动态；每端24张截图，错误状态等待共享入场过渡结束再采集。覆盖第59集续播、切第2集后频道往返、详情来源Enter重开、连续下一部Enter失败／同游标重试／空推进／去重末页、关注、隐藏后暂停恢复；Mac另验原生全屏／Escape，进出原生Space均等待系统动画结束。Web没有原生窗口全屏，按钮禁用，不能扩大为浏览器全屏通过。
- TV最终 `tv-final.log` 23×3，既有浏览回归 `tv-browsing-regression.log` 71×3，浅／深／1.3字号；频道／下一部／详情／全屏使用实际DPAD确认，重试与继续浏览仍有Accessibility ACTION_CLICK，不能称全链仅DPAD。新增公开browse-section身份只让隐藏内容来源承接至新内容选中控件，较新输入／实际编辑焦点优先；保留精确详情和播放返回。BackHandler只消费活动刷剧，Home根Back实际退出有独立断言；Web按运行时能力判断，不调用缺失的原生监听。每次临时安装后重新拉取APK比对，原包SHA256 `140304dd98b1b37dc8f7a706278b9ecf7efdc73d00c5acd884aaa0df893a8327`、night=yes、font=1.0、reverse空均恢复，未修改持久观看数据。
- CUA实际观察1440浅深：鼠标详情覆盖／返回来源焦点、下一部失败保留当前剧、Return重试和继续到末剧、末页焦点回频道；媒体为自制12秒色条夹具，不能冒充官网内容。圆角、字号、间距、对齐、主题表面、禁用／选中／焦点及内容状态由两份独立报告逐组复核；ContentArrival落实共享entrance和reduceMotion，既有控制层与overlay动效复用，不从静态图推定逐帧、读屏或物理输入通过。
- 历史失败保留在 `artifacts/feed-ui/`：Chrome一次SIGBUS启动；初次过早等媒体；第59集不在1–24区间的测试前提；Web不支持原生全屏及graphical setLifecycle；TV首焦点返顶栏；根Feed Back退出Activity；Mac AppKit进出Space期间过早发Escape／click；Web无条件原生BackHandler导致空页。对应修正后分别重跑，不将旧失败计为通过。主树后续verify被并行updater Rust fmt挡住、旧player重包被并行UpdateInstaller Android lint挡住；没有修改这些并行实现或降低门禁，最终本批验证使用相同源码哈希的隔离工作树，详见下条门禁记录。
- 最终门禁：隔离工作树基于 `4f8aa64`，本批28文件逐一SHA256与快照一致；完整 `pnpm verify` 实际exit0，Rust159／159、tooling27／27、Web52／52、Desktop50／50、TV51／51，三端check与build、格式／lint／边界／codegen／release检查通过。隔离TV独立Player `tv-player-isolated.log` 实际exit0，24×3，重新pull的恢复APK及主题／字号／reverse再次与测试前一致；证据复制到 `artifacts/feed-ui/isolated-player/`。严格OpenSpec验证通过，两份独立审查无未解决的本批发现。验证后只有任务勾选与本记录收尾；主树4份共享文件另有updater导出／装配／路由／进度修改，保持原字节和暂存状态，隔离通过仅归本Feed快照，不宣称含并行更新器的主树整体通过。
- 本批没有Rust DTO／数据库／依赖／Go／upstream变化；不重跑security、不解除既有安全阻塞。真实官网推荐完整播放序列、人工IME候选、VoiceOver／TalkBack、系统字体／逐帧动效、物理TV／遥控／硬解／长播、Windows／Linux、C3.2、其余E/F/G与正式发行继续开放。本地只提交本切片，保留并行品牌／设计／更新器修改，不推送、归档或发布；完整MVP尚未完成。
