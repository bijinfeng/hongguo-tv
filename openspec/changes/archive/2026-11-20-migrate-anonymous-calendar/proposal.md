# Proposal

## Why

首期新剧和上新日历仍未迁移。先提供匿名只读核心与严格共享契约，让后续定稿UI能区分已上线和待上线并遍历完整日期，而不虚构预约账号状态。

## What Changes

- 迁移固定新剧GET与gender/offset/session；复用既有匿名签名传输和剧目摘要。
- 迁移日历date/schema、初次省略subscribe_offset、已上线/待上线双游标与down_has_more。
- 已上线剧与待上线预告采用互斥类型；预约身份不冒充播放series_id，不输出匿名预约成功。
- HTTP/native共享严格输入、取消、边界及脱敏错误；生成OpenAPI/TS，增加合成样本和显式只读探针。

## Capabilities

### New Capabilities

- `anonymous-release-calendar`: 匿名新剧、上新日期及可恢复的全日历双游标读取。

### Modified Capabilities

无；主spec库尚为空。

## Impact

Rust catalog、现有anonymous signed transport、HTTP/native、OpenAPI/TS与离线tests。无依赖、数据库、Go、upstream、账号写或可见UI改动。新剧日历共享UI、真实预约账号与完整MVP继续分批实施。
