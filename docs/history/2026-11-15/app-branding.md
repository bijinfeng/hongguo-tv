# 应用名称与品牌图标检查 · 2026-11-15

历史记录，非当前实施指令。本次只涉及品牌资源、三端 manifest 和 TV 自定义宿主资源装配；基于 `c754c3e` 后的未提交工作树，其他并行功能改动保留，不据本次打包宣称整个 MVP 已验收。

用户提供 536×536 WebP，保持原图形转换为 PNG。资源与维护入口见 [品牌资源](../../../packages/ui/assets/brand/README.md)。三端名称保持“红果”，应用 ID 不变。

## 检查结果

- 三端 `nsh check`、`nsh build` 通过；更换高清图片后重新 build。日志为 `artifacts/app-branding-{web,desktop,tv}-{check,build}.log` 与 `*-build-final.log`。
- Web 正式入口重新打包；核对 HTML 标题、favicon、apple-touch-icon、manifest 的 name／short_name、192／512 图标实际尺寸，以及页面 Logo 的新内容摘要。产物在 `artifacts/app-branding/web/红果/`，日志 `artifacts/app-branding-web-package-final.log`。
- macOS mixed 正式入口重新打包；Info.plist 的显示名称／包名称均为“红果”，AppIcon.icns 存在并可解码为 PNG，页面 Logo 与共享高清源逐字节一致，`codesign --verify --deep --strict` 通过。产物在 `artifacts/app-branding/desktop/红果.app`，日志 `artifacts/app-branding-desktop-package-final.log`。这是本地 ad hoc 签名包，不是正式签名／公证发行。
- Android TV 在更新当前 NSH bundle、页面 Logo 与共享启动图标后执行 `assembleDebug lintDebug`，通过；`aapt2 dump badging` 确认 label 为“红果”、启动图标与横幅均已声明，APK 内启动 PNG 和页面 Logo 均与共享 536px PNG 逐字节一致。日志 `artifacts/app-branding-tv-gradle-final.log`，元数据 `artifacts/app-branding-tv-badging.txt`。沿用现有 native library，只验证本次品牌装配，不代证完整当前业务包。
- 品牌定向 Node 回归 2/2、对应 Oxlint／Oxfmt 和 diff 检查通过。首次额外运行的 workspace 测试为 11/12；既有 hook 测试在临时仓库的 pnpm 非 TTY 安装阶段失败，保留 `artifacts/app-branding-tests.log`，未修改 hook 或放宽断言。定向最终结果 `artifacts/app-branding-tests-final.log`。

没有安装或启动这些包，避免影响并行账号验收与凭据；未观察系统启动器／Dock 的实际显示，Windows／Linux 安装、物理 TV、浏览器安装及正式发行均未验。没有运行完整 verify、安全门禁，没有提交、推送或发布。原有失败不会被本次品牌配置检查替代。
