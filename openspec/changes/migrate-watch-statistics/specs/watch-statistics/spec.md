# Spec Delta

## Purpose

为当前设备和当前用户提供可解释、可恢复的观看时长统计，让用户看到真实播放累计，同时保护观看历史、账号隔离和远端同步边界。

## ADDED Requirements

### Requirement: Actual playback time is the only source

系统 SHALL 只累计媒体实际处于前台播放且时间持续前进的区段，不得用历史条数、当前进度、集数或打开播放器推导统计。相邻样本的 monotonic elapsed MUST 为正且不超过 5 秒，媒体 position advance MUST 为正且不超过 `elapsed * playback_rate + 1` 秒；计入时长 MUST 为 `min(elapsed, advance / playback_rate * 1000)`，倍速不得放大墙钟时长。

#### Scenario: Paused or buffered playback

- **WHEN** 播放暂停、缓冲、后台、结束或时间样本没有前进
- **THEN** 该区段不产生统计时长，恢复后只累计新的真实前进区段

#### Scenario: Seeking does not inflate time

- **WHEN** 用户拖动进度或恢复到已有位置而没有经过播放
- **THEN** 跳转距离和恢复位置不计入观看累计

#### Scenario: Long gap, rate change or clock suspension

- **WHEN** 两个播放样本间隔超过 5 秒、播放速率改变、媒体时钟倒退或宿主挂起后恢复
- **THEN** 当前区段被切断，只有新的 advancing 样本重新建立锚点；任何跳跃距离都不计入

#### Scenario: Crosses local midnight

- **WHEN** 一个连续 advancing 区段跨过宿主本地午夜
- **THEN** collector 按本地 `YYYY-MM-DD` 切成两项，单项只属于其真实日期；服务端以请求的 `as_of_day` 剪枝，并拒绝距当前 UTC 日超过 1 天的日期

### Requirement: Statistics are independent and owner scoped

系统 SHALL 将统计保存在独立于观看历史、收藏和云同步的本机存储中，并按当前 `{ owner_id, owner_epoch }` scope 隔离；`owner_id` 是当前 scope 的前置条件而非统计文件选择器，`owner_epoch` 在重启、登录、登出和每次 owner transition 时变化。重置统计不得删除历史或改变账号库。

#### Scenario: Guest and account scopes

- **WHEN** 游客和账号分别产生播放并切换 owner
- **THEN** 每个 scope 只能读取和修改自己的统计；游客 `owner_id` 为空但仍携带当前 epoch，迟到的旧 owner 或旧 epoch 结果收到 owner-changed 冲突并被丢弃

#### Scenario: A-to-B-to-A transition

- **WHEN** 页面在账号 A 下产生批次，应用切换到 B 后又切回 A
- **THEN** A 的旧 epoch 批次不能写入新 A scope；新 A epoch 只能读取既有 A 聚合并从新批次继续

#### Scenario: Restart preserves statistics

- **WHEN** 应用正常关闭后使用同一数据目录重新打开
- **THEN** 统计读取恢复到关闭前已提交的累计值，未提交批次可以安全重试且不重复计算

### Requirement: Batches are bounded and idempotent

系统 SHALL 使用带 `owner_id`、`owner_epoch`、`revision`、批次 ID 和播放区段的有界批次，重复提交同一批次最多累计一次，并限制单批、总时长、题材数量和保留天数。固定边界为：batch ID 8–96 位 ASCII；1–128 项；每项 1–60,000ms；总量不超过 120,000ms；每个日总量不超过 86,400,000ms；保留最近 366 个日键；type 仅为 `real`／`comic`／`ai`／`unknown`；每个日最多 16 个题材桶，题材最多 40 个 Unicode 字符并拒绝控制符、路径字符及原型污染键。

#### Scenario: Lost response and retry

- **WHEN** 批次请求已提交但调用方未收到响应，随后以相同批次 ID 重试
- **THEN** 服务返回可恢复结果且累计值保持只计算一次

#### Scenario: Retention and malformed input

- **WHEN** 批次超过字段、时长、日期、题材或保留窗口限制
- **THEN** 请求被拒绝，不发布部分累计，也不扩大本机统计文件

#### Scenario: Concurrent duplicate submission

- **WHEN** 相同 owner scope 和 batch ID 的 POST 并发到达，或已提交批次因丢回执被原样重试
- **THEN** 该 batch 最多计入一次；成功重试返回可恢复成功，不能依赖客户端重建时长

#### Scenario: Aggregate privacy

- **WHEN** collector 为分类合并短时段并准备 POST
- **THEN** series／episode ID 只能存在于内存合并键，wire 和持久化只保留日、时长、类型和题材，不包含标题、位置、URL、凭据或完整详情

### Requirement: Read, append and reset share strict transport semantics

系统 SHALL 为 HTTP 与 native 提供同一统计读取、批次追加和重置契约：GET 使用 `owner_id`、`owner_epoch`、`day` query；POST 使用相同 query 且 body scope 必须精确相等；DELETE 使用相同 query 并返回新的空 snapshot。请求必须匹配当前 owner／epoch，游客和过期 scope 不得写入其他账号；成功响应使用现有 `{ ok, data }` envelope 和 `no-store`，GET／DELETE 不暴露幂等 batch 账本。

#### Scenario: Scope changes during write

- **WHEN** owner 切换、后台或宿主销毁发生在统计批次返回之前
- **THEN** 迟到响应不更新新 scope，客户端保留原批次以便明确恢复，不自动重放到新 scope

#### Scenario: Reset fences late batches

- **WHEN** 用户确认重置后旧批次才到达
- **THEN** 旧 revision 被拒绝并返回 `STATISTICS_RESET` 冲突；collector 丢弃旧 scope 待发项，读取新 revision 后新播放可以从零开始累计

#### Scenario: HTTP and native parity

- **WHEN** 同一 scope 通过 HTTP 或 native 发送相同 GET、POST、DELETE、坏输入、旧 epoch 或旧 revision
- **THEN** 两种 transport 使用相同 DTO、状态码／错误码、边界和提交语义，不各自选择 owner 文件或实现重试规则

### Requirement: Shared history entry exposes honest states

系统 SHALL 在共享历史入口提供观看统计读取、空态、错误重试、今日／本周／本月及最近 7 日摘要、类型／题材分段和重置确认；真实缺失或未支持的数据必须保持未知，不展示合成成功值。统计 UI 复用 `packages/app` 的共享 controller 和 `packages/ui` 的现有基础组件，桌面／TV 只调整密度与焦点输入。

#### Scenario: Desktop and TV use one interaction

- **WHEN** 用户在桌面或 TV 打开观看统计
- **THEN** 两端使用同一加载、返回、重试和重置语义，仅调整密度、焦点和输入适配

#### Scenario: Reset confirmation

- **WHEN** 用户触发重置并确认
- **THEN** 统计刷新为新的起点并保留观看历史；取消或失败时原摘要仍可恢复

### Requirement: Acceptance distinguishes real playback from synthetic boundaries

系统 SHALL 将真实播放累计、重启和可见入口观察与合成协议／生命周期回归分开记录，自动测试通过不得单独宣称真实统计功能完成。

#### Scenario: Synthetic tests pass only

- **WHEN** 合成测试通过但正式入口没有真实播放累计或重置证据
- **THEN** 只报告工程边界通过，统计功能和宿主验收保持待验

#### Scenario: Real playback evidence

- **WHEN** 正式 harness、Desktop 或 Android TV 入口使用真实媒体完成播放、暂停／缓冲、切换、重启和显式重置
- **THEN** 只把实际观察到的累计、恢复、账号隔离和历史不受影响记录为功能证据；headless、合成媒体和协议 fixture 仅作为边界回归，不能替代真实验收
