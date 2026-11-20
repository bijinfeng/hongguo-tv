# 第三方声明

本文件记录随本项目源码或二进制分发、但不是本项目自有代码的来源与许可要求。

## Mobile-v5 播放取源

`crates/core/src/playback/sign_v5.rs`、`crates/core/src/playback/provider/mobile_v5.rs` 与
`crates/core/src/playback/sign_v5/tables.rs` 实现了红果移动端 v5 播放取源协议。

- 协议形状、互操作常量（magic、key、SBox、hash 表、F13 seed 与初值）以及固定测试向量，
  来自 [`aston314/hongguo-tv`](https://github.com/aston314/hongguo-tv) 的
  `core/cmd/hongguotv/playback_v5_{sign,carrier,constants}.go` 与 `testdata/signing-v5-*.json`；
  该上游文件标注 `SPDX-License-Identifier: GPL-3.0-only`，其自身又源自
  [`N3urda/hongguoTV`](https://github.com/N3urda/hongguoTV) commit `18c37c2`。
- 本项目的 Rust 代码是在阅读上述实现后编写，**不是** clean-room 复现，因此
  **不能**仅凭仓库根目录的 LICENSE 推定该部分为宽松许可。
- 公开发行前，该部分的许可归属与再分发义务必须由项目所有者或法务确认。在此之前，
  把本项目整体按宽松许可对外声明是不安全的。

测试向量 `crates/core/src/playback/sign_v5/vectors-*.json` 由参考实现以合成身份、合成
process nonce 与合成 nonce 生成，不含真实注册身份、账号凭据、媒体地址或内容密钥。

## 图标

界面图标使用固定版本的 Lucide 官方 SVG，许可证见
[`packages/ui/assets/lucide/LICENSE`](../packages/ui/assets/lucide/LICENSE)。
设计稿原型中的第三方资源许可证见对应目录内 LICENSE。
