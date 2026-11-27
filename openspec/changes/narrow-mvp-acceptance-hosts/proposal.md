# Proposal

## Why

MVP 的验收口径此前继承「每端每种宿主都要单独取证」的写法：桌面要 macOS／Windows／Linux 真机，TV 要模拟器加物理电视、真实遥控、硬解、4K 与观看距离。实际结果是验收被环境占满——本机只有 Linux，于是桌面数据页被 NSH 的 `lifecycle()` 缺陷卡在骨架屏；没有物理电视，于是模拟器上已经通过的遥控、IME、焦点与字号矩阵仍然只能记「部分验收」。这不是产品缺陷，是验收标准比产品目标更宽。

用户已确认收窄：MVP 只看两个宿主，TV 用固定模拟器，客户端用 macOS 真机。

## What Changes

- MVP 验收宿主收窄为两种：桌面为 **macOS 真机**，TV 为 **固定 API34 arm64 AVD 模拟器**（`hongguo-tv-api34-arm64`）。
- TV 的 DPAD、媒体键、硬件 Escape 与系统 IME 由模拟器注入，**属于 MVP 验收范围**；模拟器通过即视为该端通过，不因「非物理设备」回退。
- 物理 Android TV（真实遥控、硬解、4K、真实 overscan、观看距离）与 Windows／Linux 真机安装升级改为**平台限制**：事实与原因继续记录在 VALIDATION，不再是 MVP 完成条件，也不删除。
- Windows／Linux 仍是构建目标：`pnpm check`／`build` 与 preview 产物继续跑，失败仍按构建兼容问题处理，但不再阻塞 MVP 验收。
- 受影响文档就地改写：ENGINEERING §9 新增验收宿主矩阵并调整 §5／§8／§10，PRODUCT 平台范围，DESIGN 验收协调段，ARCHITECTURE 与 TV_DEVELOPMENT 的「不能互相代证」表述，台账／路线／VALIDATION 的当前状态，以及 9 份功能与组件文档里的物理设备措辞。
- 活跃变更中被物理设备阻塞的退出条件改为「模拟器」或「平台限制」；三份主规范里把物理电视写成必须显式保留的边界，改为区分「记录事实」与「MVP 阻塞」。

## Capabilities

### Modified Capabilities

- `visual-surface-system`：验收宿主表述；不改变任何视觉契约。
- `radar-snapshots`：host parity 要求中「未验物理设备边界必须显式」保留，但明确它不阻塞 MVP。
- `typed-search-interaction`：跨宿主观察的宿主集合改为 macOS 与 API34 模拟器。
- `category-catalog`：诚实审查要求中剥离物理电视作为 MVP 阻塞项。

## Impact

只改文档与 OpenSpec，不改产品源码、契约、依赖或测试。“MVP 尚未完成”的结论不变：仍有真实播放、账号上传、进度统计等开放失败，它们与本次收窄的宿主范围无关。

按 ENGINEERING §11，纯文档变更只跑格式、相对链接与 OpenSpec 校验，不重跑产品构建。
