# 工程工具链与交付规范

现行工程要求；实际命令以根package.json／工程脚本及[运行手册](docs/development.md)为准，实现状态看[台账](docs/feature-ledger.md)，实际结果看[VALIDATION](VALIDATION.md)。本文件不维护每日实施进度，TV专项流程见[TV_DEVELOPMENT](TV_DEVELOPMENT.md)。

## 1. 工具链所有权与版本

pnpm 提供统一入口，各语言工具保留自身职责。开发机和 CI 使用相同的版本文件、参数与报告格式。

| 范围         | 版本/配置入口                              | 策略                                                                               |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Node         | `.node-version`、`engines`                 | 初始锁定当前已验证的 26.12.1；其他版本经矩阵验证后再声明支持                       |
| pnpm         | 根 `package.json#packageManager`           | 初始锁定已验证的 `pnpm@11.1.3`；提交单一 `pnpm-lock.yaml`                          |
| NSH          | `.nsh-version`                             | 保持 0.7.0；CLI、runtime、Rust `nsh-*` 依赖保持一致                                |
| Rust         | `rust-toolchain.toml`                      | 固定 1.97.0，包含 rustfmt、clippy；宿主兼容性按目标实际构建与验收                  |
| Rust 包      | 根 `Cargo.toml`、`Cargo.lock`              | Edition 2024、resolver 3；显式成员、共享依赖与 lints；应用锁文件提交               |
| JS 工具      | 根 devDependencies + pnpm lock             | Oxlint、Oxfmt、Lefthook、commitlint、契约生成器使用精确版本                        |
| 原生辅助工具 | `tooling/tools.json`                       | nextest、cargo-deny、cargo-llvm-cov、cargo-fuzz、扫描/发布工具锁定版本与下载校验值 |
| 契约         | Rust DTO/路由 + 生成的 OpenAPI/TS types    | utoipa 与 openapi-typescript 锁定版本；离线导出，不启动真实服务                    |
| Android      | Gradle Wrapper、版本目录、SDK/NDK/JDK 清单 | 与选定 NSH Android 宿主实际兼容后锁定所有精确版本，不能使用动态 `+` 版本           |

版本文件是工具链要求，不代表所有平台已验收。Android 的 JDK、AGP、Gradle、NDK 组合在宿主工程固定，按目标通过干净环境构建；不以 `latest`、滚动 `stable` 或不明全局版本代替锁定。

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

`@hongguo/app` 根出口指向 `src/index.tsx`，正式页面与业务只在 `src/`。`./testing/*` 指向 `test/`，仅供显式验收入口使用：状态夹具调用生产控制器，宿主测试加载生产页面并注入合成服务，不维护另一套业务实现。测试出口存在或夹具通过，不代表真实接口、独立安装包或完整功能已验收。

Oxfmt 初期关闭未验证的 import/class 自动排序，避免重排有副作用的 import 或 NSH 类名覆盖顺序。用现有代码、控制流标签和主题样本验证格式化幂等性后再扩展规则。

默认忽略 `.nsh/`、`target/`、`node_modules/`、`.local/`、产物与第三方上游。契约生成代码由生成器控制格式；先检查来源可再生，不手工批量修补。

### 图标资源与依赖

NSH 基础组件使用单一 `@hongguo/ui`，设计依据见 [DESIGN](DESIGN.md)和[组件交接](docs/design/component-design.md)，实际公共 API／用法见 [包规范](packages/ui/README.md)，覆盖与宿主证据见 [实施验收](docs/design/component-implementation.md)。

- 应用图标仅使用 Lucide 官方 SVG，视觉与使用规则以 [DESIGN.md「统一图标」](DESIGN.md#统一图标) 为准。NSH 侧经 `nsh-icon` 的 `<Icon>` 绘制，图标集为 `nsh-icon-lucide`；调用方从图标集导入常量再交给 `packages/ui` 的 `Icon`（`<Icon icon={Search} />` 或 `icon={Search}`），`packages/ui` 只适配尺寸与颜色。业务页面和各端入口不复制图标路径。
- 三端 `nsh.json` 声明 `nsh-icon`／`nsh-icon-lucide`（`^0.2.2`），解析结果由各端 `nsh.lock` 锁定并随应用提交；`nsh add` 同时写入应用 crate 的 Cargo 依赖。只打包实际使用的图标，不依赖运行时 CDN；升级时用 `nsh upgrade` 更新锁文件，并同步浏览器原型的同版本资源和校验。
- 不引入 `lucide-react`、DOM 图标运行时或其他 npm UI 依赖。不在 `packages/ui` 维护名称到图形的清单，也不按计算出的名称取图标：NSH 由导入静态裁剪，字符串查表会让整个图标集进包。图标常量直接出现在 JSX 与数据行里，打包内容因此等于实际引用。颜色经 `tone` 映射到 `text-*` 类字面量，由文字色继承。
- 浏览器原型资源位于 `packages/ui/assets/lucide/`（Lucide 1.43.0、ISC 许可证、逐图 SHA256）；`pnpm ui:icons` 再生并校验，`pnpm ui:icons:check` 检查漂移，禁止手工修改几何数据。
- 迁移时核对每个语义名称、主题颜色、尺寸、状态及可访问名称，执行对应 NSH check **和** build，并在实际宿主观察。新增依赖执行 `pnpm security`；依赖或资源落地前，本规则仅表示已确定的约束，不表示已完成迁移或验收。
- 浏览器原型资源位于 `packages/ui/assets/lucide/`（Lucide 1.43.0、ISC 许可证、逐图 SHA256）；`pnpm ui:icons` 再生并校验，`pnpm ui:icons:check` 检查漂移，禁止手工修改几何数据。
- 迁移时核对每个语义名称、主题颜色、尺寸、状态及可访问名称，执行对应 NSH check **和** build，并在实际宿主观察。新增依赖执行 `pnpm security`；依赖或资源落地前，本规则仅表示已确定的约束，不表示已完成迁移或验收。

### 基础组件工程边界

- `packages/ui/src/index.tsx` 仅导出；内部直接导入组件所属模块，禁止循环回引自身入口。`./preview` 与 `./testing` 仅用于显式开发入口。
- 一个package共用API／值／状态，端型主题由 app 的 `nsh.json` 选择（`theme.json`／`theme.tv.json`，由 DESIGN.md 生成），尺寸集中于 foundation 并读主题 token；组件不读端型，TV 行为由调用方传显式 props；只有真实输入／宿主边界适配，不复制业务控制器，不拆 desktop-ui／tv-ui。
- `pnpm ui:check` 同时检查并构建三端验收入口；`pnpm ui:test` 检验公共控件行为；`pnpm ui:host:desktop`／`ui:host:tv` 在macOS分别观察桌面临时密度与TV密度，一条命令只开一个后台窗口、不抢键盘；`pnpm ui:preview` 才激活前台，每个端复用固定端口，重复启动替换上一次预览，不再叠加窗口。它不代表Android TV或遥控／输入法验收。
- `pnpm visual:tv` 是常规视觉验收入口：TV 页面与组件板一次出齐，默认无头 Chrome 零窗口，`--android` 在固定模拟器上验证 Android 自身绘制。截图不等于逐帧动效、读屏、遥控或真实数据验收；`ui:host:*` 只在需要观察 AppKit 窗口时使用。
- 产品设计稿与浏览器组件板使用 `design/prototype/visual-redesign-real/shared/` 资源；新增原型先扩共用组件，不在页面复刻视觉。浏览器实现不导入NSH运行时，NSH不导入DOM/CSS库。

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

### TV 公共焦点标记契约

- `focus-entry-*` 标记替换内容的一次入口交接：最新可见区域的首个可操作子项取得初始焦点，保留仍被遮挡的来源。初次原生布局期间保持该身份，新按键／指针意图立即撤销；不缩窄全局候选，不形成模态焦点陷阱。
- 阅读区域必须有可访问名称、启用、不可点击。长正文包含实际可滚动视口；会被 DPAD 跨过的短正文以公共 `testID="focus-region-*"` 显式加入，作为无点击动作的阅读停靠点，不为制造滚动而裁短正文。TSX 同时声明 `focusable`，但 NSH 0.5 Android 未将其映射为原生 View 焦点，宿主不能先要求原生可聚焦才收集该阅读点。API 30+ 仍要求精确 `role="region"`；API 26–29 的 NSH 不输出角色元数据，只接受上述显式标记，不能从名称或 `importantForAccessibility` 推断。跨版本页面同时声明角色和标记，保留正文的读屏子树。
- 阅读区域取得焦点后，方向键先滚动，边缘再导航；确认键没有点击动作。普通媒体面板不会仅因有名称或滚动内容而成为阅读区域。标记改变时同步更新宿主、测试与页面引用；实际版本／设备的验收范围以 VALIDATION.md 为准。

macOS 使用 Xcode CLT/SDK 与签名工具；Windows 使用匹配的 MSVC/SDK；Linux 固定 GTK 与系统库基线。宿主编译和安装包冒烟在本平台执行，交叉编译不能替代安装验证。

## 6. 统一命令契约

以下定义命令责任；是否已接通及实际参数以根package.json／工程脚本为准，运行方法见开发运行手册，不能把命令目标当成已实现。

| 命令                                            | 责任                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                | 只安装锁定的 JS/工程依赖；CI 不改 lockfile                        |
| `pnpm setup:workspace --target <target>`        | 准备目标工具、校验 fixtures 来源、生成类型/配置；可重复且保留数据 |
| `pnpm doctor:workspace --target <...> [--json]` | 精确检查目标环境与支持状态                                        |
| `pnpm dev:web` / `dev:desktop` / `dev:tv`       | 启动指定产品，隔离运行配置、清理本次子进程                        |
| `pnpm fmt` / `fmt:check`                        | 调用 Oxfmt、rustfmt、Android 格式工具；写入与只读分离             |
| `pnpm lint`                                     | 按 profile 调用 Oxlint、Clippy、Android Lint；不自动修复          |
| `pnpm check`                                    | 契约/包边界、各入口 NSH 类型、目标 Rust 编译检查                  |
| `pnpm build`                                    | 当前 profile 的 NSH bundle、Rust 核心/宿主/服务构建；不等于发行包 |
| `pnpm test`                                     | Node、NSH、Rust 的自动化行为测试，报告按责任层分组                |
| `pnpm verify --target <...>`                    | doctor → 格式 → lint → check → build → test；目标缺失失败         |
| `pnpm security`                                 | JS/Rust/Android 依赖与首方代码扫描；网络失败标为检查未完成        |
| `pnpm codegen` / `codegen:check`                | 生成提交的契约代码 / 验证无漂移                                   |
| `pnpm package:<target>`                         | 形成完整目标产物；开发前端包另有显式标记                          |
| `pnpm hooks:install`                            | 仅在当前仓库安装 Lefthook；无 Git 的源码包也能开发构建            |

所有命令具备稳定退出码、清晰的阶段/目标日志；不得出现“没安装工具就跳过测试并返回通过”。需要调用系统命令时使用参数数组和明确 cwd，避免依赖 Unix shell 拼接、绝对开发机路径或隐式环境变量。

`verify` 不默认要求其他操作系统的 SDK。CI 汇聚所有支持目标的结果，才构成全产品门禁。pnpm workspace 的拓扑排序只管理 JS 包图；Rust 编译、契约导出与 NSH 类型生成的先后依赖由小型编排脚本显式处理。

`check`、`build`、`test` 中的各端 NSH 调用按端并行：三端各有独立的 fixtures、端口、临时存储与 `.nsh` 产物，不存在共享状态。每端的输出在结束时整段打印，失败仍带完整日志并让阶段以非零退出；任一端失败不影响其余端跑完，最终汇总报出失败项。Rust 侧只跑一次 Clippy 驱动类型检查，不再先跑一遍 `cargo check` 重复编译同一批产物。单端可用 `--target` 只跑该端。改动门禁编排后须实测一次全量 `pnpm verify` 确认总时长与并行前的用例数一致。

## 7. Git 与协作

目标采用短期功能分支与PR合并；当前分支／提交状态以Git为准，不根据早期提案改名。是否提交、推送、合并或发布遵守用户授权，不从流程建议推导授权。

| 环节           | 工具/规则                                                         |
| -------------- | ----------------------------------------------------------------- |
| 换行/编码      | `.editorconfig` + `.gitattributes`；文本统一 LF、二进制显式标记   |
| hooks          | Lefthook，显式安装；统一调度 JS/Rust/Android 检查                 |
| pre-commit     | 首方工作区的只读格式/lint/契约检查；排除第三方与生成目录          |
| commit-msg     | commitlint + Conventional Commits                                 |
| pre-push       | 只读格式/lint/契约检查；完整 verify 在批次冻结时执行              |
| PR             | 模板包含问题/结果、影响端、验证证据、迁移与回滚                   |
| 合并           | 受保护 master：必须 PR、required 必过、禁强推与删除，squash merge |
| 提交与发布历史 | 校验 squash PR 标题；统一产品版本、按端记录 changelog             |
| 代码责任       | CODEOWNERS 映射真实维护者；共享契约/上游更新/原生边界需对应审查   |

提交示例：`feat(tv): support remote focus restoration`、`fix(core): preserve media range cancellation`、`chore(tooling): pin Rust checks`。scope 对应产品或责任层，中文说明允许。

hooks 不执行 `git add`、不隐式 `--fix`、不批量 stash/reset，不将同文件其他未暂存改动带入提交。只读文件检查反映工作区内容，不保证完全等于部分暂存的 index；最终以 CI 检查提交内容为准。

显式修复使用 `pnpm fmt` 或专门 fix 命令，由开发者审阅并暂存。AI Agent 同样必须保留无关 dirty 改动、只提交本任务文件，并报告是否推送；不绕过 hooks/CI，不把模型自查当成人工 review。

交付源码在用户当前主项目工作区修改、验收和提交。临时目录只承载构建缓存或可再生验收产物；旧临时 worktree 仅作只读迁移参考。迁回按功能核对差异，保留主仓已有修复和并行改动，并在主仓重新验收；临时草稿、旧 worktree 的通过记录和构建缓存都不能算作交付。

为依赖升级设置分组 PR，使用 Renovate 管理 pnpm/Cargo/Actions/Gradle 版本。NSH CLI 与 `nsh-*` 联动升级；工具升级、协议行为变更与业务改动分别提交，保留可定位的回退点。

## 8. CI 矩阵与必需门禁

| Job               | 环境                | 必需内容                                                                     |
| ----------------- | ------------------- | ---------------------------------------------------------------------------- |
| `scope`           | 固定 Linux runner   | 按改动路径判定哪些 job 适用；无法判定时回退完整矩阵                          |
| `checks`          | 固定 Linux runner   | frozen install、格式、Oxlint、契约生成检查、包边界、提交/PR 标题、工具测试   |
| `rust-core`       | Linux               | 根锁检查、core/http-api 的 Clippy/nextest/doctest/覆盖率、测试向量与并发场景 |
| `web`             | Linux + 浏览器      | NSH check/build/headless、静态产物、Web API 集成与浏览器冒烟                 |
| `desktop-macos`   | macOS               | mixed 原生构建、Rust/NSH 测试、进程内核心生命周期、无开发服务安装包冒烟      |
| `desktop-windows` | Windows             | MSVC 构建、同类生命周期/安装冒烟、路径/退出兼容；仅合并后的 push 运行        |
| `desktop-linux`   | 固定 Linux/GTK 基线 | 原生构建、同类冒烟、动态库依赖验证                                           |
| `tv-android`      | 固定 JDK/SDK/NDK    | Rust/JNI 编译、Android Lint、桥接/宿主测试、APK 产物与模拟器可自动化场景     |
| `security`        | 受限权限 Linux      | pnpm audit、cargo-deny、secret scan、Android 依赖及许可策略                  |
| `required`        | 汇聚 job            | 检查所有适用 job 的结果；不把失败、取消或不应跳过的 job 当作通过             |

只有已经接通并验收的目标才宣称受支持；支持的目标失败不能改成 allow-failure。新增目标先完成工作流与验收，再加入支持矩阵。

共享包、契约、锁文件、工具链、CI 配置或核心变更触发完整适用矩阵。纯端侧改动可缩减到该端与公共检查；Rust crate 图不能只用 pnpm 的 changed filter 推导影响。默认全跑，矩阵稳定后再优化路径过滤。

路径过滤由 `tooling/src/ci-paths.mjs` 实现，`pnpm ci:jobs` 输出 `rust`／`web`／`desktop`／`tv` 四个 job 是否适用。规则只允许「可证明受限」的裁剪：`docs/`、`design/`、`openspec/`、`upstream/` 与根级声明文档不触发构建；`apps/<target>/` 只触发该端；`apps/{desktop,tv}/native/` 属于 Rust 工作区成员，触发 Rust 矩阵。其余位置（packages、contracts、crates、services、tooling、根配置与锁文件）一律返回完整矩阵，Git 范围不可用时同样回退完整矩阵——判错只会多跑，不会少跑。

`required` 同时校验两个方向：需要跑的 job 必须 `success`，被判定不适用的 job 必须是 `skipped`；某 job 实际跑了但 `scope` 判定不需要也算失败。这样裁剪逻辑本身出错时会在汇聚 job 暴露，而不是悄悄放行。对应回归在 `tooling/test/ci-paths.test.mjs` 与 `tooling/test/ci-gate.test.mjs`。

`checks` 是全部快速门禁的独立闸门：frozen install、格式、Oxlint、契约生成、包边界、PR 标题与工具测试，约 40 秒。工具测试并非纯读文件——`update-manifest.test.mjs` 与归档测试会对 fixture 运行 `nsh update-manifest`，所以这个 job 必须安装 pinned NSH；缺少时会在任何 Rust 工作开始前以 `spawnSync nsh ENOENT` 失败（run 45745109311）。安装只是一次下载，闸门仍远早于所有编译 job。`rust`、`workspace`、`entry`、`security` 都 `needs: checks`，所以格式化一类的错误在几十秒内返回，而不是等 Rust 工具链、缓存恢复与安装之后；`required` 也把 `checks` 列为无条件必需的 job。这些步骤原先是 `workspace` 的前五步，串在关键路径上。

Rust 缓存只由 master 写入（`save-if`）。PR 若也保存，会在同一个键上互相竞争，而 10 GB 配额装不下每分支一代——此前四代合计 12.4 GB，每次保存都会驱逐别人还要用的缓存。entry 的 `cache-directories` 条目同样只从 master 保存。

`CARGO_PROFILE_DEV_DEBUG=line-tables-only` 在所有 cargo 构建上生效。`dev` 默认带完整调试信息，是缓存体积的主要来源；行表让失败仍能定位到文件与行，同时显著缩小每次打包与恢复的归档。实测 255 个测试在此设置下全部通过。

Linux entry job 的 GTK／GStreamer 基线约 45 MB，runner 的 Ubuntu 镜像曾以约 50 kB/s 传输，单次 975 秒。下载的 deb 缓存在 `runner.temp/apt-archives`，缓存键为 workflow 文件哈希，基线变更才失效。

entry job 的超时必须容纳冷启动，否则缓存未命中会被读成失败：NSH 0.7 下无缓存时 `tv`（macOS）crate 编译 9m33s、headless runner 13m19s，旧的 25 分钟上限在 25m22s 取消了仍在工作的 job（run 45632126021）。现为 macOS／Linux 45 分钟、Windows 60 分钟；热跑远在其内。

`nsh` 把构建写进 `apps/<app>/target`，而 `Swatinem/rust-cache` 只缓存仓库根的 `target/`，且保存时按根 workspace 的包清单裁剪。entry job 因此把 `apps/<app>/target` 作为 `cache-directories` 一并缓存——该参数原样打包、不经过裁剪，`nsh-app-*` runner（来自 `apps/<app>/.nsh/rust` 这套独立 workspace）才留得住。`cache-directories` 不参与缓存键，改动缓存内容必须同步改 `shared-key` 的代次，否则会命中不含新内容的旧缓存并跳过保存，长期静默冷跑。entry job 测试后断言 runner 落在 `target/debug`，产物位置漂移会直接失败。

不要把 `CARGO_TARGET_DIR` 指到仓库根 `target` 来共享产物：实测这会改变缓存键使全部旧缓存作废，`workspace` 里三个并行 `nsh check` 改成共用目录后被 cargo 文件锁串行化（`pnpm check` 142s→581s），而 runner 产物仍因裁剪而留不住，净效果是全线变慢。

pull request 的 entry 矩阵含 macOS 与 Linux，Windows desktop 只在合并后的 push 运行——它的冷启动约 8m44s，且该行验证的是构建与生命周期兼容性，不是 review 所需的行为。`entryMatrix` 按 `GITHUB_EVENT_NAME` 裁剪，无事件名时保留完整矩阵；`required` 只要求矩阵内列出的 job，因此裁剪不会让某个 host 两边都不跑。

Actions 固定完整 commit SHA，默认 `contents: read`。非信任 PR 不获得签名/部署密钥，不通过 `pull_request_target` 执行其代码。缓存键包含 OS/架构、编译器、锁文件、features/target；不缓存账号数据或签名材料。缓存键固定后 `saveCache` 会跳过已存在的键，不能靠冻结锁文件哈希复用旧缓存。

CI 上传按语言区分的测试/覆盖率、NSH 构建日志、安装冒烟日志与必要截图。失败报告区分工具缺失、编译、行为、网络与设备故障；重试有上限，不能反复重跑掩盖不稳定测试。

## 9. 安全、测试与可观测性

依赖门禁按实际可达性、严重性与许可证政策处理；例外必须有责任人、原因和到期日。cargo-deny 负责 Rust，pnpm audit 负责 JS，Android 依赖进入统一 SBOM/扫描流程；不重复堆叠用途相同的工具。secret scan 使用锁定版本的 Gitleaks，覆盖提交差异及首次发布前的历史。

功能验收以正式入口中的真实数据和实际使用流程为主。匿名内容使用当前真实服务；观看记录使用实际播放产生的本机持久数据；账号能力按明确授权使用真实账号。合成数据仅用于失败、极值、竞态等边界测试和回归，其通过结果不能作为功能验收通过、完成状态或 MVP 完成的依据。缺少真实数据、真实接口不可用或未完成真实流程时，保持“已实现待真实验收”，不得以 fixture 成功替代。记录应分别列出真实流程、合成边界、工程门禁和平台限制，关联源码、入口、数据来源、时间、操作及结果；历史记录同样按此标准重新判断。

真实接口返回成功只证明该次接口请求，不能替代用户操作后的可见结果与持久化结果。播放需观察真实媒体加载与进度增长，历史需由实际播放产生并核对重启后的持久结果。真实流程失败或受阻时保留失败证据；后续合成回归通过不改变该结论，重试恢复也须单列，不能改写成无故障通过。

`pnpm verify` 是工程门禁；通过不会把缺少真实流程证据的功能改为“已验收”。

测试分为纯逻辑、语言集成、跨语言契约、宿主/安装、真机/真实媒体五层。默认自动测试使用可重复 fixtures，不以随机的真实短剧标题和封面为断言。真实内容验证单独记录时间、平台和局限。

关键不变量优先于虚高的全仓覆盖率：历史请求大小、实际播放后才写进度、异步旧响应不覆盖、进度串行写入、账号隔离、媒体 Range、宿主退出清理、FFI 所有权和升级兼容必须有测试。建立实际覆盖基线后，约束关键模块及变更覆盖回退；不为凑数字测试实现细节。

PR 使用 fuzz corpus 回归；定期运行限时 cargo-fuzz，所需 nightly 与主 Rust 工具链分别锁定。加入 FFI 后增加目标化 Miri/sanitizer；不要求不兼容的原生 UI 依赖在 Miri 中运行。竞态、泄漏、崩溃和 fuzz 复现样本归档，修复后进入回归集。

日志包含 `build_id`、`instance_id`、`request_id` 和稳定错误码，在 TSX/Rust 原生与 HTTP 调用中传递请求关联信息。默认不记录令牌、二维码凭据、签名媒体 URL 或完整账号数据。服务提供健康/就绪状态和优雅停止；客户端错误给出可行动恢复路径。

建立初始化、首帧、切集、长播内存、会话恢复与媒体吞吐的基线后设置回退阈值。发布前执行长播、弱网/断网恢复、关窗/后台恢复及存储/网络任务失败，记录结果而非仅保存截图。

## 10. 版本、构建与发布

产品使用统一 SemVer 与递增 build number，唯一编辑源为 `product-version.json`，通过显式release:sync同步NSH manifest／宿主版本。内部 workspace 包保持 private；暂不需要独立 npm 发布或 Changesets 多包版本流程。Rust 核心与产品绑定发行，API/bridge 版本及行为参考来源单独记录。

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

## 11. 文档与Agent协作

文档职责与按任务阅读入口见[docs/README](docs/README.md)。规则、当前实现、计划和验收分别维护；其他文档链接唯一来源，不复制完整条款或逐轮进度。产品PRD不复制API／状态机／任务，变更技术方案归对应OpenSpec design，只有重要架构取舍建立ADR。

历史方案、被替代决策和完整运行记录保留来源、日期与证据限制，归入history／ADR／OpenSpec archive；历史开头注明非当前指令和现行入口。迁移先核对有效条款及平台差异，再改引用，不通过删文档隐藏失败。

OpenSpec格式校验不能证明实现／真实验收。同步主规范先核对重叠delta的最终语义；符合完成条件后再归档，不能因tasks已勾选批量归档。活跃变更不因文档整理被标记完成。

文档整理仅运行定向格式、相对链接／章节和适用OpenSpec校验，不重跑产品构建。涉及命令的说明要核对实际脚本；纯导航索引不复制正文。源码、工具、契约或UI改动仍执行各自必需检查。

### 上下文与工具输出

- 先用 `rg --files`／`rg -n` 定位，再读取完整的相关函数或章节；同一上下文已读且未变的不重复读。跨批次或压缩后先核对任务、差异和当前状态，缺失或变化的部分再补读，不重新倾倒全部根文档与历史。
- 先读适用 skill 的入口，再按其阅读路由取参考正文。NSH 设计指南的新页面／重设计仍全读，可分段；局部修复读取其规定的基础、相关章节与必需收尾清单。不能只读本地摘要代替规范，也不因使用 NSH 就读取所有平台和示例。
- 单次工具可见输出默认控制在约 3,000 token，按问题逐步展开。需要完整读取时分段，截断不得当作已读；搜索先限定目录、文件类型和上下文行数，不把全仓结果一次返回。
- 检查保留退出码，完整日志放忽略的 `.local/` 或 `artifacts/`，会话仅返回命令、结果、失败摘要及日志路径；失败再读取关联段落。不得用 `head`／`tail` 管道的成功掩盖检查失败。复用同源码、同环境且未受变更影响的检查，仍执行规定门禁与真实流程验收。
- API／会话／工具返回先提取本次需要的字段或统计；不输出完整会话、OpenAPI、生成文件、媒体响应或图片 base64。截图只取当前待判断状态，避免重复全屏采集；保留必要视觉证据与所有未解决失败，凭据和签名 URL 不进入摘要。
- 批次结束只交接目标、源码／未提交归属、已验命令及证据、阻塞、下一步；引用台账和活跃 OpenSpec，不复述过程。上下文较满时在自然边界准备该摘要，使用可用的压缩机制；不为减上下文自行打断真实流程或另建任务。

## 12. 官方依据

- [Oxlint 配置](https://oxc.rs/docs/guide/usage/linter/config.html)、[Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)。
- [rustup 工具链文件](https://rust-lang.github.io/rustup/overrides.html#the-toolchain-file)、[Clippy CI](https://doc.rust-lang.org/clippy/continuous_integration/index.html)、[nextest](https://github.com/nextest-rs/nextest)、[cargo-deny](https://embarkstudios.github.io/cargo-deny/)。
- [cargo-fuzz](https://rust-fuzz.github.io/book/cargo-fuzz.html)。主工具链与 fuzz 专用 nightly 分开锁定。
- [Lefthook 文件参数](https://lefthook.dev/configuration/run/)、[自动暂存配置](https://lefthook.dev/configuration/stage_fixed/)、[commitlint hooks](https://commitlint.js.org/guides/local-setup.html)。
