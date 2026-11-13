# 契约与行为参考

`openapi.json` 由 `crates/http-api` 导出，描述已实现的 `/healthz`、`/api/v1/status`、`/api/v1/search` 和 `/api/v1/series/detail`。`packages/contracts/src/generated.ts` 由 openapi-typescript 生成，使用 `pnpm codegen` 更新，`pnpm codegen:check` 只读检查漂移。

`Drama`、`Episode`、`SearchResult` 从 Rust DTO 生成，`index.ts` 只导出类型别名；账号、历史和播放仍保留手写兼容类型，对应 Rust 功能尚未开放。匿名目录行为样本、离线测试和显式官网 smoke 见 [fixtures/catalog/README.md](fixtures/catalog/README.md)。

搜索只支持官网 `source=web`，offset 表示已消耗的网页页数；它不是 App 搜索游标。请求词为 1–80 个 Unicode 字符，offset 范围 0–100000；详情 ID 是 1–32 位非全零十进制字符串，创作者合集 1003 显式拒绝。验证挑战/错误数据等返回 sanitized 502，超时 504，参数错误 400；客户端不得将这些错误当成空页。响应上限搜索 4 MiB、详情 12 MiB，每次 5 秒、整体 12 秒，最多两次尝试，不携带账号凭据或跟随重定向。

Rust Range 测试的首批固定输入与预期来自 `upstream.lock.json` 固定的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`：`core/cmd/hongguotv/minireel_range_test.go::TestMiniReelRangeByteRangeParser`。Rust 另外覆盖零后缀、逆序、非法符号、溢出与空资源。全部为合成字节区间，不包含真实账号或媒体数据。

搜索详情与官网分页已完成本地样本验证；后续行为验收顺序：签名/设备向量 → 播放 URL → CTR/MP4/Range/ETag/取消 → 账号与持久进度。尚未把这些旧测试转成 Rust 的项目，不列为 Rust 已通过。
