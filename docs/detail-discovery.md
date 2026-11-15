# 详情演员与相关作品

## 生产接线

桌面和 TV 正式入口装配 `@hongguo/app` 的 NativeApp；Web 装配同包 App。共享 Detail 在选集后组合演员和相关作品，所有行为位于 `packages/app/src/`。`testing/detail-extras-host` 仅为测试注册出口，真实宿主验收复用上述生产页面并注入显式合成 HTTP 服务。

`GET /api/v1/series/detail` 的 HTTP 和 native 路由均调用 Rust `CatalogClient::series_detail`。`SeriesDetail` 扁平包含既有 Drama 字段，再加必填 `actors` 与 `related` 数组；`SeriesActor.actor_id` 可缺省，只有合法精确编号才提供演员作品入口。`ActorSummary` 继续要求有效身份。旧 Rust `detail`／`parse_detail` 保持 Drama 返回类型；通用摘要、历史库和历史写入没有新增扩展。

## 来源与边界

固定来源为 `upstream/hongguo/core/cmd/hongguotv/hongguo_client.go` 的 SeriesDetail、normalizeSeriesActors、normalizeRelatedDramas 和 extractDeferredRecommendations。只从精确详情 loader 与合格延迟 JSON 读取数据，不执行网页 JavaScript，不迁移剧评。

完整详情响应上限 12 MiB；延迟 JSON 上限 8 MiB；演员与相关推荐原始数组各最多 2048 行，超限失败而非静默截断。姓名最多 100 Unicode 字符，图片地址最多 2048 字节并经过公开 HTTPS 白名单。演员按有效 ID 或无 ID 姓名去重，相关作品按精确系列 ID 去重、排除当前作品及不支持类型；演员编号不当成系列编号，摘要不带选集。

## 页面所有权

完整元数据缓存以来源与所选季的系列／内容类型共同标识。已有合法选集可先使用，缺少扩展数组时仍补取完整详情；已读空数组属于完整结果。失败保留可用选集并提供重试，切季、来源变化、隐藏、后台和卸载均拒绝旧请求迟到写入。

演员姓名使用公共 Button 或只读 UiText；相关作品使用公共 PosterCard 与父 Scroll 视口的虚拟网格。两端遵循原型同一四列组合，桌面窄窗减为两列，详情页只拥有一个纵向滚动区域。网格按整行回收，行内保留固定宽度槽位，返回时将作品索引转换为当前列数的行号；条目、焦点和选择始终绑定剧集身份。自然高度海报传 width，有限视口另传 availableHeight；基础组件负责比例与字体安全区。

TV 无编号姓名保留普通文本外观，以显式具名 `region` 作为遥控阅读停靠；确认键没有动作，方向键离开阅读区。桌面仍是普通文本，不增加交互。长姓名由详情滚动区域完整呈现，不为了取得焦点制造内层滚动，也不伪装成演员作品链接。

进入演员作品和相关详情只做浏览，不准备媒体或写历史。返回绑定精确条目、当前集合和 store 的焦点意图；新的用户输入优先。空段落隐藏，不生成演员姓名或推荐样本。

## 验收入口

```sh
cargo run --locked -p hongguo-core --example series_detail_probe -- --anonymous-live <public-series-id>
node tooling/src/detail-extras-host.mjs web
node tooling/src/detail-extras-host.mjs macos --foreground
node tooling/src/rankings-tv-remote.mjs run --suite detail-extras --profile all
```

匿名探针只输出身份验证结果与数量，读取生产来源但不证明整条 App 流程。宿主 runner 自动管理本轮合成服务；TV 使用独立验收包和生产输入适配器并恢复设备状态。实际通过范围及失败分类以 VALIDATION 为准，未验项目不能从此设计说明推定完成。

## 本批 UI 复核范围

| 检查组           | 结果与边界                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 圆角、颜色与表面 | 复用公共 Button／PosterCard 与主题，浅深截图未见新增偏差                                                                     |
| 字级、长文本     | 三类标题统一公共 section 字级；演员名、普通姓名与 100 字只读内容纳入宿主检查；未据单行样本宣称演员按钮两行已实测             |
| 间距、对齐       | 四列／窄窗两列与末行完整；TV 只读焦点安全区由参考 8 单位留白和真实边界断言约束                                               |
| UI 层、组件标准  | 单一 ui 包；页面仅组合公共控件与布局，无平台业务副本或手绘图标                                                               |
| Hover、Pressed   | 沿用公共状态；本批未逐项捕获全部 hover／pressed 时序，不能标为全部通过                                                       |
| 其他状态、键盘   | 精确演员／相关来源、回收、断点、切季／空段与新意图围栏均有测试；macOS 返回外圈实际可见，Web 相关返回图只见背景高亮           |
| 动效、减少动态   | 沿用公共控件与 NavStack，1180 宿主设置减少动态；未逐帧审查全部动效，不新增页面循环动画或声音                                 |
| 无障碍           | 控件全名、静态姓名子树与 TV 非点击 region 已检查；尚未实际完成 VoiceOver／TalkBack 主路径                                    |
| 平台、内容状态   | Web／macOS 两尺寸浅深、TV API34 三档与 780 窄窗纳入验收；物理电视、观看距离、其他 OS、真实推荐封面与独立官网 C3.2 保持未验证 |

设计复核按用户任务检查布局、承诺与结果、层级、共享组件、状态和真实宿主。演员只在有精确 ID 时打开作品；普通姓名不承诺导航；相关推荐完整保留，空数据隐藏，浏览不写历史或准备媒体。独立视觉结果、各版修复及工程门禁以 VALIDATION 的实际证据为准；以上不是全部产品或完整 MVP 已通过的声明。
