# 原生核心收尾审查

日期：2026-11-16。变更：`embed-native-core`。本批只收敛原生 bridge／Desktop mixed／TV 独立业务的工程证据与剩余宿主边界，不扩大共享 UI 或账号能力范围。

## 功能审查

- `crates/native-bridge` 复用同一 core-client transport 和 Rust 业务服务；HTTP 预览仍是显式模式，native 业务不暴露 HTTP business routes。
- session、请求取消、媒体 lease、关闭排空、失去响应后的资源释放、私有数据目录和损坏文件拒绝均有 Rust／native parity 回归；TV 独立包的真实搜索→详情→播放→切集→返回、后台／恢复和同库重启续播证据沿用 C3.1 记录。
- 当前没有新的生产 UI 代码变更；共享 App、Desktop 和 TV 仍使用同一页面和状态语义，平台差异只保留在宿主生命周期、输入和密度适配。

## UI 审查

本批对可见 UI 的结论只来自既有 C3.1 TV 独立宿主记录和当前共享页面回归：TV 三主题／字号、方向键焦点、返回层级和错误恢复保持通过范围。Desktop mixed 的真实搜索、观看、重启续播、Select 和两种批准尺寸／主题仍未观察；headless 通过不替代该证据。原型的桌面／TV 视觉细节另见[原型综合评估](design/prototype-comprehensive-review.md)。

## 工程验证

- 冻结当前源码运行的完整 `pnpm verify` 通过；包含三端 check／build、Rust nextest、应用回归、`codegen:check`、格式、包边界和 release 基础检查。
- `openspec validate embed-native-core --strict` 通过；全量 `openspec validate --changes` 为 32/32。
- `pnpm security` 已实际运行但按现有策略失败：NSH 间接依赖的许可证未显式允许（foldhash／zlib-rs 的 Zlib、webpki-roots 的 CDLA-Permissive-2.0、winx 的 LLVM exception），并报告 `bincode` 与 `ttf-parser` 未维护；没有新增 allow／ignore，也没有放宽门禁。

## 未完成与下一步

`3.2` 仍保持未完成：当前 macOS 原生窗口处于锁屏状态，无法完成 Desktop mixed 的真实观看、重启恢复、Select／焦点和双尺寸浅深观察。真实账号、物理 TV、读屏／系统大字、媒体解码、正式签名／发行仍分别开放。`3.3` 的工程检查、规格验证和证据整理已完成；本批不推送、不归档、不发布。
