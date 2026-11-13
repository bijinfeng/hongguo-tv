# Proposal

## Why

Rust 搜索与详情已可用，但历史接口仍返回 501，无法为三端提供稳定的续播数据。设计稿产出前先实现游客历史存储，可离线验证重启恢复与写入失败保护，并复用到后续原生宿主。

## What Changes

- 在 Rust 核心实现 SQLite 游客历史：保存进度、按最近观看排序、删除单条与清空历史。
- 使用独立版本化数据库，事务提交后才返回新状态；拒绝未来版本、损坏或非本应用数据库，不读取旧 Go 数据。
- 接入现有 library GET/POST，保留 Host/Origin、JSON 与 32 KiB 边界；生成历史 DTO 与请求契约。
- 明确只支持游客历史；账号、云同步、收藏/点赞、真实播放解析和 TV 原生业务 bridge 继续按后续切片迁移。页面和设计不变。

## Capabilities

### New Capabilities

- `guest-history`: 游客历史与续播的持久化、失败保护、进程接入与生成契约。

### Modified Capabilities

无。

## Impact

涉及 crates/core、crates/http-api、services/web-api、contracts、packages/contracts、开发启动脚本和验证文档。固定 rusqlite bundled 依赖与锁文件；默认回归使用临时数据库，不接触用户数据或真实账号。并行 TV/UI 改动保留。
