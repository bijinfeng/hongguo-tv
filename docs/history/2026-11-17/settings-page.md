# 设置页还原批次

日期：2026-11-17。变更：界面与偏好实现（无 OpenSpec 变更）。本批按 `design/prototype/visual-redesign-real` 的单列设置布局还原设置页，补齐设计稿未列、但已有真实行为的设置项；偏好经 NSH Storage 本机持久化，先 Web 实现，再在 macOS 宿主与 Android TV 模拟器验收。

## 背景

生产端此前没有设置页：侧栏和 TV 顶栏都没有入口，`docs/design/ui-map.md` 与 `docs/feature-ledger.md` 只登记了「两端设置与生命周期待建」。当前原型设置页是单列布局（外观／播放／应用更新／本地数据），其中「重置设计预览」是演示行为。用户要求布局沿用新原型，并补上设计稿没有的设置项。

## 决策

- 布局采用当前原型的单列卡片行，不恢复 11 月 14 日审计前的分类侧栏版本。
- 只列真实实现项：主题、自动播放下一集、记住播放位置、默认倍速、安静观看、账号入口、应用更新（仅宿主有 updater）、恢复默认设置。
- 语言（无翻译资源）、缓存／预加载（无真实容量契约，且范围禁止虚构）、启动页／推荐方向／解码／清晰度（未实现为偏好）、诊断／许可（无数据源，仓库无 LICENSE）不展示。
- 安静观看复用真实行为：桌面播放时收起侧栏与顶栏；TV 播放时本来就隐藏 chrome，因此不显示该行。
- 持久化只走 NSH Storage，本轮不新增 Rust 偏好接口与契约生成。
- 基础组件进 `packages/ui`：新增 `SettingsSection`，`SettingsRow` 增加 `card` 变体，`Switch` 增加 `labelHidden`（标签由所在行承担时仍保留无障碍名称）；不新增第二套开关或页面私有原语。
- 设置行按组件板「设置行」规范对齐：分组用 1px 分隔线而不是每行卡片，标签 600、说明在下、控件右对齐，Select 固定 200 宽并使用 `input` 边框；分区标题沿用设计系统 24px；组件拆到独立文件，不集中在一个 shared 文件。

## 实施

- `packages/ui/src/settings-row.tsx`／`settings-section.tsx`：设置行与分区各自成模块；`SettingsRow` 默认 `divided` 分隔列表，`card` 保留独立卡片。
- `packages/ui/src/`：`Switch` 的 `labelHidden`；`Select` 增加仅布局的 `class`／`style`（触发按钮仍是控件外观）。按反馈把原 `form.tsx` 拆成单组件模块：`text-input.tsx`（TextInput／SearchField）、`field.tsx`、`select.tsx`、`checkbox.tsx`、`switch.tsx`、`choice-group.tsx`、`tabs.tsx`、`slider.tsx`、`choice.ts`，公共导出不变，`packages/ui/README.md` 模块表同步。
- `packages/app/src/settings.ts`：偏好模型（主题、自动播放、记住位置、默认倍速、安静观看、自动检查更新）、NSH Storage 读写、`setColorScheme` 应用、保存失败与损坏数据回退。
- `packages/app/src/pages/SettingsPage.tsx`：五段设置只做拼装；业务组件拆到 `pages/settings/{appearance,playback,account,updates,local-data}.tsx`，页面级错误与重试留在页面。
- `packages/app/src/store.ts`、`shell/Sidebar.tsx`、`shell/TvHeader.tsx`、`shell/Pages.tsx`：设置路由与桌面／TV 入口。
- `packages/app/src/pages/Player.tsx`：默认倍速、记住位置、自动连播接入真实播放行为。
- `packages/app/src/shell/DesktopShell.tsx`：安静观看收起桌面 chrome。
- `packages/app/src/updates.ts`、`index.tsx`：自动检查更新按偏好触发，未开启时不自动请求。
- `packages/app/test/settings.tsx` 与三端 `App.test.tsx`：设置页回归（入口、默认值、持久化、损坏数据、返回）。
- `tooling/src/settings-host.mjs`：Web／macOS／Android 宿主截图脚本。

## 验证

- `pnpm check`、`pnpm build` 三端通过；`ui:check` 通过；`ui:test` 18／18。
- 应用套件（组件拆分与设置行对齐后复跑）：Web 233／233、Desktop 241／241、TV 243／243。
- `form.tsx` 拆分后复跑：`pnpm check`、`pnpm build` 三端通过，`ui:check` 通过，`ui:test` 18／18，`pnpm lint` 0 告警 0 错误；全量套件 Web 233／233、Desktop 241／241、TV 243／243，macOS 宿主截图重新生成 2／2。
- 宿主截图存于 `artifacts/design/settings/{web,macos,android}/`：Web 由浏览器驱动 `nsh run --target web` 页面，macOS 宿主 2／2，Android TV 模拟器（1920×1080）2／2；浅色／深色各一张。设置行对齐后的 Web 复核截图在 `.local/settings-work/web2-settings-light-*.png`，macOS／Android 宿主截图在原目录覆盖更新。
- Web 持久化实测：`localStorage` 键为 `nsh:dev.hongguo.web:settings.v1`，关闭自动播放后值为 `autoplayNext:false`，重开页面保持。
- 未验证：物理 Android TV／桌面真机的遥控与窗口操作、安静观看／自动播放／续播的真实播放实看、正式签名升级、诊断与许可；本机并行 `cargo test` 下 `hongguo-native-bridge` 的 SQLite 生命周期用例偶发失败（串行 50／50 通过，工作区无 Rust 改动，与本批无关）。
