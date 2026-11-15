# 追更

沿用正式详情的播放主动作、基础组件板的 Button／Cover／Notice／CardControls，以及片库的虚拟列表密度。桌面与 TV 共用状态、成员身份、操作和焦点策略，只通过现有 Product、tvUnit 和布局适配输入距离。页面只呈现已实现的追更列表，不展示预约、提醒、计数或推测的更新计划。

## 动效与交互清单

- 导航、刷新、追更／取消沿用公共 Button 的 hover、pressed、selected、pending 和 focus-visible；详情的播放继续是主动作，收藏和追更为辅助操作。提交期间保留原标签，不乐观切换成员状态。
- 首次完整列表由 ContentArrival 一次呈现，沿用 180ms／8pt entrance；刷新保留列表，虚拟行回收不重播。减少动态取消位移，内容仍直接可读。
- 加载、stale、错误、unknown／unconfirmed 在原区域使用公共 Notice。刷新只读取状态；重试由用户明确触发原 series 与原绝对目标，不自动重放 POST，不使用持续成功 toast。
- 取消确认后列表即时更新，无额外布局动画；按稳定 series ID＋offset 保留阅读位置，将焦点交给存活邻项或空态入口。详情返回先恢复锚点，再 nearest 揭示来源；新输入、离页、后台和 owner／epoch 变化取消迟到焦点。
- 行内详情与取消复用 CardControls：键盘／DPAD 在现有可用动作间移动，确认激活，返回沿用导航栈。缺少可播放摘要的有效成员显示“内容暂不可用”，保留取消，不能构造播放入口。
- 更新文案只取实际 series_status、latest_watched_episode、has_watched_latest_episode、show_update_frequency；无字段则省略。follow_update_time 未约定单位，不猜测为本地日期或“刚刚更新”。明确完结不能新增，已追更仍可取消。
- 无新手势、声音、连续动画或自定义图标，使用统一 Lucide bell。

## 验证边界

合成回归仅验证空／错／stale、缺摘要、完结约束、精确季身份、unknown 显式恢复、虚拟回收与焦点 fencing。功能验收需要正式入口、实际账号追更数据及实际宿主观察；真实添加／取消需适用的账号、series、操作授权。Web／Desktop／Android TV、浅深色、大字、减少动态及键盘／DPAD 分开记录，合成通过不代表真实验收。
