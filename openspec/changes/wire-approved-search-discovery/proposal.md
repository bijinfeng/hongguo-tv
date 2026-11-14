# Proposal

## Why

Rust 已提供匿名搜索发现数据，但定稿找剧页的建议与海报区域尚未消费。接通同一共享 UI，让用户在未输入关键词时直接找剧，同时保留最近搜索和既有分页／返回位置。

## What Changes

- 共享 Search 在活动且关键词为空时读取匿名发现；取消、迟到响应、空结果与失败重试有明确语义，不发送本地关键词或历史。
- 沿用定稿：桌面最近词／建议 chips 与已有 poster grid；TV 最近词与“试试这些故事” shelf。只使用真实数据，短剧／漫剧有准确标题，不复制 legacy 的另一套热榜界面。
- 关键词建议执行普通搜索并按既有规则保存最近词；有精确系列身份的卡片打开详情，返回恢复焦点／阅读位置。搜索结果分页与历史写入保持原语义。
- 补共享状态／交互回归与 Web、macOS 两尺寸浅深及 TV fixture 宿主验收，独立审查后本地提交。

## Capabilities

### New Capabilities

- `search-discovery-surface`: 定稿找剧页对匿名建议与热门短剧／漫剧的可取消读取、卡片／关键词交互与跨端状态反馈。

### Modified Capabilities

无。已完成但未归档的 `anonymous-search-discovery` 核心契约作为本批依赖，不在此复制修改。

## Impact

packages/app（状态、页面与测试）、现有 fixture／宿主验收、DESIGN动效清单与VALIDATION。复用现有 SearchDiscovery 生成契约、Controls／Button／PosterCard和同一宿主transport，不改后端协议、数据库、依赖、Go或发行。输入时联想、筛选／推荐频道和其余MVP范围继续单列，不以本批替代。
