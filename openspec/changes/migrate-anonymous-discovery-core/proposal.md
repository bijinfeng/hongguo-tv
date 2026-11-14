# Proposal

## Why

搜索发现的公开推荐词与短剧／漫剧热搜仍依赖 legacy Go，当前 Rust 搜索只能提交关键词。先迁移真实匿名只读能力，后续定稿发现页才能使用真实数据而非演示列表。

## What Changes

- 按已核对的上游匿名 plan 请求迁移独立设备身份、Medusa 签名与严格解析，保留已迁移播放协议。
- 提供有界、可取消、实例内缓存的发现服务；禁止账号令牌／Cookies、本机关键词历史或查询进入上游发现请求。
- 增加统一只读 `/api/v1/search/discovery` HTTP/native 入口与生成契约，使用固定离线向量及 loopback fixtures 验证。
- 此批仅完成核心／API能力；下一批再按定稿卡片／关键词接共享 UI，不改现有布局或宣称发现页面已完成。

## Capabilities

### New Capabilities

- `anonymous-search-discovery`: 独立匿名公开搜索建议、短剧／漫剧热搜读取及其隐私、边界和传输契约。

### Modified Capabilities

无。

## Impact

Rust core、http-api、native-bridge、OpenAPI／generated.ts、固定合成样本与文档。复用现有密码和HTTP依赖，不新增Go业务、工具链或账号集成；不改upstream、数据库、原型、NSH版本或发行。
