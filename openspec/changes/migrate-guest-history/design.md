# Design

## Context

见 proposal.md。共享 store 已串行发送 action=progress，附带 owner_id，并仅在成功响应后发布 library；progressSession 已防止播放前写历史。旧参考 library.go 使用提交后发布的 JSON 快照，但新核心尚无存储。目标架构已选择 SQLite；本切片只迁移游客历史。

## Goals / Non-Goals

**Goals:** 同一 Rust 库可供 HTTP 和未来 native adapter 使用；不占用异步 executor 线程，不依赖 Go、UI 或账号。

**Non-Goals:** 不迁移旧 JSON、账号凭据、收藏/点赞和云记录；不声称支持公开多用户服务或 Android 真机。

## Decisions

1. 固定 rusqlite 0.42.0 bundled，编译 SQLite，不依赖系统 SQLite。相比新建文件快照，事务和跨连接写锁可直接保护重启恢复及并发修改；相比完整 ORM，本阶段一个表无需增加模型层。官方依据：https://docs.rs/crate/rusqlite/latest 。
2. core/library 公开异步 LibraryStore，内部单连接由 Mutex 保护，数据库操作进入 Tokio spawn_blocking；SQLite busy timeout 2 秒，事务使用 Immediate。事务内写入、读取返回快照，commit 成功后才响应，无可先行污染的内存缓存。请求取消不撤销已经进入阻塞执行的事务；重新 GET 可确认结果，重复 progress 为按 series_id 覆盖。
3. 以 application_id 和 user_version=1 标识数据库。仅空数据库可初始化；版本不兼容、外来表或损坏拒绝启动，不重建覆盖。表保存紧凑 entry JSON 和排序时间；单调时间取 max(系统毫秒, 已有最大时间+1)，避免同毫秒排序不稳定。没有隐式数量上限或自动淘汰历史。
4. Library/Entry 维持旧 TS 可选字段兼容，新增严格 action-tagged HistoryChange，支持 progress/remove/clear，删除仅 kind=history。非空 owner_id 返回冲突。更新校验在 SQL 前完成；数据库错误只输出固定代码/文字，不暴露路径、SQL 或用户数据。
5. 现有 router 构造保留无历史模式给调用方与目录测试；新增显式服务装配，status.history 由存储是否接入决定。生产开发 binary 要求 --data-dir，启动脚本传仓库 .local/data/rust；该目录与 legacy 分开。新目录在 Unix 使用 0700，新数据库 0600。存储初始化完成后才发布 ready。
6. GET/POST 响应 no-store，继承现有来源与请求体边界。生成 Entry/Library/HistoryChange 及 envelope，并替换同名手写类型。UI 不变，继续使用原有共享回归；通过临时数据库、可控 SQLite 写失败和真实二进制重启验证持久化。

## Risks / Trade-offs

- 客户端取消后写入可能已提交 → 文档明确提交语义；前端串行写与 GET 恢复，不报告已回滚。
- bundled C 构建增加宿主成本 → 固定锁文件、许可证检查；Android 与 Windows/Linux 实测单列，不由本机推定。
- 历史记录全部返回可能增长 → 与当前契约保持一致，不静默删除；分页另作契约变更。
- 当前游客 API 无公网身份隔离 → 保持 loopback Host/Origin 边界，非空 owner 拒绝，不能部署为公共多用户 API。

## Migration Plan

新增独立数据库，不读取或转换旧数据。先完成 core 与离线失败测试，再接 HTTP/启动、生成契约和三端回归。回退时恢复旧路由 501，保留新数据库文件，不尝试降级或删除用户数据。
