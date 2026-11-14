## Why

输入联想已经保留演员身份，但 Rust 仍缺少按演员 ID 获取作品的能力。独立迁移固定官网演员页，才能让后续共享联想界面进入真实作品列表，而不是将演员姓名当普通关键词。

## What Changes

- 在 Rust catalog 增加匿名演员摘要及有序作品列表，严格绑定请求身份并限制响应、字段与列表规模。
- 提供严格 HTTP/native 只读入口、生成契约、离线样本与取消／失败回归。
- 本批无可见 UI 改动，联想弹层与演员作品界面作为后续独立切片；普通搜索与最近词限制不变。

## Capabilities

### New Capabilities
- `actor-works`: 通过精确演员 ID 读取匿名官网演员摘要及其作品。

### Modified Capabilities
无。

## Impact

crates/core、http-api、native-bridge、contracts 与生成类型；无新增依赖、数据库写入、登录或 Go 链路。复用匿名目录请求、超时和取消机制。
