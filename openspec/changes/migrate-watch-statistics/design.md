# Design

## Context

固定上游已有独立的观看统计存储和 HTTP 形状：每日累计总时长、内容类型和题材，保留 366 天，批次按 ID 幂等，重置以 revision 拦截旧批次。当前 NSH 播放器已经有 `playbackActivity`、前台／后台生命周期和历史写队列，但没有统计所有者；统计不能复用历史 SQLite 或云同步队列。上游的浏览器 `dayKey` 使用本地日，而服务端只允许当前 UTC 日附近的日期；本批把这个边界写入契约，避免跨午夜把时长记到错误的一天。

## Goals / Non-Goals

**Goals:** 从共享播放器真实活动生成本机统计；跨 HTTP/native 读取、追加、重置保持同一严格语义；接入历史入口的桌面／TV共享页面并覆盖错误、空态、焦点和重置恢复。

**Non-Goals:** 不上传统计、不把统计并入历史或收藏、不添加评论／弹幕／点赞、不引入图表框架或下载队列、不把合成播放当作真实验收。

## Decisions

### 独立 core 存储

使用现有数据目录下独立版本化 SQLite 统计库；guest 与每个账号由受限 owner key 映射到独立记录（文件名只能由 core 生成，不能由请求拼接路径）。库内保存 owner 身份、`revision`、`reset_at_ms`、`since`、按日总时长、类型／题材分桶和最近 64 个 batch ID。采用原子事务、私有目录（Unix 0700）和文件（0600）、`quick_check`，坏库或未来版本拒绝打开并保留原文件，不读 legacy JSON。选择独立存储而不是复用 `LibraryStore`，是为了保证清空历史、账号同步和统计重置互不影响。

请求 scope 是 `{ owner_id, owner_epoch }`。`owner_id` 只作当前 scope 的前置条件，不能选择任意统计文件；AccountService 或受信任 guest store 提供实际 owner。`owner_epoch` 是当前进程／账号代次，随重启、登录、登出和 A→B→A 切换变化，用于拒绝旧页面和迟到批次；它不改变历史 owner 文件，也不因 reset 生成新的账号代次。游客的 `owner_id` 为空，但仍必须带当前 `owner_epoch`。

核心 DTO 为 `WatchStatisticsSnapshot { version, since, reset_at_ms, revision, days }`、`WatchStatisticsBatch { owner_id, owner_epoch, id, revision, items }` 和 `WatchStatisticsSegment { day, ms, type, genre }`。`batches` 仅作服务端幂等账本，GET／DELETE 不返回它；统计持久化不保存标题、series/episode ID、视频位置、URL、凭据或完整详情。

固定边界：保留最近 366 个日键；每个日总量最多 86,400,000ms；batch ID 为 8–96 位 ASCII 字母／数字／`_`／`-`，每批 1–128 项、单项 1–60,000ms、总量不超过 120,000ms；type 只允许 `real`、`comic`、`ai`、`unknown`；每个日最多 16 个题材桶（含 `unknown`），题材最多 40 个 Unicode 字符且不得含控制符、空白首尾、`/\\<>:` 或 `__proto__`／`constructor`／`prototype`。重复 batch ID 在并发和丢回执重试中最多累计一次，拒绝输入时不得部分写入或扩大文件。

### 播放活动采集

在 `Player` 的真实 advancing 样本上接入共享 collector。NSH 使用 `onProgress`、`onBuffer`、播放结束／错误和现有 lifecycle，而不是复制浏览器 DOM `timeupdate` 监听。collector 只接收前台、未暂停、未缓冲、已加载且位置持续前进的区段：相邻样本的 monotonic elapsed 必须为正且不超过 5 秒，position advance 必须为正且不超过 `elapsed * rate + 1` 秒，计入 `min(elapsed, advance / rate * 1000)`；倍速不放大实际墙钟时长。暂停、等待、stall、后台、结束、错误、恢复位置、seek、fast seek、换集和 clock suspend 都先切断区段，ratechange 只结算其前一段。

collector 按宿主本地日（`Date` 的本地日键）在午夜切分；每个请求同时带 `day`／`as_of_day`，core 只接受相对当前 UTC 日不超过 1 天的本地日键，并以该 `as_of_day` 作为剪枝基准。这样保留本地“今天”显示，同时防止任意历史日期写入；跨时区迁移只影响新样本的本地日，不重写已提交数据。每 30 秒或 64 个待发聚合行 flush，单行切成最多 60 秒，待发队列最多 12 批；短暂失败可延迟重试，400／409 或 owner 变化丢弃过期 scope 的待发项，不自动把它们重放到新 owner。

分类优先使用当前 `Drama.content_type`／`tags`，映射为闭集类型（`ai` 优先，其次 comic/漫，real/真人，`1`／`short_play` 为 real，`1004` 为 comic）；缺失时可在后台做有界 detail 查询，失败归 `unknown`，不得阻塞播放或从历史推导。题材只取首个安全主要标签；series ID 只可作为内存中的合并键，POST 前必须剥离。

### 传输与契约

HTTP 和 native 共用同一 core 用例与 DTO：`GET /api/v1/watch-statistics?owner_id=&owner_epoch=&day=YYYY-MM-DD` 读取以 `day` 为本地“今天”的有界快照；`POST` 使用相同 query，并要求 JSON body 的 `owner_id`／`owner_epoch` 与 query 精确相同，追加有界 batch；`DELETE` 使用相同 query，清空当前 scope 并返回新的空快照、`revision`、`since` 和 `reset_at_ms`。成功响应为现有 `{ ok: true, data }` envelope，全部响应 `Cache-Control: no-store`。

适配层只做请求解析、scope 校验和错误转换：400 `STATISTICS_REQUEST_INVALID`（日期、边界、未知字段）；403 `FORBIDDEN_ORIGIN`；409 `ACCOUNT_OWNER_CHANGED` 或 `STATISTICS_RESET`（旧 epoch／revision）；413 `BODY_TOO_LARGE`；503 `STATISTICS_STORAGE_UNAVAILABLE`。DELETE 必须先等待已接纳的当前 scope batch 结束；reset 成功后生成新的随机 revision，旧 revision 的迟到 POST 一律 409。core-client 对日期、整数、类型、题材、revision 和 unknown 严格校验；HTTP 与 native 不得各自实现一套 owner 文件逻辑。若把 `statistics` 加入 `/api/v1/status` capability，必须同时更新 Rust schema、OpenAPI、generated.ts 和两端 fixture；否则明确以现有 `history`／transport 可用性为准，不虚报独立 capability。

### UI 组合

历史页保留现有“观看统计”入口，打开独立内容区：摘要数字、周期切换、类型／题材排行、加载／空／错误和重置确认均使用 `Notice`、`Button`、`Tabs`、`List` 与数字文本基础组件。桌面与 TV 共用组件和 controller，仅由既有 platform density 与 focus manager 处理差异。

## Risks / Trade-offs

- [设备异常退出可能丢失尚未提交的短区段] → 只承认已提交批次，关闭时沿用现有 player checkpoint drain，避免伪造统计成功。
- [跨午夜或切换 owner 时批次可能横跨边界] → collector 在本地日／scope 变化时切段，core 按 `as_of_day` 和 owner epoch 校验并拒绝超窗口数据。
- [真实媒体时钟不稳定或跳动] → 只接受有限前进样本，暂停／缓冲／倒退和超长间隔都切断区段。
- [Web／Desktop／TV 对本机目录能力不同] → 以各自现有 core transport 为准，Web 只承诺本机服务可用时的同一语义，宿主未观察部分保留待验。

## Migration Plan

先实现 core 存储／契约和回归，再接 collector 与共享 UI；旧历史文件无需迁移。统计文件损坏只报告统计不可用并保留原始文件，不删除或重建历史；关闭新入口即可回滚，不影响播放器和历史写入。
