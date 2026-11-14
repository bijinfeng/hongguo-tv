# 原生客户端更新

桌面使用 NSH updater；TV 使用独立 Rust updater 与 Android PackageInstaller。两端只读取公开 GitHub Releases，不依赖业务 API、Pages 或客户端 token。

## 界面与状态所有权

入口复用现有账号页的「应用更新」，避免为一个操作新增整套设置导航。应用根持有更新控制器，下载与安装能力归宿主；返回找剧后继续下载。首次进入应用自动检查，不自动下载、不弹窗、不抢播放焦点。更新页保留一个稳定主动作，下载读数变化不重新创建按钮。Web 不注入更新能力，不显示入口。

编码前动效清单：按钮沿用共享 fast 100ms 颜色／按下反馈；页面沿用 NavStack（桌面默认，TV 即时，reduced motion 禁用）；内容首次到达用 ContentArrival 的 base 180ms easeOut／8px，reduced motion 即时；状态与下载字节原位变化，不对每次进度做动画，不增加音效或循环装饰。系统授权与安装使用真实 Android 界面。

## 安装边界

桌面只在 NSH shellInfo 确认正式安装后自动检查。下载与安装使用同一已检查候选，准备好后不再检查覆盖 NSH 的全局目标。不支持自动替换时打开公开 Release。开发宿主不显示「已是最新版本」。

TV 在 Rust 中对原始字节做域分隔 Ed25519 验签，再核对应用、稳定渠道、固定 tag URL、版本代码、SDK、ABI、证书、大小与 SHA256。下载限长、HTTPS、限制 GitHub 资产跳转、原子暂存；恢复时重新验签、核对实际 build 与 APK 摘要。Android 再核对 APK 的 package/versionCode/versionName/minSdk、完整 signer 集合、当前安装证书和 native ABI，向 PackageInstaller 流式写入时再次验摘要。只允许私有 NSH updates/update.apk 路径。

下载前检查空间，写入失败清理局部文件；取消等待本次下载收尾，不能把局部包交给安装器。安装前排空进度写入并重试失败记录，保存失败不安装。授权拒绝、系统取消和安装失败保留校验后的包，旧版和游客库不删除。安装失败还可显式重新下载，避免损坏包只能重复安装。系统安装回调落盘；只有实际安装版本匹配预期 build 才算成功。

成功回执只消费一次；下一次已暂存候选优先于旧成功状态。桌面异步操作结束后仅在没有新输入意图时恢复主按钮焦点；TV 宿主识别公开 `navigation-primary-*` 身份，在新页面内容到达且可操作时交接焦点，后续遥控输入优先。入口和返回的 Android 验收使用原生焦点与 DPAD 确认。

TV 自定义打包必须保留 NSH 输出的 `capabilities.json`，与 `bundle.nshc`／`app.json` 一起装入 APK。`app.json` 仅保存应用 ID，不携带能力声明；打包会逐字节回读三份文件，拒绝漏装或旧 bundle。

## 验证

可复现命令：

```sh
pnpm verify
pnpm test:desktop-updates
pnpm test:tv-updates
pnpm security
```

- Rust updater 4/4：精确原始字节和域分隔签名、错误身份／URL／证书／ABI／大小、流式下载／坏哈希／截断／取消、重启重新验签与已安装缓存清理。下载 response seam 只用于测试；生产不能注入本地 URL、公钥或 API origin。
- 共享更新状态测试 4/4：失败观看写入重试、不让旧失败集覆盖新集、初始化／检查重试、离页下载、迟到进度隔离、取消与手动下载、保存失败阻止安装、实际安装确认与下一候选优先。headless 不代表系统安装完成。
- macOS 图形原生宿主浅深各 1 个流程通过；合成 adapter 覆盖可更新／下载／准备好／保存失败和 hover，Enter 连续启动下载与安装前保存。截图在 `artifacts/client-updates/macos/`，只验证实际页面与交互，不代表 NSH 正式更新替换通过。
- TV 生产入口独立 debug APK 的实际 Android 版本桥接、非法私有路径拒绝、拒绝时不创建 session、合成回执不能冒称成功／实际版本匹配只消费一次、无 Release 时诚实可重试、主按钮及返回来源原生焦点均在固定 API 34 arm64 模拟器验收。浅深及 1.3 字号分别记录 `artifacts/client-updates/tv/`；测试 `adb install -r` 保留应用数据并恢复主题／字号。没有把打开安装器或模拟回执计为真实升级。
- 圆角、字阶、间距、对齐和浅深表面复用既有主题与控件，并检查上述实屏；hover 已在 macOS 观察，键盘和遥控主动作通过。页面入场与按钮反馈复用共享动效，进度原位变化；静态截图不证明逐帧动效、减少动态或 VoiceOver／TalkBack 人工验收。

完整源码验证结果追加于 [VALIDATION](../VALIDATION.md)。更新专项日志和截图保存在 ignored `artifacts/client-updates/`，不会进入源码或 Release。

## 正式发布前的剩余项

`Publish release` 已将相同源码 SHA 的完整验证和安全检查设为签名构建前置依赖。TV 三个构建 workflow 共用工具准备：仓库 JDK 版本用于 NSH CLI，`TV_JAVA_HOME` 的 JDK 17 用于 Gradle，显式安装固定 SDK／NDK、Rust targets 和 NSH runtime；action 固定提交。准备方式遵循 [setup-java](https://github.com/actions/setup-java) 和 [sdkmanager](https://developer.android.com/tools/sdkmanager) 官方用法；尚未据本地静态检查声称 GitHub runner 已通过。

正式 workflow 在创建草稿前确保 tag 已指向源码 SHA：不存在时只创建新 ref，已存在时拒绝不同提交，不改写 tag，再用 `gh release create --verify-tag` 创建草稿。上传前仍复核 tag，避免依赖草稿阶段自动建 tag 的时机。实际 workflow 的 shell 已通过 5 种模拟 CLI 场景（首发／正确旧 tag／错误旧 tag／API 失败／并发建 tag 冲突）；这是本地控制流验证，未写入远端。命令语义见 [GitHub CLI](https://cli.github.com/manual/gh_release_create)。

工作区关闭未使用的 `nsh-base` 默认功能后，`pnpm security` 仍因五项许可证拒绝及 ttf-parser 的 unmaintained advisory 失败，未放宽策略或添加忽略；独立 `pnpm audit --audit-level moderate` 无已知漏洞。NSH CLI 生成的宿主仍启用语法高亮，不能把根锁文件移除 bincode 解释成发行二进制已移除该依赖，分析与剩余范围见 [原生发行依赖检查](dependencies/native-release-security.md)。正式发布继续被安全门禁阻断。签名 environment 的六个 secret 名称已只读确认，未输出或提交值。

远端 Actions、正式签名 N-1 → N、macOS 实际重启替换／Developer ID 与公证、Android 真正未知来源授权／系统安装／拒绝／进程重启升级、物理 TV／硬解／长播、Windows／Linux、人工读屏和减少动态仍未验收。当前公开仓库没有 Release；在首次成功公开两版之前，不能宣称自动更新端到端完成。没有推送源码或创建正式 Release。
