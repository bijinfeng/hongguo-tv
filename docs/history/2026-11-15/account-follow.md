# 账号追更实施与验收 · 2026-11-15

范围为 `migrate-account-follow`，基线 `4850ae3`。当前 13／16 项任务完成；实现、合成边界与正式真实流程分别记录；未推送或发行，不视为完整 MVP 验收。

## 实现与审查

- 固定来源为 `upstream.lock.json` 的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。追更 tab_type14 与预约 tab_type13 分离；成员用 series 身份，不把外层 video_id 当可播 VID。没有修改或运行 Go。
- Rust 只发布完整有界成员表；100 页、2000 个唯一成员、完整响应 JSON 序列化聚合 8MiB、读取总截止 60 秒。缺少可播摘要的有效成员保留取消能力。没有收藏 outbox、历史写入或离线追更队列。
- scope／epoch、顺序闸门、取消及任务排空保护账号；ACK 与确认分开。失响应先完整读取，明确重试仍发送原 series 的原绝对目标，不自动重发 POST。已完结的真实证据禁止新增，已有成员仍可取消。
- HTTP／native 复用同一 DTO 和用例，生成契约；共享状态与正式导航、账号入口、列表和详情复用公共组件，保留锚点与有效焦点意图。
- 交叉审查修复：空值擦除身份、POST 刷新凭证后读回失败丢失新凭证、同步与追更凭证互相覆盖、响应预算只计摘要、客户端拒绝 Rust 合法 content_type=1／7。另修复异步返回时禁用按钮的焦点恢复和正常加载闪红色提示。

## 工程证据

日志位于忽略目录 `artifacts/account-library-sync/`，其中合成数据仅验证边界：

- `follow-core-first.log`、`follow-core-second.log` 保留首轮编译失败：测试模块路径、穷尽 Drama 字段和 Map／Value 类型；`follow-core-third.log` 为修复后的 22 项定向测试通过（包含 1 项同名 radar 用例）。
- `follow-account-regression.log`：账号既有与新增回归 86／86；包括重开、旧 epoch、读写排序、丢调用方、凭证 CAS 和 ACK 后刷新凭证保存。
- `follow-http.log`、`follow-http-errors.log`、`follow-native.log`：原有边界分别 3／1／1 项通过。2026-11-16 新增 `follow_http_native_authenticated_success_and_unconfirmed_results_match`，在仅测试依赖启用的 loopback fixture 中验证 HTTP/native 共用 `AccountService` 的空列表、ACK 未确认与后续读回；不为生产加入任意 endpoint 注入。
- `follow-state-client-final.log`：32 项 Node 状态、client 与既有账号／片库回归通过。
- `follow-tooling.log` 保留 131／132 初轮结果；失败为 pnpm 11 在临时 hook 仓库自修复依赖，被 noTTY 拒绝。仅测试子进程改用受支持的 `verify-deps-before-run=warn`，不安装或修改主仓依赖，定向回归通过。
- `follow-clippy-first.log` 保留 4 项新 parser 风格检查失败；修复后 `follow-clippy-final.log` 为全工作区 strict Clippy 通过。
- `follow-desktop-check-first.log` 与 `follow-desktop-test-first.log`：Desktop check 和首轮筛选 9／9 通过；该筛选并非新增全部 UI 用例，最终全量结果另记。
- `follow-verify-first.log`：完整 `pnpm verify` exit 0，工具 133、Rust 374、Web 207、Desktop／TV 各 209 通过；Rust 显式联网 probe 跳过 1 项，native headless runner 各有 1 个 warning。仅为工程证据，不代表真实数据或正式包验收。
- 全量运行后补齐 TV 游客入口与慢网主焦点：`follow-final-check.log`、`follow-final-build.log` 为最终共享源码三端 check／build；`follow-final-all-tests.log` 为完整追更定向回归 Web／Desktop 各 11、TV 12 通过（各含 1 项同名详情元数据测试）。包含不可播成员、迟到取消不能抢较新详情焦点、慢读取后主焦点补偿及新导航围栏。`follow-guest-detail-final.log` 另记录三端各 1 项游客详情→合成登录→返回→再次显式确认回归通过，确保登录不自动重放且只用 series 而非 VID。该增量与前述整轮范围分别记录，不宣称修改后重新执行了整轮 verify。
- 新增游客详情回归后 `follow-final-check-with-tests.log` 再次三端 check 与 strict Clippy 通过；`follow-spec-validation.log` 为 OpenSpec strict 校验通过。`follow-final-source.json` 保存本批文件的最终 SHA-256 与基线提交，便于区分上述源码增量。依赖未变，没有重跑已知失败的全局 security；既有门禁失败仍见当前验收矩阵。

## 真实流程与凭证

用户要求登录凭证保存在本机并用于后续验收，取代先前验收后退出的要求。本轮只读核验凭证仍存在；正式应用私有目录 0700、凭证库 0600。不复制或输出凭据、不合并游客记录、不自动退出。正常入口此前已验证关闭重开免扫码，见[账号片库同步记录](account-library-sync.md)。凭证远端失效、撤销或主动退出后仍可能需要重新登录。

正式 `pnpm dev:desktop` 启动并 connected 后 AX 窗口数为 0，未能进入真实追更列表。当前系统 IOConsoleUsers 明确报告 `CGSSessionScreenIsLocked=true`，不能按此前未锁屏的事件归因。本次已在结束前保存精确宿主 PID 的 3 秒采样：`follow-native-zero-window.sample.txt`；主线程在正常 AppKit 事件循环，engine 等待消息，没有本次采样支持的 join／shutdown 卡死证据。`follow-desktop-live.log` 保留启动日志；未因可见窗口不可用重复重启或要求重新扫码，真实只读验收继续待补。收尾仅结束已采样的开发宿主、未执行 logout；`persistent-login-after-follow.json` 再次去敏核验凭证仍在，目录／文件权限仍为 0700／0600。

真实添加／取消追更尚无本批适用的明确授权，不由历史或收藏的写授权推定。继续只读和工程验收；真实写往返、Web／当前 Android TV 包、物理 TV、读屏、大字／减少动态及跨设备流程分别保留待验。

## 2026-11-16 增量：传输 parity 与 UI 密度修正

- `crates/core` 新增 `test-support` feature，仅由 HTTP/native 的开发测试依赖启用；loopback-only `AccountService` 注入和合成已验证账号只存在测试构建路径，默认 release 不启用。
- HTTP 与 native 使用同一已验证 `AccountService` 和同一 loopback 上游，覆盖认证空列表、远端 ACK 但完整读回未观察到成员（`acknowledged=true`、`confirmed=false`）及解除隐藏后的精确 series 读回；请求仍校验 `tab_type=14`、`count=20` 和 series 身份。
- 追更页面标题改用 `content-title`，行内 TV 间距使用 `tvUnit`；公共 `CardControls` 的按钮间距随 Product 密度缩放。桌面／TV 语义、焦点和无评论／弹幕／点赞范围不变。
- 定向证据：HTTP follow 3／3、native follow 2／2、core follow 7／7、Web test 142／142、三端 check/build 通过；一次并行全量 nextest 的无关生命周期用例出现时序失败，单测串行复跑 5 次通过，未将该失败写成产品回归。真实账号和正式宿主仍待验。
