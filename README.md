# 红果 · NSH

NSH TSX + Rust 的桌面和 Android TV 客户端，采用 pnpm／Cargo 工作区。两端共享业务与基础组件，按键鼠和遥控器适配界面，默认使用包内 Rust。MVP 的验收宿主是 macOS 真机与固定 API34 AVD 模拟器，Windows／Linux 与物理电视按平台限制记录（见 [ENGINEERING §9](ENGINEERING.md#验收宿主矩阵)）。官方产品已有 Web 端，本仓库不重复实现：`apps/harness` 只是无头浏览器验收宿主，不是产品入口。

完整 MVP 尚未完成。当前实现见[功能台账](docs/feature-ledger.md)，真实验收、开放失败和平台限制见[VALIDATION.md](VALIDATION.md)，下一批见[实施路线](docs/implementation-roadmap.md)。

## 开始开发

先安装 Rust／rustup、Node／pnpm 和[官方 NSH CLI](https://nsh.dev/zh-CN/docs/getting-started/)。Node 接受 `package.json#engines` 的 `>=24.2 <27`（`import.meta.main` 与 `node:sqlite` 的门槛），`.node-version` 只钉 CI 安装的参考版本；pnpm、NSH 与 Rust 分别由 `package.json#packageManager`、`.nsh-version`、`rust-toolchain.toml` 管理。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:workspace
pnpm setup:tools
pnpm hooks:install
pnpm doctor:workspace
```

```sh
pnpm dev:desktop      # 包内 Rust
pnpm dev:tv           # 包内 Rust；需要 Android TV 设备环境
pnpm dev:api          # 宿主验收用的 loopback Rust API
pnpm check --target desktop
pnpm build --target desktop
pnpm verify           # 完整工程门禁；不等于真实功能验收
pnpm security         # 安全门禁单列
```

安装细节、运行模式、定向验证和诊断见[开发运行手册](docs/development.md)；完整工程约束见[ENGINEERING.md](ENGINEERING.md)。工具缺失必须失败；NSH 改动同时 check 和 build。

## 找到需要的文档

从[文档索引](docs/README.md)按任务进入，不必每次通读历史。

| 要做的事             | 入口                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| 确认产品范围         | [PRODUCT.md](PRODUCT.md)                                                                 |
| 理解依赖和状态所有权 | [ARCHITECTURE.md](ARCHITECTURE.md)                                                       |
| 修改界面或基础组件   | [DESIGN.md](DESIGN.md)、[UI 包用法](packages/ui/README.md)                               |
| 判断做到了哪一步     | [功能台账](docs/feature-ledger.md)、[当前验收](VALIDATION.md)                            |
| 开始下一批           | [实施路线](docs/implementation-roadmap.md)、对应活跃 OpenSpec                            |
| TV 开发与设备验收    | [TV 开发流程](TV_DEVELOPMENT.md)、[Android 宿主](apps/tv/android/README.md)              |
| 构建、更新和发行     | [GitHub 分发](docs/github-delivery-and-updates.md)、[客户端更新](docs/client-updates.md) |
| 追溯旧结论和失败     | [历史索引](docs/history/README.md)                                                       |

`upstream/hongguo/` 是固定的只读行为参考；`legacy:*` 仅用于迁移对照，不属于目标产品的正常构建和发行依赖。缓存、运行配置、产物和凭据不入库。安全、安装、签名与升级的剩余项以当前验收为准，不把预览包当作正式交付。
