# 游客历史 SQLite 依赖

固定 rusqlite 0.42.0、libsqlite3-sys 0.40.0，关闭默认 feature，仅启用 bundled；当前不需要 statement cache、WASM SQLite 或动态扩展。随 crate 编译 SQLite 3.54.1，不要求用户安装系统数据库。

已检查 Cargo 原包的 rusqlite/LICENSE、libsqlite3-sys/LICENSE（均 MIT）及 sqlite3/sqlite3.c 来源标记。发行保留原版权与许可、SQLite 来源信息，第三方 notices 的正式汇集仍属于发行门禁；不新增许可证或 advisory 例外。

版本和打包依据：[rusqlite 官方说明](https://docs.rs/crate/rusqlite/latest)。升级时重新检查锁文件、原包许可证、cargo-deny、事务失败/版本保护测试及对应宿主构建；本机 bundled 编译通过不代表 Android/Windows/Linux 已验收。
