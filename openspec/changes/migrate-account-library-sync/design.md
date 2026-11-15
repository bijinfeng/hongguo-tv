# Design

## Context

动机见 proposal。当前 `AccountService` 已拥有 `SavedSession`、活动 `LibraryStore` 和 owner epoch；`AccountCommandResult` 返回同一协调器下的 account＋library。`LibraryStore` 的游客 v2／账号 v3 只有 history、recent_searches 和账号 owner，注册操作仍接受 `HistoryChange`。`Entry` 只表达历史，不能把仅收藏的卡片塞进其历史数组。当前正式 `Account.tsx` 有账号／历史入口，`History.tsx` 有虚拟列表和管理，详情尚无正式收藏功能。

基于当前源码，不把活跃账号变更或正在进行的扫码验收视作整批通过。固定上游：`de9712bf358dcbdf8a188e26cba711e3e5354e8a`；下述行指针均相对该提交的 `upstream/hongguo/core/cmd/hongguotv/`。

## Goals / Non-Goals

**Goals:** 同一 Rust 状态所有者贯通持久化、云协议、HTTP/native 和共享 UI；保留现有库、精确回执、账号切换与播放检查点顺序。

**Non-Goals:** 不增加同步服务／通用插件框架，不接管旧客户端数据；不实现追更、预约、点赞、通知或公开 Web 多用户。追更 `subscribe/delete/v` 与预约 `uncover_subscribe/v` 均不进入收藏实现。

## Decisions

### 1. 一个契约负责人，扩展现有写屏障

- `crates/core/src/library` 定义单一 `LibraryChange`，包含现有 progress/remove/clear 和显式 `favorite { owner_id, drama, value }`；kind 增加 favorites。需要兼容 `HistoryChange` 名称时仅用类型别名，不维护双套模型。
- `Library.entries` 继续只返回历史；增加 `favorites: Vec<FavoriteEntry>`，其字段仅为紧凑 drama 和 favorite_at，不伪造 episode／position。owner 仍由库固定，DTO 中的 owner 只是前置条件。
- favorite 使用现有 write_session／apply_operation 和精确终止回执；不另建并发写队列。原始请求重放、失败新 operation ID、未知结果对账沿用现约定；旧兼容 library 写入口仍只服务初始游客历史，不借本批开放收藏或账号旁路。
- `Account` 增加 `sync` 与 `guest_history { total, available }` 安全状态；`AccountCommand` 增加 `sync`、`import_guest_history`，继续使用现有 owner_id＋owner_epoch。`AccountCommandResult` 保留 account＋library，导入另带可选 `import_history { imported, remaining }`；丢失响应后只能报告对账得到的当前数量，不伪造原响应计数。Rust 是 HTTP/native／OpenAPI 的唯一 DTO 编辑源，TS 只导出 generated aliases。

选择扩展现有协调器，避免 HTTP/native 各做同步，也避免收藏数组污染历史／首页续播。API 装配者负责一次性冻结字段和错误码，再交给 UI 实施者。

### 2. library v4 原地迁移

迁移在现有 `initialize`／owner 校验与 Immediate 事务中完成；`application_id=0x48475456` 不变。

| 来源    | v4 处理                                                                |
| ------- | ---------------------------------------------------------------------- |
| 游客 v1 | 先保持已有 v1→v2 行为，再升级；history 时间与 recent_searches 原样保留 |
| 游客 v2 | 保留两张原表；建立单行 owner，值为空，只允许按游客打开                 |
| 账号 v3 | 保留原 owner 行、history 和 recent_searches；不能变成游客或其他 UID    |
| 新库    | 直接创建同一 v4；owner 空值表示游客，否则必须为合法已验证 UID          |

新增 `favorites(series_id, drama_json, favorite_at)`、`sync_state(singleton, sequence, last_sync)`、`sync_outbox(sequence, kind, series_id, payload_json)`、`sync_hidden(kind, series_id, hidden_at)`、`guest_import_watermark(series_id, played_at)`。outbox 对 `(kind, series_id)` 唯一；替换使用递增 sequence，ACK 只按精确 sequence 删除。游客不产生云 outbox。

账号 v3 已有历史作为一次性的首次对账候选保存在 `sync_backfill(series_id)`；拉取后只将仍需上报的有效记录逐批搬入 outbox，保留原时间，未入队候选不丢弃。remove/clear 同事务移除对应候选。不得因超过2000条而阻断库升级或重新标记为“刚观看”。

每次操作重新校验 v4 owner。迁移前创建 SQLite 一致性备份；失败回滚、保留源文件，未知版本／异常 owner／坏 JSON 拒绝打开。不删库重建，不读取 legacy JSON。history 与 favorites 分表，删除任一类别不删另一个；recent_searches 的现有宿主路由范围保持不变。

### 3. Passport 内部增加固定云协议

在 `account/passport/cloud.rs` 增加私有 `cloud_request`，对外仅提供 `pull_library(uid, local)`、`upload_progress(entry)`、`set_favorite(series_id, value)`；类型不携带公开 Cookie/token。复用现有 bounded transport、query 和 full Medusa，新增 JSON／GET 支持；不复用固定 POST/form 的 `app_request` 或其 `message=success` 判定。

统一基址 `https://api5-normal-lq.fqnovel.com`；从当前 `SavedSession` 克隆会话后先 `validate_for_uid(profile.uid)`。云头使用参考非 Passport SDK 版本 `6031190`，注入 X-Tt-Token 和会话 Cookie；签名覆盖实际 JSON 字节。仅顶层 code=0 且嵌套 error_code 无非零才成功；所有错误输出有限安全分类，不输出远端正文。依据 `passport_client.go:83–175,327–385`。

| 能力     | 固定 wire                                                                                                                                                                                           | 来源               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 历史列表 | GET `/reading/bookapi/read_history/list/v`；book_type=2、limit=0、offset、full_field=false、query_soft_deleted=false、last_min_read_timestamp_ms=0、is_first_load                                   | `cloud.go:337–412` |
| 收藏列表 | GET `/reading/bookapi/bookshelf/video/list/v`；target_user_id=已验证 UID；必需 video_shelf_info 数组                                                                                                | `cloud.go:413–450` |
| 补充进度 | POST `/reading/bookapi/read_progress/get/v`；`{"book_ids":{"2":[numeric IDs]}}`；每批200，video_data 允许顶层／data内                                                                               | `cloud.go:490–545` |
| 补卡片   | POST `/novel/player/multi_video_detail/preload/v1`；dr_scene=preload、逗号拼接 series_id 及固定 biz_param；每批20                                                                                   | `cloud.go:548–584` |
| 上传历史 | POST `/reading/bookapi/read_history/update/v`；`update_datas`，book_id／vid 数字，vid_index、read_timestamp_ms、位置／时长毫秒，book_type=2                                                         | `cloud.go:317–328` |
| 上传进度 | POST `/reading/bookapi/read_progress/upload/v`；`books`，book_id／item_id 字符串、vid_index、current_play_time 毫秒和原 read_timestamp_ms                                                           | `cloud.go:329–334` |
| 收藏写   | POST `/reading/bookapi/bookshelf/video/update/v`；is_cancelled=false、固定 shark_extra、update_bookshelf_video_list，book_id字符串、book_type=2、modify_time、video_shelf_operate_type 添加0／取消1 | `cloud.go:304–315` |

保留参考行中的其余固定字段、布尔／数字类型，不按字段名猜测；精确数字使用 serde_json::Number，不经过 f64。历史最多200页，检测重复页和空页 has_more，next_offset 未推进时按500步进。`cloud_test.go:17–237,239–371` 提供分页、季号、wire 与坏快照断言；不运行 Go。

### 4. 持久 outbox 与冲突

`library/sync.rs` 拥有事务 `merge_remote`、`next_pending`、`ack(sequence)` 和 `mark_synced`；`library/favorites.rs` 拥有收藏存取。账号实际 progress／favorite 变更与 outbox 同事务；队列最多2000条，同 kind＋series 允许替换。队满时新用户变更整体失败，既有数据不受影响。

同步顺序为完整拉取→事务冲突合并／首次候选入队→逐项上传→精确 ACK→保存成功时间。历史上报与进度上报都成功才 ACK；任一失败保留操作，重试可能再次发送已成功的一半，不能宣称远端恰好一次。参考 `cloud.go:165–244,255–301,587–657`、`account_test.go:439–485`。

远端严格更新的观看时间只淘汰对应旧 progress；相等／旧时间保持本地。拉取期间的新本地写入和收藏操作不能被覆盖。只有完整已校验的收藏快照可移除未保护的本地收藏；卡片缺失不等于取消收藏，身份冲突必须拒绝合并。

history remove/clear 只写本机 hidden，不发云历史删除；favorites clear 只隐藏，本机确认文案写明“仅从此设备移除”；单项取消收藏写远端取消 outbox。既有用户明确提交的 outbox 不因本机 clear 而假装撤销。上游内存 map 最多2000条隐藏标记会淘汰；本批用 SQLite 持久隐藏表按 ID 查询，不照搬会使已删除记录复活的淘汰策略。导入 watermark 同样独立持久。

### 5. 同步生命周期和 DTO 发布

`account/sync.rs` 复用 AccountService：锁内捕获 UID、owner_epoch、活动 store 和凭据，网络放锁外。每次 merge、ACK、凭据刷新和状态发布前都重新检查同一 scope；每 scope 单个任务，3分钟整轮超时，账号切换／退出／宿主停止取消。收到取消不代表远端写已回滚；迟到结果只能丢弃，不能更新新 epoch 或重新登录。

宿主统一启动／关闭一个 `run_sync` 生命周期，不在页面或各 clone 隐式启动 worker。参考登录唤醒、90秒周期和本地变更2秒合并；显式 sync 唤醒同一 worker，不建立第二条队列。页面离开只取消 UI 观察，不撤销已提交 outbox。刷新后的有效会话只在原 scope 内用私有 SessionStore 保存。

`sync.state=local|idle|pending|syncing|error`，含 pending、可选 last_sync/error；成功时间只在完整流程完成并持久化后更新。状态读取保留历史快照；同步发布不能让较早 TSX read／receipt 覆盖新快照。共享 library-state 对当前 epoch 的异步刷新做串行失效与重读，沿用原 registered receipts，不用 GET 冒充写终止证明。

### 6. 显式游客历史导入

`library/guest_import.rs` 提供 eligible counts 与事务 import；AccountService 校验 scope 后读取本应用 guest snapshot。按 series 取最新合法 progress，严格比较账号时间、watermark 和 history hidden 时间；保留原时间、账号收藏，guest 库只读。记录、outbox、watermark 一次提交，满队列允许部分导入并返回 imported／remaining；重启／清空后旧源记录不复活。

不能调用会重新生成观看时间的普通 progress apply 来模拟导入。前端先排空已接纳 checkpoint，再通过 account command 提交和对账；丢失响应先读取权威状态，未确认结果不虚构回滚。依据 `guest_history.go:21–146`、`guest_history_test.go:32–213`。

### 7. 正式入口、交互与动效清单

- 账号页：当前账号、同步状态／同步或重试、可导入数量与“合并登录前观看记录”、历史／收藏入口。只在确有对象和操作时显示状态，不堆技术说明；未登录仅本机能力。
- 片库：沿用现有 history 路由和列表／管理，使用共享 Tabs 分为“观看记录／收藏”；账号页可直达收藏 tab。保留已有历史管理、虚拟身份和来源恢复。收藏提供详情、单项取消和明确本机范围的清空确认，不冒充追更／预约。
- 详情：当前浏览 series 的显式“收藏／已收藏”，绑定当前 owner 的本机持久状态；离线可提交，云端失败显示待同步；本地失败或未知回执不能先改为成功。切季变更精确 series，不能误用当前播放 VID。
- 全部使用现有 Button、Tabs、Notice、ConfirmDialog、Cover／PosterCard 和 Lucide Icon；组件一次运行，绑定内读取信号。UI 风格／tokens／基础动效只归 packages/ui，不复制端型逻辑。

| 状态变化                                    | 工具／tokens                                       | 减少动态与焦点                                                |
| ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| 收藏、同步、导入按钮 hover／press／disabled | 共享 Button fast 反馈                              | 关闭缩放或即时反馈；焦点独立于选中                            |
| 收藏图标／标签与同步状态改变                | 共享图标／文字状态过渡，fast；高频计数即时更新     | 即时切换，不移动邻项或强制聚焦                                |
| 历史／收藏 tab 切换                         | 共享 Tabs selection 与既有切页过渡                 | 即时切换；每tab保留独立 ID＋offset                            |
| 首次收藏内容到达                            | 现有 ContentArrival 180ms／8pt                     | 关闭位移；刷新／回收行不重播                                  |
| 导入／清空确认开关                          | 现有 ConfirmDialog presence                        | 复用减少动态；安全取消为初始焦点，回存活触发器                |
| 取消收藏后列表变化                          | 提交后更新；复用历史的邻项揭示／恢复，不加布局动效 | 即时揭示完整焦点圈；新输入／离页／background／epoch取消旧恢复 |
| loading、部分失败、待同步                   | 原区域 Notice 与共享 pending 控件                  | 不循环装饰动画；不遮挡仍可读记录                              |
| 拖动／手势／声音／持续动画                  | 本批无此能力                                       | 不新增                                                        |

### 8. 验收与授权

先用去敏 fixture 回归迁移、JSON字节签名、分页、双写／ACK、冲突、满队列、写盘失败及 A→B→A；HTTP/native 同用例验证。三端 check 和 build、codegen:check 后冻结源码，由集成者跑一次完整 verify。

正式验收使用本应用真实播放产生的游客／账号记录：收藏与重启、云端已有记录拉取、授权的真实播放进度上传、单项收藏／取消、显式合并、本机清空后拉取、退出恢复游客。真实云写前明确获准账号、目标剧集和操作（包括启动 worker 可能上传的既有 outbox／迁移候选）；扫码登录授权不自动扩展为云写授权。未获授权继续离线／只读工作，不代为操作其他客户端。

分别观察 Web、Desktop native、Android TV 正式宿主的浅深、大字、键盘／DPAD、减少动态、长列表与返回。跨设备冲突若无可用第二端真实证据，保留未验，不能用 loopback 替代。证据记录源码、入口、平台、真实／合成来源、失败与限制，不含凭据；具体结果以后按既有文档所有者维护，不在本次规划改根文档。

## Risks / Trade-offs

- 上游分页／字段／会话变化 → 固定 wire 回归＋授权真实验收；坏快照保留本机与 outbox。
- 双写部分成功／回执丢失 → 保留精确操作重试；不宣称云端恰好一次或取消即回滚。
- 长期隐藏／导入水位增加磁盘记录 → SQLite 按主键查询，不整表载入内存，也不静默淘汰导致旧记录复活。
- UI快照与同步并发 → 一套 library-state 发布与 epoch 围栏，复用现有 operation barrier；不新增第二个可写客户端缓存。

## Migration Plan

先由一个负责人落定 DTO 与 v4 SQL；存储／协议在互不覆盖的子模块实现，集成 coordinator 后再接正式 UI。历史 v2／v3 的一致性备份和迁移失败回滚必须先通过；随后补宿主与真实验收。旧 binary 不支持 v4时拒绝打开，不能自动降级；人工离线恢复备份须明确备份不含升级后的新写入，不覆盖现有库“恢复成功”。只在行为／证据满足后申请归档，规划完成不表示功能完成。
