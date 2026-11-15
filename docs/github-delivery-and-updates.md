# GitHub构建、分发与更新

本文件维护同仓库Releases的发行方案与操作边界；当前门禁、安装／升级及远端运行结果只维护在[VALIDATION](../VALIDATION.md)。客户端状态和宿主安装细节见[客户端更新](client-updates.md)，产品内界面规则见[DESIGN](../DESIGN.md)。早期调研、签名工具实验和逐轮实施／远端结果保存在[历史记录](history/2026-11-15/github-delivery-and-updates.md)。

源码、版本与工作流使用bijinfeng/hongguo-tv，桌面和TV从同仓库公开Release资产下载，客户端无GitHub token，不新增发行仓库、Pages或业务API依赖。单通道不保证所有地区家庭网络可达，发行前实际测量。

## 本地发行工具

唯一版本编辑源为product-version.json。下列工具只检查／生成元数据，不自动签名、上传或发布：

```sh
pnpm release:check
pnpm release:sync
pnpm release:metadata --artifact <产物路径> --target <平台标识> --source-sha <源码SHA>
pnpm release:record --input <候选描述JSON> --repository bijinfeng/hongguo-tv --source-sha <源码SHA> --out release.json --checksums SHA256SUMS
pnpm release:verify-record --record release.json --artifact-dir <下载目录> --repository bijinfeng/hongguo-tv --source-sha <源码SHA>
```

参数与字节校验边界见[发行摘要](release-metadata-validation.md)。预览使用debug／ad-hoc签名，候选和正式签名、元数据验签、实际安装与两版升级各有证据，不能互相代替。

## 仓库、清单与版本

### 单仓库源码与发行

源码、版本文件、工作流和发行记录均保留在当前仓库。公开 Release 的自动源码归档直接对应产品源码 tag，用户可定位并复现构建。安装包、更新清单、签名和去敏验收记录都作为同一 Release 的资产提供。

公开前核对现有 Git 历史、日志和 artifact 的凭据/私人数据，并明确项目 LICENSE 与第三方 NOTICE；不将“源码可见”当成已经具备明确开源许可。公开后的日志、artifact、符号和 source map 以可被外部读取为前提，只上传已去敏内容；生产密钥始终留在受保护的 environment secrets。

正式 Release 的固定资产名：

```text
latest.json
latest.json.sig
tv-latest.json
tv-latest.json.sig
hongguo-desktop-<version>-macos-aarch64.tar.gz
hongguo-tv-<version>-android-arm64.apk
desktop-release.json
desktop-SHA256SUMS
tv-release.json
tv-SHA256SUMS
```

首期只生成 stable。后续预览渠道使用独立 `.preview` 应用身份、预览签名和独立 Release；不能让预览包覆盖正式应用或修改 stable。PR artifact 与公开预览包都不能存放保密测试数据；确有保密需求时另用受限存储，不把“尚未正式发布”当成私有。

桌面当前 manifest 使用以下更新配置；公钥只放入客户端，私钥留在 `release-signing` environment：

```json
{
  "updater": {
    "github": "bijinfeng/hongguo-tv",
    "publicKey": "<正式更新清单 Ed25519 公钥>"
  }
}
```

NSH 会读取：

```text
https://github.com/bijinfeng/hongguo-tv/releases/latest/download/latest.json
https://github.com/bijinfeng/hongguo-tv/releases/latest/download/latest.json.sig
```

TV `apps/tv/nsh.json` 不配置 NSH updater。发布工作流生成 `tv-latest.json` / `tv-latest.json.sig`，TV 原生 adapter 固定请求：

```text
https://github.com/bijinfeng/hongguo-tv/releases/latest/download/tv-latest.json
https://github.com/bijinfeng/hongguo-tv/releases/latest/download/tv-latest.json.sig
```

清单中的每个安装包 URL 使用带确定 tag 和资产名的完整 HTTPS Release URL；清单签名覆盖发布前的原始字节。

先上传草稿 Release 的全部资产，以工作流身份下载回验清单、签名和包摘要；草稿不能匿名读取。回验通过后先发布为非 latest，逐资产匿名下载、比较原始字节并再次校验，全部通过后才晋级 latest。任一步失败即停止，不将失败候选晋级。并发发布按渠道串行；草稿上传失败需人工核对同版本资产后恢复，当前流程不会自动覆盖或重试已有同名 Release。

清单与签名是两个 HTTP 请求，缓存切换时仍可能短暂读到不同版本。必须验签失败关闭、保留当前应用并有限重试，不能临时接受无签名清单。首个桌面升级实验需专门验证固定 NSH 的缓存/重试行为；不满足时先加宿主适配，不改框架。

### 版本与发行身份

根级 `product-version.json` 包含 `version` 和 `build`，是唯一编辑源。`pnpm release:sync` 同步 NSH 清单与根产品版本，Android 从 TV 清单读取 versionName/versionCode；`pnpm release:check` 拒绝漂移。

- 正式版本使用 SemVer `x.y.z`，每次整包发行都增加版本；修复包不能仅增加 build。
- build 为全局单调递增正整数，作为 Android versionCode；校验 Android 可用范围，不直接把 workflow run number 当版本。
- 产品 tag `vX.Y.Z` 指向构建候选的源码 SHA，同仓库 Release 绑定该 tag；不另建发行仓库 tag。
- `release.json` 记录 sourceRepository/sourceSha、version/build、工具链、平台资产 SHA256/大小、签名身份、run ID 与验收记录标识；渠道发布结果记录 Release URL、tag、run ID 和资产摘要。
- 首次生产发行前确认两个正式应用 ID、数据目录及更新公钥。保留现有 ID 是默认建议，尚未形成正式身份承诺。
- 已安装 T0/debug 签名 APK 不能直接覆盖为不同签名的正式 APK。开发身份先隔离；正式升级测试必须从生产同签名的 N-1 包开始，不以卸载正式应用修复升级。

### 资产与支持矩阵

首个发行演练优先 macOS arm64 与 TV arm64。Windows/Linux 是产品目标，必须各自完成宿主构建和升级验收后才加入正式支持，不能由三系统 Rust CI 推定。

| 平台                     | 初装文件                                    | 应用内更新资产                                                | 候选验证重点                                                       |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| macOS arm64，后续 x86_64 | 已签名、公证的 app 归档；需要时再提供 DMG   | NSH 识别的 `*-macos-aarch64.tar.gz` / `*-macos-x86_64.tar.gz` | Developer ID、notarization/staple、Gatekeeper、可写/不可写安装位置 |
| Windows x64              | 固定 CLI 实际支持且验收的安装程序或便携 ZIP | NSH 平台更新 ZIP                                              | Authenticode、时间戳、文件占用、安装目录权限、重启 helper          |
| Linux x64                | NSH 目录归档 `.tar.gz`                      | 用户可写目录中的 NSH 归档                                     | 动态库/系统基线；系统包管理安装不承诺自行替换                      |
| Android TV arm64-v8a     | 最终 Gradle release APK                     | 同一个完整 APK                                                | APK 签名、applicationId、versionCode、minSdk、ABI、TV 安装器遥控   |

以 NSH 实际产物名为准，统一归档显示名宜使用稳定 ASCII，避免中文/空格 URL 与脚本解析问题。macOS universal 的更新平台键映射须单独实验，不先承诺通用包。首发不额外增加 AppImage、deb/rpm、MSIX 或双播放器包矩阵。

每个 Release 同时提供 SHA256SUMS、去敏 release.json、SBOM、NOTICE 和分端更新清单的归档副本；保留目录的清单/签名可打成 `update-metadata.tar.gz`，Release 资产使用其中的原始字节。调试符号和源码映射按版本归档，公开提供前确认不含凭据、私人路径或测试数据。

## 构建与发布流水线

现有CI及发行工作流定义在.github/workflows；Android／各桌面真实宿主和设备矩阵的缺口以VALIDATION为准，接通的产品目标纳入required。工程入口沿用 pnpm/Cargo，不新增 Go 发行依赖。干净 runner 执行 frozen install、setup、setup:tools、doctor、verify；发行另外执行 security、包检查和安装/升级验收。缺工具、缺报告、缺平台或安全失败都应阻止正式晋级。

| 工作流                                  | 触发与权限                                                                      | 交付                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `release-validation.yml`（同仓库）      | 手动选择确定 SHA；验证源码版本、完整公共门禁和元数据契约，不拿生产密钥          | 可追溯的源码验证记录；不产生可安装候选，不投放 stable                         |
| `release-preview.yml`（同仓库）         | 手动选择确定 SHA；构建 macOS arm64 与原生 TV arm64 预览包，不拿生产密钥         | 短期 Actions artifact、`release.json` 和 `SHA256SUMS`；不投放 stable          |
| `tv-release-candidate.yml`（同仓库）    | `release-signing` environment；读取 TV keystore secrets，构建并验签 arm64 APK   | 正式签名 TV 候选与证书摘要；不创建 Release、不投放 stable                     |
| `release-publish.yml`（已加入，同仓库） | 指定源码 SHA 与 `vX.Y.Z`；使用 `release-signing` environment 构建两端并校验资产 | 草稿回验 → 非latest发布 → 匿名回验 → latest晋级；不需要 `HONGGUO_CORE_ORIGIN` |

版本必须先写入源码再形成候选。tag 先建或后补均需校验指向同一 SHA，晋级／上传阶段复用已验收的最终字节，不再自动重构建另一份文件。候选过期、文件缺失、重签名或字节变化必须重新验收。正式标记前最终文件需完成平台验签及安装冒烟。

当前的 `release-publish.yml` 直接读取手动输入的确定源码 SHA 与 tag，分别在 macOS/Ubuntu runner 构建，再由 publish job 校验两份 `release.json` 的 source SHA 后上传草稿。不能只按 artifact 名称查找“最新成功构建”，也不能把任意 fork PR 的 artifact 当成可签名/可发布候选。GITHUB_TOKEN 按 job 分配所需权限即可完成同仓库晋级。

顺序约束：

1. 检查版本唯一性、源码/tag、锁文件、门禁和候选身份；仓库配置定义本次必需平台集合。
2. 各平台原生 runner 构建，生产签名完成后形成候选。macOS 公证/装订、Windows 签名/时间戳、TV 最终宿主 release 签名都在最终摘要之前完成。
3. 安装这些最终文件，执行 N-1 → N 升级、数据兼容与观看恢复；人工 TV 真机证据绑定 APK SHA256。
4. 由最终文件计算摘要，生成并签名清单；验证清单签名、包摘要、版本和平台身份。
5. 上传草稿的完整资产，鉴权下载回验；先发布为非 latest，匿名复验同一组 Release 资产后再晋级 latest。
6. 保存 Release URL、tag、源码 SHA、资产摘要与验证报告。同版本不同哈希直接失败；已有同名草稿的恢复需人工核对，当前不宣称自动幂等恢复。

构建 runner 与生产签名阶段分离权限；不让 fork PR、任意 workflow_dispatch ref 或不可信缓存进入签名路径。签名阶段执行的工具与 workflow 也必须来自审核过的固定提交。Actions 固定完整 SHA，不在 `pull_request_target` 执行 PR 代码。[GitHub Actions 安全依据](https://docs.github.com/en/actions/reference/security/secure-use)。

### 凭据与审批能力

同仓库操作使用短期 GITHUB_TOKEN，不新增 GitHub App 或 PAT。默认 `contents: read`，读取候选的 job 按需加 `actions: read`，Release job 加 `contents: write`；不把写权限提升到所有构建/PR job。客户端只携带公钥。[官方鉴权说明](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)。

GITHUB_TOKEN 触发的常见仓库事件不会再次启动工作流，因此发布流程直接在同一个 `publish` job 中创建、上传并发布 Release；不依赖发布事件再接力部署。见 [工作流事件触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。

更新清单私钥与 macOS/Windows/Android 代码签名密钥分开，备份、责任人与轮换流程分别记录；签名材料临时落盘后清理，不进缓存或 artifact。清单签名保证更新来源，系统代码签名保证安装身份，GitHub 来源证明保证产物出处，三者不互相替代。单公钥 NSH 配置的密钥轮换需先用旧密钥发布信任新公钥的宿主，不能直接更换线上清单签名；旧密钥丢失/失陷有必须手动安装的恢复边界。

公开仓库可配置 environment required reviewers。设置独立的 `release-signing` 和 `production` 环境：前者保护生产签名密钥，后者保护正式发行；仅允许已审核的分支/tag，按维护者配置防止自行批准及管理员绕过。签名 job 也必须在获得对应审批后才拿到密钥，不能只保护最后的发布步骤。单维护者阶段若无法提供独立审批人，应如实记录审批配置，不以 environment 名称冒充双人复核。若未来调整仓库可见性，再按账号套餐重新确认保护能力。见 [部署保护与套餐限制](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)。

## 双端更新职责

桌面使用NSH updater，TV使用Rust验签／下载和Android PackageInstaller；清单签名与平台安装签名分别核验。客户端状态机、进度写排空、授权／取消／安装确认、焦点及交互的唯一说明在[client-updates](client-updates.md)，这里不复制实现和视觉状态。

正式发布前需同一源码的verify／Clippy／security及最终签名资产验收，缺失或失败阻止晋级；安全工作区和生成宿主范围见[依赖检查](dependencies/native-release-security.md)。支持平台、真实两版升级、数据保留和恢复演练按工程规范与当前矩阵逐项验证，工作流存在不等于发行已完成。

## 故障、撤回与数据

| 故障                                | 行为                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| GitHub Releases 不可达、超时、限流  | 保持当前版本可用；有界退避，手动重试；不影响正常观看                         |
| 缓存清单与签名不一致、签名错误      | 拒绝更新，记录不同错误原因；绝不降为无签名下载                               |
| 下载中断、空间不足、包不匹配        | 不进入安装；保留旧应用，清理失败临时文件，提供重试                           |
| TV 未授权、用户取消或厂商安装器拒绝 | 返回原应用，保留可重试状态；不要求卸载或清数据                               |
| 正式发布后发现严重问题              | 停止将该版本作为 latest，保留不可变资产和证据；以更高 version/build 发布修复 |
| 二进制启动后故障或迁移失败          | 使用已验证的数据备份/恢复路径；不能依赖 NSH 安装失败保护解决启动后逻辑错误   |

撤回时将渠道清单恢复为上一份已验签清单，阻止较旧设备继续获知坏版本；已缓存/下载或离线设备无法被保证立即撤回，已安装坏版本也不会自动降级。若要实时 kill switch 或防重放 freshness，需另行扩展清单和客户端；首期不承诺。

数据库迁移前备份，升级中断、磁盘满、未来 schema、迁移失败保留原数据；测试历史和账号保留，但不读取旧参考客户端数据。不把复制旧二进制等同于数据可回退，不用删除数据库处理更新错误。

单 GitHub 通道能满足首期托管与分发，但不保证所有电视网络可达。发行前从目标地区的桌面与家庭电视网络测量清单和 Release 跳转下载。若成功率或速度不满足产品要求，再接自有域名/CDN；镜像使用同一套签名清单和哈希，不引入任意第三方 GitHub 加速代理。
