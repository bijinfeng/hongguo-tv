# Proposal

## Why

产品台账仍缺少观看统计，当前播放只写观看记录，无法向用户展示实际观看时长。统计必须来自播放过程中真实前进的时间，和历史条数、当前位置、收藏及云同步保持独立；现在补齐它可以完成个人记录 MVP 的最后一类本地数据。

## What Changes

- 在 Rust core 增加按当前 owner 隔离的本机观看统计存储，保留每日总时长、内容类型和主要题材累计，并支持有界保留与显式重置。
- 从共享播放器的真实播放活动产生有界、可重试且幂等的统计批次；暂停、缓冲、后台、跳转和仅打开播放器不计入统计。
- 接通 HTTP/native 统一 GET、POST、DELETE 契约与 TypeScript/core-client 校验，保护 owner／epoch、生命周期和迟到响应。
- 在账号历史入口提供共享观看统计摘要和重置确认；桌面与 TV 复用语义和交互，仅适配密度与输入。
- 记录真实流程、合成边界和未覆盖宿主，保留统计不上传云端、不清除历史的边界。

## Capabilities

### New Capabilities

- `watch-statistics`: 基于真实播放活动的本机观看统计累计、读取、重置及共享展示。

### Modified Capabilities

无。

## Impact

涉及 `crates/core`、`crates/http-api`、`crates/native-bridge`、contracts／core-client、`packages/app` 播放与历史页面及各入口测试。使用现有 SQLite／NSH／Tokio 和传输，不新增依赖，不修改 `upstream/hongguo/`，不把统计并入观看历史或账号云同步。
