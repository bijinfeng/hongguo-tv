# Design

## Context

见 proposal。账号、持久会话、云传输、追更、日历公告与季元数据已存在。固定依据为 de9712bf 的 `lists.go:445–569`、`lists_test.go:42–138`、`series_seasons.go`；本批不借用其他版本 wire。

## Goals / Non-Goals

**Goals:** 打通独立预约记录的两组读取、精确身份写入和正式共享入口，复用账号生命周期、基础组件及只读恢复。

**Non-Goals:** 不将预约并入追更或收藏，不新增离线队列、系统推送、定时任务；本地更新提醒与统计下一批继续实施。

## Decisions

### Wire 与身份

GET `/reading/user/subscribe/list/v1/` 固定 tab_type=13、subscribe_order_type=0、swipe_type=0、need_calendar_schema=false、limit=20、subscribe_offset=0，分别 is_online=true／false，offset 从0开始。首轮省略 session_id，后续原样携带远端 session。has_more 明确为 false 才完成；官方已证实 raw rows 非空且 continuation 缺失／不前进时 offset+20，其他停滞拒绝。空但前进的页合法。两组共享100页、2000唯一成员、8MiB完整响应 JSON 和60秒整轮预算；单请求沿用既有25秒。该预算是工程限制，不是产品宣称。

POST `/reading/bookapi/search/uncover_subscribe/v`，gzip 精确数字 JSON `{item_id:<i64>,item_type:1,op_type:1|2,shark_param:{enter_from:"BulletActivity",previous_page:"MainFragmentActivity",page_list:"MainFragmentActivity,BulletActivity"},wish_list_all_del:0}`，复用固定签名／来源限制。Target 为 `{kind:"item"|"series",id:string}`；canonical 正十进制，最大 i64::MAX，全程不经过 JS number。日历及列表用 raw item_id，季用实际 series ID。

### DTO 与观察

`ReservationQuery` 为 owner_id／owner_epoch。`ReservationSnapshot` 同 scope、items、可选真实 online_total／upcoming_total。Item 为可选 reservation_id／series_id、online、可选真实可播 drama／title、cover／cover_fallback／intro、可选秒级 publish_time／publish_text 与 tags。至少保留一种真实身份；不凭 item_id 补 series。无卡片仍能显示不可用成员并按有效 item 身份取消。

`ReservationMutationRequest` 为 scope、target、enabled。Result 同 intent、acknowledged=true、confirmed、可选完整 snapshot／安全 reconciliation_error。GET／POST `/api/v1/reservations`、native 共用 core DTO；client 为 readReservations／setReservation／reservationMembership。

匹配目标类型的真实身份时观察为 true；没有匹配且所有成员都带该种身份时为 false；否则为 unknown。不能用刚上线、缺身份或部分列表证明取消。快照完整但关系 unknown 时，界面仍允许显式 enabled=true，不假称“未预约”；写回不确定时保留原绝对目标，刷新只读，明确重试才可能再写。

### 所有权和最小复用

沿用 follow 的 scope、闸门、watch 取消、已接纳任务排空与凭证 CAS。两种真实在线能力已有重复需求时只提取窄的 account online 协调帮助，不建插件框架、操作注册表或持久任务。账号主锁不跨网络；旧 same-epoch 凭据不能覆盖新凭据；POST 刷新凭据须在读回前保存。HTTP／native 只作适配，TSX controller 持有视图快照与 pending／unknown／unconfirmed，后台、切号、销毁取消旧发布。

### UI 与动效

沿用原型的账号记录入口、内容列表、日历公告及季布局。账号页增加“查看预约”，独立共享页使用 Tabs“待上线／已上线”、刷新和现有 List／Cover／CardControls，实际字段缺失就省略。待上线不提供虚假播放；已上线有真实 drama 才打开详情。未知、错误、空表分别呈现，不以空表吞失败。日历与季的 ReservationAction 共用控制器与基础 Button／Notice，不制造两套交互。

| 状态变化                        | 既有工具                           | 减少动态／焦点                   |
| ------------------------------- | ---------------------------------- | -------------------------------- |
| 按钮、Tab hover／press／pending | UI fast／selected反馈              | 保留清晰焦点，不新增位移         |
| 初次数据出现                    | ContentArrival 180ms／8pt          | 无位移；刷新与回收不重播         |
| 取消后列表变化                  | 确认快照、ID＋offset锚点和邻项恢复 | 无额外布局动画；新意图取消旧恢复 |
| 错误／unknown                   | 原位 Notice／只读刷新／显式重试    | 不抢焦点，不用成功 toast         |
| 进入／返回                      | 既有 NavStack                      | 复用减少动态，不新增弹层、声音   |

TV 与桌面复用语义和组件，密度与输入仅由既有适配处理；TV 主焦点使用可用 Tab，避免等待接口结束才有可达入口。具体细节见 `docs/features/reservations.md`。

## Risks / Trade-offs

- 两组读取不是远端原子快照 → 不宣称瞬时事务一致，身份冲突保守失败，写后重新完整观察。
- 远端可能返回缺失关联身份 → 保留成员和 unknown，不虚构关系或成功。
- 云写必须有适用授权、macOS 锁屏 → 独立工程工作继续，真实写与可见宿主保持未验，不复制账号凭证；物理 TV 按平台限制记录。

## Migration Plan

无数据库迁移及新依赖。新增端点与共享页面，既有历史、收藏、追更保持原语义；分层定向测试后冻结代码，统一 codegen/check/build/verify，再真实入口审查和本地提交，不推送。
