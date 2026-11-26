# 开发运行手册

本文件只维护可执行的环境、运行与诊断方法。工具与工程要求见 [ENGINEERING](../ENGINEERING.md)，当前结果见 [VALIDATION](../VALIDATION.md)，版本以仓库版本文件为准。

## 环境准备

安装 [Rust/rustup](https://rust-lang.github.io/rustup/installation/) 和[官方 NSH CLI](https://nsh.dev/zh-CN/docs/getting-started/)。macOS／Linux 按仓库版本安装 NSH：

```sh
curl -fsSL https://nsh.dev/install.sh -o /tmp/nsh-install.sh
NSH_VERSION="v$(cat .nsh-version)" sh /tmp/nsh-install.sh
npm install --global pnpm@11.1.3
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:workspace
pnpm setup:tools
pnpm hooks:install
pnpm doctor:workspace
```

Windows 按官方 PowerShell 安装说明设置 NSH_VERSION，其余 pnpm 命令相同。`NSH_BIN` 可指定 CLI；setup 校验版本、生成各端类型及连接配置，保留合法已有配置与 `.local/data/`。Rust 工具使用 `~/.cargo/bin`，工程子进程继承工具路径，无需改 shell 配置；辅助工具版本与摘要见 `tooling/tools.json`。

桌面需要目标系统 SDK（macOS 为 Xcode CLT）。TV 另需 [Android 宿主说明](../apps/tv/android/README.md)中的固定 JDK、SDK／NDK、Rust targets、NSH runtime 和 ready 设备；使用 `pnpm doctor:workspace --target tv` 检查。NSH runtime 可按需运行 `nsh component add web android`。

## 运行模式与数据

`pnpm dev:api` 启动 loopback Rust API（验收宿主与 http-preview 使用）。Desktop／TV 的 dev 和 package 默认使用包内 Rust，不要求电脑 API 或 adb reverse。

`pnpm dev:fixture:desktop|tv` 用 `tooling/src/browsing-fixture.mjs` 的本地合成 core 启动同一入口，只用于开发与回归（接口契约、布局、状态切换）；启动时明确标注 synthetic data，不能作为功能验收证据，验收使用 `pnpm dev:*` 或正式包连真实 core。

`HONGGUO_RUNTIME_MODE=native|http-preview|t0` 显式选择模式；未设置时 Desktop／TV 为 native，验收宿主（`apps/harness`）恒为 http-preview。显式提供 `HONGGUO_CORE_ORIGIN` 也会选择 http-preview，不能同时指定 native／t0。HTTP preview 打包必须提供精确 origin，不回退默认地址。

```sh
HONGGUO_RUNTIME_MODE=http-preview pnpm dev:tv
HONGGUO_CORE_ORIGIN=http://127.0.0.1:18997 pnpm package:desktop
HONGGUO_RUNTIME_MODE=t0 pnpm package:tv
```

setup/check 保留合法已有 runtime 配置，dev/package 每次覆盖为本次选择；原生包不继承旧电脑地址。打包清理本入口 `.nsh/out`，防止探针素材残留。`runtime.generated.json` 不入库，同一入口默认只运行一个会话。

HTTP preview 使用独立 `.local/data/rust`；native 使用宿主私有 app data；不读旧客户端数据。直接启动 Rust binary 必须提供 `--data-dir`。不兼容／坏库启动失败并保留原文件，不删除数据绕过错误。原生失败不清库、不回退外部服务；正常卸载先收集最终 checkpoint、排空所属写队列，再关闭会话；强杀只保障已提交记录。

HTTP 开发 API 仅监听 loopback，校验精确 Host／Origin，不能直接暴露到公网。HTTP dev 拥有并清理本次 API／TV reverse；native／T0 只拥有宿主进程。具体装配与资源边界见 ARCHITECTURE。

## 定向验证

check／build／test 可加 `--target harness|desktop|tv`，默认三个工程；`dev`／`dev:fixture`／`package` 只接受 `desktop|tv`，因为 harness 不发行。开发中运行改动层的专项检查；批次代码稳定后由一个执行者运行完整 verify，详见[批次流程](implementation-roadmap.md#每批怎样执行)。纯文档调整只检查格式、链接和适用的 OpenSpec，不重跑产品构建。


真实匿名流程使用现有工具，不注入合成响应或直接伪造观看记录：

```sh
node tooling/src/live-discovery-host.mjs macos --anonymous-live
node tooling/src/live-history-host.mjs macos --anonymous-live
node tooling/src/live-history-host.mjs web --anonymous-live
```

macos 参数在 `apps/harness` 里用原生窗口跑 HTTP 入口，不是 Desktop native；web 参数用 Chromium 和精确 Origin。历史来自实际媒体进度并核对持久结果；每段结果和整轮结果分别记录，重试恢复不抹去原失败。当前证明了哪些流程，查 VALIDATION，勿从命令存在推断通过。

真实 runner 每次 API 启动保留独立 stderr，附件位置在 `result.json` 的 `apiStarts[].diagnostics`。诊断只记安全阶段／来源／错误分类；内部来源失败可能随后恢复，不等于最终播放失败。原生专项诊断需 `NSH_VERBOSE=1`，默认 NSH test 隐藏原生 stderr。不得记录签名媒体 URL、凭据或原始敏感错误；准备成功也不代替实际解码／播放。

## 发行与迁移对照

版本唯一编辑源为 `product-version.json`。release:check／sync／metadata／record／verify-record 的参数、工作流、签名和晋级规则见[分发方案](github-delivery-and-updates.md)、[发行摘要](release-metadata-validation.md)及[客户端更新](client-updates.md)，不在此复制发布流程。

`pnpm legacy:setup`、`legacy:dev:web`、`legacy:dev`、`legacy:verify` 只用于旧行为对照，仅这条链路需要 Go。新工程不执行 Go，不读取旧客户端数据，不修改固定上游。旧链路退役条件见 ARCHITECTURE。
