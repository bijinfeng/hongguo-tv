# 目录 HTTP/TLS 依赖

2026-11-13：固定 reqwest 0.13.5、rustls 0.23.46，禁用 reqwest 默认 feature，使用 rustls-no-provider 与 ring。保留宿主已有 CryptoProvider；独立进程尚未安装时显式初始化 ring，避免 reqwest 因缺 provider panic。网络 client 构造失败不能发布 ready。

检查了 Cargo 下载包中的原始 LICENSE；`deny.toml` 只为下表版本增加例外，不扩大全局许可证集合、不忽略 advisory、不减少来源检查：

| crate             | 精确版本 | 许可证              | 发行要求                                                           |
| ----------------- | -------- | ------------------- | ------------------------------------------------------------------ |
| ring              | 0.17.14  | Apache-2.0 AND ISC  | 保留 LICENSE、LICENSE-other-bits、LICENSE-BoringSSL 及随包 notices |
| rustls-webpki     | 0.103.17 | ISC                 | 保留版权、许可与第三方 notices                                     |
| untrusted         | 0.9.0    | ISC                 | 保留版权和许可                                                     |
| webpki-root-certs | 1.0.12   | CDLA-Permissive-2.0 | 随证书数据分发协议全文                                             |

升级版本需要重新检查原包许可证、`cargo deny --locked check` 和本地网络边界测试。正式包的 notices 汇集属于发行门禁，当前未声明已生成正式包。

并行 TV mixed 工作区引入的 NSH 依赖另有许可证与停止维护告警，保留失败，不用此表豁免。当前结果见根目录 VALIDATION.md。Android/JNI TLS 初始化、真实网络和发行环境仍需单独验证；本机 anonymous probe 不替代 Android 验收。
