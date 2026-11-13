# 红果 · NSH

NSH TSX + Rust 多端工程，采用 pnpm monorepo 和 Cargo workspace。Web、桌面和 Android TV 复用同一套界面与状态逻辑；目标原生客户端直接链接 Rust 核心。

**当前是工程迁移第一阶段。** Rust API 已提供匿名官网搜索与详情、游客 SQLite 历史、播放解析与有界媒体服务、生成契约和边界检查；定稿播放器已接入，Web 的官网观看与 Rust 历史重启续播已验证；账号、macOS 与完整 TV 遥控仍在迁移／验收中。三端业务通过 HTTP 连接 Rust 服务，尚未接入原生业务 bridge。已有真实播放验证保留在 `legacy:*`，其 Go 核心只作为迁移对照，不属于新工作区的构建与发行依赖。

## 准备

固定版本：Node 26.12.1、pnpm 11.1.3、NSH 0.5.0、Rust 1.97.0。分别由 `.node-version`、`package.json`、`.nsh-version`、`rust-toolchain.toml` 管理。NSH TSX 不需要 React、DOM、Vite 或 npm UI 依赖。

安装 [Rust/rustup](https://rust-lang.github.io/rustup/installation/) 和[官方 NSH CLI](https://nsh.dev/zh-CN/docs/getting-started/)。macOS/Linux 安装固定 NSH：

```sh
curl -fsSL https://nsh.dev/install.sh -o /tmp/nsh-install.sh
NSH_VERSION="v$(cat .nsh-version)" sh /tmp/nsh-install.sh
npm install --global pnpm@11.1.3
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup
pnpm setup:tools
pnpm hooks:install
```

Windows 按 NSH 官方 PowerShell 安装说明设置 `NSH_VERSION`，其余 pnpm 命令相同。`NSH_BIN` 可指定 CLI；`setup` 会校验版本、生成每端连接配置和 NSH 类型，保留已有配置与 `.local/data/`。Rust 工具自动使用 `~/.cargo/bin`，NSH 构建、测试与开发子进程也会继承该工具路径，无需修改 shell PATH；`setup:tools` 安装 `tooling/tools.json` 固定的 nextest、deny、llvm-cov、fuzz，以及 LLVM 工具组件。

```sh
pnpm doctor                 # 通用工具检查，不等于真机通过
pnpm doctor --target tv     # 另检查 JDK、SDK/NDK、Rust Android targets、NSH runtime 和设备
```

原生桌面需要目标系统开发依赖（macOS 为 Xcode Command Line Tools）。TV 还需要 Android 35、Build Tools 35.0.1、NDK 27.2.12479018、Rust Android targets、NSH Android runtime 和一台 ready 设备；当前环境已补齐前述 SDK/NDK、Rust targets 和 runtime，T0 最终 APK 已在固定 Android TV 模拟器验收；物理电视与完整业务仍待验证。NSH runtime 可以用 `nsh component add web android` 按需安装。

## 开发与验证

```sh
pnpm dev:web         # 自动构建 Rust API、分配端口、启动 NSH
pnpm dev:desktop
pnpm dev:tv          # 开发设备通过 adb reverse 访问本机 API
pnpm dev:api         # 只启动 loopback Rust API，stdout 输出 ready JSON
pnpm verify          # 格式、lint、契约、Rust/NSH check + build + tests
pnpm security        # Cargo 漏洞/许可证/来源 + pnpm audit
pnpm coverage        # Rust LLVM 行覆盖率门槛 75%
pnpm codegen         # Rust → OpenAPI → TypeScript；无需运行服务器
pnpm codegen:check   # 只比较，不修改文件
```

发行基础检查使用根级 `product-version.json` 作为版本与 build 的唯一编辑源：

```sh
pnpm release:check
pnpm release:sync
pnpm release:metadata --artifact <产物路径> --target <平台标识>
pnpm release:record --input <候选描述 JSON> --out release.json --checksums SHA256SUMS
pnpm release:verify-record --record release.json --artifact-dir <下载目录>
```

先编辑 `product-version.json`，再显式运行 `release:sync` 同步根 `package.json`、三个 NSH manifest；`release:check` 用于门禁。`release:metadata` 只生成带 SHA256、大小、版本、build 和源码 SHA 的摘要，不执行签名或发布。`release:record` 读取候选描述中的本地产物，生成不包含本地路径的确定性 `release.json` 和校验和文件；`release:verify-record` 在发布前绑定源码身份、版本、build 和下载文件字节，拒绝哈希、大小或路径漂移。两者都会拒绝非 HTTPS URL、重复 target、非法 Git SHA 和缺失产物，不执行签名、上传或发布。正式桌面/TV 产物、平台签名、GitHub Release 和更新清单仍需通过发行门禁后接入。

公开仓库的手动 `Release preview` workflow 会从指定源码 SHA 构建 macOS arm64 桌面预览包和 Android TV arm64 T0 技术包，上传短期 Actions artifact，并附带 `release.json`/`SHA256SUMS`。这些包需要外部 Rust API 或仍属于 T0 技术验证，不是正式 Release，也不会进入稳定更新渠道。

`TV release candidate` workflow 使用 `release-signing` environment，读取 `TV_RELEASE_KEYSTORE_BASE64`、`TV_RELEASE_STORE_PASSWORD`、`TV_RELEASE_KEY_ALIAS` 和 `TV_RELEASE_KEY_PASSWORD`，生成正式签名候选并验证 applicationId、versionCode、证书摘要和 APK 完整性；它只上传候选 artifact，不创建 GitHub Release。正式发布前应在该 environment 增加 required reviewers 和分支/tag 限制。

`Publish release` workflow 需要手动输入确定的源码 SHA 和对应 `vX.Y.Z` tag，在 `release-signing` environment 中构建 macOS arm64 与 Android TV arm64，使用 `DESKTOP_UPDATE_MANIFEST_KEY`、`TV_UPDATE_MANIFEST_KEY` 生成各自的 `latest.json`/签名文件，发布 GitHub Release 并部署 Pages 更新目录。桌面构建还要求同一 environment variable `HONGGUO_CORE_ORIGIN`，缺失时工作流失败，避免把本地 API 地址打进正式包。仓库 Pages 已初始化为 GitHub Actions source。

目录离线样本与显式官网 smoke 见 [contracts/fixtures/catalog/README.md](contracts/fixtures/catalog/README.md)。匿名查询在 `crates/core`，可由未来原生 adapter 复用；默认测试仅使用合成样本和 loopback server，不要求账号或 Go。新增依赖的许可证记录与剩余安全阻塞见 [VALIDATION.md](VALIDATION.md)。

游客历史说明见 [crates/core/src/library/README.md](crates/core/src/library/README.md)。`pnpm dev:*` 自动传入独立数据目录 `.local/data/rust`，不读取旧客户端文件；直接启动 Rust binary 必须提供 `--data-dir <目录>`。数据库不兼容或损坏时启动失败并保留原文件，请先检查版本与备份，不要删除数据绕过错误。

fuzz 使用独立固定 nightly：先 `rustup toolchain install nightly-2026-11-01 --profile minimal`，再 `pnpm fuzz`。coverage/fuzz 的实际运行状态见 VALIDATION。

也可分别运行 `pnpm fmt`、`fmt:check`、`lint`、`check`、`build`、`test`、`test:tooling`。check/build/test 可添加 `--target web|desktop|tv` 缩小范围；默认检查三端入口。NSH headless 测试使用真实引擎和网络 stub，不能证明 TV 遥控或硬件解码。

`pnpm dev:*` 使用共享界面和 Rust 匿名官网搜索/详情。搜索只支持 `source=web`，与 App 搜索游标不同；游客历史支持读取、保存、删除/清空；账号接口仍返回 `CORE_NOT_IMPLEMENTED`；播放接口通过 Rust 解析并准备同源不透明媒体，支持质量选择、幂等释放及 GET／HEAD Range，来源不可用或访问拒绝时明确失败。官网验证挑战、超时和协议错误会明确失败。开发 API 只监听 `127.0.0.1`、校验精确 Host/Origin、限制请求体；不能直接公开到公网。Ctrl-C 关闭本次 API 和宿主。每个目标同时只运行一个会话。

Web/Desktop 预览打包需要显式提供 `HONGGUO_CORE_ORIGIN`，再运行 `pnpm package:web|desktop`；TV 在存在 `apps/tv/native` 时可运行 `pnpm package:tv` 生成 arm64 T0 技术验证 APK，否则同样需要外部 API。技术验证包仍不等于独立产品；桌面/TV 业务原生链接、公开 Web 身份隔离、签名与更新均是后续阶段。

## 目录与依赖

```text
apps/web|desktop|tv/       三端薄入口、NSH 清单、测试入口
packages/app/             共享页面、导航、状态、播放会话、行为测试
packages/ui/              共享控件、主题与动效
packages/core-client/     HTTP 适配和媒体/历史请求边界
packages/contracts/       Rust 目录/历史契约 + 未迁移兼容 DTO
crates/core/              目录/播放协议、有界 HTTP/TLS、SQLite 历史、媒体准备与 Range
crates/http-api/          Axum 路由、开发来源策略、OpenAPI 导出
services/web-api/         Tokio 进程、loopback 监听和优雅退出
tooling/                  工程命令、生命周期、依赖边界测试
contracts/                生成 OpenAPI、合成目录行为样本
scripts/ + upstream/      旧验证脚本及 Go 行为参考（迁移对照）
upstream/hongguo/         固定上游源码，不直接修改
```

依赖方向：`packages/app → ui/core-client → contracts`，`http-api → core`。工程规则由 Oxlint 和 `tooling/src/boundaries.mjs` 检查。业务页面不能导入 Node/React、其他应用入口或直接访问上游核心。NSH `.nsh/types` 是 API 真值；生成目录、连接配置、数据、产物和私有凭据均忽略进 Git。

Git hooks 需主动安装：pre-commit 只读检查格式、lint、契约；commit-msg 校验 Conventional Commits；pre-push 运行完整 verify。安装的 hooks 通过 Node wrapper 强制 `--no-stage-fixed`，关闭 Lefthook 默认的隐式 stash；没有自动格式化或 git add/reset。CI 包含三系统 Rust 检查、macOS 三入口 NSH headless 和依赖安全检查，`required` 汇总所有门禁；真实三端安装与发布验收尚未接入。远端分支保护需要仓库管理员将该检查设为必需。

## 旧行为对照

```sh
pnpm legacy:setup     # 仅此链路需要 Go；不读取旧客户端数据
pnpm legacy:dev:web
pnpm legacy:dev
pnpm legacy:verify
```

legacy 脚本复用 `apps/web` 薄入口和 `packages/app`，不再保留根级 demo。搜索结果、播放前不写历史、完成状态、历史裁剪及串行持久写入的回归测试随共享包保留。Go 核心固定为 `de9712bf358d`；`pnpm upstream:sync` 校验上游，不覆盖修改。

设计与阶段边界见 [ARCHITECTURE.md](ARCHITECTURE.md)、[ENGINEERING.md](ENGINEERING.md)、[DESIGN.md](DESIGN.md)；真实检查结果、尚未验证的设备与功能见 [VALIDATION.md](VALIDATION.md)。

TV 的实施顺序、遥控与真机测试、设备预览、签名发布和升级流程见 [TV_DEVELOPMENT.md](TV_DEVELOPMENT.md)。
