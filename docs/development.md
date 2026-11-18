# 开发运行手册

本文件只维护可执行的环境、运行与诊断方法。工具与工程要求见 [ENGINEERING](../ENGINEERING.md)，当前结果见 [VALIDATION](../VALIDATION.md)，版本以仓库版本文件为准。

## 环境准备

安装 [Rust/rustup](https://rust-lang.github.io/rustup/installation/) 和[官方 NSH CLI](https://nsh.dev/zh-CN/docs/getting-started/)。macOS／Linux 按仓库版本安装 NSH：

```sh
curl -fsSL https://nsh.dev/install.sh -o /tmp/nsh-install.sh
NSH_VERSION="v$(cat .nsh-version)" sh /tmp/nsh-install.sh
npm install --global pnpm@11.1.3
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup
pnpm setup:tools
pnpm hooks:install
pnpm doctor
```

Windows 按官方 PowerShell 安装说明设置 NSH_VERSION，其余 pnpm 命令相同。`NSH_BIN` 可指定 CLI；setup 校验版本、生成各端类型及连接配置，保留合法已有配置与 `.local/data/`。Rust 工具使用 `~/.cargo/bin`，工程子进程继承工具路径，无需改 shell 配置；辅助工具版本与摘要见 `tooling/tools.json`。

桌面需要目标系统 SDK（macOS 为 Xcode CLT）。TV 另需 [Android 宿主说明](../apps/tv/android/README.md)中的固定 JDK、SDK／NDK、Rust targets、NSH runtime 和 ready 设备；使用 `pnpm doctor --target tv` 检查。NSH runtime 可按需运行 `nsh component add web android`。

## 运行模式与数据

`pnpm dev:web` 启动当前 Rust API 并分配端口，`pnpm dev:api` 只启动 loopback API。Desktop／TV 的 dev 和 package 默认使用包内 Rust，不要求电脑 API 或 adb reverse。

`pnpm dev:fixture:web|desktop|tv` 用 `tooling/src/browsing-fixture.mjs` 的本地合成 core 启动同一入口，只用于开发与回归（接口契约、布局、状态切换）；启动时明确标注 synthetic data，不能作为功能验收证据，验收使用 `pnpm dev:*` 或正式包连真实 core。

`HONGGUO_RUNTIME_MODE=native|http-preview|t0` 显式选择模式；未设置时 Desktop／TV 为 native，Web 为 http-preview。显式提供 `HONGGUO_CORE_ORIGIN` 也会选择 http-preview，不能同时指定 native／t0。HTTP preview 打包必须提供精确 origin，不回退默认地址。

```sh
HONGGUO_RUNTIME_MODE=http-preview pnpm dev:tv
HONGGUO_CORE_ORIGIN=http://127.0.0.1:18997 pnpm package:desktop
HONGGUO_RUNTIME_MODE=t0 pnpm package:tv
```

setup/check 保留合法已有 runtime 配置，dev/package 每次覆盖为本次选择；原生包不继承旧电脑地址。打包清理本入口 `.nsh/out`，防止探针素材残留。`runtime.generated.json` 不入库，同一入口默认只运行一个会话。

HTTP preview 使用独立 `.local/data/rust`；native 使用宿主私有 app data；不读旧客户端数据。直接启动 Rust binary 必须提供 `--data-dir`。不兼容／坏库启动失败并保留原文件，不删除数据绕过错误。原生失败不清库、不回退外部服务；正常卸载先收集最终 checkpoint、排空所属写队列，再关闭会话；强杀只保障已提交记录。

HTTP 开发 API 仅监听 loopback，校验精确 Host／Origin，不能直接暴露到公网。HTTP dev 拥有并清理本次 API／TV reverse；native／T0 只拥有宿主进程。具体装配与资源边界见 ARCHITECTURE。

## 定向验证

check／build／test 可加 `--target web|desktop|tv`，默认三端。开发中运行改动层的专项检查；批次代码稳定后由一个执行者运行完整 verify，详见[批次流程](implementation-roadmap.md#每批怎样执行)。纯文档调整只检查格式、链接和适用的 OpenSpec，不重跑产品构建。

| 入口                                                  | 范围与限制                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm ui:check`／`ui:test`／`ui:preview`              | 基础组件三端检查、公共控件行为与显式预览；预览固定端口单实例；不等于 Android 遥控／系统输入法                                   |
| `pnpm ui:host:desktop`／`ui:host:tv`                  | 唯一需要 AppKit 窗口的路径，拆成两条各开一个窗口：桌面临时密度 / TV 密度各一张整板截图（平铺全部组、浅深各一）；行为断言留在无头 `ui:test`；密度来自 manifest 主题，不是页面切换 |
| `pnpm visual:tv`                                      | 全部视觉证据一次出齐：TV 八个页面 × 浅深 + 扁平平铺的组件板，**同一命令、同一 fixture、单个 app 实例**。默认 `--web` 无头 Chrome（零窗口），`--android` 用固定 API34 模拟器；组件板平铺后一张高视口截全，不再逐个切换分组。产物与证明边界见 `artifacts/tv-visual/<host>/manifest.json` |
| `pnpm test:tv-emulator`                               | 显式 T0 最终 APK 的技术验证，不是完整业务                                                                           |
| `pnpm dev:fixture:web`／`desktop`／`tv`               | 真实入口 + 本地合成 core；只用于开发／回归，不算真实数据功能验收                                                    |
| `pnpm test:tv-browsing`／`test:tv-player`             | 显式 HTTP fixture；不算真实数据功能验收                                                                             |
| `pnpm test:tv-native-startup`／`test:tv-native-retry` | 原生入口合成启动／失败／重试，不是独立真实业务                                                                      |
| `pnpm test:tv-native-business`                        | 当前原生 APK、官网媒体、SQLite、进程重启；需要唯一固定 TV API34 模拟器                                              |
| `pnpm test:desktop-updates`／`test:tv-updates`        | 更新状态／宿主适配，不创建线上 Release，不代替正式签名 N-1→N 升级                                                   |
| `pnpm coverage`／`pnpm fuzz`                          | 运行范围和要求见 ENGINEERING；fuzz 先安装仓库要求的独立 nightly                                                     |

真实匿名流程使用现有工具，不注入合成响应或直接伪造观看记录：

```sh
node tooling/src/live-discovery-host.mjs macos --anonymous-live
node tooling/src/live-history-host.mjs macos --anonymous-live
node tooling/src/live-history-host.mjs web --anonymous-live
```

macos 参数运行该宿主中的正式 Web／HTTP 入口，不是 Desktop native；web 参数使用 Chromium 和精确 Origin。历史来自实际媒体进度并核对持久结果；每段结果和整轮结果分别记录，重试恢复不抹去原失败。当前证明了哪些流程，查 VALIDATION，勿从命令存在推断通过。

真实 runner 每次 API 启动保留独立 stderr，附件位置在 `result.json` 的 `apiStarts[].diagnostics`。诊断只记安全阶段／来源／错误分类；内部来源失败可能随后恢复，不等于最终播放失败。原生专项诊断需 `NSH_VERBOSE=1`，默认 NSH test 隐藏原生 stderr。不得记录签名媒体 URL、凭据或原始敏感错误；准备成功也不代替实际解码／播放。

## 发行与迁移对照

版本唯一编辑源为 `product-version.json`。release:check／sync／metadata／record／verify-record 的参数、工作流、签名和晋级规则见[分发方案](github-delivery-and-updates.md)、[发行摘要](release-metadata-validation.md)及[客户端更新](client-updates.md)，不在此复制发布流程。

`pnpm legacy:setup`、`legacy:dev:web`、`legacy:dev`、`legacy:verify` 只用于旧行为对照，仅这条链路需要 Go。新工程不执行 Go，不读取旧客户端数据，不修改固定上游。旧链路退役条件见 ARCHITECTURE。
