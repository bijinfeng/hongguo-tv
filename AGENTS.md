# Working in this repository

1. Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
2. 每次修改都要兼顾用户体验、开发体验和 AI Agent 的使用体验，三个都要变好，而且不能破坏现有功能。

- 先读 README.md 和 docs/README.md，按任务表读取相关规范、台账行与活跃 OpenSpec；架构／契约读 ARCHITECTURE，工程／安全／验收读 ENGINEERING，UI 读 DESIGN 并使用本项目 NSH skills。功能范围读 PRODUCT，验收读 VALIDATION 对应项；历史与完整运行日志按需查阅，不每次通读全部根文档。区分目标、实际实现与已验证行为。
- 两处按节读，不整份读：DESIGN 的 `Components` 约 25k 字符，只在改动涉及的组件或页面时读对应小节，改 token／颜色／字号时读对应契约段；VALIDATION 只在确认某项当前状态时读对应小节，不把它当背景资料通读。
- 同一上下文内复用已读且未变的资料；先定位再读范围。按 ENGINEERING「上下文与工具输出」限制长日志、整份 JSON 和会话回读；不得因此省略适用规范、失败信息或真实验收。
- 目标是 NSH TSX + Rust、pnpm/Cargo 工作区。Go 仅为 legacy 行为参考，不增加 Go 业务、工具链或发行依赖；Rust 对齐后退役旧链路。
- 首次 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm setup`、`pnpm setup:tools`；工具诊断 `pnpm doctor`，完整验证 `pnpm verify`，依赖变化 `pnpm security`。工具缺失必须失败，不能静默跳过。
- NSH 版本唯一来源 `.nsh-version`；API 以各端 `.nsh/types/` 为准，由 `pnpm check` 生成；必须同时 check 和 build。不能加入 React/Vite/npm UI 依赖。
- 共享业务只在 packages/app，控件/主题/动效只在 packages/ui；apps/* 为薄入口。组件只运行一次，信号和 props 在绑定中读取。
- 视觉真相只有 DESIGN.md 的契约与产品代码两处，不建并行 HTML/CSS 稿；界面只看真实入口（`ui:preview`、`ui:host:*`、`dev --target`、`visual:tv`）。改界面按 DESIGN.md「改界面的做法」的顺序来；token 拥有的尺寸由 `packages/app/test/layout-contract.tsx` 在真实应用上断言。
- 应用界面图标统一使用固定版本的 Lucide 官方 SVG；设计稿与 NSH 共用来源和名称映射，生产仅通过 packages/ui 的 Icon 使用。禁止手写或手改图标 SVG/path、混用其他图标库；品牌标识与系统原生控件自带图标除外。资源、适配与迁移状态见 DESIGN.md「统一图标」和 ENGINEERING.md。
- packages/app → ui/core-client → contracts；Rust http-api → core。持久状态目标归 Rust，页面状态归 TSX；第一阶段尚未完成持久状态迁移。
- 修改 Rust DTO 后 `pnpm codegen`，提交 OpenAPI 和 generated.ts，再 `pnpm codegen:check`。兼容 DTO 尚未生成，不能宣称所有旧接口已类型对齐。
- 不修改 upstream/hongguo/，不放宽私有接口检查。不把评论/选集完整详情写入历史，不读取旧客户端数据。
- Git hooks 不得 reset／checkout／stash 整个工作区，不得暂存未暂存的文件，不擅自提交或推送；保留不相关修改。pre-commit 允许格式化已暂存文件并只重新暂存这些文件：lint-staged 必须运行在 `--no-stash` 下，格式化器只能收到暂存版本，未暂存改动不得进入提交。部分暂存的保护行为有回归验证，不能靠放宽断言让它通过。
- 交付源码在当前主项目工作区修改、验收和提交，不在临时目录另起实现。旧临时 worktree 仅作只读迁移参考；按功能选择性迁回，保留主仓现有修复与并行改动。临时目录只放构建缓存、可再生验收产物，不把草稿或缓存计作已交付。
- 功能验收以正式入口、真实数据和实际使用流程为主；合成数据只验证边界与回归，其通过结果不能作为功能或 MVP 验收通过的标准。真实接口返回成功也不等于实际使用流程通过；缺少真实流程证据时保持已实现待真实验收，并分别记录数据来源、平台、源码与限制。
- UI 可见变化还要在真实宿主观察。headless TV 入口通过不等于真机、遥控、解码或独立安装包通过。
- 不提交 .local/、artifacts/、target/、.nsh/、runtime.generated.json 或凭据；记录未验证项，不把骨架、预览包和正式发行混淆。

- 一个事实只有一个主要来源；按 docs/README.md 的职责表更新。当前状态不追加成长篇过程日志，历史放 docs/history 并注明非当前指令；不在多份交接复制同段增量。纯文档变更检查格式／链接／适用OpenSpec，不触发产品构建。
