# 原生发行依赖检查

2026-11-14，固定 NSH 0.5.0。依赖与许可证结论来自当前 Cargo 下载包、`cargo tree --locked` 和 `pnpm security`，不将维护状态告警表述为已知可利用漏洞。

## 已移除的工作区依赖

TV Rust 模块仅使用 `nsh-base::theme()`，不使用编辑器、语法高亮、绘图、富文本编辑器或终端。工作区对 `nsh-base` 设置 `default-features = false`；未改 NSH 版本、源码、公共 API 或 TSX 控件。

此前的依赖链为 `hongguo-tv-native → nsh-base/highlight → syntect / two-face → bincode 1.3.3`。关闭默认功能后，根 `Cargo.lock` 移除 16 个包且没有引入新版本，包含 bincode、foldhash 0.1.5、syntect、onig、ropey 和 vte。原有主题 API 不受这些 feature 控制。

这项变化只缩减应用 Rust 工作区的依赖图。NSH CLI 生成的独立宿主工作区仍通过 `nsh-base` 的默认功能及 Android 的 `highlight` 引入相关依赖；预构建 NSH runtime 也不能仅凭根 Cargo.lock 推断组成。根 `pnpm security` 不能替代对生成宿主、预构建运行时及最终发行 notices 的检查；目前没有宣称发行二进制已移除 bincode。

## 仍阻断的工作区检查

| 依赖                         | 原因                                              | 当前来源                                            |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| foldhash 0.2.0               | Zlib 未在现有策略中允许                           | hashbrown／indexmap、NSH 及 OpenAPI 工具链          |
| webpki-roots 0.26.11、1.0.12 | CDLA-Permissive-2.0 未在现有策略中允许            | NSH WebSocket／TLS、TV updater                      |
| winx 0.36.4                  | Apache-2.0 WITH LLVM-exception 未在现有策略中允许 | NSH → cap-std → cap-primitives                      |
| zlib-rs 0.6.8                | Zlib 未在现有策略中允许                           | flate2、内容核心与 NSH updater                      |
| ttf-parser 0.25.1            | RUSTSEC-2026-0192，停止维护                       | NSH core 与 proc macro 的直接依赖，非可关闭 feature |

`pnpm security` 实际 exit 1：5 项许可证拒绝、1 项 unmaintained advisory，bans／sources 通过。单独 `pnpm audit --audit-level moderate` 实际 exit 0；完整命令在 cargo-deny 失败后退出，不能把单独 audit 的成功说成完整 security 通过。未添加 allow／ignore 例外。

[ttf-parser 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2026-0192) 没有修复版本，建议的替代库需要上游迁移；[bincode 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2025-0141) 也没有修复版本。已下载核对当天发布的 NSH 0.5.1 Cargo manifest，core 仍直接依赖 ttf-parser 0.25，因此没有为此升级整套 CLI／宿主并重新推定验收结果。

许可证需要按实际分发内容核对原始许可、版权与 notices；移除 Windows 目标或降低 advisory 检查不能代替处理依赖。升级上游、移除实际未使用功能或明确审查后的策略变更，需要分别记录并重新验证，正式 publish 保持阻断。

## 本地证据

- `artifacts/client-updates/logs/minimal-features-security.log`、`minimal-features-audit.log`：当前结果；保留旧 `security.log` 作为变更前记录。
- `artifacts/client-updates/logs/headless-warning.log`：NSH headless runner 的 1 项警告来自 macOS debug 链接器 `__eh_frame` 大于 16 MiB；不是应用 Rust／TSX 编译警告，不通过关闭 linker warning 掩盖。不能据此断言正式包同样有该警告或完全没有警告。
- 根 `Cargo.lock` 和 `apps/tv/.nsh/rust/{test,android}/Cargo.toml`：应用图与 CLI 生成宿主图的区别。`.nsh/` 与日志不入库；后续在干净 runner 上重新生成和检查。
