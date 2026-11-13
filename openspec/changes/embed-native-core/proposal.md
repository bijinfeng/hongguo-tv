# Proposal

## Why

当前桌面与 TV 生产页面仍连接电脑上的 Rust HTTP 服务，安装包不能独立搜索、观看或保存续播。C 批把已迁移核心链接进原生宿主，复用既定页面和 T0 embedding，建立首期 MVP 的原生运行基线。

## What Changes

- 增加共享 Rust native bridge，装配目录、游客 SQLite 历史、播放服务；业务在进程内调用，媒体使用仅限 loopback 的有界 Range 路由。
- core-client 保留 HTTP 配置入口，增加平台无关 transport 注入；原生薄入口注册同一 bridge，保持既有 wire DTO、错误码、取消和迟到资源释放。
- Desktop 接 NSH mixed；TV 复用现有 native crate 和 Android 宿主，生产默认包使用原生业务，保留显式 HTTP 夹具与 T0 验证入口。
- 开发与打包命令区分原生业务、外部 API 预览和技术探针；不再以 T0 或 adb reverse 证明独立业务。
- 按切片审查并提交，独立验收安装包在电脑 API 停止且 reverse 清除后的真实搜索、观看、重启续播。

## Capabilities

### New Capabilities

- `native-core-session`: 原生应用隔离存储、进程内业务调用、取消与媒体服务所有权，以及独立安装运行。

### Modified Capabilities

无。现有目录、历史与播放变更仍未归档，其业务约束保持；本批新增宿主装配行为。

## Impact

涉及 crates/native-bridge、apps/desktop/native、apps/tv/native、两端薄入口、packages/core-client、http-api 的媒体专用路由与工程脚本；继续使用锁定 NSH/Tokio/SQLite/HTTP 依赖，不引入 Go、sidecar、React 或新 UI。Rust DTO 变化时生成并检查契约。macOS 锁屏、物理设备、辅助技术、账号和正式签名发行的边界单独记录，C 验收不能覆盖 A/B 的未完成项。
