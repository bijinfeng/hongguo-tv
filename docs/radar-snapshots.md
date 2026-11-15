# 榜单雷达

与官方动态榜单独立的第三方只读快照，依据固定上游 `radar.go`。源码、测试输入与提交都在主项目工作区；不读取旧 worktree 或旧客户端的数据。

## 数据与身份

- 生产只读取 hongguo-radar 的 `ranks_latest.json`／`growth_latest.json`，按固定 ghfast 镜像→raw GitHub 回退。每个响应上限 5 MiB、单次 6 秒，两分支共享 13 秒网络截止时间，锁等待也计入。
- 快照包含综合／真人／AI／漫剧四桶，各自保留 `rank_date`／`prev_rank_date`。增长独立保留 `date`／`prev_date`／`gap`；不会把间隔增量除以 gap，也不会将两分支日期合并成同一天。
- `id` 全程是精确十进制字符串，最多 32 位且不能全零。榜单名次来自来源字段；缺失时不把列表位置伪装成真实名次。快照和增长仅按完全相同 ID 左连接。
- `hot`／`fav`／`d_hot`／`d_fav`／`d7_hot`／`d7_fav` 通过契约输出可选十进制字符串，避免 i64 经 JavaScript Number 舍入。缺失显示 `—`，零和负值分别保留。排序保持相等条目的来源顺序。
- 不输出或保存点赞、watch 标志、评分。表格摘要没有封面或选集；点击按 ID 读取真实详情，核对身份后才导航，不准备媒体、不写历史。

## 缓存与生命周期

缓存文件是本产品私有数据目录的 `radar-v1.json`，与 `guest.sqlite3` 分开。规范化快照和各分支的成功获取时间一起持久化；失败分支继续使用其原日期／时间并标记 stale。没有任何可用分支时明确失败。

缓存有版本、大小与内容校验。损坏或不兼容时保留原文件并报告错误，不自动删除或借旧客户端文件恢复。写入使用同目录私有临时文件和原子替换；失败保留此前文件，`cache_write_failed` 明确表示本次数据未成功保存。

调用者拥有网络任务，取消／会话关闭不留后台抓取。文件系统进入提交后的写入不承诺可撤销；提交顺序必须受同一所有权约束，旧操作不能晚到覆盖更新的数据。13 秒是网络截止时间，不是文件系统硬实时承诺。

## 入口与共享布局

HTTP／native 使用同一 `GET /api/v1/radar`。只接受空查询与无请求体；原生请求带 body 表示写方法，按现有 bridge 契约拒绝。保持既有来源检查、路径长度、请求大小与 no-store。测试构造器只允许显式裸 HTTP loopback IP origin，生产不开放可配置 URL。

排行榜保留红果榜，雷达内部保留快照／飙升榜、分类／指标／类型筛选及刷新。状态归共享 app controller，表格样式与输入归单一 UI 包。隐藏、后台、卸载或较新选择会拒绝迟到详情导航；返回按 ID 恢复原来源，同时保留较新用户焦点意图。

正式入口是 `apps/*/App.tsx` → `@hongguo/app` → `src/pages/Rankings.tsx`／`Radar.tsx`，请求经 core-client 进入 Rust。`package.json` 的 `testing/*` 只显式导出 `test/` 中的状态夹具和验收脚本，不供正式入口加载；宿主验收使用同一生产 App 注入本地 HTTP 样本，组件样例则单独验证 UI 契约，不将样例数据放进产品路由。

三端使用同一个 RadarTable。表头位于独立横向 Scroll，数据位于其兄弟纵向虚拟 List；List 保持自己的可测量视口，各行以 `translateX` 同步表头的横向偏移。列导航与横向滚轮共用该偏移，标题使用同一个原生 Button。切换集合重置滚动，同一集合刷新保留位置；返回按精确 ID 揭示标题列和数据行，再在来源仍有效时恢复焦点。官方榜／雷达的来源注册与恢复均受当前视图、活动页面和组件生命周期约束。

筛选、日期、加载、错误重试和缓存反馈共用 `radar-controls` 滚动区；过期、增长分支与缓存提示紧凑排列并自动换行。控件区上限为 TV `tvUnit(360)`／桌面 256，并根据页面测得的高度收缩，为正文预留 TV `tvUnit(280)`／桌面 200 及 16 的区间间距，以容纳列导航、表头和至少一条完整行。状态叠加增加滚动内容，不继续侵占正文。

## 当前验证边界

- `cargo test --workspace radar`：27 项通过，分别为 core 19、HTTP 3、native 4、web-api 真实进程 1；默认忽略需要显式联网的来源 probe。日志：`artifacts/radar-ui/logs/rust-radar-final.log`。
- `cargo clippy --workspace --all-targets -- -D warnings` 与 `pnpm codegen:check` 已通过。日志：`artifacts/radar-ui/logs/clippy-final.log`、`codegen-check-final.log`。
- 固定生产来源的显式只读 probe 通过，见 `artifacts/radar-ui/logs/core-live-probe.log`：四个榜单桶各 100 项，榜单日期 2026-11-14／前期 2026-11-13；增长 760 项，日期亦为 2026-11-14／2026-11-13。两分支均非 stale，缓存写入成功且可重新打开。该时点聚合结果只证明服务读取与缓存，不证明持续可用或 App 详情、输入与返回链路。
- 新数值列宽下，Web 与 macOS 真实 HTTP 宿主各 4／4，覆盖 1180×780／1440×1000 浅深；macOS 以 `--foreground` 运行。日志：`web-host-width-final.log`、`macos-host-width-final.log`，均位于 `artifacts/radar-ui/logs/`。覆盖精确详情身份、迟到拒绝、分支缓存／重试、列切换及较后来源返回。
- `table-three-targets-current.log` 中三端独立 RadarTable check、build 与每端 3／3 测试通过；这是数值列宽修复前的结果，不能当作新列宽最终验证。`ui-three-targets-current.log` 的公共 UI check／test 三端各 16／16，包含当前 Button `labelLines`；`prototype-current.log` 的原型 28／28 通过。
- TV 基线在 API34 独立宿主浅色 1.0／深色 1.0／深色 1.3 各 48 项通过，证据 `artifacts/rankings-ui/android-real-adapter/2026-11-15T00-48-36-570Z/`；官方榜身份回归同三档各 21 项通过，证据 `2026-11-15T00-51-02-363Z/`。新列宽最终 TV 全组也已通过，同三档各 48 项，日志 `tv-all-width-final.log`，证据 `2026-11-15T01-02-08-666Z/`。最终 `restoration.json` 三组 passed／nativePassed 均为 true、11 项 cleanup 成功、errors 为空，生产 APK 路径／SHA、字号、主题、前台和 reverse 前后相同，独立验收包已卸载。

独立视觉复核实际查看 TV 浅色的快照、缓存、身份错误、末列、较后行来源／返回、增长和刷新错误 8 张，以及深色／大字号各缓存、末列、返回 3 张，共 14 张；这些图属于列宽修复前源码。新列宽桌面另看 1180×780 浅色快照、标题 hover、末列、stale 与较后行返回 5 张：完整 i64 已单行，数值对齐、状态换行和完整行可读性可接受。顶层雷达 Tab 的 hover 背景仍有覆盖选中下划线的轻微视觉发现，选中文字继续可读；未将全部 finishing 项记为通过。

最终完整 `pnpm verify` 已通过：工程工具 37／37、Rust 224／224（默认跳过显式联网 probe）、Web 126／126、Desktop／TV 各 128／128，并含三端正式入口 check／build 和新列宽表格各 3 项回归。独立表格 preview 又完成三端最终 build；严格 OpenSpec 校验通过，日志见 `verify-final.log`、`table-build-warning-final.log`、`openspec-final.log`。609 个主仓源码／契约／测试输入的摘要见 `artifacts/radar-ui/source-manifest.json`，最终 TV 输入哈希与主仓逐项一致。

最终列宽另独立复核 8 张 TV／macOS／Web 关键图，确认状态、完整数值、较后长标题与焦点外圈可读。两端 mixed headless runner 的 warning 已以 `-v` 展开，均为 macOS linker 的 `__eh_frame` 超过 compact unwind 编码上限提示；不是零警告构建，不修改 NSH 或放宽门禁。截图不证明全部动效／减少动态、连续 hover／pressed、完整横向滚轮行为、读屏或物理观看距离；本批宿主与合成 HTTP 也不代表媒体、正式安装包或发行通过。最终实际范围见 VALIDATION.md。
