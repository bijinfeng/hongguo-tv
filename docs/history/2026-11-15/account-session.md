# 账号会话验收 · 2026-11-15

范围：`migrate-account-session-isolation`，基于 `d4b2733` 的账号批次工作树。产品源码均在主仓库；忽略的 `.nsh/` 仅存验收 driver，`artifacts/` 存去敏证据。没有发送短信或执行云端写入。

## 正式 Desktop 与真实数据

用户授权“现在可以，验收后退出”。从正式 `apps/desktop/App.tsx`、macOS 原生宿主、live 网络和 Rust 私有数据目录执行；截图不保存二维码、身份或输入值，日志不输出凭据／请求正文。

| 运行目录（相对 `artifacts/account-live/`）              | 实际结果与限制                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-native-authorized-2026-11-15/`                 | 首轮未登录；用户随后澄清使用了错误手机 App，不据此修改扫码协议。                                                                                                                      |
| `desktop-native-authorized-retry-2026-11-15/`           | 真实扫码确认成功，Dialog 自动关闭；销毁／重开后恢复账号成功。观看记录步骤等待固定旧搜索结果 ID 超时，整轮失败。finally 已退出，随后只读 SQLite 确认 `payload IS NULL`，文件权限0600。 |
| `public-media-probe-2026-11-15/`                        | 修正 driver 为当前真实搜索首卡后，游客搜索、详情、播放从0增长到3秒、历史可见通过。只证明游客公开路径，不能代证账号隔离。                                                              |
| `desktop-native-authorized-current-results-2026-11-15/` | 二维码等待手机确认150秒超时，未建立账号，退出后凭据仍为空；未执行本轮重启／账号观看。                                                                                                 |
| `desktop-native-authorized-correct-app-2026-11-15/` | 再次等待手机确认150秒超时；未建立账号，保留登录过期／服务暂不可用提示，不据此断定二维码协议故障。 |
| `desktop-native-authorized-human-ready-2026-11-15/` | 用户确认方便后真实扫码成功、Dialog自动关闭、同库重开恢复成功、真实搜索成功；播放计时等待30秒未前进，整轮失败。finally退出成功；随后只读SQLite确认凭据为空、权限0600。本轮为片库v4集成工作树，无worker／云写。 |
| `public-media-probe-diagnostic-2026-11-15.log` | 随后独立游客正式入口／真实首卡复查，在媒体准备阶段返回409 `PLAYBACK_IDENTITY_MISMATCH`，未重试取绿灯。此结果说明未登录路径也受影响，但不能解释上一轮计时停滞；两类失败分别保留。 |
| `desktop-native-dialog-review-2026-11-15/`              | 真实二维码获取与取消，空手机号表单和取消后账号页，浅深色四图通过独立视觉复核。输入／相邻按钮44px同高，单层边框，Tabs 选中线完整。未发短信，不把截图当完整账号功能验收。               |

键盘／焦点补验保存以下独立结果：

- `desktop-native-form-keyboard-2026-11-15/`：首轮程序点击后假定焦点位置，箭头切换未成功，保留失败。
- `{desktop,tv}-native-form-keyboard-2026-11-15-v2/`：等待实际窗口获焦，从初始动作以 Shift-Tab／方向键切登录方式，Escape 关闭、Enter 回源重开均通过；TV 确认进入输入、返回保留空草稿通过。TV截图暴露焦点圈左侧裁切，行为通过不计视觉通过。
- `{desktop,tv}-native-form-keyboard-2026-11-15-v3/`：共享 Dialog 扩大滚动裁剪视口并对称补内边距，保持原内容对齐；键盘路径再通过。桌面1180×780与TV密度1920×1080、浅深色四图独立复核通过，焦点圈完整、选中Tab在hover下底线完整。两端均运行于实际macOS宿主，不能代证Android TV遥控或物理电视。

同库重启验收使用 NSH 图形测试宿主的两个临时数据根：在启动前将第二根链接到第一根，无账号注入、凭据复制或合成记录。该装配只用于复用同一验收数据，不等于独立安装包重启验收。成功轮结束已核对同根；超时轮未走第二次 open。

## 边界回归与工程门禁

Rust 包含签名固定向量、loopback 协议、attempt 生命周期、存储失败及 owner 隔离；HTTP/native 包含身份前置条件和严格未知字段拒绝。Node 账号／owner／writer 定向29项通过。共享 App 的合成 QR／MFA／丢响应流程只作回归，最终 `pnpm verify` exit 0：工具76、Rust272（另跳过显式联网1项）、Web181、Desktop／TV各183项；包含三端 check／build、格式、lint、codegen:check和版本检查。九个账号 App 合成场景包含关闭后 Enter 重开／Escape 关闭回源。headless及宿主 warning 保留，不宣称安全门禁或真实平台全矩阵通过。

最初完整门禁在 native mixed fixture 的旧501断言失败，日志保留于 `artifacts/account-session/logs/verify-account-session-initial-failed.log`；已修为当前真实能力／游客身份断言，定向通过。首个最终门禁 `verify-account-session-final.log` 通过后，实际TV密度图发现上述焦点裁切；修复后稳定源码最终门禁 `verify-account-session-focus-final.log` exit 0（工具76、Rust272、Web181、Desktop／TV各183项），保留之前结果，不覆盖原始失败。

独立源码复核覆盖 Dialog 生命周期与焦点回源、后台／离页取消、已登录 logout、owner／epoch、旧写排空和原子发布，未发现阻碍提交的新问题。静态视觉覆盖选中Tab hover配对，但未覆盖 pressed 逐帧动效、读屏、大字、人工IME、Android TV遥控；这些不记作通过。

账号观看记录隔离尚未完成正式真实流程；手机号／短信／MFA、其他宿主的真实登录、物理TV和公网多用户均未验。云同步、导入、收藏／追更／预约另按后续变更实施。
