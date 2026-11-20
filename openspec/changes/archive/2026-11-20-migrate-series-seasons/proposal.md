# Proposal

## Why

完整MVP需要系列切季和可靠的下一季关系，当前Rust目录仅有单剧详情。迁移固定上游的两个官方只读关系入口，为后续定稿选集／连续观看提供身份明确的数据。

## What Changes

- 完整同IP系列列表保留官方顺序、季号／标签、上线与禁播状态；预告不当正片。
- 下一季读取在当前季缺失时进行一次反向关系确认，只选择最近可播放后继，冲突／未确认明确失败。
- 共用有界匿名签名传输、严格HTTP/native输入、生成契约、取消与离线回归；显式探针仅输出计数。
- 本切片不接可见UI、自动跳转、账号预约写入或创作者专辑，不以核心通过关闭完整系列功能。

## Capabilities

### New Capabilities

- `series-seasons`: 官方系列列表与经过当前季身份确认的下一季关系。

### Modified Capabilities

无；主spec库尚为空。

## Impact

Rust catalog、既有anonymous transport、HTTP/native与OpenAPI／TypeScript契约，新增合成fixtures及探针。无新依赖／数据库／Go／UI变化，不修改固定upstream。
