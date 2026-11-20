# Proposal

## Why

匿名分类核心已迁移，但定稿找剧筛选尚无真实入口。搜索页与分类页需要按原型区分，避免把官网关键词结果在本地筛成假分类。

## What Changes

- 新增共享找剧分类页，桌面三行筛选、TV三个紧凑选择器，复用海报grid／shelf、详情与精确来源恢复。
- 独立页面controller拥有明确全部、动态题材／类型、真实排序、取消、迟到隔离、分页session／offset／shown和重试。
- 保留现有关键词搜索、最近词、发现和联想；分类无q，不声称支持关键词组合筛选。
- 真实图形宿主与TV模拟器观察、独立功能及UI审查、完整验证后仅本地提交。

## Capabilities

### New Capabilities

- `category-browsing`: 定稿分类筛选、跨宿主页面生命周期、独立分页和来源恢复。

### Modified Capabilities

无。当前主spec库存为空，前序变更尚未归档。

## Impact

packages/app、packages/ui及测试／fixture／验收工具；无Rust DTO、依赖、持久状态或upstream变化。完整D/MVP及现存安全／发行边界继续开放。
