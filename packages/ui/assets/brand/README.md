# 应用品牌资源

`app-icon.png` 来自用户提供的 536×536 高清 WebP，仅转换为 PNG，不改变图形、颜色或产品名称；圆角方块以外为透明，内部像素与源图逐字节一致。Web、Desktop、TV 的 `nsh.json#icon` 均指向此文件；NSH 生成各端安装图标及 Web favicon、触屏图标和 manifest 图标。各入口的 `assets/hongguo-logo.png` 保持同一份字节，供正式页面及显式验收入口导入；品牌回归检查其一致性。

原导出把圆角方块压在白底上，四个角是不透明白色，24／28px 页面 Logo 和 TV 启动图标都因此露出白边；现在只清除方块外的底板，图形与白色播放窗口保持原样。品牌回归 `tooling/test/app-branding.test.mjs` 校验四角透明且方块中心不透明，防止白底再次混入。

Android TV 自定义宿主由 `tooling/src/tv-host.mjs` 将同一文件复制到生成资源目录，启动图标与 TV 横幅共同引用它；应用名称直接读取 `apps/tv/nsh.json#name`。不修改应用 ID，保留原数据目录与升级身份。

后续替换品牌资源时同步更新源图与三端页面副本，保留同一图形；各安装尺寸由打包器生成，不将放大图当作更高分辨率原稿。品牌标识属于 DESIGN 的 Lucide 规则例外。

本次包内资源检查与未验范围见[品牌配置检查记录](../../../../docs/history/2026-11-15/app-branding.md)。
