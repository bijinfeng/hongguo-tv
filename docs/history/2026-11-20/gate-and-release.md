# 工程门禁、正式发布与账号页构图（2026-11-20）

非当前指令。当前验收状态见[VALIDATION](../../../VALIDATION.md)，实现缺口见[功能台账](../../feature-ledger.md)，发行流程见[分发方案](../../github-delivery-and-updates.md)。

本页承接 2026-11-20 从 VALIDATION 移除的过程叙事和验证细节，避免当前验收页被长段落占用；事实、源码身份、命令结果与限制保持原样。

## 工程门禁

当前工作树（到 `44c0542`）由脚本串行执行 `pnpm verify` 连续两次退出码 0（修复两个生命周期测试的 admit 顺序后）、`pnpm security` 退出码 0，涵盖三端 check／build、Rust／应用回归、codegen:check、格式、包边界和 release 基础检查；OpenSpec changes 32／32 通过。

未覆盖与限制：

- Rust 显式联网 probe 跳过 1 项，headless 有 warning。
- 门禁只覆盖本机工作树的根工作区，不含签名、安装、升级与真实流程。
- `pnpm security` 绿灯不含 NSH 生成宿主的锁文件；正式发行仍被两条无修复版本的 unmaintained advisory 阻断。
- `master` 的 CI（run 44481849616，`9bc20a4`）曾为 failure；`fe3f057` 上 CI 六个 job 全部 success（security、三平台 rust、workspace、required），为该分支第一次全绿。

已修：`lifecycle_tests` 的两个重开测试原先只 poll 一次，而 `apply_operation` 要先等账号状态锁才注册写入，drop 掉后 drain 没有可等的写入，于是重开读到空库（`entries.len()==0`）。改为把写入作为任务启动并自己取同一把锁，让注册顺序确定；「仍被阻塞」的判据由 30ms 计时器改为 noop waker 单次 poll。对照：旧写法 3／30 失败，新写法 0／60，连续两次完整 verify 无失败。

后续补充（同日）：PR #1 合并后 `master` 的 CI run 44702712996 六个 job 全部 success，此前 `master` 上的旧 failure 不再代表当前默认分支状态。

## 首次正式发布 v0.1.0

2026-11-20 首次正式发布 `v0.1.0`（run 44688698633，源码 `f19a6af`）：`quality`／`security` 两个前置 job 通过，两端构建成功，`publish` 创建非草稿、非预发布 Release。已下载产物实测：

- APK 证书 `8d34d7e8…` 与 `tooling/release-policy.json` 逐字符一致（`CN=Hongguo TV Release`）、v2 签名通过。
- `hongguo-tv-0.1.0-android-arm64.apk` 与 `hongguo-desktop-0.1.0-macos-aarch64.tar.gz` 的 SHA-256 与各自清单一致。
- `latest.json`／`tv-latest.json` 两份更新清单的 Ed25519 签名均以配置公钥验签通过。

桌面为 NSH ad hoc 签名并按既定决定接受 Gatekeeper 拦截。Web／macOS／TV 已有分阶段构建及部分实际宿主证据；本工作树的 `verify`／`security` 在本机通过。

未完成与具体未验：

- Windows／Linux 实际安装、公开 Web 会话隔离／部署、正式签名／公证／N-1 升级／SBOM、无 Go 干净环境及完整产品矩阵。
- macOS 产物是 NSH 的 ad hoc 签名 `.app` 直接打 tar（`.github/workflows/release-publish.yml:114-124`），无 Developer ID／公证；桌面发布 job 只跑 `macos-15`（`:81`）。
- TV 无正式签名候选，预览构建默认 debug（`tooling/src/tv-host.mjs:32`）。
- `v0.1.0` 是唯一 Release、没有前一版，N-1 → N 升级与回执链路无证据。
- tag 指向 `f19a6af`，经 PR #1 squash 合并后不在 `master` 历史（内容已随 `0ecca76` 进入 master）。
- 仓库与 `.github` 无 SBOM／provenance／NOTICE 生成；`release-signing` 环境保护规则为空且 `can_admins_bypass` 为 true（`gh api repos/bijinfeng/hongguo-tv/environments/release-signing`），发布 job 自身不挂 environment（`.github/workflows/release-publish.yml:301`）。
- Web 服务端仍只 bind 环回且明说公开多用户未支持（`services/web-api/src/main.rs:1,45`、`crates/http-api/src/lib.rs:1`），`package:web` 脚本存在（`package.json:37`）但无 workflow 调用，也无 Dockerfile 或托管平台配置。

## 我的账号页面构图

账号页按设计稿拆为身份卡、"我的内容"卡、片库区与登录弹窗，基础层新增 `ActionRow`；桌面 1440×1000 与 TV 960×540 的浅／深、游客／已登录及登录弹窗共 12 张截图完成四轮视觉复评（7.7 FAIL → 7.2 FAIL → 7.7 FAIL → **PASS 8.17**，无高严重度项）；三端账号行为回归 Web 12／12、Desktop 12／12、TV 12／12 通过；`pnpm check`／`build` 三端通过。截图在 `artifacts/account-redesign/`（未提交）。

未验：真实登录／真实同步／物理遥控与系统大字未在本轮观察；验收数据为合成服务响应，只证明构图与状态渲染；TV 以轻标题＋按钮带替代第二列与卡片容器属端型适配，不作为桌面还原度的一部分；`tooling/src/account-host.mjs` 为临时截图脚本，未接入 `pnpm` 脚本。
