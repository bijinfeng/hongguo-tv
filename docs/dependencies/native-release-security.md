# 原生发行依赖检查

2026-11-14 首次核对，2026-11-17 升级到 NSH 0.5.1、2026-11-19 到 NSH 0.6.0 后各重跑一次。依赖与许可证结论来自当前 Cargo 下载包、`cargo tree --locked` 和 `pnpm security`，不将维护状态告警表述为已知可利用漏洞。

## 已移除的工作区依赖

TV Rust 模块仅使用 `nsh-base::theme()`，不使用编辑器、语法高亮、绘图、富文本编辑器或终端。工作区对 `nsh-base` 设置 `default-features = false`；未改 NSH 版本、源码、公共 API 或 TSX 控件。

此前的依赖链为 `hongguo-tv-native → nsh-base/highlight → syntect / two-face → bincode 1.3.3`。关闭默认功能后，根 `Cargo.lock` 移除 16 个包且没有引入新版本，包含 bincode、foldhash 0.1.5、syntect、onig、ropey 和 vte。原有主题 API 不受这些 feature 控制。

这项变化只缩减应用 Rust 工作区的依赖图。NSH CLI 生成的独立宿主工作区在锁文件里仍通过 `nsh-base` 的默认功能及 Android 的 `highlight` 解析出 bincode／syntect／two-face；预构建 NSH runtime 也不能仅凭根 Cargo.lock 推断组成。根 `pnpm security` 不能替代对生成宿主、预构建运行时及最终发行 notices 的检查。这些包是否真的进发行包，按宿主 release 构建与已打包二进制的取证见「宿主工作区不在根门禁内」；目前既不宣称发行二进制已移除 bincode，也不宣称它一定带着。

## 门禁例外（2026-11-20 审计）

`deny.toml` 对 2026-11-19 的 6 项拒绝（4 项许可证、2 项 advisory；webpki-roots 两个版本各一条例外）按精确版本给出最小例外：许可证进 `licenses.exceptions`，不扩全局 `allow`；advisory 进 `advisories.ignore`。`unused-ignored-advisory = "deny"` 使失效的忽略直接报错，不静默保留。

| 依赖                 | 类别                           | 引入方                                                                    | 运行时／仅构建                              | 处置                                |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| foldhash 0.2.0       | Zlib（OSI 认可）               | `rust-i18n-support`（nsh-core）；`hashbrown`（quickjs-jit-core）          | 运行时（第一条）；第二条在根图仅 dev        | 精确版本例外，保留 notices          |
| zlib-rs 0.6.8        | Zlib（OSI 认可）               | `zip/deflate`（nsh-updater）→ `flate2/zlib-rs`                            | 根图仅 dev；生成宿主默认 `updater` 后进发行 | 精确版本例外，保留 notices          |
| webpki-roots 1.0.12  | CDLA-Permissive-2.0            | `hongguo-core`、`hongguo-updater`                                         | 运行时                                      | 精确版本例外，随数据分发协议全文    |
| webpki-roots 0.26.11 | CDLA-Permissive-2.0            | 宿主：`nsh-core/websocket` → `nsh-js` → `tokio-tungstenite`；根图只经 dev | 运行时（宿主）；根图是否命中待实跑          | 精确版本例外，同上                  |
| winx 0.36.4          | Apache-2.0 WITH LLVM-exception | `nsh-core` → `cap-std` → `cap-primitives`                                 | 运行时，仅 `cfg(windows)`                   | 精确版本例外，例外只放宽 4(a)(b)(d) |
| ttf-parser 0.25.1    | RUSTSEC-2026-0192              | `nsh-core`（字体）、`nsh-macros`（资源字体），均非可选                    | 运行时                                      | ignore，无修复版本                  |
| chrono 0.4.45        | RUSTSEC-2026-0543              | `nsh-core`、`nsh-base`                                                    | 运行时                                      | ignore，无修复版本                  |

三条发行事实约束上表的实际影响。`release-publish.yml` 只出 `desktop-macos-arm64` 与 `tv-android-arm64`，所以 `winx`（`cfg(windows)`）不进任何发行包。`webpki-roots` 两个版本都进发行包，但来源不同：tv 侧由 `hongguo-core` 的 `cfg(target_os = "android")` 依赖（`crates/core/Cargo.toml:29-30`）和 `hongguo-updater`（`crates/updater/Cargo.toml:13`）带入 1.0.12，desktop 侧 1.0.12 只在 `hongguo-core` 的 dev-dependency 测试路径；0.26.11 在发行宿主里经 `nsh-core/websocket` 与 `nsh-platform-*` 的默认 `websocket` feature 打开 `nsh-js`，再由其非可选的 `tokio-tungstenite` 带入（`nsh-js-0.6.0/Cargo.toml:158-164`、`nsh-core-0.6.0/Cargo.toml:44-49`），与 `nsh.json` 是否声明 `websocket` 无关。`CDLA-Permissive-2.0` 与 `Zlib` 的 notices／协议全文仍须随包分发，而 `pnpm package` 目前没有对应产物（`tooling/src/cli.mjs:342-362` 的 `package` 分支只调 `nsh package` 与 `packageTvHost`；`tooling/src` 内没有 notices 生成步骤），须人工核对。

责任人 jfbi。advisory 到期 2027-02-28（跟随 NSH 向 jiff／time、skrifa 的迁移）；许可证到期 2027-05-31 或下一次 NSH 升级，取较早者。

### 与 2026-11-20 现状的逐条核对

`deny.toml` 解析结果（`python3 -c "import tomllib; ..."`，本次实跑）：`advisories.ignore` 2 条（`RUSTSEC-2026-0543`、`RUSTSEC-2026-0192`），`licenses.exceptions` 9 条（`ring`、`rustls-webpki`、`untrusted`、`webpki-root-certs`、`foldhash`、`zlib-rs`、`webpki-roots` 两个版本、`winx`），`unused-ignored-advisory = "deny"`，`bans`／`sources` 保持原样。按根 `Cargo.lock` 与本地 RUSTSEC 库（`~/.cargo/advisory-dbs/advisory-db-3157b0e258782691`，HEAD `074ea9a`，2026-11-19）逐条比对：

- 两条 advisory 例外都仍然需要，且只此两条：本地全库扫描根锁只命中 `ttf-parser 0.25.1`（RUSTSEC-2026-0192）与 `chrono 0.4.45`（RUSTSEC-2026-0543），与 `ignore` 完全对应，没有多余项，也没有过期项；`reason` 里引用的 `nsh-core-0.6.0/Cargo.toml:59-62`、`nsh-macros-0.6.0/Cargo.toml:51-52`、`nsh-base-0.6.0/Cargo.toml:71-74` 与下载包逐行一致。
- 九条许可证例外中，`ring`／`rustls-webpki`／`untrusted`／`webpki-root-certs` 属既有 TLS 集合，四个版本都在根锁里且都可达。
- `foldhash =0.2.0`、`zlib-rs =0.6.8`、`winx =0.36.4`、`webpki-roots =1.0.12` 四条命中的是根图里的实际版本。
- `webpki-roots =0.26.11` 是唯一可疑项：它可能从未命中，见下文。
- 九条例外都没有结构化期限，`2027-02-28` 与 `2027-05-31` 两档相对 2026-11-20 均未到期。

cargo-deny 0.20.2 的 `IgnoreId` 只接受 `id` 与 `reason`（[0.20.2 源码](https://docs.rs/crate/cargo-deny/0.20.2/source/src/advisories/cfg.rs)），逐条 `expiry` 需 0.21.0；责任人、原因与到期日因此写在 `reason` 文本里，升级工具链后可迁成结构化字段。两条例外都是 unmaintained 公告，不是已证实可利用漏洞；不按“降级 advisory 检查”处理，`unmaintained` 保持 0.20.2 的默认作用域 `all`（同源：`unmaintained: Scope::All`），未改成 `workspace`/`transitive`/`none`。

`unused-ignored-advisory = "deny"` 只约束 advisory 忽略项；许可证例外由另一个 lint `unused-license-exception` 管，cargo-deny 默认是 `warn`（[licenses 配置](https://embarkstudios.github.io/cargo-deny/checks/licenses/cfg.html)），所以前者已经能让失效的 advisory 忽略直接失败，后者默认只留警告。两档到期日（`2027-02-28`、`2027-05-31`）相对 2026-11-20 都未到期；cargo-deny 0.20.2 不校验这些文本，到期检查只能靠人或升级到带 `expiry` 的版本，工具不会自己报。

根图许可证检查默认 `include-dev = false`（同上），只经 dev-dependency 可达的 crate 不参与检查。`webpki-roots 0.26.11` 在根图里正是这种情形（`crates/native-bridge/Cargo.toml:17-22` 的 dev-dependency `nsh-engine` → `nsh-js` → `tokio-tungstenite`），2026-11-19 的日志里它没有独立的拒绝块、只有 `1.0.12` 有，而 0.5.1 的日志里两者各有一块（当时 `nsh-core` 直接依赖 `nsh-js`）。所以在当前根图上这一条例外很可能从未命中。若把 `unused-license-exception` 收紧为 `deny`，需同时删除这一条或改用 `include-dev = true`，否则门禁会因未命中而失败；这条结论与收紧动作都必须在实跑 `pnpm security` 后确认，本次未改。

被忽略的 advisory 还有两条已知局限。其一，`cargo deny --locked check` 只解析根工作区，NSH 生成的宿主工作区（`apps/*/.nsh/rust/Cargo.lock`）另有根图没有的 `bincode 1.3.3`、`syntect`、`two-face` 与 `foldhash 0.1.5`；宿主是否放行要按各自锁文件单独核查，结论见下一节。其二，`slotmap`（Zlib）与 `libloading`（ISC）不在 2026-11-19 的拒绝列表里，两者成因不同，2026-11-20 已按锁文件重新核对：根图里 `slotmap` 只由 `nsh-core` 的 `taffy` 带出，而 `nsh-core` 以 `default-features = false` 加 `std/flexbox/grid/block_layout/content_size` 声明 taffy（`nsh-core-0.6.0/Cargo.toml:125-134`），没有 `taffy_tree`，所以 `slotmap` 不在根图；宿主图里它由 `usvg → fontdb` 带入，`fontdb` 对 `slotmap` 非可选（`fontdb-0.23.0/Cargo.toml:39-41`）。`libloading` 在根图可达：`nsh-js` 的 `rquickjs` 显式启用 `bindgen`（`nsh-js-0.6.0/Cargo.toml:134-142`）→ `quickjs-jit-sys` 的可选 `bindgen-rs` → `bindgen` 默认含 `runtime` → `clang-sys/runtime` → `libloading`；这是 build-dependency 链，许可证检查默认 `include-build = true`，按规则应被检查，而 2026-11-19 的日志没有它的拒绝块。这条差异仍未对齐，需要一次实跑确认；在此之前不预先放宽。

## 宿主工作区不在根门禁内（2026-11-20 复核）

`pnpm security` 只执行 `cargo deny --locked check`，cwd 固定为仓库根（`tooling/src/cli.mjs:339`，`tooling/src/process.mjs:60`、`:116`），因此它只覆盖根 `Cargo.lock`。而 release-publish 的两端产物都不由根图构建：desktop 的 `红果.app` 是可执行文件加宿主工作区 `apps/desktop/.nsh/rust` 的 release 构建（`nsh-cli-0.6.0/src/package.rs:1811-1818`、`:1883-1918` 的 runner 复制，`rust_app.rs:2904-2933` 选择 `rust-macos` 包），TV 的 `libnsh.so` 来自 `nsh-cli-0.6.0/src/package.rs:1411-1418`。这两份锁文件被 `.gitignore:2` 的 `**/.nsh/` 排除，不入库，因此也不被任何入库门禁读取。

按锁文件比对：根 `Cargo.lock` 396 条 `[[package]]`，`apps/desktop`／`apps/tv` 的宿主锁各 702／703 条，263 个 crate 名不在根图里。对已打包的 desktop 二进制（`apps/desktop/.nsh/out/红果.app/Contents/MacOS/App`，含符号）与 APK 的 `lib/arm64-v8a/libnsh.so`（已 strip，只有字符串）核对，命中宿主独有 crate 的证据如下：

| 宿主 crate       | 类别                     | 进入路径                                             | 发行包证据                                      | 根策略覆盖                 |
| ---------------- | ------------------------ | ---------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| rustybuzz 0.20.1 | RUSTSEC-2026-0206 未维护 | `nsh-core/svg` → `resvg` → `usvg/text`               | 两端源码路径字符串（desktop 50 条，APK 40 条）  | 否                         |
| slotmap 1.1.1    | Zlib                     | `usvg → fontdb`                                      | 两端；desktop 另有 8 个符号                     | 否                         |
| hexf-parse 0.2.1 | CC0-1.0                  | `naga`                                               | desktop 有 `hexf_parse` 符号 3 个；APK 已 strip | 否                         |
| tiny-skia 0.11.4 | BSD-3-Clause             | `resvg`                                              | desktop 436 个符号；APK 源码路径字符串          | 是（在全局 `allow` 内）    |
| arrayref 0.3.9   | BSD-2-Clause             | `tiny-skia`                                          | 宿主 release 构建有 rlib；最终二进制未见符号    | 否                         |
| libloading 0.8.9 | ISC                      | `ash`、`dlib`、`wgpu-hal`                            | 宿主 release 构建有 rlib；最终二进制未见符号    | 否                         |
| foldhash 0.1.5   | Zlib                     | `hashbrown 0.15.5`（`imara-diff`、`gpu-descriptor`） | 宿主锁内有；未单独取证                          | 否                         |
| zstd-sys 2.1.3   | BSD-3-Clause AND BSD-2   | `zstd`（`nsh-base/math`）                            | 只在 debug／test 宿主构建里找到                 | 否（BSD-2 部分未在 allow） |
| bincode 1.3.3    | RUSTSEC-2025-0141 未维护 | `nsh-base/highlight` → `syntect`                     | 只在 debug／test 宿主构建里找到                 | 否                         |

`usvg-0.46.0/Cargo.toml:44-50` 的 `text` feature 打开 `rustybuzz`，`fontdb-0.23.0/Cargo.toml:39-41` 对 `slotmap` 非可选，`resvg` 由 `nsh-core/svg` 打开（`nsh-core-0.6.0/Cargo.toml:37-42`、`:91`），`nsh-platform-macos`／`nsh-platform-android` 的默认 feature 含 `svg`（`nsh-platform-macos-0.6.0/Cargo.toml:34-49`、`nsh-platform-android-0.6.0/Cargo.toml:34-49`），所以这几条在 `nsh.json` 不关 `svg` 前必然参与发行构建。

这里同时修正正文一处旧结论：「生成宿主仍启用 `highlight`」只对 debug／test 宿主成立；本次在 release 宿主构建与 desktop 包内都没有找到 `syntect`／`two-face`／`bincode`，也没有证据表明它们一定不在，只能说未取证。宿主是否加载 `highlight` 取决于 runner feature 选择（`nsh-cli-0.6.0/src/package.rs:1147-1160` 的 `native_features::choose`），不取决于宿主 `macos-host/Cargo.toml:14` 的清单声明。

最小覆盖手段是给宿主工作区各跑一次同一份策略，而不是把宿主 crate 塞进根 `deny.toml`（`unused-ignored-advisory = "deny"` 会因根图里没有它们而直接报错，`deny.toml:11-16` 已写明这一点）。做法：新增 `tooling/host-deny.toml`，沿用根的 `allow`、`[licenses.private]` 与全部 `licenses.exceptions`（宿主图同样需要 `webpki-roots 0.26.11`、`foldhash`、`zlib-rs`、`winx`、`ring` 等，且这些在这一作用域里确实命中），再追加宿主独有的 Zlib（`slotmap`、`foldhash 0.1.5`）、ISC（`libloading`）、CC0-1.0（`hexf-parse`）、BSD-2-Clause（`arrayref`）与 `BSD-3-Clause AND BSD-2-Clause`（`zstd-sys`）例外，以及 `RUSTSEC-2026-0206`；在 `pnpm security` 里对两个 app 各执行 `cargo deny --manifest-path apps/<target>/.nsh/rust/Cargo.toml --config tooling/host-deny.toml check`，排在 `pnpm setup` 之后。这条门禁本次未实现也未运行：它需要 `.nsh/` 存在并会触发 `cargo metadata`，而本路被限定不运行会写 `target/`、`.nsh/` 的命令；`RUSTSEC-2025-0141` 是否列入取决于该门禁检查 release 还是 debug 图（本次只在 debug／test 宿主构建里找到 bincode）。`tiny-skia` 的 BSD-3-Clause 已在根 `allow` 内，宿主策略无需再加。

## 正式发行还缺的供应链证据（2026-11-20 复核）

文档早已要求这些证据，实现一侧尚未接上。逐条对应关系如下（左侧是要求，右侧是本仓库的实际状态与依据）：

| 要求                                            | 依据                                                                                | 现状                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 唯一来源：`ENGINEERING.md:245` 的锁定 Syft SBOM | `docs/github-delivery-and-updates.md:111` 也列为 Release 必备                       | `.github/` 与 `tooling/`（含 `package.json`）都没有 SBOM 生成步骤；`grep -rIl -iE 'sbom\|cyclonedx\|syft' .github tooling package.json` 无命中                                                                                                              |
| NOTICE／第三方许可证汇总                        | `docs/github-delivery-and-updates.md:111`、`ENGINEERING.md:245`                     | `pnpm package` 分支只调 `nsh package` 与 `packageTvHost`（`tooling/src/cli.mjs:342-362`），没有 notices 步骤；打包出的 `红果.app`（`find … -iname 'LICENSE*' -o -iname 'NOTICE*'` 为 0）与 `红果.apk`（`unzip -l` 中 license／notice 为 0）都不含许可证文本 |
| 项目自身 LICENSE                                | `docs/github-delivery-and-updates.md:27` 要求在公开前明确                           | 仓库根没有 `LICENSE`；`git ls-files` 只匹配到两个第三方资源自带的许可证（`packages/ui/assets/lucide/LICENSE`、`design/prototype/.../LICENSE`）；`package.json` 与 `Cargo.toml` 都没有 `license` 字段                                                        |
| Gitleaks secret scan                            | `ENGINEERING.md:192`（security job 内容）、`:205`（锁定版本、覆盖差异与首发前历史） | 仓库内没有 Gitleaks 配置或工作流；`.github/workflows/` 中 `grep -rIl -i gitleaks` 无命中，`ENGINEERING.md`／`VALIDATION.md` 只有要求文字                                                                                                                    |
| provenance／构建证明                            | `ENGINEERING.md:236`、`:245`（受控 CI 身份）                                        | `.github/` 下 `grep -rn 'id-token\|attest'` 无命中；`provenance` 只出现在图标资源的 `tooling/src/ui-icons.mjs:8` 与它的测试里，与构建证明无关                                                                                                               |
| Android 依赖进入统一 SBOM／扫描                 | `ENGINEERING.md:192`、`:205`                                                        | 已有 `apps/tv/android/gradle/verification-metadata.xml`（283 个 `<component>`，`verify-signatures=false`）作为校验和锁定，但没有任何步骤把它汇入 SBOM                                                                                                       |
| 走过的安全门禁本身                              | `release-publish.yml:60-76`、`ci.yml:71-85`                                         | 两个 security job 都只跑 `pnpm security`，因此与根 `pnpm security` 同范围：不含宿主工作区、不含 secret scan、不含 SBOM                                                                                                                                      |

这些条目的共同点是：不是策略未定，而是没有任何生成或上传步骤。`release-publish.yml:362-373` 的上传清单只有归档、APK、两个清单及其签名、两个 `*-release.json` 与两个 `SHA256SUMS`，没有 SBOM／NOTICE。要在本仓库内补齐，需要新增生成步骤并把它接进同一个发布 job；SBOM 与 NOTICE 可完全本仓实现，provenance 需要仓库的 `id-token: write` 与可用的 sigstore 端点，secret scan 只需在现有 job 里加一步。

## 尚未完成的验证

2026-11-19 在 NSH 0.6.0 上复跑，`pnpm security` 实际 exit 1：4 项许可证拒绝、2 项 unmaintained advisory，bans／sources 通过。相对 0.5.1 的差异：许可证拒绝从 5 项降到 4 项（foldhash、webpki-roots、winx、zlib-rs 不变，此前单独计数的一项已随依赖图变化消失）；新增 chrono（RUSTSEC-2026-0543），版本在升级前后都是 0.4.45，属于新发布的 advisory 而非 0.6.0 引入。单独 `pnpm audit --audit-level moderate` 实际 exit 0；完整命令在 cargo-deny 失败后退出，不能把单独 audit 的成功说成完整 security 通过。

2026-11-20 只改了 `deny.toml` 与本文，本次审计未运行 `pnpm security`。`VALIDATION.md:11`、`:37` 记录 `44c0542` 上 `pnpm security` 退出码 0，但本机唯一能找到的 cargo-deny 原始输出是 `/tmp/hg-security.log`（2026-11-19 23:36），它仍是失败：`advisories FAILED, bans ok, licenses FAILED, sources ok`，4 条 `error[rejected]`（foldhash 0.2.0、webpki-roots 1.0.12、winx 0.36.4、zlib-rs 0.6.8）加 2 条 `error[unmaintained]`；本次交接也只在「退出码 0」之后贴出这同一段失败文本。因此该绿灯目前只有文档结论、没有可核对的日志，本文既不确认也不否认它。下一次实跑要确认三件事：九条例外中哪些实际命中（尤其 `webpki-roots =0.26.11`）、`libloading` 是否如期被检查、以及 `unused-license-exception` 的告警清单。若确认这盏灯成立，应把日志落到 `artifacts/` 并在 `VALIDATION.md` 写明路径，而不是只留结论。

[ttf-parser 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2026-0192) 与 [chrono 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2026-0543) 都没有修复版本，建议的替代库（skrifa、jiff／time）需要上游迁移；[bincode 官方 advisory](https://rustsec.org/advisories/RUSTSEC-2025-0141) 也没有修复版本。NSH 0.6.0 的 core 仍直接依赖 ttf-parser 0.25 与 chrono 0.4；2026-11-19 的升级只更换 `nsh-*` 版本（`Cargo.lock` 仅增加 env_filter 并更新 nsh 系列），升级不解除该阻塞，正式 publish 保持阻断。

许可证需要按实际分发内容核对原始许可、版权与 notices；移除 Windows 目标或降低 advisory 检查不能代替处理依赖。升级上游、移除实际未使用功能或明确审查后的策略变更，需要分别记录并重新验证，正式 publish 保持阻断。

## 本地证据

- `/tmp/hg-security.log`（2026-11-19 23:36）与 `/tmp/security-051.log`（2026-11-17）：本文引用的两份 cargo-deny 原始输出，均在 `target/` 之外，属本机临时文件、不入库。
- 本文「宿主工作区」一节的锁文件比对与二进制取证是 2026-11-20 在本工作区实跑：`python3` 解析 `Cargo.lock`／宿主锁并比对本地 RUSTSEC 库，`strings`／`nm` 检查 `apps/desktop/.nsh/out/红果.app/Contents/MacOS/App` 与 `apps/tv/.nsh/out/红果.apk` 解出的 `libnsh.so`。两项产物本身不入库。
- 根 `Cargo.lock` 和 `apps/tv/.nsh/rust/{test,android}/Cargo.toml`：应用图与 CLI 生成宿主图的区别。`.nsh/` 与日志不入库；后续在干净 runner 上重新生成和检查。
