# Working in this repository

1. Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
2. 每次修改都要兼顾用户体验、开发体验和 AI Agent 的使用体验，三个都要变好，而且不能破坏现有功能。

- 先读 README.md、ARCHITECTURE.md、ENGINEERING.md、DESIGN.md、VALIDATION.md，区分目标、实际实现与已验证行为；使用本项目的 NSH skills。
- 目标是 NSH TSX + Rust、pnpm/Cargo 工作区。Go 仅为 legacy 行为参考，不增加 Go 业务、工具链或发行依赖；Rust 对齐后退役旧链路。
- 首次 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm setup`、`pnpm setup:tools`；工具诊断 `pnpm doctor`，完整验证 `pnpm verify`，依赖变化 `pnpm security`。工具缺失必须失败，不能静默跳过。
- NSH 版本唯一来源 `.nsh-version`；API 以各端 `.nsh/types/` 为准，由 `pnpm check` 生成；必须同时 check 和 build。不能加入 React/Vite/npm UI 依赖。
- 共享业务只在 packages/app，控件/主题/动效只在 packages/ui；apps/* 为薄入口。组件只运行一次，信号和 props 在绑定中读取。
- packages/app → ui/core-client → contracts；Rust http-api → core。持久状态目标归 Rust，页面状态归 TSX；第一阶段尚未完成持久状态迁移。
- 修改 Rust DTO 后 `pnpm codegen`，提交 OpenAPI 和 generated.ts，再 `pnpm codegen:check`。兼容 DTO 尚未生成，不能宣称所有旧接口已类型对齐。
- 不修改 upstream/hongguo/，不放宽私有接口检查。不把评论/选集完整详情写入历史，不读取旧客户端数据。
- Git hooks 只读，不自动 stash、stage、fix/reset；保留不相关修改，不擅自提交或推送。测试部分暂存的保护行为。
- UI 可见变化还要在真实宿主观察。headless TV 入口通过不等于真机、遥控、解码或独立安装包通过。
- 不提交 .local/、artifacts/、target/、.nsh/、runtime.generated.json 或凭据；记录未验证项，不把骨架、预览包和正式发行混淆。
