# 目录行为样本

来源：`aston314/hongguo-tv@de9712bf358dcbdf8a188e26cba711e3e5354e8a`。

- `search_web.go::parseWebSearchPage`、`search_web_test.go::TestWebSearchNormalizationAndEmptyPage`：website 分页、精确数值 ID、去重和非剧集过滤。
- `hongguo_client.go::SeriesDetail`、`hongguo_client_test.go::TestSeriesDetailCreatesLockedEpisodes`：router JSON、视频顺序与 accessible_episode_cnt。缺失/零/超出视频数量时，按参考将已列出的集全部视为可访问。

所有标题、简介、图片地址、视频 ID 与响应均为合成数据；保留大整数格式用来检验 JavaScript 精度边界，没有 Cookie、账号、媒体或真实用户信息。expected 文件是既有共享 UI 使用的归一化子集，不声明已迁移评论、演员或完整上游对象。创作者合集被明确拒绝/过滤。

执行：`cargo test --locked -p hongguo-core --test catalog`。测试直接消费 input 与 expected，不运行 Go，不访问网络。网络边界另由 loopback server 测试覆盖；官网检查单独运行，不能用本样本证明实时接口可用。

匿名官网 smoke（显式联网，不使用账号）：

```sh
cargo run --locked -p hongguo-core --example catalog_probe -- 重生
```

此命令先搜索；有更多结果时按返回的官网游标再取一页，核对来源与推进并输出新增身份数量，再读取第一项详情，只输出数量和剧集 ID。官网挑战、超时或协议变更会明确失败；成功也只说明当时的匿名目录可用，不代表 App 搜索、账号或播放通过。生产 origin 固定为 `https://hongguoduanju.com`；loopback 注入只供离线测试，产品参数不能选择上游。
