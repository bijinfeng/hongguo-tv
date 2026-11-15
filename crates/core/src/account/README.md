# 本机账号会话

`AccountService::open(directory, guest)` 接受宿主明确的数据目录与游客 `LibraryStore`，拒绝把账号库注入为游客库。HTTP/native 共用该协调器；它管理单一本机活动账号，不是公网多用户会话管理器。当前提供官网 QR、手机号／验证码及额外短信验证的协议与本地状态机；恢复本机会话不代表远端凭据仍有效。

## 状态与切换

`Account` 只公开身份、`owner_epoch` 和安全的登录展示状态，凭据不进入 DTO。账号命令必须携带最新快照的 `owner_id`、`owner_epoch`；两者是前置条件，不是任意账号选择器。启动与每次成功提交重新生成 epoch，A→B→A 的旧命令仍会被拒绝。QR／手机号推进另需精确 attempt ID；取消、替换、过期和丢弃尚未提交的网络请求都会使旧 attempt 失效。错误阶段的调用不会取消当前可编辑 attempt。

切换持有协调器锁，先封存并排空旧库和目标库的写会话及已接纳 worker，再原子保存凭据，最后发布新账号、epoch 与库。已接纳的提交由独立任务继续持锁；caller 取消或响应丢失不撤销提交，通过 `state()` 同时重读账号与历史核对结果。保存失败保留旧 owner 与凭据；已封存的写 token 不重新开放，客户端需重新申请。客户端仍须丢弃旧 scope／操作的迟到响应。

退出只清除当前凭据并切回原游客库，保留各账号的本地历史，不自动合并、迁入或云同步。观看历史库与写屏障见[存储约定](../library/README.md)。

## 存储

| 路径                     | 内容                                                 |
| ------------------------ | ---------------------------------------------------- |
| `account.sqlite3`        | 当前身份与私有凭据，以及剥离账号凭据后的注册设备信息 |
| `guest.sqlite3`          | 原游客历史                                           |
| `accounts/<uid>.sqlite3` | 固定绑定该 UID 的本地历史                            |

会话库 `application_id=0x48474143`、`user_version=1`，单行保存；payload／device 各限 128 KiB。SQLite 使用 `synchronous=FULL`、`secure_delete=ON`、DELETE journal；阻塞操作在 `spawn_blocking` 中串行执行。Unix 新目录 0700、会话文件 0600，拒绝非普通会话文件；这不是系统钥匙串或数据库加密实现。只初始化空库，不导入 legacy 数据；损坏、未知版本和身份／凭据 UID 不一致均拒绝恢复并保留原文件。

旧 `apply_history` 没有 generation，只在服务启动后尚未切换过的游客状态兼容。账号状态及本次服务内任何成功切换后，即使已退出，也返回 `SessionExpired`；正式客户端始终使用注册写会话。

## 验证边界

`cargo test --locked -p hongguo-core --lib account` 包括合成协议响应、临时 SQLite、attempt 失效、A→B→A、取消与存储故障回归。它们不能证明真实登录、短信投递或远端 MFA 可用。正式 Desktop 已观察真实扫码登录、同库重启恢复及退出清除凭据；账号观看记录隔离和其他平台／手机验证仍待验，见[当前验收](../../../../VALIDATION.md)。账号恢复不等于云同步、收藏／追更等后续能力已完成。
