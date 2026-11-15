# 红果 · NSH

NSH TSX + Rust 的 Web、桌面和 Android TV 客户端，采用 pnpm／Cargo 工作区。三端共享业务与基础组件，按键鼠和遥控器适配界面；Desktop／TV 默认使用包内 Rust，Web 使用 Rust HTTP 服务。

完整 MVP 尚未完成。当前实现见[功能台账](docs/feature-ledger.md)，真实验收、开放失败和平台限制见[VALIDATION.md](VALIDATION.md)，下一批见[实施路线](docs/implementation-roadmap.md)。

## 开始开发

先安装 Rust／rustup、固定版本 Node／pnpm 和[官方 NSH CLI](https://nsh.dev/zh-CN/docs/getting-started/)。版本分别由 `.node-version`、`package.json#packageManager`、`.nsh-version`、`rust-toolchain.toml` 管理。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup
pnpm setup:tools
pnpm hooks:install
pnpm doctor
```

```sh
pnpm dev:web          # Rust API + Web
pnpm dev:desktop      # 包内 Rust
pnpm dev:tv           # 包内 Rust；需要 Android TV 设备环境
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
