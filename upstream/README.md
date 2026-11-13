# 复用的红果核心

来源：[aston314/hongguo-tv](https://github.com/aston314/hongguo-tv)，固定提交 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。

`hongguo/` 保留上游 Go 模块、核心、测试、fixture 与嵌入的原页面。这里不修改协议、安全边界和旧页面；新界面在 `app/`。嵌入页面是上游 Go 的构建输入，也保留为行为对照。

`upstream.lock.json` 记录每个源文件的 Git blob SHA。`npm run upstream:sync` 下载固定提交并校验内容；发现本地修改会停止，不覆盖。更新时应显式选择新提交并复核接口、播放和账号行为。

验证版使用独立的 `.local/data`，不读取旧客户端的数据目录。上游真实账号、媒体处理与网络行为并不因引入源码而视为已验收。
