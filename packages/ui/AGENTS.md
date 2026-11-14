# UI package rules

先读本包 README、根 DESIGN、docs/design/component-design.md 与 component-roadmap.md，并使用 nsh / nsh-design-guides 技能。

- 单一 `@hongguo/ui`；内部按职责分模块，桌面／TV 共用值和行为，只在真实输入／宿主边界适配。
- 产品仅从包根导入；本包内部不得导入自身 index。index 只导出，不放实现。dev/test 只能经显式开发入口装配。
- 公共组件用命名 Props 与文档，新增事件传对象，受控值单一所有者；props／信号在绑定读取。
- 颜色归 theme.json，普通控件尺度归 foundation；有限 variant/size，不向页面开放任意绘制参数。
- Lucide 官方原资源有版本／许可证／SHA256；只经 tooling/src/ui-icons.mjs 再生，不手改生成结果，不引入 React/DOM 图标运行时。
- 不发业务请求、不写持久设置、不保存账号／媒体状态；不向上依赖 app/core-client/contracts。
- 修改同时覆盖验收页、必要行为回归与组件完整度矩阵；执行 ui:check（check+build）、ui:test、相关宿主与根验证。未验证的行为如实记录。
- 保留 CardControls、SelectFocus、FocusedRemovalRoot 已有语义与宿主回归；不为视觉统一删除它们。
