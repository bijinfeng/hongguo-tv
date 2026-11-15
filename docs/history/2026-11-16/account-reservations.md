# 账号预约批次

日期：2026-11-16。变更：`migrate-account-reservations`。本批完成预约的 Rust 核心、HTTP/native 契约、core-client、共享 controller/store，以及账号列表、日历和待上线季入口；完整 MVP 仍未完成。

## 实施结果

- 预约读取分别覆盖已上线和待上线两组，分页从零开始并携带服务端 continuation；空但明确前进的页继续读取，停滞、畸形响应、后页失败和预算超限拒绝发布部分快照。
- 成员保留真实原始身份。账号列表和日历使用 `item_id`；待上线季预约使用该季真实 `series_id`，嵌套预约 item 只证明开放预约，不能作为可播身份。缺卡片成员仍可显示和取消；待上线成员不虚构播放入口。
- 写入只接受 canonical 十进制 `item`／`series` 目标，在当前 `owner_id`／`owner_epoch` 下发送显式添加或取消。ACK 不等于成功；保存刷新凭据后重新完整读取两组，只有目标种类的真实身份观察一致才返回 confirmed。缺身份、失响应或读回不一致保持 unknown／unconfirmed，恢复只读核对，不自动重发。
- HTTP、native、core-client 共用同一 DTO 和错误边界；controller/store 保护后台、切号、销毁、旧读取和焦点恢复。取消后按稳定身份与 offset 恢复邻项，新意图会取消旧恢复计划。

## 功能审查

源码交叉审查覆盖 Rust/core、HTTP/native、core-client、reservation controller/store 和页面入口。未发现确定的身份混淆、分页／预算泄漏、ACK 误报、scope／epoch、取消排空、后台或销毁后迟到发布问题。缺少安全的已登录 HTTP/native 正向确认夹具，因此任务 2.3 保持未完成；游客拒绝结果不作为正向证据。

## UI 审查

预约页复用共享 `ReservationAction`、`ReservationNotice`、`List`、`Cover` 和 `CardControls`。桌面与 TV 共享语义和组件，仅沿用平台密度、输入和焦点适配；错误、空态和 unknown 保持原位，不用成功提示吞掉未确认结果。已上线只有真实 drama 才可进入详情，待上线不提供虚假播放。源码审查覆盖登录返回、失败重试、稳定 key、列表回收、取消后的邻项／offset 恢复、来源焦点和浅深色样式；真实可见宿主和物理 TV 仍未正式验收。

## 验证

- `pnpm exec openspec validate migrate-account-reservations --strict` 通过。
- `pnpm codegen:check`、`pnpm check --target web/desktop/tv` 通过。
- Web 227/227、Desktop 234/234、TV 235/235、tooling 142/142；Rust workspace 399/399，另跳过 1 个显式联网项。
- `node --test tooling/test/live-browser-wrapper.test.mjs` 2/2 通过。首轮 Desktop 全量曾出现一次 live browser wrapper 超时；隔离重跑及随后全量均通过，原始失败保留为诊断证据，不归因于预约代码。

## 未验收

合成协议、生命周期和 UI 回归不替代真实产品验收。尚未完成：正式入口读取本机保留账号的真实预约列表、日历和季入口；适用授权下真实预约／取消／正常重开／完整读回；Web、Desktop、TV 可见宿主的浅深色、字号、焦点和动效；Android TV 物理遥控。任务 2.3、4.2、4.3、4.4 继续保持未勾选。

本批未推送，也未提交 `design/prototype/*`、并行设计文档、历史快照或其他无关 dirty 改动。
