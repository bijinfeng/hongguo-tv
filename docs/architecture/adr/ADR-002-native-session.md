# ADR-002：原生进程内会话与共享bridge

状态：Accepted（架构方向）；原提案：2026-11-13。独立业务、设备和发行是否通过，以VALIDATION为准。

## 决策与原因

Desktop使用NSH mixed，Android TV使用embedding／JNI，链接同一Rust core并共用native bridge。平台入口打开宿主会话，平台无关transport消费结构化接口；页面不直接拥有FFI对象或调用平台生成模块。

最终用户不需要电脑API、Node、Rust编译器或另行启动核心服务。相比sidecar／Go mobile binding，进程内核心减少独立进程握手与发行组件；媒体字节通过受限loopback路由供原生播放器使用，不经TSX／FFI反复复制。

## 代价与边界

核心故障可能影响整个宿主，必须检查解析边界、panic不跨ABI、回调注销、请求取消和幂等销毁。初始化／关闭先后与持久写排空有明确所有者；不能把强杀当作完成清理。只有证实需要故障隔离时再评估独立进程，不预建第二套架构。

来源：[原始架构提案](../../history/2026-11-15/ARCHITECTURE.md)、[原生变更设计](../../../openspec/changes/embed-native-core/design.md)、[现行架构](../../ARCHITECTURE.md)。本文记录取舍，运行命令、API及逐轮验收分别维护在其唯一来源；替代时标记Superseded。
