# 工程工具链与交付规范

> 2026-11-13 实施状态：pnpm/Cargo 工作区、三端薄入口、共享 UI、Axum/Tokio 骨架及工程门禁已落地（第一阶段基线）。当前 NSH 仍为 TSX + HTTP 开发模式；native bridge、完整内容协议、原生独立包和真机发行仍为目标。实际可执行命令以 README.md 为准，验证结果以 VALIDATION.md 为准。

TV 的阶段任务、命令现状、设备门禁与签名 APK 交付顺序见 [TV_DEVELOPMENT.md](TV_DEVELOPMENT.md)。

状态：设计提案，2026-11-13。与 [ARCHITECTURE.md](ARCHITECTURE.md) 配套，覆盖 TypeScript/NSH、Rust 和 Android 宿主。目标产品及正常开发、CI、发布均不依赖 Go；当前旧验证工程只在迁移期保留。以下是完整产品的规范；当前阶段仅实现 README 与 VALIDATION 明确列出的子集。

## 1. 工具链所有权与版本

pnpm 提供统一入口，各语言工具保留自身职责。开发机和 CI 使用相同的版本文件、参数与报告格式。

| 范围         | 版本/配置入口                              | 策略                                                                               |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Node         | `.node-version`、`engines`                 | 初始锁定当前已验证的 26.12.1；其他版本经矩阵验证后再声明支持                       |
| pnpm         | 根 `package.json#packageManager`           | 初始锁定已验证的 `pnpm@11.1.3`；提交单一 `pnpm-lock.yaml`                          |
| NSH          | `.nsh-version`                             | 保持 0.5.0；CLI、runtime、Rust `nsh-*` 依赖保持一致                                |
| Rust         | `rust-toolchain.toml`                      | 固定 1.97.0，包含 rustfmt、clippy；可移植工作区已编译，mixed/Android 宿主仍待验证  |
| Rust 包      | 根 `Cargo.toml`、`Cargo.lock`              | Edition 2024、resolver 3；显式成员、共享依赖与 lints；应用锁文件提交               |
| JS 工具      | 根 devDependencies + pnpm lock             | Oxlint、Oxfmt、Lefthook、commitlint、契约生成器使用精确版本                        |
| 原生辅助工具 | `tooling/tool-versions.json`               | nextest、cargo-deny、cargo-llvm-cov、cargo-fuzz、扫描/发布工具锁定版本与下载校验值 |
| 契约         | Rust DTO/路由 + 生成的 OpenAPI/TS types    | utoipa 与 openapi-typescript 锁定版本；离线导出，不启动真实服务                    |
| Android      | Gradle Wrapper、版本目录、SDK/NDK/JDK 清单 | 与选定 NSH Android 宿主实际兼容后锁定所有精确版本，不能使用动态 `+` 版本           |

Rust 1.97 是源码要求，不代表已经证明桌面/Android 集成能通过。Android 的 JDK、AGP、Gradle、NDK 组合，以及所有新工具的精确版本，在首个兼容性提交中填写并通过干净环境构建；不以 `latest`、滚动 `stable` 或不明全局版本代替锁定。

`setup` 只下载所选目标需要的工具，并校验官方发布的摘要。项目私有工具放到 `.local/tools/`；Rust 编译器由 rustup 管理。不替换用户默认编译器、不改 shell 配置、不自动接受 SDK 许可。普通依赖安装不隐式执行全量原生下载。

`doctor` 按 `web/desktop/tv/ci` profile 报告缺失项、实际版本、目标 triple、SDK 路径及修复命令；支持机器可读 JSON 和失败退出码。目标缺失必须标为失败或明确未支持，不能静默跳过后汇总为成功。

## 2. TypeScript、NSH 与 Node

| 职责                          | 工具                           | 检查要求                                             |
| ----------------------------- | ------------------------------ | ---------------------------------------------------- |
| JS/TS 静态规则                | Oxlint                         | 首方代码无新增警告；根配置按运行环境 overrides       |
| JS/TS/JSON/YAML/Markdown 格式 | Oxfmt                          | 仅读检查与显式写入分开；格式化不能顺带更改运行语义   |
| NSH 类型                      | `nsh check`                    | 三个入口分别使用自身生成类型，包含共享包源码及测试   |
| NSH 编译语义                  | `nsh build`                    | 与类型检查同时必需；未知类名、无效导出等警告必须处理 |
| UI/共享业务测试               | `nsh test`                     | 三端入口装配、模拟网络、状态/生命周期回归            |
| Node 工程测试                 | `node --test`                  | 开发进程编排、配置隔离、目标解析、版本检查、失败清理 |
| 边界检查                      | Oxlint 导入限制 + 少量结构断言 | 防止 Node/原生模块进入错误运行环境，禁止反向依赖     |

NSH overrides 使用其实际 globals，包括 `If/Each`；不启用 React hooks、React runtime 或 DOM 规则。Node 工程脚本继续使用标准 ESM `.mjs`，避免仅为编排脚本增加转译器。

共享 TSX 包使用源码 exports，不用普通 TS 编译器先降级 JSX，以免丢失 NSH 的响应式转换。类型检查在应用上下文执行；根编辑器配置只提供开发上下文，不能替代每入口检查。

Oxfmt 初期关闭未验证的 import/class 自动排序，避免重排有副作用的 import 或 NSH 类名覆盖顺序。用现有代码、控制流标签和主题样本验证格式化幂等性后再扩展规则。

默认忽略 `.nsh/`、`target/`、`node_modules/`、`.local/`、产物与第三方上游。契约生成代码由生成器控制格式；先检查来源可再生，不手工批量修补。

## 3. Rust

Rust 检查覆盖 core、HTTP 层、Web 服务、native bridge 及实际宿主成员，不用一个空 crate 通过检查来声称核心和原生工程完备。

| 职责            | 工具/策略                                              | 执行位置                                          |
| --------------- | ------------------------------------------------------ | ------------------------------------------------- |
| 格式            | `cargo fmt --all -- --check`                           | 本地、每个 PR                                     |
| 编译            | `cargo check --locked`，按宿主选择成员/features/target | 本地、每个受支持平台的 PR job                     |
| 静态检查        | 同一工具链的 Clippy，`--all-targets -- -D warnings`    | 本地、每个 PR                                     |
| 单元/集成测试   | cargo-nextest                                          | 本地、每个 PR；超时和重试策略提交到配置           |
| 文档测试        | `cargo test --doc --locked`                            | PR；与 nextest 分开执行                           |
| 覆盖率          | cargo-llvm-cov，固定兼容版本                           | portable crates 的 PR 报告；关键变更不得丢失场景  |
| 供应链          | cargo-deny                                             | PR 与定期检查；许可证、advisories、来源与依赖策略 |
| 协议与解析 fuzz | cargo-fuzz，固定工具及 nightly 版本                    | PR corpus 回归、定期有时限 fuzz                   |
| FFI 内存边界    | 目标化 Miri/sanitizer 验证                             | 引入 unsafe/JNI/原生播放器后在专门 job 中运行     |

根 `[workspace.lints]` 统一约束，成员显式继承。公共接口有文档；禁止非 FFI 模块随意使用 unsafe。生产代码的 panic/unwrap、锁持有时间、阻塞操作和资源 Drop 路径列入 review。FFI 对 panic、跨线程回调和销毁竞态必须有测试。

`--all-targets` 指当前 triple 下的库、二进制、测试和 examples，不代表所有平台；不一律加 `--all-features`，避免同时启用互斥的 macOS/Windows/Linux/Android 特性。可移植 crate 与平台宿主分别检查，平台特性组合显式列入矩阵。

NSH mixed 原生类型需要编译并 describe crate 才能生成。bootstrap/CI 的顺序必须包含原生描述，再运行 TSX 检查。生成 runner 可能有独立依赖解析，接入时必须核实锁定方式和依赖一致性；未解决前不能开启正式 native release。

性能基线包括核心初始化、存储恢复、播放解析、首帧、有界媒体缓冲与退出耗时。Rust 更改必须覆盖初始化失败、无效凭据、数据库损坏/写盘失败、取消、重复停止、后台恢复与升级切换。核心同宿主运行，需要额外检查任务/线程/句柄泄漏及 panic 对整个宿主的影响。

## 4. 核心兼容、存储与并发测试

重写按行为对齐，核心首先建立去敏 golden vectors 与合成媒体 fixtures。样本标记来源 SHA、输入和预期输出；默认测试直接消费样本，不编译或运行旧实现。

| 范围              | 验证要求                                                      |
| ----------------- | ------------------------------------------------------------- |
| 签名与参数规范化  | 固定时钟/随机源；字段顺序、编码、字节结果及错误输入           |
| 媒体与流式处理    | 任意偏移、分片边界、Range/ETag、206/416、断流、取消、有界内存 |
| 账号与会话        | 扫码状态机、恢复/过期/取消，多账号上下文不共享凭据或缓存      |
| 存储              | 原子写入、失败不发布状态、并发进度排序、崩溃恢复与迁移/备份   |
| HTTP/原生 adapter | 相同用例和错误码；取消/超时/销毁不因调用方式而漂移            |
| Web 服务          | 会话隔离、慢客户端、限流、媒体流回压、服务关闭与恢复          |

nextest 的超时、隔离和平台配置提交到仓库。Tokio 异步测试覆盖任务取消与关闭顺序；可用受控时钟避免依赖真实等待。proptest 用于适合的解析/序列化性质，cargo-fuzz 针对不可信协议和媒体解析；复杂共享状态确有需要时再加入 Loom 模型检查。

Rust 不能以“没有数据竞争”替代所有并发验证：进度覆盖、重复关闭、回调与销毁竞态、事务次序仍需要集成场景。Miri/sanitizer 只覆盖适用模块，不能当成原 `-race` 的一对一替换。

Web API 与媒体测试默认使用本地 fixture server，不连接真实上游、不使用真实账号、不产生账号副作用。真实内容验证单独执行并记录边界。退役旧工程后，在没有 Go 的干净环境完成完整检查与打包，防止脚本或测试偷偷保留旧运行依赖。

## 5. Android 与平台依赖

TV 工程包含真正可重复构建的原生宿主，而不止 `--target android` 别名。

- 提交 Gradle Wrapper、精确的 AGP/Kotlin 版本、依赖锁定与校验配置；JDK/SDK/build-tools/NDK/CMake 按实际需求列入目标清单。
- Kotlin/Android 代码启用 Android Lint 与对应版本的静态检查/格式规则；新增原生代码时立即接入，不留为事后任务。
- Rust Android target、NDK linker、JNI/NSH embedding 的工具版本和 ABI 显式指定；归档 Rust native library 与 Android 宿主产物的来源及校验值。
- 建立 arm64 真机验收，按实际设备需求决定是否发布 armv7；x86_64 模拟器只用于适用的自动化测试。
- 验证 Leanback 入口、触屏非必需、遥控键路由、焦点恢复、视频 surface 生命周期、后台恢复、音频焦点及内存压力。
- Android API 26 是当前 NSH 范围下限；最终 min/target SDK 与分发渠道要求分别管理，不能把最低运行版本当成 target SDK。

macOS 使用 Xcode CLT/SDK 与签名工具；Windows 使用匹配的 MSVC/SDK；Linux 固定 GTK 与系统库基线。宿主编译和安装包冒烟在本平台执行，交叉编译不能替代安装验证。

## 6. 统一命令契约

以下是完整产品的命令目标；当前第一阶段命令已切换 pnpm，实际行为以 README 为准。

| 命令                                      | 责任                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`          | 只安装锁定的 JS/工程依赖；CI 不改 lockfile                        |
| `pnpm setup --target <target>`            | 准备目标工具、校验 fixtures 来源、生成类型/配置；可重复且保留数据 |
| `pnpm doctor --target <...> [--json]`     | 精确检查目标环境与支持状态                                        |
| `pnpm dev:web` / `dev:desktop` / `dev:tv` | 启动指定产品，隔离运行配置、清理本次子进程                        |
| `pnpm fmt` / `fmt:check`                  | 调用 Oxfmt、rustfmt、Android 格式工具；写入与只读分离             |
| `pnpm lint`                               | 按 profile 调用 Oxlint、Clippy、Android Lint；不自动修复          |
| `pnpm check`                              | 契约/包边界、各入口 NSH 类型、目标 Rust 编译检查                  |
| `pnpm build`                              | 当前 profile 的 NSH bundle、Rust 核心/宿主/服务构建；不等于发行包 |
| `pnpm test`                               | Node、NSH、Rust 的自动化行为测试，报告按责任层分组                |
| `pnpm verify --target <...>`              | doctor → 格式 → lint → check → build → test；目标缺失失败         |
| `pnpm verify:portable`                    | 无设备的公共层与 Web 检查；输出不冒充 native/TV 验收              |
| `pnpm security`                           | JS/Rust/Android 依赖与首方代码扫描；网络失败标为检查未完成        |
| `pnpm codegen` / `codegen:check`          | 生成提交的契约代码 / 验证无漂移                                   |
| `pnpm package:<target>`                   | 形成完整目标产物；开发前端包另有显式标记                          |
| `pnpm hooks:install`                      | 仅在当前仓库安装 Lefthook；无 Git 的源码包也能开发构建            |

所有命令具备稳定退出码、清晰的阶段/目标日志；不得出现“没安装工具就跳过测试并返回通过”。需要调用系统命令时使用参数数组和明确 cwd，避免依赖 Unix shell 拼接、绝对开发机路径或隐式环境变量。

`verify` 不默认要求其他操作系统的 SDK。CI 汇聚所有支持目标的结果，才构成全产品门禁。pnpm workspace 的拓扑排序只管理 JS 包图；Rust 编译、契约导出与 NSH 类型生成的先后依赖由小型编排脚本显式处理。

## 7. Git 与协作

采用 trunk-based development：目标主分支 `main`，短期功能分支，PR 合并。当前仓库尚无首次提交，仍在 `master`；设计阶段不自动改名或创建基线提交。

| 环节           | 工具/规则                                                         |
| -------------- | ----------------------------------------------------------------- |
| 换行/编码      | `.editorconfig` + `.gitattributes`；文本统一 LF、二进制显式标记   |
| hooks          | Lefthook，显式安装；统一调度 JS/Rust/Android 检查                 |
| pre-commit     | 首方工作区的只读格式/lint/契约检查；排除第三方与生成目录          |
| commit-msg     | commitlint + Conventional Commits                                 |
| pre-push       | 运行完整 verify；跨系统与真机矩阵由 CI/验收保证                   |
| PR             | 模板包含问题/结果、影响端、验证证据、迁移与回滚                   |
| 合并           | 受保护主分支，至少一位人工 reviewer，必需 CI，通过后 squash merge |
| 提交与发布历史 | 校验 squash PR 标题；统一产品版本、按端记录 changelog             |
| 代码责任       | CODEOWNERS 映射真实维护者；共享契约/上游更新/原生边界需对应审查   |

提交示例：`feat(tv): support remote focus restoration`、`fix(core): preserve media range cancellation`、`chore(tooling): pin Rust checks`。scope 对应产品或责任层，中文说明允许。

hooks 不执行 `git add`、不隐式 `--fix`、不批量 stash/reset，不将同文件其他未暂存改动带入提交。只读文件检查反映工作区内容，不保证完全等于部分暂存的 index；最终以 CI 检查提交内容为准。

显式修复使用 `pnpm fmt` 或专门 fix 命令，由开发者审阅并暂存。AI Agent 同样必须保留无关 dirty 改动、只提交本任务文件，并报告是否推送；不绕过 hooks/CI，不把模型自查当成人工 review。

为依赖升级设置分组 PR，使用 Renovate 管理 pnpm/Cargo/Actions/Gradle 版本。NSH CLI 与 `nsh-*` 联动升级；工具升级、协议行为变更与业务改动分别提交，保留可定位的回退点。

## 8. CI 矩阵与必需门禁

| Job               | 环境                   | 必需内容                                                                     |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `quality`         | 固定 Linux runner/镜像 | frozen install、格式、Oxlint、契约生成检查、包边界、提交/PR 标题             |
| `rust-core`       | Linux                  | 根锁检查、core/http-api 的 Clippy/nextest/doctest/覆盖率、测试向量与并发场景 |
| `web`             | Linux + 浏览器         | NSH check/build/headless、静态产物、Web API 集成与浏览器冒烟                 |
| `desktop-macos`   | macOS                  | mixed 原生构建、Rust/NSH 测试、进程内核心生命周期、无开发服务安装包冒烟      |
| `desktop-windows` | Windows                | MSVC 构建、同类生命周期/安装冒烟、路径/退出兼容                              |
| `desktop-linux`   | 固定 Linux/GTK 基线    | 原生构建、同类冒烟、动态库依赖验证                                           |
| `tv-android`      | 固定 JDK/SDK/NDK       | Rust/JNI 编译、Android Lint、桥接/宿主测试、APK 产物与模拟器可自动化场景     |
| `security`        | 受限权限 Linux         | pnpm audit、cargo-deny、secret scan、Android 依赖及许可策略                  |
| `required`        | 汇聚 job               | 检查所有适用 job 的结果；不把失败、取消或不应跳过的 job 当作通过             |

只有已经接通并验收的目标才宣称受支持；支持的目标失败不能改成 allow-failure。新增目标先完成工作流与验收，再加入支持矩阵。

共享包、契约、锁文件、工具链、CI 配置或核心变更触发完整适用矩阵。纯端侧改动可缩减到该端与公共检查；Rust crate 图不能只用 pnpm 的 changed filter 推导影响。默认全跑，矩阵稳定后再优化路径过滤。

Actions 固定完整 commit SHA，默认 `contents: read`。非信任 PR 不获得签名/部署密钥，不通过 `pull_request_target` 执行其代码。缓存键包含 OS/架构、编译器、锁文件、features/target；不缓存账号数据或签名材料。

CI 上传按语言区分的测试/覆盖率、NSH 构建日志、安装冒烟日志与必要截图。失败报告区分工具缺失、编译、行为、网络与设备故障；重试有上限，不能反复重跑掩盖不稳定测试。

## 9. 安全、测试与可观测性

依赖门禁按实际可达性、严重性与许可证政策处理；例外必须有责任人、原因和到期日。cargo-deny 负责 Rust，pnpm audit 负责 JS，Android 依赖进入统一 SBOM/扫描流程；不重复堆叠用途相同的工具。secret scan 使用锁定版本的 Gitleaks，覆盖提交差异及首次发布前的历史。

测试分为纯逻辑、语言集成、跨语言契约、宿主/安装、真机/真实媒体五层。默认自动测试使用可重复 fixtures，不以随机的真实短剧标题和封面为断言。真实内容验证单独记录时间、平台和局限。

关键不变量优先于虚高的全仓覆盖率：历史请求大小、实际播放后才写进度、异步旧响应不覆盖、进度串行写入、账号隔离、媒体 Range、宿主退出清理、FFI 所有权和升级兼容必须有测试。建立实际覆盖基线后，约束关键模块及变更覆盖回退；不为凑数字测试实现细节。

PR 使用 fuzz corpus 回归；定期运行限时 cargo-fuzz，所需 nightly 与主 Rust 工具链分别锁定。加入 FFI 后增加目标化 Miri/sanitizer；不要求不兼容的原生 UI 依赖在 Miri 中运行。竞态、泄漏、崩溃和 fuzz 复现样本归档，修复后进入回归集。

日志包含 `build_id`、`instance_id`、`request_id` 和稳定错误码，在 TSX/Rust 原生与 HTTP 调用中传递请求关联信息。默认不记录令牌、二维码凭据、签名媒体 URL 或完整账号数据。服务提供健康/就绪状态和优雅停止；客户端错误给出可行动恢复路径。

建立初始化、首帧、切集、长播内存、会话恢复与媒体吞吐的基线后设置回退阈值。发布前执行长播、弱网/断网恢复、关窗/后台恢复及存储/网络任务失败，记录结果而非仅保存截图。

## 10. 版本、构建与发布

产品使用统一 SemVer 与递增 build number，首次实施时建立唯一产品版本文件，并同步生成 NSH manifest/宿主版本。内部 workspace 包保持 private；暂不需要独立 npm 发布或 Changesets 多包版本流程。Rust 核心与产品绑定发行，API/bridge 版本及行为参考来源单独记录。

发布流水线按以下顺序执行：

```mermaid
flowchart LR
  Tag[受保护版本标签] --> Verify[完整质量与兼容门禁]
  Verify --> Build[各平台原生构建]
  Build --> Smoke[安装与升级冒烟]
  Smoke --> Sign[平台签名与公证]
  Sign --> FinalCheck[验签与最终产物冒烟]
  FinalCheck --> Evidence[摘要 SBOM 来源证明]
  Evidence --> Draft[草稿发布与验收]
  Draft --> Publish[受保护环境发布]
```

桌面/TV 完整产物链接匹配的 Rust 核心，Web 使用携带同一核心的 Rust 服务端。用户不需要 Node、Rust 编译器、NSH CLI 或本地开发服务。干净构建与发行环境不安装 Go；Web 浏览器资源与服务器镜像分别打包并标记兼容协议。

macOS 使用 Developer ID 签名/公证，Windows 使用 Authenticode，Android 使用受保护 keystore；Linux 发布校验摘要及适用的签名。NSH 更新清单签名、平台代码签名、供应链来源证明分别验证，互不替代。

发布记录包含产品版本、Git SHA、行为参考来源、NSH 版本、Rust/Node/pnpm 版本、target/ABI/SDK、协议版本、构建 job、摘要与已完成的验收。使用锁定 Syft 生成覆盖实际 Rust/JS/Android/原生依赖的 SBOM，校验许可证和第三方 NOTICE。构建 provenance/签名通过受控 CI 身份生成。

纯产物在锁文件与固定环境下验证可重复内容；时间戳/平台签名等引入非确定部分应单独记录，不能未经比对宣称 bit-for-bit reproducible。归档源码映射、Rust 符号和 Android 符号，以支持对应版本排错。

Web 按不可变镜像摘要灰度/回滚。桌面更新原子切换，失败保留上一可用版本；升级核心前验证数据兼容。数据库/记录格式变更带迁移版本、备份恢复与前后版本兼容测试，不将降级二进制等同数据可降级。Android 数据迁移向前兼容，分发与回滚能力按实际渠道验证。

签名与发布仅在受保护环境使用短期凭据/受控密钥。开发与 PR 不自动部署或发布；发行条件未满足时保留可检查的草稿及产物，不把 unsigned 开发包标成正式发行。

## 11. 实施交付清单

首个工程化阶段应提交以下可评审结果：

1. pnpm/Cargo workspace、版本文件、锁文件及可重复 bootstrap；新工作区命令不依赖旧语言工具，每项工具有对应调用与失败用例。
2. Oxlint/Oxfmt、rustfmt/Clippy/nextest、核心测试向量与契约检查的真实接入，命令能从任意 cwd 正确运行。
3. 包边界与契约生成验证；保留现有 UI/网关场景，将核心必需行为转为 Rust 测试。旧测试通过不能代替 Rust 核心验证。
4. Lefthook、commitlint、编辑器配置、PR 模板与基础 CI；在临时 Git 仓库验证 hooks 不改工作区/index，正确拦截失败。
5. 新环境复现记录，覆盖成功初始化、重复执行、缺工具/版本错误、构建失败退出与子进程清理。
6. Rust/Android 尚未通过的兼容项清单和负责人；正式宿主与发行门禁按架构阶段逐步接通，状态明确。旧工程退役后在没有 Go 的机器完成 setup/verify/发行构建。

不得仅添加配置文件、工具名称或空成功脚本就标记工具链完备。每个门禁必须能证明成功，也能证明一个真实失败会被阻断。

## 12. 官方依据

- [Oxlint 配置](https://oxc.rs/docs/guide/usage/linter/config.html)、[Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)。
- [rustup 工具链文件](https://rust-lang.github.io/rustup/overrides.html#the-toolchain-file)、[Clippy CI](https://doc.rust-lang.org/clippy/continuous_integration/index.html)、[nextest](https://github.com/nextest-rs/nextest)、[cargo-deny](https://embarkstudios.github.io/cargo-deny/)。
- [cargo-fuzz](https://rust-fuzz.github.io/book/cargo-fuzz.html)。主工具链与 fuzz 专用 nightly 分开锁定。
- [Lefthook 文件参数](https://lefthook.dev/configuration/run/)、[自动暂存配置](https://lefthook.dev/configuration/stage_fixed/)、[commitlint hooks](https://commitlint.js.org/guides/local-setup.html)。
