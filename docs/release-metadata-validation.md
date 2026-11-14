# 发行清单与制品回验

2026-11-14。本批完成 GitHub Releases 更新元数据的生成与发布前后校验；未执行远端发布，不代表客户端更新或 Android 安装已经完成。

## 使用同一个工具入口

TV 构建先成功运行固定 SDK 的 `apksigner verify --print-certs` 和 `aapt2 dump badging`，保存完整报告。`release:record` 生成最终 APK 对应的 `tv-release.json` 后执行：

```sh
node tooling/src/update-manifest.mjs tv \
  --dir <TV产物目录> \
  --repository bijinfeng/hongguo-tv \
  --source-sha <40位源码SHA> \
  --badging <aapt2报告> \
  --certificates <apksigner报告> \
  --key <仓库外的TV清单私钥文件>
```

该命令重新读取 APK 字节，核对包名、版本、minSdk、ABI、非 debug 和完整单签名者身份，然后生成 `tv-latest.json` / `tv-latest.json.sig`。预期证书和清单公钥来自 `tooling/release-policy.json`，不从待签 APK 自行建立信任；私钥不写入清单、记录或日志。APK 报告是受信任构建 job 的输出，独立提供文本报告不能替代 APK 实际验签。

发布 job 不需要私钥，下载两端候选后执行：

```sh
node tooling/src/update-manifest.mjs verify \
  --desktop-dir <桌面产物目录> \
  --tv-dir <TV产物目录> \
  --repository bijinfeng/hongguo-tv \
  --source-sha <40位源码SHA>
```

工具核对 `desktop-release.json` / `tv-release.json`、两个 SHA256SUMS、原始清单签名、版本、应用 ID、平台和固定 tag 下载地址，再流式计算包摘要。下载到同一目录时，两个目录参数传相同路径即可。

workflow 顺序为：候选回验 → 上传草稿 → 鉴权下载回验 → 发布为非 latest → 匿名下载、逐字节比较和回验 → 晋级 latest。构建 job 只有 contents: read，发布 job 才有 contents: write；签名临时文件由 always 步骤清理。失败不自动覆盖已有同名草稿或资产；需核对后恢复，不承诺自动幂等重试。

桌面正式归档名为 `hongguo-desktop-<version>-macos-aarch64.tar.gz`。固定 NSH CLI 对原 `macos-arm64` 后缀会生成空 platforms；回归测试直接调用 CLI 生成真实清单，避免仅凭手写 JSON 测试掩盖该问题。

## 本次验证

- 完整 `pnpm verify` exit 0：格式、lint、边界、codegen、Rust check/Clippy、三端 NSH check/build、Rust 159/159、Web 52/52、Desktop 50/50、TV 51/51；当时 tooling 26/26。最后新增校验和/缺签名回归后，单独 `pnpm test:tooling` 27/27，全数通过，无跳过。完整日志 `artifacts/release-metadata/verify.log`，最终 tooling 日志同目录 `tooling.log`。
- 新增清单测试 6/6：与固定 NSH 0.5.0 CLI 的签名逐字节一致；错误签名上下文、公钥、篡改、缺签名、未知 schema、错应用/版本、可变 URL、错哈希/大小、SDK/ABI、debug、多签名者和校验和漂移均拒绝。
- 真实本地 APK 的 aapt2/apksigner 报告核对通过：其 debug 属性被正式发行校验器拒绝。仅为核对报告解析，曾在内存中去掉 debug 行并以实际证书替代预期值；这部分不能计作生产签名或正式候选通过，未改写/重签 APK，也未安装。
- Oxfmt、Oxlint、`pnpm release:check`、YAML 解析及全部 workflow shell block 的 `bash -n` 通过；无依赖、Rust DTO 或客户端 UI 变化。
- 实施中曾遇到测试文件漏括号、workflow YAML 内联冒号、桌面 arm64 文件名未被 CLI 识别，以及合成报告最初误用 `sdkVersion`；均按实际工具输出修复并回归。第一次完整验证因 YAML 语法失败，保留 `artifacts/release-metadata/verify-yaml-failed.log`，不以最终通过覆盖该记录。

签名格式依据 [固定 NSH updater 源码](https://github.com/longbridge/nsh/blob/f4d68f7/crates/nsh-updater/src/lib.rs)，latest 参数语义依据 [GitHub CLI 实现](https://github.com/cli/cli/blob/trunk/pkg/cmd/release/edit/edit.go)。实际远端行为仍待发布演练确认。

## 剩余边界

该元数据批次当时尚未接客户端；后续 Rust 验签／下载、APK 身份复核和安装 adapter 已实现，当前证据和未验范围见 [客户端更新](client-updates.md)。桌面 N-1 → N、macOS Developer ID/公证、Windows/Linux、TV 真机安装器和真实网络仍未验收。既有依赖安全阻塞保持开放；该元数据批次无依赖变化，未重跑 security。未推送或创建正式 Release；工作区并行 UI/设计改动保留。
