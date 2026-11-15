# 本地历史与写屏障

`LibraryStore::open(path)` 打开游客库；`open_for_owner(path, uid)` 只供已验证身份的协调器打开账号库。宿主提供明确路径，不读取 legacy `library.json`。调用方只在实际播放后提交紧凑 progress；解析 URL、浏览详情不创建记录。历史与收藏独立持久化，不保存登录凭据、媒体 URL、评论或完整选集。

## 数据库与 owner

SQLite `application_id=0x48475456`；新游客／账号库均直接提交为 v4。单行 `library_owner` 的空值表示游客，账号永久绑定非全零、1–32 位十进制 UID 字符串，`01` 与 `1` 不同。账号不能接管游客库，游客不能打开账号库，不同账号不能共用库。旧游客 v1／v2 中出现 owner 表、旧账号 v3 owner 缺失／异常、未知版本或坏数据均拒绝打开并保留原文件，不自动降级、重建或合并。

旧 v1／v2／v3 先验证身份、历史、搜索与完整性，再用 SQLite `VACUUM INTO` 建立包含已提交 WAL 内容的一致性备份：同目录 `<原文件名>.before-v4-<随机值>.sqlite3`，Unix0600并同步落盘。随后以 Immediate 事务重新核对身份／版本，保留原历史时间与搜索顺序并升级；失败回滚，源库和已完成备份保留。备份是升级前快照，不包含后续写入；恢复备份必须离线另行处理，不能自动覆盖当前库。已是 v4 的重开不重复备份。

v4 新增独立 `favorites`、`sync_state`、`sync_outbox`、`sync_hidden`、`guest_import_watermark`、`sync_backfill`，以及只供核心使用的季号／多季／待补元数据 `sync_metadata`。旧账号历史作为首次对账候选逐条保存在 backfill，不因超过2000条而阻断升级或改成刚观看；游客不产生候选。表存在不代表收藏、同步或导入已接线，当前功能以正式 API 和台账为准。

每次操作重新核对库的持久身份；变更及 `write_session` 请求中的 owner 必须精确匹配，缺省／空值仅用于游客。数据库路径和 owner 由受信任宿主／账号协调器决定，请求 owner 仅为前置条件。账号切换、epoch 与正式入口规则见[账号约定](../account/README.md)。

SQLite bundled、WAL、`synchronous=FULL`；新建 Unix 目录／文件为 0700／0600，不修改已有目录权限。连接操作在 `spawn_blocking` 中串行执行，独立连接使用 Immediate 事务和 2 秒 busy timeout。提交后才返回事务快照，没有提前发布的内存缓存；争锁超时返回 Storage，保留未保存状态后显式重试。历史当前返回全部条目，没有隐式淘汰或分页契约。

## 注册写入与失效

客户端先 `write_session`（`POST /api/v1/library/session`），再 `apply_operation`（`POST /api/v1/library/operation?session_id=…&operation_id=…`）提交原样 `LibraryChange`（`HistoryChange` 仅为兼容别名）。operation ID 是从 1 连续递增的规范十进制字符串，最大 `9007199254740991`；前一操作终止后才能注册下一操作。同 ID、同类型化请求等待／重放原执行；改请求或重放更旧 ID 被拒绝。注册前拒绝不消耗 ID。

只有匹配捕获身份的回执证明原执行终止：`committed` 带原事务快照，`failed` 带安全错误；业务重试换新 ID。传输错误、普通 GET、客户端队列排空都不代替完成回执。取消 waiter 不撤销已接纳事务，客户端不能用迟到的旧回执覆盖较新状态。

签发新 session 先封存旧 session 并等待尾操作终止。账号切换使用 `invalidate_write_sessions`，同时等所有已接纳 blocking worker 真正退出，再清除旧 session；取消等待不能重新开放旧 token。同进程注册表按规范路径＋owner 共享，尚未退出的 worker 保持注册表可发现；A→B→A 后旧 token 仍失效。调用方协调器必须阻止切换期间向旧 store 新派发；该方法不撤销受信任 store 对象的直接 `apply` 权限，也不提供跨进程排序。

`snapshot` 先等待读取时已注册的尾操作，返回持久快照，不签发回执或阻止之后的新写入。低层 `apply` 不参与注册屏障。正式账号入口仅兼容初始游客的旧 `POST /api/v1/library`；登录或成功切换后必须用注册写入，退出也不重新开放该兼容入口。

## 同步事务与内部 API

账号 progress／favorite 与对应 outbox 在同一事务提交；游客变更不生成 outbox。队列按 `(kind, series_id)` 唯一，最多2000项；同键替换分配新的递增 sequence，满队列的新键使整个本机变更回滚。上传完成后 `ack_sync(sequence)` 仅删除精确操作；上传一半成功、ACK写盘失败或旧ACK都不能清除较新操作。outbox 私有载荷用外部标签编码，避免内部标签缓冲改变精确数字／浮点字段的解析。

同步协调器先读取 `sync_boundary()` 和 `local_sync_snapshot()`，完成全部云端校验，再调用 `merge_remote(remote, boundary)`。库层使用独立的 `RemoteLibrary`／`SyncMetadata`，不依赖 Passport wire 类型；owner epoch、网络取消和凭据提交由账号协调器负责。每个 scope 只有一个 worker，拉取期间不运行另一轮 ACK。远端严格更新的历史仅替代 boundary 以内的旧 progress；期间较新的本机写入、独立 favorite 操作及持久 hidden 保持保护。只有完整收藏集合可删除未保护的旧成员；缺元数据先保留已有卡片，后续补卡不覆盖相等／较旧的本机进度。

云历史允许缺 VID 或 episode=0，仍保留真实时间和进度；`sync_metadata.history_remote` 标记该来源。普通本机 checkpoint、导入与 outbox 始终要求严格播放身份，不能为上传伪造VID或集号。hidden 按类别和 exact series 持久保存，不按数量淘汰；history 删除／clear 和 favorites clear 只影响本机可见性，不撤销已提交的 outbox。真正新播放或明确的单项收藏操作可解除相应 hidden；单项取消收藏入队 false，clear 不批量取消远端。

`merge_remote` 后按容量将迁移 backfill 搬入 outbox，保留原时间。`next_pending()` 每次只读取一项；精确 ACK 后继续填充候选。协调器须持续读取到空，不能只上传首次的2000项。`mark_synced(stamp)` 只在 outbox 与 backfill 均排空后提交成功时间；`sync_status()` 同时计入尚未入队的首次候选。此处是存储内部协议，账号 worker／正式入口接线及真实同步验收分别维护。

## 显式游客历史导入

账号协调器核对当前 owner epoch 后，只读本应用游客库快照，调用 `guest_history_status(&guest)` 获取总数与可导入数；明确确认后调用 `import_guest_history(guest)`。来源必须是空 owner；按 exact series 选择最新合法 checkpoint，只有原时间严格大于账号历史、独立导入水位和 history hidden 才可导入。收藏不参与，源游客库不变；持久记录、outbox、水位在同一 Immediate 事务提交，原观看时间不重新生成。

容量不足时提交能容纳的项并返回 `imported/remaining`；同键替换仍可完成。所有候选均无法容纳时返回 `SyncQueueFull`，不推进水位、不丢候选。上传腾出容量后重新读取游客快照／可导入数量并显式重试；原响应丢失不能从当前状态伪造上次 imported 数量。失败不发布成功计数，重启保留 outbox 和水位；删除或清空账号历史后，旧游客事件不会仅因记录已不存在而复活，真正更新的游客观看可再次成为候选。

## 最近搜索与验证

`recent_searches` 是同一物理库的独立表；add／clear 不改观看历史，不读取旧文件或发送云端。空白折叠、去重置顶、最多 10 项，拒绝控制字符及超过 80 字符／100 UTF-16 单位的词。低层操作遵守物理库 owner；当前 HTTP/native 最近搜索仍使用固定游客库，不宣称随活动账号切换或云同步。

`cargo test --locked -p hongguo-core --test library` 验证临时 SQLite 的隔离、重开、并发、故障与坏库保护；`cargo test --locked -p hongguo-core --lib library::operations` 验证取消、重传、会话切换、旧 worker 排空及失败回执。合成记录仅作边界回归；正式功能仍需真实播放产生记录、正式入口管理及重启恢复的证据，真实账号流程另行验收。

迁移专项 `cargo test --locked -p hongguo-core --test library_migration` 验证旧库、WAL一致备份、原时间、2001条首次候选、坏库／错误owner与升级失败回滚；它不证明真实云数据同步。

`cargo test --locked -p hongguo-core --lib library::sync` 与 `--lib library::guest_import` 使用合成 SQLite 记录覆盖精确ACK、满队替换、拉取期间新写、云缺播放身份、隐藏、2000项以上分批、原时间／水位、故障回滚和并发checkpoint。它们只证明存储边界；正式入口真实数据与实际云端读写仍需独立验收。
