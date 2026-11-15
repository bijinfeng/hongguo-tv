# 游客历史

`LibraryStore::open(database_path).await` 接受宿主明确提供的数据库路径。只在新目录/新文件创建时设置 Unix 0700/0600，不修改已有目录权限；绝不读取 legacy 的 library.json。

`snapshot` 只读；`apply(HistoryChange)` 支持 progress、remove/clear（kind=history）。游客 owner_id 仅允许缺省或空字符串。调用方负责只在实际播放后上报，URL 解析不能创建记录；共享 progressSession 的保护行为继续保留。

SQLite bundled、WAL、synchronous=FULL，单连接操作在 spawn_blocking 中串行执行，独立连接由 Immediate 事务和 2 秒 busy timeout 协调。事务内读取新快照，commit 后才返回，无提前发布的内存缓存。取消 HTTP/future 不能撤销已经开始的阻塞事务；普通 GET 或客户端队列排空不能证明原写入已结束。

需要完成屏障的客户端先调用 `write_session`（`POST /api/v1/library/session`），再用 `apply_operation`（`POST /api/v1/library/operation?session_id=…&operation_id=…`）提交原样 `HistoryChange`。operation_id 为从 `1` 开始连续递增的规范十进制字符串，最大 `9007199254740991`；同一会话只允许前一操作终止后注册下一操作。同 ID、同类型化请求重传会等待或重放原执行结果，不重新执行；同 ID 改请求或重放更旧 ID 会被拒绝。只有匹配捕获身份的 `LibraryOperation` 回执证明原执行已终止：`committed` 含原事务快照，`failed` 含脱敏错误，业务重试须换新 ID。传输错误或注册前拒绝均不是完成回执，注册前拒绝不消耗 ID。

切换会话先封存旧会话，再等待已注册的原操作终止，最后返回新 session_id；取消等待者不会取消执行或重新开放旧会话。同进程以规范数据库路径共享会话注册表，原宿主 store 被丢弃后重开仍能等待其阻塞 worker。公开 `snapshot` 也先等待读取时已注册的尾操作终结，避免重开页面先显示其执行前的旧快照；读取不签发操作身份回执，也不锁住之后注册的写入。此协议不提供跨进程排序；旧 `apply`／`POST /api/v1/library` 保持兼容，但不参与完成屏障。客户端仍须隔离旧回执，不能用原事务快照覆盖较新的页面状态。

application_id=0x48475456、user_version=2（从1在同一事务内新增关键词表）。仅空库初始化，不识别的数据库/未来版本/坏数据报错并保留原文件，不重建或自动降级。历史不设隐式淘汰上限，API 当前返回全部条目；分页需另行演进契约。数据库不保存账号、媒体 URL 或完整选集。

验证：`cargo test --locked -p hongguo-core --test library`，使用临时目录；覆盖并发连接、事务失败、重启、身份/输入边界及坏库保护。完成屏障另由 `cargo test --locked -p hongguo-core --lib library::operations` 覆盖取消、重传、会话切换、同路径重开和失败回执。

最近搜索使用同一宿主数据库的独立 `recent_searches` 表。`search_history` 只读；`change_search_history` 的 add／clear 只保存提交的关键词，不改观看历史，不读取 legacy 文件或发送云端。空白折叠并去重，新词或重复词置顶，最多10项；拒绝控制字符、超过80字符或100 UTF-16单位的词，不放宽官网搜索限制。事务提交后才返回快照，失败保留上一快照；已有未来版本／异常表／坏数据明确失败。v1→v2 先校验观看数据再建表，一起提交；失败回滚。旧版不能打开v2，不自动降级或删除表，回退必须使用升级前备份。

独立连接争锁超过 2 秒时返回 Storage，调用者保留未保存状态并显式重试；不承诺任意积压下所有写入都无错误。并发验收逐轮运行两个独立写入者并核对全部 20 条记录；另用真实 SQLite 写锁验证超时不改变已提交快照、解锁后相同写入可重试。
