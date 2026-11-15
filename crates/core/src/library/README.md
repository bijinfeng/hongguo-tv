# 本地历史与写屏障

`LibraryStore::open(path)` 打开游客库；`open_for_owner(path, uid)` 只供已验证身份的协调器打开账号库。宿主提供明确路径，不读取 legacy `library.json`。调用方只在实际播放后提交紧凑 progress；解析 URL、浏览详情不创建记录。支持观看历史 progress、remove／clear，不保存登录凭据、媒体 URL、评论或完整选集。

## 数据库与 owner

SQLite `application_id=0x48475456`；新游客库为 v2，账号库为 v3。游客 v1 在同一事务内验证历史并新增关键词表升级至 v2；账号 v3 另有单行 `library_owner`，永久绑定非全零、1–32 位十进制 UID 字符串，`01` 与 `1` 不同。账号不能接管游客库，游客不能打开账号库，不同账号不能共用库。v1／v2 中出现 owner 表、v3 owner 缺失／异常、未知版本或坏数据均拒绝打开并保留原文件，不自动降级、重建或合并。

每次操作重新核对库的持久身份；变更及 `write_session` 请求中的 owner 必须精确匹配，缺省／空值仅用于游客。数据库路径和 owner 由受信任宿主／账号协调器决定，请求 owner 仅为前置条件。账号切换、epoch 与正式入口规则见[账号约定](../account/README.md)。

SQLite bundled、WAL、`synchronous=FULL`；新建 Unix 目录／文件为 0700／0600，不修改已有目录权限。连接操作在 `spawn_blocking` 中串行执行，独立连接使用 Immediate 事务和 2 秒 busy timeout。提交后才返回事务快照，没有提前发布的内存缓存；争锁超时返回 Storage，保留未保存状态后显式重试。历史当前返回全部条目，没有隐式淘汰或分页契约。

## 注册写入与失效

客户端先 `write_session`（`POST /api/v1/library/session`），再 `apply_operation`（`POST /api/v1/library/operation?session_id=…&operation_id=…`）提交原样 `HistoryChange`。operation ID 是从 1 连续递增的规范十进制字符串，最大 `9007199254740991`；前一操作终止后才能注册下一操作。同 ID、同类型化请求等待／重放原执行；改请求或重放更旧 ID 被拒绝。注册前拒绝不消耗 ID。

只有匹配捕获身份的回执证明原执行终止：`committed` 带原事务快照，`failed` 带安全错误；业务重试换新 ID。传输错误、普通 GET、客户端队列排空都不代替完成回执。取消 waiter 不撤销已接纳事务，客户端不能用迟到的旧回执覆盖较新状态。

签发新 session 先封存旧 session 并等待尾操作终止。账号切换使用 `invalidate_write_sessions`，同时等所有已接纳 blocking worker 真正退出，再清除旧 session；取消等待不能重新开放旧 token。同进程注册表按规范路径＋owner 共享，尚未退出的 worker 保持注册表可发现；A→B→A 后旧 token 仍失效。调用方协调器必须阻止切换期间向旧 store 新派发；该方法不撤销受信任 store 对象的直接 `apply` 权限，也不提供跨进程排序。

`snapshot` 先等待读取时已注册的尾操作，返回持久快照，不签发回执或阻止之后的新写入。低层 `apply` 不参与注册屏障。正式账号入口仅兼容初始游客的旧 `POST /api/v1/library`；登录或成功切换后必须用注册写入，退出也不重新开放该兼容入口。

## 最近搜索与验证

`recent_searches` 是同一物理库的独立表；add／clear 不改观看历史，不读取旧文件或发送云端。空白折叠、去重置顶、最多 10 项，拒绝控制字符及超过 80 字符／100 UTF-16 单位的词。低层操作遵守物理库 owner；当前 HTTP/native 最近搜索仍使用固定游客库，不宣称随活动账号切换或云同步。

`cargo test --locked -p hongguo-core --test library` 验证临时 SQLite 的隔离、重开、并发、故障与坏库保护；`cargo test --locked -p hongguo-core --lib library::operations` 验证取消、重传、会话切换、旧 worker 排空及失败回执。合成记录仅作边界回归；正式功能仍需真实播放产生记录、正式入口管理及重启恢复的证据，真实账号流程另行验收。
