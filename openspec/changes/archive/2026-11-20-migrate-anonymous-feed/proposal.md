# Proposal

## Why

分类与搜索已具备真实入口，但定稿刷剧频道的推荐来源仍留在旧工程。先迁移独立匿名推荐协议与可靠分页，避免用分类或热榜冒充推荐流。

## What Changes

- Rust 只读服务支持推荐16、漫剧36、真人剧39；关注45随账号批次接入，本批明确拒绝。
- 保留 tab 首屏到 cell 续页的阶段转换、原始 cell/plan/session/offset/shown，解析有界嵌套可播摘要并去重。
- 同一严格 HTTP/native 契约、取消、失败和隐私边界；离线 fixture、显式匿名 live 探针及独立审查。
- 本批仅核心接口；下一共享 UI 切片按定稿接频道与播放，不把核心通过当完整刷剧或 MVP 完成。

## Capabilities

### New Capabilities

- `anonymous-recommendation-feed`: 真实匿名推荐频道、阶段游标和跨传输只读服务。

### Modified Capabilities

无；主 spec 库仍为空。

## Impact

core catalog/playback 协议、http-api/native-bridge、生成契约及探针/测试。复用现有签名与传输，无新依赖、数据库或 Go/upstream 修改，无可见 UI 变化。
