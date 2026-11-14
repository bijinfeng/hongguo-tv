# Proposal

## Why

匿名发现页已接通，输入时联想仍依赖未迁移的旧链路。先将固定上游的官网 suggestion 协议迁到 Rust，并生成同一 HTTP／native 契约，为随后定稿交互提供真实、可取消且不会混淆演员和剧集身份的数据。

## What Changes

- 增加只读 `/api/v1/search/suggestions?q=…`，官网匿名请求仅含固定 app_id／count 和当前词，不含账号、搜索历史或发现服务的注册身份。
- 有界归一化剧名、演员与关键词；大整数 ID 保留字符串，只在合法剧名条目的 video_data 中提供可打开详情的精确系列，不以 keyword 猜测播放身份。
- HTTP/native 严格参数／方法／body检查、错误与取消语义一致，补合成样本、隐私／传输及生命周期回归，生成 OpenAPI／TS 类型。
- 本批交付核心与契约；下一独立 UI 切片处理输入防抖、IME、下拉焦点和演员作品交互，不把本批计为输入联想界面或整个 D 完成。

## Capabilities

### New Capabilities

- `typed-search-suggestions`: 匿名输入词联想的有界读取、剧名／演员／关键词身份与跨传输契约。

### Modified Capabilities

无。已完成的匿名发现、普通搜索和最近词语义不变。

## Impact

crates/core catalog、HTTP API、native request、生成契约及离线样本／测试／验证文档。无数据库、依赖、UI、Go、upstream或发行变化。复用既有匿名网站 client 与取消／超时，避免另一套客户端和手工 TS DTO。
