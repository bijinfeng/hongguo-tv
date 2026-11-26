# Proposal

## Why

官方产品本身已有 Web 端，本仓库再维护一个 Web 客户端没有用户价值；而本仓库的 Web 入口从未发行：`release-publish.yml` 与 `release-preview.yml` 只构建 Desktop 归档和 Android TV APK，`package:web` 没有任何 workflow 调用。保留它会让产品范围、CI 矩阵和文档持续承诺一个不会交付的端。

同时需要保留它真正的工程价值：`apps/web` 是唯一没有 Rust crate 的 NSH 工程，18 个 tooling 脚本把它当作 HTTP／fixture／无头 Chromium 宿主，用于验收。直接删除会丢掉全部浏览器证据路径并强制宿主打开原生窗口。

## What Changes

- 移除 Web 的**产品身份**：`apps/web` 改名 `apps/harness`，manifest id 从 `dev.hongguo.web` 改为 `dev.hongguo.harness`；删除 `dev:web`、`dev:fixture:web`、`package:web`，`dev`／`dev:fixture`／`package` 只接受 `desktop`／`tv`。
- 保留**宿主能力**：`apps/harness` 全部 preview、`App.tsx` HTTP 入口、两个浏览器控件测试与验收脚本继续可用；`pnpm check`／`build`／`test` 仍覆盖它。
- `services/web-api` 改名 `services/core-api`（包名 `hongguo-core-api`），职责不变：为宿主和原生 `http-preview` 提供共享 HTTP 契约。它不是发行服务。
- CI 删除 `web` 入口矩阵行；`apps/harness/**` 的改动不再触发任何目标 job（`workspace` 仍 check/build 它）。
- 新建本变更并改写 9 个活跃变更里 11 条要求「Web 验收」的未完成任务，以及 5 份主规范中把 Web 当作产品端的表述。

## Capabilities

### Modified Capabilities

- `guest-history`：共享行为测试的宿主表述从 Web 改为 harness，语义不变。

## Impact

影响根脚本、tooling 目标词汇、CI 路径分类、release 版本清单、约 15 份当前文档与多份活跃 OpenSpec。不修改 `crates/http-api`（`crates/native-bridge` 的媒体路由与 `pnpm codegen` 仍依赖它）、`packages/app`、`packages/ui`、`packages/core-client`，也不修改固定上游。`VALIDATION.md` 保留既有 Web／Chromium 证据，只把验收主体改称 harness，不删除历史结论。
