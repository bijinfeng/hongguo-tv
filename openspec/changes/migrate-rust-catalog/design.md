# Design

## Context

见 proposal.md。当前 `hongguo-core` 无网络依赖，HTTP 层将搜索/详情映射到统一 501，客户端使用手写 Drama/Episode/SearchResult。参考固定 SHA 的 `search_web.go` 已验证官网 `/api/search/result` 的独立分页语义，`hongguo_client.go::SeriesDetail` 从 HTML 内的 `_ROUTER_DATA` 解析详情，均不需要账号。

## Goals / Non-Goals

**Goals:** Rust 目录服务可直接供未来 native bridge 复用；生产仅访问固定官网，测试可显式注入 loopback fixture origin；保持业务页面和 HTTP 外层安全边界。

**Non-Goals:** 不抽象通用爬虫、完整上游数据模型或未来所有 host services；不实现 App 搜索/身份、合集、演员、评论、推荐、播放和持久化，不改 UI 或 T0 宿主。

## Decisions

1. 在 `crates/core/src/catalog/` 放 DTO、纯解析与可克隆异步 CatalogClient。使用固定 `reqwest=0.13.5`、rustls、无 cookie 功能；复用 Tokio，HTTP/1.1、不跟重定向、禁隐式代理和额外底层重试。相比直接在 Axum 内请求，此布局让 native adapter 不依赖 Axum；相比通用 transport trait，显式 loopback 注入即可覆盖当前边界。
2. 官网是 `https://hongguoduanju.com`。默认构造不能被用户 query 改变；测试配置只接受裸 loopback HTTP origin。请求 URL 通过编码 query 构造，不允许任意 URL。每次请求最多两次尝试，仅 transport/read/5xx 重试，间隔 200ms；单次最多五秒、整体十二秒，响应分块累计限额。异步 future 不 spawn 后台工作，取消由 drop 向下传播。
3. ID 始终是字符串，serde_json 开启 arbitrary_precision，兼容上游数值 ID 而不经过浮点。纯解析拒绝错误分页、截断 JSON、错误剧集；搜索去重/滤 actor，空数组不变 null；详情按 vid_list 的原顺序生成选集，严格无 eval。保留封面原地址，对参考支持的 HEIC CDN 映射输出可选 fallback。
4. 只建立当前 UI 已使用的 Drama/Episode/SearchResult 字段，不暴露完整上游对象。增加可选 source 字段以兼容旧 TSX fixtures；Rust 搜索始终返回 source=web。这些类型从 Rust 生成后由 contracts/index.ts 导出 alias，账号/历史/播放暂保留手写兼容层。
5. HTTP 状态从服务能力产生，search=true、playback/account=false。搜索/详情使用同一服务，输入拒绝返回 400，超时 504、校验挑战/错误上游 502，统一 sanitized code/error。router 构造若 HTTP/TLS 初始化失败应返回错误，让 binary 在发布 ready 前失败；测试使用显式注入 client 的 router。其他路由仍 501，现有 Host/Origin、32 KiB 与 method checks 不变。
6. `contracts/fixtures/catalog/` 保存合成 input/expected 与来源说明，Rust 默认测试直接读这些文件，不运行 Go。loopback server 测试真实客户端编码、失败/重试/大小/超时/drop。跨层测试验证查询拒绝在上游前、成功 envelope、schema 和未开放路由。真实官网检查使用显式手动 example，不放默认测试。

## Risks / Trade-offs

- 官网返回挑战或协议漂移：通过稳定错误码和 fixtures 定位，绝不自动绕过验证或返回伪造空结果；live smoke 结果单列。
- TLS/native 依赖增加 Android 构建成本：固定版本并执行供应链检查；T0 在 Android 继续验证这些依赖，不将本机编译当成 Android 支持。
- 官网源的结果/游标与 App 不同：响应声明 web，拒绝 app source，本阶段不声称完整 App 搜索对齐。
- 并行任务会改 Cargo 与文档：每次编辑前重读，局部合并依赖/锁文件，保留 T0 和设计改动，不整树格式化或提交。

## Migration Plan

先落 fixtures 与纯 DTO/解析，再接有界 HTTP client、Axum 与生成契约；保持 TS 字段可选性，执行现有三端检查/测试。最后更新当前能力文档和验证记录。若需回退，仅撤销本切片的路由接入及对应生成契约，其他并行改动不动；无数据迁移或用户数据写入。
