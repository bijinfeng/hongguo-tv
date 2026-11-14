# 游客历史

`LibraryStore::open(database_path).await` 接受宿主明确提供的数据库路径。只在新目录/新文件创建时设置 Unix 0700/0600，不修改已有目录权限；绝不读取 legacy 的 library.json。

`snapshot` 只读；`apply(HistoryChange)` 支持 progress、remove/clear（kind=history）。游客 owner_id 仅允许缺省或空字符串。调用方负责只在实际播放后上报，URL 解析不能创建记录；共享 progressSession 的保护行为继续保留。

SQLite bundled、WAL、synchronous=FULL，单连接操作在 spawn_blocking 中串行执行，独立连接由 Immediate 事务和 2 秒 busy timeout 协调。事务内读取新快照，commit 后才返回，无提前发布的内存缓存。取消 HTTP/future 不能撤销已经开始的阻塞事务；恢复后 GET 确认结果，重复 progress 覆盖同一 series_id。

application_id=0x48475456、user_version=2（从1在同一事务内新增关键词表）。仅空库初始化，不识别的数据库/未来版本/坏数据报错并保留原文件，不重建或自动降级。历史不设隐式淘汰上限，API 当前返回全部条目；分页需另行演进契约。数据库不保存账号、媒体 URL 或完整选集。

验证：`cargo test --locked -p hongguo-core --test library`，使用临时目录；覆盖并发连接、事务失败、重启、身份/输入边界及坏库保护。

最近搜索使用同一宿主数据库的独立 `recent_searches` 表。`search_history` 只读；`change_search_history` 的 add／clear 只保存提交的关键词，不改观看历史，不读取 legacy 文件或发送云端。空白折叠并去重，新词或重复词置顶，最多10项；拒绝控制字符、超过80字符或100 UTF-16单位的词，不放宽官网搜索限制。事务提交后才返回快照，失败保留上一快照；已有未来版本／异常表／坏数据明确失败。v1→v2 先校验观看数据再建表，一起提交；失败回滚。旧版不能打开v2，不自动降级或删除表，回退必须使用升级前备份。
