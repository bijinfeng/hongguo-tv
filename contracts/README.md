# 契约与行为参考

`openapi.json` 由 `crates/http-api` 导出，只描述已实现的 `/healthz`、`/api/v1/status`。`packages/contracts/src/generated.ts` 由 openapi-typescript 生成，使用 `pnpm codegen` 更新，`pnpm codegen:check` 只读检查漂移。

`packages/contracts/src/index.ts` 中的搜索、详情、账号、历史 DTO 目前是迁移兼容层，尚未由 Rust 生成，不能据此认定内容接口已实现。

Rust Range 测试的首批固定输入与预期来自 `upstream.lock.json` 固定的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`：`core/cmd/hongguotv/minireel_range_test.go::TestMiniReelRangeByteRangeParser`。Rust 另外覆盖零后缀、逆序、非法符号、溢出与空资源。全部为合成字节区间，不包含真实账号或媒体数据。

后续行为验收顺序：签名/设备向量 → 搜索详情与分页 → 播放 URL → CTR/MP4/Range/ETag/取消 → 账号与持久进度。尚未把这些旧测试转成 Rust 的项目，不列为 Rust 已通过。
