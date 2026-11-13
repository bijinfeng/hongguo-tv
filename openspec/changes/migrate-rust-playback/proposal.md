# Proposal

## Why

A 批浏览界面已提交为 `9285503`，Rust 的播放地址接口仍返回 501，用户还不能从新链路完成观看与续播。下一步以已确定的桌面／TV 播放器和固定上游行为为依据，接通 Rust 媒体与共享播放会话。

## What Changes

- 在 Rust core 建立按剧目、视频、内容类型及质量／编码选择隔离的播放解析和媒体生命周期；有限身份恢复、来源回退与取消均有测试，不依赖 Go 运行。
- 实现本地媒体句柄及 HTTP GET／HEAD、200／206／416、失败恢复、有界读取和过期清理；播放器只能访问本服务发出的媒体地址。
- 从 Rust 生成播放契约，替换 TS 手写 PlayInfo；保留账号兼容 DTO 及现有游客历史协议。
- 按定稿实现桌面画面＋选集栏、TV 影院与播控／选集面板；保留来源、焦点和区间，真实播放后才保存进度。没有互动服务的评论等入口继续保持不可用，不制造成功状态。
- 用同一 Rust API 完成 Web／macOS 的真实搜索→详情→播放→切集→返回→进程重启续播；TV HTTP 预览与模拟器输入单列，不扩大成独立原生业务或物理电视验收。

## Capabilities

### New Capabilities

- `playback-resolution`: 合法可用内容的播放来源、质量／编码选择、错误、身份隔离和有界取消。
- `media-delivery`: 同源不透明媒体句柄、稳定表示、HTTP Range、读取限制与媒体资源释放。
- `adaptive-player`: 桌面与 TV 的真实播放、控制层、选集、返回及历史续播。

### Modified Capabilities

无。主 specs 当前为空；A 批的导航／续播约定保持不变，不把其尚未完成的桌面字体缩放验收勾选为通过。

## Impact

- `crates/core/src/playback/`、现有 `media.rs`、`crates/http-api`、`services/web-api`；HTTP 与未来 native bridge 复用 core，不加入 sidecar 或 Go 发行依赖。
- `packages/contracts`、`packages/core-client`、`packages/app` 和 `packages/ui`；三端仍为薄入口，播放器不在各应用复制。
- 生成 OpenAPI／TypeScript，增加去敏离线样本、Rust／HTTP／NSH 与宿主验收；依赖只在实际实现需要时选取、固定并运行 security，不放宽既有门禁。
- 公开 Web 身份隔离、账号、持久偏好、互动、下载、原生独立运行与发行属于 C／E／F／G；本批不读取旧客户端数据，不自动推送、发布或进入用户的原生 Chrome／全屏。
