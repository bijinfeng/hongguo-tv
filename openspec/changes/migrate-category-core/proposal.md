## Why

定稿找剧筛选尚无Rust分类数据。固定上游分类使用匿名签名POST、动态selector与独立游标，不能用搜索结果的本地筛选或推荐feed替代。

## What Changes

- 迁移分类场景、明确空选择、八类受限筛选、session／offset／shown上下文与严格解析。
- 复用已迁移的Passport签名原语并支持POST body，使用短生命周期匿名身份，仅空200响应有限重试。
- 同一只读GET `/api/v1/category` 接入HTTP/native并生成契约；离线／取消／错误／隐私与显式匿名探针提供证据。

## Capabilities

### New Capabilities

- `category-catalog`: 匿名分类筛选、动态选项、分页上下文与跨传输一致性。

### Modified Capabilities

无。

## Impact

core catalog／crate-private匿名传输、HTTP/native适配、OpenAPI／TS aliases与回归。无依赖、数据库、Go或upstream改动，无可见UI；后续共享筛选页继续按定稿实现，推荐feed／新剧／榜单独立迁移。完整D/MVP、C3.2和安全发行保持开放。
