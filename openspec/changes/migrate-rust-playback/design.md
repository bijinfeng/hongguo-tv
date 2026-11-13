# Design

## Context

动机和范围见 proposal。实施起点为 A 批提交 `9285503`；其字体缩放验收 6.2 仍开着，不作为本批隐式完成项。

已核对的实际实现：

- `crates/core/src/media.rs` 只有 ByteRange，尚无媒体网络或存储实现；`http-api/src/lib.rs` 的 `/api/v1/play/info` 为 501，未注册媒体路由。`services/web-api` 只装配 CatalogClient 与 LibraryStore。
- `packages/contracts/src/index.ts` 的 PlayInfo 为手写兼容类型；core-client 固定请求 range/default，并只允许同源 `/minireel-proxy/media/`。此 URL 安全边界保留。
- `packages/app/src/pages/Player.tsx` 已有 Video、暂停／seek／下一集及 progressSession，但未实现定稿的两端播放器布局、选集面板、控制层或质量切换。业务 store 与 NavStack 现已按挂载隔离，不能引入新的模块级播放器状态。
- 固定参考为 `upstream.lock.json` 的 `de9712bf358dcbdf8a188e26cba711e3e5354e8a`。本次只读检查了 `minireel.go`、`minireel_source_sequence.go`、`minireel_single_model.go`、`minireel_single_registered.go`、`minireel_sign.go`、`minireel_range.go` 和播放器原型规格。它不是一个无状态 URL 转发：身份注册、来源预算、编解码及媒体准备均影响成功。
- 设计真值是 `design/prototype/{desktop,tv}.{js,css}` 与 `docs/design/prototype-system.md`，不是当前兼容 Player；三端 Video 的生成类型已有 volume/rate 和 seek。全屏需核对相应宿主公开 API，不能套用 DOM 或私有接口。

## Goals / Non-Goals

**Goals:** core 拥有播放解析、短期身份与媒体资源；TSX 拥有单个播放会话及控制层；HTTP 只负责验证、错误与字节响应。所有层保留精确 ID、取消和错误边界，未来 native adapter 可复用。

**Non-Goals:** 本批不实现原生业务 bridge、账号权限体系、持久播放偏好、互动、下载管理或公网产品；不宣称 TV HTTP 预览脱离电脑可用。正常验证不运行 Go、不写真实账号、不修改只读原型，不自动打开用户的原生 Chrome 或全屏。

## Decisions

### 1. 按现有职责新增最小播放模块

在 core 的 `playback/` 放请求／结果／错误、来源解析、短期身份、准备会话；`media` 放表示与读取。先使用具体服务及显式 fixture 构造，避免先建通用插件协议或跨端传输框架。HTTP state 显式装配服务，初始化失败不得输出 ready；status 的播放 capability 随真实服务可用性更新，不能仅因路由存在置 true。

Rust DTO 生成播放结果、可用质量和脱敏诊断。保留 path/vid 等已有客户端含义；能力外的账号 DTO 继续兼容，不能声称全部契约已迁移。若为生命周期需要释放接口，则同时纳入 OpenAPI、core-client、退出／换集与幂等测试，不能留下客户端自行拼接的未记录接口。

### 2. 以固定上游行为建立来源与身份边界

来源顺序依据 `minireel_source_sequence.go`，不将多个私有协议压成一次请求；默认解析总预算 30 秒，各来源保留有限子预算，错误分类决定是否继续。生产 endpoint 在 Rust 固定；fixture 只接受显式 loopback 构造，不能通过 API 注入任意 URL。

匿名身份按 core 服务实例隔离，不借用账号 cookies。并发注册使用单次共享结果；刷新要绑定被拒身份的 revision，晚到失败不能替换更新身份；10 分钟刷新冷却沿用参考的防风暴规则。缓存有数量／TTL 上限，不保存到游客历史或读取 legacy 设备数据。来源只有在媒体准备可用后才记成功；业务拒绝、锁定、取消不触发无限轮换。

质量／编码选择有限且验证在网络前。bytevc2 等未支持编码明确拒绝；不能只因响应给出 hvc1 名称就认定能解码。受保护内容须使用服务允许的授权播放路径；不绕过锁定、付费、地域或访问限制，也不把自行构造的明文样本当作官网成功。

### 3. 媒体是有期限的表示，不是开放代理

本地 path 使用加密安全随机的不透明 token，绑定 series/video/content-type/quality/codec 和本次表示；不从用户字符串推导文件名，不返回上游签名 URL、内容密钥或本地路径。失效 token 明确失败，前端重新解析选中集。服务重启丢弃临时句柄；Rust SQLite 历史独立保留。

按需读取以强 validator、长度和正确 Content-Range 为前提，分块上限以参考 512 KiB 为起点，媒体表示变化立即失效，不拼接版本。上游忽略 Range、布局不支持等情况只能进入独立的有界完整文件准备，不能把大响应读入内存冒充小片段。完整文件上限及缓存总额分别为 512 MiB，初始化元信息至多 16 MiB；准备并发初始上限 2、就绪句柄上限 24。单个上游读取限时 12 秒；上限是初始工程预算，改变前更新规范及压力证据。

原始网络和临时文件在 core 管理，网络断开、最后 owner 取消、服务退出均释放；ready 句柄闲置 15 分钟过期。活跃读取持有资源租约，清理不能先删除正在使用的文件。临时目录限于本应用专属 media 子目录，禁止跟随任意路径或清理历史库／旧客户端目录。不能为缓存成功而放宽媒体访问边界。

### 4. HTTP Range 复用现有规则并覆盖真实字节

复用 ByteRange，新增 GET／HEAD 返回正确的 200、206、416、Content-Length／Content-Range／Accept-Ranges、媒体类型及 no-store。HEAD 与 GET 按相同表示计算响应但不取媒体 body；Range 无效时 Content-Range 给总长。流式响应既要限制缓冲，也要在 body 被丢弃后取消上游；用慢源和主动断开测试，而非只验证函数退出。

保留现有 DevPolicy Host／Origin／请求体边界；仅为允许的来源暴露播放器需要的媒体头。禁止把上游 Set-Cookie、跳转地址、错误 body、签名头或本地文件信息透传给客户端。二进制路由与 JSON 边界分别验证，不能让 JSON middleware 无意缓存或吞掉媒体流。

### 5. 先对齐定稿，再接播放交互

在根 DESIGN 的 B 节编码前记录控件／状态／动效映射并扩展 ui，复用现有 cinema 主题和显式 desktop/tv 上下文。桌面为画面＋右选集栏，TV 等比竖片留黑、底部控制层及右侧选集面板；详情仍用 A 分段，播放器面板按原型四列。不可用评论／收藏不制造假面板或成功。

单个 Video 宿主不随控制层、进度、暂停和面板反复挂载。质量变化是同集新表示，保留有效时间；换集是新会话，默认从零或显式该集续播。volume/rate 用已有 Video props；全屏用各宿主生成类型中受支持的能力，保持媒体节点及焦点来源。若目标宿主无法满足定稿，应报告具体 API 限制并修订方案，不能偷偷退回另一种页面。

控制层显隐计时仅在播放且没有焦点／面板／seek 编辑时生效；暂停、错误、无障碍操作时保持可达。TV 状态显式区分 hidden、controls、seek-preview、episode-panel，返回按最上层消费。seek-preview 不写当前时间，确认才 seek，取消不触碰 Video。播放器键处理仅在当前可见 player 生效，不能侵入搜索输入或 IME。

| B 编码前动效清单            | 工具与约束                                       | 减少动态效果               |
| --------------------------- | ------------------------------------------------ | -------------------------- |
| 控制层显隐                  | ui 颜色／透明度 transition；隐藏层退出焦点候选   | 即时显隐，焦点不丢失       |
| 面板开启／关闭              | NSH 语义 overlay；按原型边缘短过渡，不重建 Video | 无位移，保持模态边界       |
| 进度／seek 预览／选集／缓冲 | 原位更新，不对高频进度做额外动画                 | 相同                       |
| 焦点／选中／pressed         | 共享 ui 稳定几何与语义状态                       | 即时反馈                   |
| 全屏／窗口模式              | 宿主公开能力；不叠加页面转场                     | 遵循宿主设置，另验真实结果 |

### 6. 保留实际播放与历史的现有不变量

progressSession 仍是 TSX 播放会话状态，Rust LibraryStore 仍是持久事实源；不给媒体读取自动写历史。所有异步解析和 Video 回调绑定当前会话 owner／revision；取消后迟到 onLoad／onProgress／onEnd 不得保存到新集。切集、后台、卸载保持串行保存与错误重试；完成状态不被退出 checkpoint 覆盖。

服务重启后重新解析本集媒体，再恢复 Rust history 中同 video_id、未完成且有效的时间；无 duration、缺失集、锁定集及完成集保留 A 的明确恢复路径，不把旧时间套给另一集。后台恢复不自动播放。

## Risks / Trade-offs

- [官网协议或设备接受规则变化] → 去敏固定向量与来源单测分开，显式官网 probe 记录当时结果；无真实成功就保持未验收。
- [媒体与并发取消复杂] → 所有任务有 owner，准备／读取分别限额；用真实慢 HTTP 源、并发租约、断开和进程退出验证资源释放。
- [官方内容不能由当前宿主播放] → 返回明确能力／访问错误，保留原选择和返回；不增加绕过权限的 fallback。
- [视觉再次偏离] → 原型源先映射尺寸和交互，Web／macOS 与 TV 截图矩阵做独立复审，修复后重拍，不靠 headless 自证。
- [全屏打断用户] → 不自动操作用户的原生 Chrome／全屏；在隔离、不会抢占用户界面的宿主完成可做项，交互全屏验收单列待专门窗口。
- [安全门禁已有失败] → 新增依赖单独评审、固定与检查；既有 NSH 阻塞独立报告，不添加 ignore 或用 verify 替代 security。

## Migration Plan

1. 固化去敏行为向量、来源矩阵和 B 的 DESIGN 映射，保留 A 回归及未完成验收。
2. 实现 core 解析／身份／取消，再做媒体读取、缓存和真实 HTTP Range；每一层先验证 fixture 边界，不宣称官网可用。
3. 装配 HTTP 与真实 binary，生成播放 DTO；迁移 TS 客户端，确认 501／新服务错误均可恢复。
4. 实现两端播放器、选集与控制层；保留浏览返回、历史隔离及真实播放前零写入。
5. 完整 verify、codegen 漂移、依赖 security、原型回归及三端宿主观察；真实 Web/macOS 搜索至重启续播单独验收，TV 与物理电视保持各自范围。
6. 回退按本批源码与生成契约整体回退，不回退或删除游客历史；媒体缓存可在无活跃租约时清理。提交／推送／归档／发布按用户指令，不把规划状态视为实现完成。
