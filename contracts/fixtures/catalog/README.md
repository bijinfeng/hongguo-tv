# 目录行为样本

来源：`aston314/hongguo-tv@de9712bf358dcbdf8a188e26cba711e3e5354e8a`。

- `search_web.go::parseWebSearchPage`、`search_web_test.go::TestWebSearchNormalizationAndEmptyPage`：website 分页、精确数值 ID、去重和非剧集过滤。
- `hongguo_client.go::SeriesDetail`、`hongguo_client_test.go::TestSeriesDetailCreatesLockedEpisodes`：router JSON、视频顺序与 accessible_episode_cnt。缺失/零/超出视频数量时，按参考将已列出的集全部视为可访问。
- `hongguo_client.go::SearchSuggestions`、`hongguo_client_test.go::TestSearchSuggestionsNormalizesDramaActorAndKeyword`：固定官网 suggestion 的剧名／演员／关键词及 display_words、剧名回退。`suggestions.input/expected.json` 增加合成重复、未知类型及非播放身份，验证精确数值ID与严格有界输出；不运行Go。

所有标题、简介、图片地址、视频 ID 与响应均为合成数据；保留大整数格式用来检验 JavaScript 精度边界，没有 Cookie、账号、媒体或真实用户信息。expected 文件是既有共享 UI 使用的归一化子集，不声明已迁移评论、演员或完整上游对象。创作者合集被明确拒绝/过滤。

联想每次最多10条、扫描前128行、响应256KiB；当前词trim后最多100 Unicode字符，空词不联网。名称／剧名最多100字符；元信息最多3个24字符分类、80字符上游热度文字及正集数，不生成热度。演员ID独立且不代表演员作品页已经实现；keyword即使像系列ID也不能推断为剧集。无本地输入词缓存／持久化；HTTP/native生成契约不等于输入联想界面已验收。

执行：`cargo test --locked -p hongguo-core --test catalog`；联想专项为 `cargo nextest run --locked -p hongguo-core suggestion`。测试直接消费 input 与 expected，不运行 Go，不访问网络。网络边界另由 loopback server 测试覆盖；官网检查单独运行，不能用本样本证明实时接口可用。

匿名官网 smoke（显式联网，不使用账号）：

```sh
cargo run --locked -p hongguo-core --example catalog_probe -- 重生
cargo run --locked -p hongguo-core --example suggestions_probe -- --anonymous-live
```

此命令先搜索；有更多结果时按返回的官网游标再取一页，核对来源与推进并输出新增身份数量，再读取第一项详情，只输出数量和剧集 ID。官网挑战、超时或协议变更会明确失败；成功也只说明当时的匿名目录可用，不代表 App 搜索、账号或播放通过。生产 origin 固定为 `https://hongguoduanju.com`；loopback 注入只供离线测试，产品参数不能选择上游。

第二个探针必须显式提供 `--anonymous-live`，读取固定当前词的官网联想，仅输出各类型／合法系列的数量，不记录词、建议原文或身份。返回演员或关键词为0也只是当次结果，不能替代离线混合类型或UI验收。

演员作品：`hongguo_client.go::ActorWorks` 与 `TestActorWorksParsesNestedVideoList`／`TestActorWorksRejectsMismatchedActor` 为固定协议参考。`actor-works.input.html`／`actor-works.expected.json` 使用合成演员、剧目与图片；布局内的误导列表不能替代 `character_(id)/page`。数字ID保持精确；actor_id／actor_id_str／person_id 中每个已给出的值均须与请求一致，空列表成功，缺失／非数组列表失败。响应12MiB、原始列表2048行，超限整页失败；去重与不支持内容过滤不宣称官网所有未来作品都已穷尽。名称100字符、描述1024字符、标签最多3×24字符，异常可选字段省略；不返回选集详情或账号字段。

专项离线验证：`cargo nextest run --locked -p hongguo-core actor`。HTTP/native入口为 `/api/v1/actors/works?actor_id=...`，只有 actor_id；未知／重复参数、非空GET body、native body与普通POST均拒绝。Axum自动HEAD与全局OPTIONS保留框架语义。生成契约不代表演员作品界面已接通。

显式匿名演员页探针：`cargo run --locked -p hongguo-core --example actor_works_probe -- --anonymous-live <public-actor-id>`。只输出作品／字段存在性等计数，不记录姓名、简介、URL、身份或作品原文；失败明确退出。此结果仅说明当时该公开演员页的匿名读取，不替代UI或其他演员页面验收。
