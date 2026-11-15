# 账号更新提醒批次

日期：2026-11-16。变更：`migrate-account-notifications`。本批完成通知的 Rust 核心、HTTP/native 契约、core-client 和 Desktop/TV 共享 UI；完整 MVP 仍未完成。

## 实施结果

- 账号作用域通知存储使用独立版本化 SQLite，不进入凭证库、播放历史或云同步；保存追更更新和预约上线的稳定事件 ID，最多保留最新 200 条并去重。
- 首次前台刷新只建立来源基线；后续完整追更／预约快照比较后生成通知。来源部分失败时保留旧列表和旧基线并标记 stale，完整重试后再提交新结果。
- owner／epoch、取消和生命周期边界已覆盖；迟到响应不能写入切换后的账号。单条和全部已读都在提交后重新读取当前 scope，未知写入响应不会自动重放。
- GET 查询、POST 已读、严格 query/body 校验、HTTP/native parity、guest 错误、取消响应和 OpenAPI／TypeScript 生成契约已接通。
- 共享页面使用现有 NSH `List`、`Surface`、`Badge`、`Notice`、`Button`、`Cover` 和内容到达组件。桌面沿用紧凑指针／键盘密度，TV 只调整尺寸和焦点；通知不弹播放提示，不做系统推送、后台轮询、评论、弹幕或点赞。

## 功能审查

Rust 通知回归 7/7 通过，覆盖首次基线、追更／预约转变、部分失败和恢复、持久重启、已读状态、owner 隔离、200 条上限和稳定排序。native bridge 定向 parity／生命周期回归通过；`pnpm test:tooling` 为 142/142，通知 core-client 定向用例通过。

## UI 审查

`pnpm check --target web`、`desktop`、`tv` 通过；`pnpm test --target web` 为 227/227，`pnpm test:tooling` 为 142/142；Desktop NSH 通知回归 234/234，TV NSH 通知回归 235/235；`pnpm ui:test` 为 18/18。审查后补齐首次加载态、stale／错误重试、空态、登录门槛、详情返回列表定位、单条已读后的焦点恢复和 TV 首要焦点。页面未新增颜色、控制器或平台分叉，继续复用公共 UI 层和语义 token。

## 数据边界与未验收项

本批合成夹具只用于取消、迟到、失败、长文本、焦点和未知已读响应等边界，不作为真实功能通过依据。尚未完成的正式验收是：用真实账号在 Web、Desktop、TV 分别观察一次追更或预约变化，确认单条／全部已读、应用重启恢复以及 owner 切换隔离。真实账号验收需要正式入口和可用账号状态；在此之前不能把工程回归写成产品验收。

本批没有推送远端，也没有提交 `design/prototype/*`、并行设计文档、历史快照或其他无关 dirty 改动。
