# 共享排行榜

排行榜消费 Rust 已迁移的匿名 `GET /api/v1/lists/rank`；桌面主导航和 TV「新剧与热播」「更多找剧方式」进入同一控制器与页面。源码只在主项目目录实施，旧 worktree 作为只读迁移参考。

## 数据与所有权

- `rank`／`rank_sub`／`rank_panel` 使用服务端不透明 ID、标签和树；空字符串是合法选项。默认选中仅用于展示，不把默认提示写回首次请求。换父维度清除依赖选择及续页上下文。
- 首屏省略续页参数；续页精确保留 offset、session 和最多 128 个唯一原始 decimal shown ID，按最后一次出现顺序保留。空推进页继续可翻；停滞／越界游标明确失败，重试重复同一路径。
- 展示按 `kind:id` 去重。相同原始 ID 的演员和剧目各保留一项；演员进入作品，剧目进入详情，不把演员当作可播放剧集。只展示真实 badge／heat，不补造名次：`cell/change/v` 不返回任何名次字段，行内因此没有名次槽，也不按顺序推算 1、2、3。
- 剧目行读取该接口自己的字段（2026-11-19 用 `--anonymous-live` 核对）：`title`、`video_desc`、`episode_cnt`、可直接展示的 `sub_title`（如"逆袭·全319集"）和 `rec_text_item.RecommendText`（如"8907万热度"）。详情页别名 `series_title`／`series_intro`／`heatText` 不在本接口响应里；`cell_data[].ugc_user_data` 只在演员榜出现。改动前这些别名导致行标题与简介落空。
- controller 使用 revision、AbortSignal、活动页面、真实 background 和 dispose 共同拒绝迟到结果。窗口可见 inactive 继续读取；页面隐藏取消待办，已完成页保留，短暂返回不重新请求。错误经共享映射，不展示任意后端原文。

## 布局与输入

页面只组合共享 Button、CardControls、RankingCard、UiText、Notice、ContentArrival 与 NSH List／Scroll。一个 UI 包、一份行为；桌面一列，TV 两列。演员使用既有 Avatar lg，剧目使用 Cover；整行一个动作，选择与焦点独立。

动态筛选保留全部选项。选项一行放不下时换行，不使用横向滚动条。收起态只渲染前三组（榜单、子榜、第一个筛选组），底部一行的「展开筛选」按钮切换全部组，展开后按钮变为「收起筛选」。收起态若有被隐藏的组已被用户显式选中，按钮旁显示「已选 N 项」；服务端为每组下发的默认选中不计入该数量。展开态按页面高度取预算并累加**实测的完整组高度**，只在完整行之间结束、不裁半行；密集榜单（最多 32 个面板组）因此在筛选区内纵向滚动，榜单条目始终保留在下方。换榜单（根维度变化）时回到收起态；在已展开的组里改选项不收起。

TV 使用同一收起／展开模型与同一预算，只是每组渲染成「组名 + 单选下拉」：遥控无法扫读 chip 行，裸值也不说明改的是什么，因此沿用 `FilterChoices variant="select"`（与雷达控件带一致）。桌面 chip 的 `ranking-choice-*` 与 TV 下拉的 `ranking-group-*-trigger` 是两条不同交互路径，验收要分别走；下拉只在不同值时才上报变更，默认即选中的组没有可观察的提交。

结果用虚拟行与稳定槽位；每个虚拟行保留焦点环安全区。详情／演员作品返回先恢复缓存视口，来源未挂载或不完整可见时才居中定位。scroll 后重新测量，只主动复测一次；未稳定时等待 ref／layout 通知，不直接聚焦被裁切的行、不无限排帧。异步测量再次核对列表 owner、新输入意图及 ref 身份。

加载更多保持原位置等待状态，阻止重复提交；失败保留结果和同页重试。终页移除入口时，仅所属未被新输入替代的意图交回当前榜单选择；换榜或新的导航焦点不被旧终页覆盖。

Android 遥控先浏览当前滚动区域，再离开到区域外的对齐控件。同一范围内临时禁用的来源保留稳定 ID、页面及输入代次；重新启用或换原生 View 后仅在没有更新输入时恢复。弹层遮盖、`focus-entry-*` 替换内容和页面返回继续使用原有来源恢复，不能按临时禁用处理；替换内容之外被遮盖的来源即使同 scope 也不属于临时禁用。此适配属于 TV 宿主，不在榜单页复制遥控规则。

## 动效清单

- 榜单／子榜／面板使用共享 Button 和 CardControls：hover、pressed、selected 复用控件 fast 反馈，焦点独立于选择；减少动态时即时反馈。
- 首次成功内容用 `ContentArrival`（180ms／8 单位／ease-out），减少动态时关闭位移；续页和虚拟行回收不重播进入。
- 加载文案在原位置更新，pending 保留来源目标；失败用现有 `Notice`，重试保留已完成条目。无弹层、拖动或声音。
- 官方榜头部沿用暗红渐变（`#5c120d → #8f2417 → #3b1311`）与白色文字，不加装饰投影；来源 Tabs 在头部之上，雷达头部只保留控件带，不重复标题区。
- 验收须观察 harness（Chromium）、macOS、TV 的浅深与大字状态，未观察项不可算通过。

## 可重复验证

```sh
pnpm check
pnpm build
pnpm test --target harness
node tooling/src/rankings-host.mjs web
node tooling/src/rankings-host.mjs macos --foreground
node tooling/src/rankings-tv-remote.mjs run --suite identity --profile light
node tooling/src/rankings-tv-remote.mjs run
node tooling/src/rankings-tv-remote.mjs run --suite player --profile all
```

TV 命令使用独立 API34 模拟器验收包，复用生产 MainActivity／TvRemote Java 和共享 TSX。默认七组榜单 suite 通过合成只读 HTTP source 验证输入；单独的 `player` suite 复用既有 PlayerAcceptance 和自制媒体 fixture，检查共享输入适配的播放器、弹层及嵌套 Select 回归，仅在 fixture 内写播放历史，不访问真实账号。两类请求边界与结果分别记录，不把媒体回归计为榜单读取。

工具不跑 Cargo、不覆盖生产 APK；保存并恢复生产 APK 路径／SHA、前台、字体、主题和 reverse，卸载本次独立包。可用 `--suite`／`--profile` 定向复现。harness／macOS 工具不覆盖运行配置，显式生成 ignored 验收入口。

RankingCard 独立样例与测试说明见 [UI 包](../../packages/ui/README.md#rankingcard)。实际执行结果和已知失败归因见 [VALIDATION](../../VALIDATION.md)，不能把测试源码、headless 或 Mac 的 TV 密度当作 Android 遥控通过。

## 范围

本批不写历史、收藏、追更或预约，不触发媒体，不伪造成功；不扩展 Rust DTO 或依赖。原型五轴评分已取消。固定上游 `radar.go` 第三方榜单快照／增长列表仍是后续独立迁移范围，不能删成「上游不支持」。旧 Android runtime、读屏、系统大字、真实账号及生产原生业务与发行仍分别验收；物理 TV 按平台限制记录，遥控由模拟器覆盖。
