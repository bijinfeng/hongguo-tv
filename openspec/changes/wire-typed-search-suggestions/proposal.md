## Why

Rust 联想和演员作品协议已迁移，但共享搜索仍只提交普通关键词。接入定稿搜索输入的实时建议及演员作品流，才能让三种建议各自进入正确内容并保留输入、位置和焦点。

## What Changes

- 共享联想生命周期支持240ms防抖、输入法组合、取消／迟到隔离、关闭与重试，使用既有 typed HTTP/native 契约。
- 同一搜索输入下的建议列表按剧集／演员／关键词触发详情、演员作品或普通搜索，不把opaque key当搜索词或系列身份。
- 演员作品通过既有页面栈与定稿海报grid／TV shelf呈现，加载、失败重试、空态及精确来源恢复明确；不宣称全网全部作品。
- 普通提交保留80 Unicode scalar／100 UTF16与control规则；无效输入保留原文和焦点，剧集／演员ID激活不受展示名长度影响。

## Capabilities

### New Capabilities

- `typed-search-interaction`: 三端共享搜索建议、输入边界、对应导航及返回语义。

### Modified Capabilities

无。

## Impact

packages/app拥有查询、激活、导航与生命周期；packages/ui拥有输入、建议弹层、海报与状态外观。宿主入口保持薄层，共用现有DTO，无新增依赖或数据库变更。保留分页、最近搜索、发现、播放及观看历史规则；本批不关闭其他D/E/F/G、C3.2或发行项。
