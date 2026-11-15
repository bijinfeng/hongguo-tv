# Account reservations

## Purpose

让登录用户在上新日历、待上线季和账号列表管理实际预约，并在内容上线后进入真实详情。账号切换、网络失败、身份缺失与远端未确认时，保留正确的记录归属和可恢复状态，不用收藏、追更或本地成功提示替代远端预约事实。

## ADDED Requirements

### Requirement: Separate reservation and playable identities

系统 SHALL 使用日历原始预约项目 ID 或待上线季的实际 series ID 发起预约；两类目标必须显式区分，不相互推定，不将预约项目当作可播 series。

#### Scenario: Upcoming season has a nested reservation item

- **WHEN** 待上线季提供实际 series ID 与不同的嵌套预约 item ID
- **THEN** 预约使用该季 series ID；嵌套 item ID 只证明开放预约，不能用来播放

### Requirement: Complete bounded account reads

系统 SHALL 完整读取当前账号待上线与已上线两份预约，并保留缺少卡片的有效成员；分页、载荷或超时失败不得发布部分成员表为完整结果。

#### Scenario: Empty advancing page

- **WHEN** 上游返回空页但明确 continuation 前进
- **THEN** 继续读取并原样携带服务端 session，不把空页当作完成

#### Scenario: Read cannot complete

- **WHEN** continuation 停滞、响应畸形、超预算或后页失败
- **THEN** 返回安全读取失败，旧快照可保留但标记过时

### Requirement: Exact explicit online mutation

系统 SHALL 只在当前 owner／epoch 下发送显式添加或取消目标，不自动重放写操作，不新增离线预约队列。

#### Scenario: Caller disappears after dispatch

- **WHEN** 写请求已接纳而调用方取消或丢失响应
- **THEN** 已接纳任务有界排空，后续读取不得越过它，恢复先读取而不自动重发

### Requirement: Acknowledgement is distinct from confirmation

系统 SHALL 在 ACK 后完整读取两份列表，并仅在实际目标身份的观察证明期望状态时确认成功；缺少对应身份不能作为缺席证据。

#### Scenario: Reservation becomes online

- **WHEN** 取消后的待上线列表不含目标，但已上线列表仍含目标
- **THEN** 不宣称取消已确认

#### Scenario: Missing identity leaves negative observation unknown

- **WHEN** 没有匹配成员且部分成员没有目标种类的身份
- **THEN** 关系保持未知，不能确认取消；显式添加仍可提交绝对目标

### Requirement: Scope and credentials remain isolated

系统 SHALL 拒绝游客及过期 scope，丢弃切号、后台或销毁后的迟到界面结果，保护刷新凭证不被旧请求覆盖；正常关闭保留私有凭证供下次恢复。

#### Scenario: Account changes during a read or write

- **WHEN** A 的请求在切到 B 或 A 的新 epoch 后返回
- **THEN** 不发布旧成员、结果、凭证或恢复焦点到新 scope

### Requirement: Shared product entrances and recovery

系统 SHALL 在共享账号入口提供待上线／已上线预约，并接通日历和开放预约的季入口；可播内容使用真实详情，取消与返回保留存活项位置及有效焦点。

#### Scenario: Guest activates reservation

- **WHEN** 游客选择预约
- **THEN** 进入现有登录入口，登录返回后由用户再次明确提交，不自动预约

#### Scenario: Focused row is removed

- **WHEN** 当前预约取消且完整快照确认成员移除
- **THEN** 恢复相邻有效项或空态入口；新输入、切页、后台或切号取消旧焦点计划

### Requirement: Acceptance uses real authorized product flows

系统 SHALL 将合成边界回归与真实验收分别记录，真实读写和 UI 审查必须使用正式入口、真实数据及适用授权；未观察到的宿主、设备或写操作保持待验。

#### Scenario: Only synthetic tests pass

- **WHEN** 自动测试通过但实际预约往返或可见宿主尚未观察
- **THEN** 只报告工程与边界通过，不报告完整功能或平台验收通过
