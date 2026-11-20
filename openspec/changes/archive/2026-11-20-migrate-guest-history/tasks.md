# Tasks

## 1. Rust 游客历史

- [x] 1.1 实现 SQLite 版本化初始化、事务 CRUD、紧凑 DTO 和错误边界；临时数据库测试覆盖重启、并发、写失败、坏库/未来版本、输入拒绝、裁剪及删除/清空，并补核心存储说明与依赖记录。

## 2. 传输与进程

- [x] 2.1 接入 library GET/POST、no-store、history capability、owner 冲突和显式 data-dir 启动；HTTP 与真实进程测试证明边界、重启恢复和初始化失败前不 ready，更新启动说明。

## 3. 契约与回归

- [x] 3.1 生成 Entry/Library/HistoryChange/envelope 契约并替换同名手写类型；codegen:check 与三端 check/build/headless 通过，保留原有播放前不写历史和完成状态测试。
- [x] 3.2 完整 verify、依赖安全检查和 OpenSpec strict 校验，更新实际能力与验证记录，区分未通过安全项/未测设备，保留并行改动。

## Workflow follow-up

- 本切片完成后保留待审阅；不自动提交、推送或归档新增改动。

## 验收说明

- 完整 pnpm verify 通过：35 项 Rust、7 项工程、16 项 NSH headless，三端 check/build、契约无漂移及 Clippy 通过；修复 Utoipa tagged newtype 与 closed object 的 schema 冲突，并断言合法进度请求的每个字段均被生成 schema 接受。
- 独立 fuzz locked check 与 OpenSpec strict 校验通过；没有运行实际 fuzz、覆盖率或真机验收。
- 安全检查已执行，NSH 间接依赖仍有 6 项许可证与 2 项停止维护阻塞；没有新增例外。单独 npm audit 通过。详见 VALIDATION.md。
