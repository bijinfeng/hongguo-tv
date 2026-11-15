# 账号片库同步实施与验收 · 2026-11-15

范围为 `migrate-account-library-sync`，实现已本地提交为 `4562b9d`。下列离线测试与正式真实流程分开记账，当前 15／19 项任务完成，未完成本批验收，未推送或发行。

## 真实操作授权

用户明确授权本次读取账号云端记录、上传该账号本机产生的观看进度和收藏变更。允许既有 outbox／首次对账候选随 worker 自动同步；本次不合并游客记录、不发送短信。后续用户进一步要求将登录凭证持久保留本地、避免重复扫码，取代本轮原先“验收后退出”的要求；自动退出验收脚本已停止。凭据仅留在应用私有存储，不写入本文件、仓库、日志或截图。

真实验收应使用正式 Desktop 入口的固定应用数据目录。NSH 图形测试默认分配临时目录，即使同库重开成功，也不能证明正常桌面入口下次启动无需扫码。凭证过期、撤销或用户主动退出后仍可能需要重新登录。

## 已运行的离线回归

以下日志均位于忽略目录 `artifacts/account-library-sync/`，只证明对应工程／边界行为：

- `cloud-coordinator-core.log`：core 226 单元测试、33 集成测试通过，另有 1 项显式联网测试忽略；包括 19 个协调器和 29 个 Passport 用例。
- `cloud-coordinator-clippy.log`：core strict Clippy 通过。
- `adapters-final.log`：HTTP 30 项、native 39 项通过；保留前轮 `adapters.log` 的旧 registered-favorites 501 断言失败。新增正向回执与重放检查，没有放宽 legacy 写入口拒绝。
- `codegen.log`：OpenAPI／TypeScript 生成及漂移检查通过。
- `state-final.log`：共享账号／片库写队列／owner／详情收藏 Node 回归通过。
- `check-desktop.log`：Desktop check 通过。
- `nsh-account-desktop.log`：正式共享 App 的 6 项合成账号／同步／导入边界回归通过，不计真实登录或同步验收。
- `nsh-app-final.log`：首次完整 Desktop App 回归 111／115，通过记录保留另外 4 项失败；等待写尾的读取被取消后误补 GET 已修复，其余为 shutdown abort、完成文案和账号 epoch 测试前提修正。`nsh-app-final-fixed.log` 为修复后 115／115；`state-review-final.log` 为共享状态定向 Node 59／59。它们仍只证明边界行为。
- `verify-final.log`：冻结本批实现后完整 `pnpm verify` exit 0，三端 check／build、格式／lint／codegen 漂移检查和发行元数据检查通过；工具 116、Rust 346、Web 197、Desktop／TV 各 199 项通过。Rust 显式联网 probe 跳过 1 项，原生 headless runner 各有 1 个 warning；不计为真实平台功能或发行验收。
- `security-final.log`：`pnpm security` 失败。cargo-deny 的 bans／sources 通过，许可证策略仍拒绝 Zlib、CDLA-Permissive-2.0、Apache-2.0 WITH LLVM-exception，另有 `ttf-parser` 未维护公告；未放宽规则。该失败使后续 `pnpm audit` 未执行，不声明完整安全门禁通过。本批 Cargo.lock 仅为 native 测试增加既有 workspace rusqlite 的依赖引用，没有升级依赖版本。

独立源码审查分别覆盖未参与实现的账号协调／cloud／favorites，以及另一位审查者未参与的存储迁移／sync／guest import；限定范围内未发现新增、可确认的高风险问题。存储原作者的交叉复核不计作该模块独立审查。它们不能代替真实云写、截图、物理设备或人工 review。

## 尚未完成

原生关闭与同目录重开的排空边界已补；`native-lifecycle-tests.log` 中 5 项 SQLite 阻塞／取消／失败与目录别名用例通过，`phone-device-drain-tests.log` 中 33 项账号服务用例通过。三端工程检查与相关 NSH 回归已通过；真实进度上传、游客显式导入与再导入、本机清空后的真实拉取、其他端功能与平台视觉仍待验。正常 Desktop 持久登录、已有云端历史拉取和收藏往返已通过下述真实流程。此前账号播放计时停滞与游客 409 身份拒绝分别保留在[账号会话记录](account-session.md)，不能用 HTTP 媒体准备成功代替实际播放通过。

## 正常桌面入口持久登录

从 `pnpm dev:desktop` 正常入口完成实际登录，使用固定应用目录，而非 NSH 测试的临时 data 根。只读 SQLite 去敏核验：凭证存在、会话文件权限 0600；账号库有 10 条真实历史、0 条收藏、outbox 为空，成功同步时间已持久化。本轮没有合并游客记录或主动添加／取消收藏。证据为 `artifacts/account-library-sync/persistent-login-before-restart.json` 和 `desktop-persistent-login.log`。随后通过实际窗口关闭按钮关闭，宿主已正常断开；同入口重开后，凭证仍存在且权限为 0600；实际账号页自动恢复登录、没有重新获取二维码，未调用 logout。去敏文件核验保存于 `persistent-login-after-restart.json`。后续关闭窗口仅结束宿主，保留登录凭证供正式入口复用，不自动退出账号；远端撤销／过期不由本机持久化保证。继续回归前再次只读核验凭证存在，私有目录权限 0700、会话文件 0600。

## 正常桌面入口真实收藏往返

继续复用上述账号，从片库已有真实历史进入《悍妻当家，靠美食扶起一家软骨头》详情，点击“收藏”，实际按钮变为“已收藏”；SQLite 中对应收藏存在，outbox 已排空。通过窗口关闭按钮正常关闭后，再次 `pnpm dev:desktop` 打开，无登录按钮或二维码；新一轮同步完成后收藏仍在，片库“收藏”中对应行可打开详情。之后点击“已收藏”取消，再从账号页执行一次“同步”，成功时间继续增长，收藏和 outbox 均为 0；“查看收藏”进入空态，提供“去找剧”。未合并游客记录，未退出账号。动态云端拉取期间历史总数从 10 变为 11，不把总数固定当作单项收藏行为的证明。

去敏数据证据为 `persistent-favorite-before-restart.json`、`persistent-favorite-after-restart.json`、`persistent-favorite-after-cancel.json` 和 `persistent-favorite-after-cancel-pull.json`；启动日志为 `desktop-live-final.log`、`desktop-favorite-restart.log`。界面操作与状态通过 macOS 原生 AX 观察；系统截图调用失败，`CGPreflightScreenCaptureAccess()` 为 false，无法补充本轮视觉截图。因此此轮证明实际交互与持久／同步结果，不证明浅深、排版或动效完整验收。

收尾仅关闭应用窗口，未退出账号；`persistent-login-retained-final.json` 再次核验凭证仍存在，文件权限 0600、私有目录 0700。

## 本轮播放失败仍开放

同一真实剧集从详情继续第 1 集，原生 AX 显示 `00:07 / 02:54`；点击“播放”后观察到 `00:08` 和“重试”入口。`desktop-favorite-restart.log` 同轮包含 `PLAYBACK_IDENTITY_MISMATCH` 409，但日志没有步骤时间或拒绝分支，不能证明这条日志就是随后停止的直接原因，也不能仅凭恢复位置或一秒变化宣称播放／进度上传通过。未重复重试取绿灯；播放准备与媒体停播需分别定位，前序原始失败继续保留。
