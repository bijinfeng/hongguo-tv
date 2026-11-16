# 详情演员与相关作品验收批次

更新时间：2026-11-16。该批次只记录详情演员、相关作品、切季和来源返回；评论、弹幕、剧评与点赞不在范围内。

## 结论

- 共享 Web fixture 宿主通过 4/4：1180／1440 两种宽度，浅色／深色各一轮。覆盖演员入口、后段演员作品、后段相关作品、精确来源返回、切季后扩展数据归属和只读请求。
- Android TV 输入适配通过三档：light 53/53、dark 53/53、large-text（1.3）54/54。覆盖 DPAD 读取无 ID 演员、长姓名、演员作品、后段相关卡、重复返回、空扩展季和切季恢复；未产生媒体或写请求。
- 正式匿名 Web 入口未通过：`tooling/src/live-discovery-host.mjs macos --anonymous-live` 在浅色／深色均停留在首页，等待主窗口获得焦点超时。运行时 API 只收到 `/api/v1/account`，当前 macOS 锁屏；没有用 fixture 代替真实数据，也没有把该功能标为真实验收通过。
- macOS 图形宿主和物理 TV 仍未观察；Android 结果是隔离 TV 输入适配包，不等于物理遥控、硬解或发行 APK。

## 工具修复

TV 隔离验收脚本此前复用生产 Manifest，却漏注入 `app_name`，也漏挂 NSH 生成的 `android-host/res`，导致资源链接阶段失败。`tooling/src/rankings-tv-remote.mjs` 现在注入验收应用名并复用生成资源；生产应用与产品资源未改动。

## 证据

- Web fixture：`artifacts/detail-extras-ui/web/2026-11-15T23-52-49-146Z/`
- TV adapter：`artifacts/rankings-ui/android-real-adapter/2026-11-16T00-00-04-094Z/`
- 正式匿名失败：`artifacts/live-discovery/2026-11-15T23-50-16-790Z/`
- 运行源码：`packages/app/src/pages/Detail.tsx`、`packages/app/src/DetailExtras.tsx`、`packages/app/src/season-detail.ts`、`tooling/src/detail-extras-host.mjs`、`tooling/src/rankings-tv-remote.mjs`

## 工程与 UI 审查

功能审查确认演员 ID 与剧集 series ID 分离，无 ID 演员保持静态文本；相关条目按真实顺序保留，返回按精确来源与稳定身份恢复，切季不会泄漏上一季扩展数据。UI 审查确认演员段在选集后、相关段在演员后，空段隐藏，公共 Button／Cover／焦点轮廓和 token 在桌面／TV 共用；TV 只调整密度与 DPAD 读取区域，大字仍可读。真实网络数据和 macOS 图形焦点仍待解锁后补验。
