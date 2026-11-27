# Mobile-v5 播放取源

第 2 路模型源，位于 `video_tab` 之后、旧 `multi_video_model` 之前。它是第二条取源路径，不替代任何既有路径；前三路仍按各自预算继续。

## 为什么存在

`video_tab` 与旧 multi 在部分匿名注册身份上会持续返回 **HTTP 200 空正文**（上游 issue #12 / #109 的实测症状）。上游在 2026-11-16 增加了这条移动端链路，配合「空正文只轮换一次身份」来绕开这类身份。`crates/core/src/playback/provider/mobile_v5.rs` 对齐这一行为。

## 协议形状

- `POST https://api5-normal-sinfonlinea.fqnovel.com/novel/player/multi_video_model/player/v1`，路径无结尾斜线。
- body 为 gzip JSON，`mixed_video_id_map` 保留所选内容类型（默认 `1004`），`dr_scene=player`。
- query 只含固定 13 个移动端字段，签名时追加 `_rticket`；不发送 `ts`、`cdid`、账号 Cookie。
- 两个字段不是可选项：`manifest_version_code=74332` 必须出现在最终 query 并参与签名，播放证明字段 21 使用 wire 值 `738`（zigzag 前 `369`）。任一退回到旧值都会得到 HTTP 200 空正文。
- 仅发送 `X-Khronos` / `X-Helios` / `X-Medusa` / `X-SS-STUB` 与请求票据；不带 Argus、Gorgon、Ladon。
- `X-SS-STUB` 是**实际压缩字节**的 MD5。
- 签名使用 F13 branch 低半字节 12，只微调 `_rticket`（最多 1024 次）命中。
- 身份缓存在 `Profile::MobileV5` 独立槽，与 tab、旧 multi、新旧 single 和账号彼此隔离。

## 失败与恢复

- 只有**确认 HTTP 200 空正文**才轮换一次该源自己的身份；其他错误保留当前身份，交给既有来源序列决定是否继续。
- 明确业务拒绝、取消、存储或指定清晰度限制不触发轮换，也不扩大重试。
- 该源单次上限 4 秒，与旧 multi 合计受 14 秒族预算约束，总模型预算仍是 30 秒，不重置。
- 只接受所选集自身的模型；不猜测别集、不取首条、不走 direct-model 兜底。响应上限 2 MiB。

## 验证

签名层以固定向量逐字节校验（`crates/core/src/playback/sign_v5/vectors-*.json`，来自参考实现用合成身份生成的 40 组样本）：

```sh
cargo test -p hongguo-core --lib playback::sign_v5
```

覆盖 32 组 F13 时间旋转、4 组 carrier 时间变体、4 组完整 wire（query + Medusa + Helios）。wire 向量已对齐上游 2026-11-23 修复后的签署器，`manifest_version_code` 参与签名且字段 21 为 `738`。

真实接口验证需显式开启，且结果不代表上游长期承诺：

```sh
cargo run -p hongguo-core --example playback_probe -- --live <搜索词> .local/playback-probe
```

2026-11-20 首次实测时，上游该端点与本项目其余来源同样返回 `HTTP 200` + 0 字节；当时归因为上游行为。2026-11-23 上游定位到这是本项目协议字段缺失导致的签名不合格，而非上游下线：补上 `manifest_version_code` 与字段 21 的 `738` 后，同一批请求立即返回候选源。

2026-11-24 本机复验（Ubuntu，`master` @ `9d704e4` 加本次修复）：修复前对「重生」「甜宠」两个真实入口分别得到 9 路 `PLAYBACK_SOURCE_EMPTY` 并最终失败；修复后 `video_tab` 仍空，但 `MobileV5` 直接返回模型，「重生」「甜宠」「逆袭」「穿越」四剧分别准备出 7.95 MB／10.16 MB／3.94 MB／6.34 MB 的 HEVC 媒体（1080P／720P）。同一路径经正式 HTTP 入口 `GET /api/v1/play/info` 返回 `ok:true`、`video_codec:hevc`、`quality:1080P`，代理 Range 请求返回 `206` + `video/mp4`，`ffprobe` 识别 HEVC 1920×1080 + AAC 91.37 秒，`ffmpeg -f null` 全片解码无错误。

以上是取源与媒体准备的证据，不等于各宿主播放器已实看：macOS 桌面与 TV 模拟器的首帧、进度、暂停恢复和后台仍需按 VALIDATION 分别验收；物理设备按平台限制记录。

## 许可

本模块的互操作常量（magic／key／SBox／hash 表）与协议形状来自参考实现，见[第三方声明](../THIRD_PARTY_NOTICES.md)。`crates/core/src/playback/sign_v5.rs` 与 `provider/mobile_v5.rs` 是在阅读上游 GPL-3.0-only 实现后编写的 Rust 实现，**不是** clean-room 复现；该部分的许可归属需在公开发行前由项目所有者或法务确认，不得仅凭仓库根 LICENSE 推定。
