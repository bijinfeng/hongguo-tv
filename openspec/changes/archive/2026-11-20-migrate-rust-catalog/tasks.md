# Tasks

## 1. 目录契约与离线行为

- [x] 1.1 建立目录 Rust DTO、搜索/详情纯解析与来源明确的合成 input/expected fixtures；Rust 测试覆盖精确 ID、分页/去重/空页、错误数据、详情身份与选集锁定，并补 fixtures 使用说明。

## 2. 匿名目录服务

- [x] 2.1 接入固定 HTTP/TLS 依赖，实现受限 origin、有界响应、超时/有限重试与 drop 取消；本地 fixture server 测试覆盖编码、无 Cookie/重定向、状态/挑战、读失败、大小、超时与取消，提供显式 live smoke example 和运行说明。

## 3. HTTP 与共享类型接入

- [x] 3.1 接入搜索/详情路由、结构化参数/错误与诚实 capability；HTTP 集成测试证明成功、输入拒绝、原有来源保护、未实现端点和初始化顺序。
- [x] 3.2 生成目录 OpenAPI/TS 类型并替换同名兼容 DTO；更新契约说明，codegen:check 与三端 check/build/headless 回归通过。

## 4. 集成验收

- [x] 4.1 执行完整现有 verify、安全检查与 OpenSpec strict 校验；显式尝试匿名官网 smoke 并如实记录结果，更新 README/ARCHITECTURE/VALIDATION 的目录能力与限制，保留并行改动。

## Workflow follow-up

- 按需评审后再归档此 change；本次不自动提交、推送或发布。

## 验收说明

- 3.2 的生成契约、codegen:check、三端 check/build/headless 已通过；Web/Desktop/TV 分别 5/5/6 项，共 16 项。TV T0 取消与正常完成采用手动时钟验证，工程脚本补齐 NSH 子进程的 Rust 工具路径。
- 4.1 已执行完整 verify、安全检查和显式官网 smoke，结果记录在 VALIDATION.md。完整 pnpm verify 通过；cargo-deny 仍受 NSH 间接依赖的许可证与停止维护告警阻塞。没有豁免 advisory、扩大许可证白名单、删除测试或修改 TV 生命周期实现；任务全部完成不表示安全或真机发行门禁通过。
