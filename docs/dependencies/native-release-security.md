# 原生发行依赖检查

2026-11-14 首次核对，2026-11-17 升级到 NSH 0.5.1、2026-11-19 到 NSH 0.6.0 后各重跑一次。依赖与许可证结论来自当前 Cargo 下载包、`cargo tree --locked` 和 `pnpm security`，不将维护状态告警表述为已知可利用漏洞。

## 已移除的工作区依赖

TV Rust 模块仅使用 `nsh-base::theme()`，不使用编辑器、语法高亮、绘图、富文本编辑器或终端。工作区对 `nsh-base` 设置 `default-features = false`；未改 NSH 版本、源码、公共 API 或 TSX 控件。

此前的依赖链为 `hongguo-tv-native → nsh-base/highlight → syntect / two-face → bincode 1.3.3`。关闭默认功能后，根 `Cargo.lock` 移除 16 个包且没有引入新版本，包含 bincode、foldhash 0.1.5、syntect、onig、ropey 和 vte。原有主题 API 不受这些 feature 控制。

这项变化只缩减应用 Rust 工作区的依赖图。NSH CLI 生成的独立宿主工作区仍通过 `nsh-base` 的默认功能及 Android 的 `highlight` 引入相关依赖；预构建 NSH runtime 也不能仅凭根 Cargo.lock 推断组成。根 `pnpm security` 不能替代对生成宿主、预构建运行时及最终发行 notices 的检查；目前没有宣称发行二进制已移除 bincode。

## 门禁例外（2026-11-20 审计）

`deny.toml` 对 2026-11-19 的 6 项拒绝（4 项许可证、2 项 advisory；webpki-roots 两个版本各一条例外）按精确版本给出最小例外：许可证进 `licenses.exceptions`，不扩全局 `allow`；advisory 进 `advisories.ignore`。`unused-ignored-advisory = "deny"` 使失效的忽略直接报错，不静默保留。

| 依赖                 | 类别                           | 引入方                                                           | 运行时／仅构建                              | 处置                                |
| -------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| foldhash 0.2.0       | Zlib（OSI 认可）               | `rust-i18n-support`（nsh-core）；`hashbrown`（quickjs-jit-core） | 运行时（第一条）；第二条在根图仅 dev        | 精确版本例外，保留 notices          |
| zlib-rs 0.6.8        | Zlib（OSI 认可）               | `zip/deflate`（nsh-updater）→ `flate2/zlib-rs`                   | 根图仅 dev；生成宿主默认 `updater` 后进发行 | 精确版本例外，保留 notices          |
| webpki-roots 1.0.12  | CDLA-Permissive-2.0            | `hongguo-core`、`hongguo-updater`                                | 运行时                                      | 精确版本例外，随数据分发协议全文    |
| webpki-roots 0.26.11 | CDLA-Permissive-2.0            | `nsh-js` → `tokio-tungstenite`（非可选、非 wasm）；1.0.12 的壳   | 运行时                                      | 精确版本例外，同上                  |
| winx 0.36.4          | Apache-2.0 WITH LLVM-exception | `nsh-core` → `cap-std` → `cap-primitives`                        | 运行时，仅 `cfg(windows)`                   | 精确版本例外，例外只放宽 4(a)(b)(d) |
| ttf-parser 0.25.1    | RUSTSEC-2026-0192              | `nsh-core`（字体）、`nsh-macros`（资源字体），均非可选           | 运行时                                      | ignore，无修复版本                  |
| chrono 0.4.45        | RUSTSEC-2026-0543              | `nsh-core`、`nsh-base`                                           | 运行时                                      | ignore，无修复版本                  |

三条发行事实约束上表的实际影响。`release-publish.yml` 只出 `desktop-macos-arm64` 与 `tv-android-arm64`，所以 `winx`（`cfg(windows)`）不进任何发行包。`webpki-roots` 两个版本都进发行包，但来源不同：tv 侧由 `hongguo-core` 的 `cfg(target_os = "android")` 依赖（`crates/core/Cargo.toml:29-30`）和 `hongguo-updater`（`crates/updater/Cargo.toml:13`）带入 1.0.12，desktop 侧 1.0.12 只在 `hongguo-core` 的 dev-dependency 测试路径；两个目标都经 `nsh-js` → `tokio-tungstenite` 带入 0.26.11，那条依赖不是可选的，与 NSH `websocket` feature 是否打开无关。`CDLA-Permissive-2.0` 与 `Zlib` 的 notices／协议全文仍须随包分发，而 `pnpm package` 目前没有对应产物（`tooling/src/cli.mjs:342-362` 的 `package` 分支只调 `nsh package` 与 `packageTvHost`；`tooling/src` 内没有 notices 生成步骤），须人工核对。

责任人 jfbi。advisory 到期 2027-02-28（跟随 NSH 向 jiff／time、skrifa 的迁移）；许可证到期 2027-05-31 或下一次 NSH 升级，取较早者。

cargo-deny 0.20.2 的 `IgnoreId` 只接受 `id` 与 `reason`，逐条 `expiry` 需 0.21.0；责任人、原因与到期日因此写在 `reason` 文本里，升级工具链后可迁成结构化字段。两条例外都是 unmaintained 公告，不是已证实可利用漏洞；不按“降级 advisory 检查”处理，`unmaintained` 仍保持默认作用域。

被忽略的 advisory 还有两条已知局限。其一，`cargo deny --locked check` 只解析根工作区，NSH 生成的宿主工作区（`apps/*/.nsh/rust/Cargo.lock`）另有根图没有的 `bincode 1.3.3`、`syntect`、`two-face`，以及根图未解析的 `foldhash 0.1.5`；宿主是否放行要按各自锁文件单独核查。其二，锁文件里还有 `slotmap`（Zlib）与 `libloading`（ISC）不在 2026-11-19 的拒绝列表里：`slotmap` 只经 `taffy/taffy_tree` 进入，本机 `target/debug/.fingerprint/taffy-*/lib-taffy.json` 的启用 feature 只有 `block_layout/content_size/flexbox/grid/std`，`target/debug/deps` 没有 `libslotmap` 产物；`libloading` 的推导与记录不一致：`nsh-js` 的 `rquickjs` 依赖显式启用 `bindgen`（`nsh-js-0.6.0/Cargo.toml`），`quickjs-jit-sys` 的 `bindgen` 再打开默认 feature 含 `runtime` 的 `bindgen-rs`，`clang-sys/runtime` 引入 `libloading`（ISC），按清单它应在图内，而 2026-11-19 的拒绝列表没有它。两者只能靠实跑对齐：cargo-deny 默认按所有平台加默认 feature 建图，一旦 `taffy_tree` 或 `bindgen` 进入解析后的图，许可证检查会再次失败，届时再按实际拒绝项决定是否例外，不预先放宽。

## 尚未完成的验证

2026-11-19 在 NSH 0.6.0 上复跑，`pnpm security` 实际 exit 1：4 项许可证拒绝、2 项 unmaintained advisory，bans／sources 通过。相对 0.5.1 的差异：许可证拒绝从 5 项降到 4 项（foldhash、webpki-roots、winx、zlib-rs 不变，此前单独计数的一项已随依赖图变化消失）；新增 chrono（RUSTSEC-2026-0543），版本在升级前后都是 0.4.45，属于新发布的 advisory 而非 0.6.0 引入。单独 `pnpm audit --audit-level moderate` 实际 exit 0；完整命令在 cargo-deny 失败后退出，不能把单独 audit 的成功说成完整 security 通过。

2026-11-20 只改了 `deny.toml` 与本文，未重跑 `pnpm security`，因此不能宣称门禁已通过；例外是否被 cargo-deny 接受、是否还有未列出的拒绝项，都要以下一次实跑为准。

[ttf-parser 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2026-0192) 与 [chrono 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2026-0543) 都没有修复版本，建议的替代库（skrifa、jiff／time）需要上游迁移；[bincode 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2025-0141) 也没有修复版本。NSH 0.6.0 的 core 仍直接依赖 ttf-parser 0.25 与 chrono 0.4；2026-11-19 的升级只更换 `nsh-*` 版本（`Cargo.lock` 仅增加 env_filter 并更新 nsh 系列），且 CLI 生成的宿主仍启用 highlight，升级不解除该阻塞，正式 publish 保持阻断。

许可证需要按实际分发内容核对原始许可、版权与 notices；移除 Windows 目标或降低 advisory 检查不能代替处理依赖。升级上游、移除实际未使用功能或明确审查后的策略变更，需要分别记录并重新验证，正式 publish 保持阻断。

## 本地证据

- `artifacts/client-updates/logs/minimal-features-security.log`、`minimal-features-audit.log`：当前结果；保留旧 `security.log` 作为变更前记录。
- `artifacts/client-updates/logs/headless-warning.log`：NSH headless runner 的 1 项警告来自 macOS debug 链接器 `__eh_frame` 大于 16 MiB；不是应用 Rust／TSX 编译警告，不通过关闭 linker warning 掩盖。不能据此断言正式包同样有该警告或完全没有警告。
- 根 `Cargo.lock` 和 `apps/tv/.nsh/rust/{test,android}/Cargo.toml`：应用图与 CLI 生成宿主图的区别。`.nsh/` 与日志不入库；后续在干净 runner 上重新生成和检查。
