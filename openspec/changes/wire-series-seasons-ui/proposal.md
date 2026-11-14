# Proposal

## Why

匿名系列／后继核心已迁移，但详情和播放器仍只显示当前作品选集。接入定稿选季布局，让观众浏览完整系列、选择真实可播集，并在已确认的末集结束后继续下一季。

## What Changes

- 共享 SeasonChoice／SeasonPicker，桌面详情选集区与播放器右栏、TV／全屏选集面板保持同一语义，状态只来自可播资格、实际播放和真实观看历史。
- 选季只改变浏览上下文；详情、简介、选集与续播跟随选季并按真实身份缓存。预告／不可播季不读取可播选集、不准备媒体、不写历史或伪造预约。
- 只有确认合法选集或真实末集结束后的已验证后继才切实际媒体；请求、缓存、焦点、历史和推荐来源分别保留身份，较新操作拒绝迟到回调。
- 删除播放器残留评论与点赞入口，继续用户已确认的安静观看范围。

## Capabilities

### New Capabilities

- `season-browsing`: Shared season browsing, independently owned playback selection and confirmed automatic continuation across desktop and TV.

### Modified Capabilities

None.

## Impact

packages/app 的系列状态、选季组合、浏览详情缓存、Detail／Player／Feed 和独立验收入口；packages/ui 的单一 SeasonChoice。复用已有 Rust DTO、HTTP／native adapter 与播放历史队列，无新依赖或账号写能力。交付源码和验收输入均在主仓，不继承旧 worktree 的完成勾选或通过记录。
