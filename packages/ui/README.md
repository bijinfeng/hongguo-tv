# @hongguo/ui

红果桌面与 TV 的共享 NSH 样式层。业务页面从包根导入；NSH `nsh/base` 提供行为，本包拥有主题、尺寸、图标、部件样式与必要输入适配。它不依赖 `packages/app`、网络、存储、媒体会话或其他应用入口。

## 两端使用

只有一个 package、一份公共 API。应用根注入 `Product.Provider`，普通页面不判断平台，不复制 DesktopButton／TvButton。`desktop` 与 `tv` 是产品端型，不是操作系统；Web 采用桌面样式。

```tsx
import { View, signal } from 'nsh';
import { Product, SearchField, Button } from '@hongguo/ui';

export function Example() {
  const query = signal('');
  const submit = () => {
    /* app owns the request */
  };
  return (
    <Product.Provider value="desktop">
      <View class="gap-6 p-6">
        <SearchField
          label="搜索短剧、演员"
          value={query()}
          onChange={({ value }) => query.set(value)}
          onSubmit={submit}
        />
        <Button label="搜索" variant="primary" onPress={submit} />
      </View>
    </Product.Provider>
  );
}
```

TV 入口仅将 `value` 换为 `tv`。普通控件使用同一尺寸表：桌面 md 44／sm 36、TV 60 参考单位；TV 的字号、图标、间距、面板同步通过 `tvUnit()` 转换，不能直接把 1920 设计数值当作 dp。大字号允许按内容增长，不固定裁切高度。

真实差异集中在输入边界：桌面键鼠；TV 确认进入输入／滑杆调整、返回保留或取消草稿；必要的 macOS Select 与来源焦点适配保留。不得复制业务状态机。NSH Menu 的承载由真实宿主 idiom 决定，不能伪造锚点行为。

## 模块与接口

| 模块                                                | 责任                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| foundation                                          | Product 上下文、端型尺寸表、TV 换算                                 |
| icon / assets/lucide                                | 官方 Lucide 资源、稳定语义别名、原生渲染                            |
| button                                              | Button／IconButton，有限 variant 与 size                            |
| form                                                | Input／Field／SearchField、Select、多选／单选、Tabs、Slider         |
| overlay                                             | Dialog／Confirm／SidePanel、Menu／Popover、提示、操作栏、折叠、链接 |
| display / frequent                                  | 字级、静态表面、反馈、行与高频基础组合                              |
| content / player                                    | 既有内容与影院控件的兼容组合                                        |
| card-controls / select-focus / focused-removal-root | 已有宿主焦点问题的内部适配                                          |
| dev / test                                          | 显式验收入口和行为测试，不挂载到产品路由                            |

`src/index.tsx` 只做公共导出。内部文件直接导入拥有者，禁止反向导入 barrel 造成循环。只有包根用于产品；`./preview` 与 `./testing` 是开发入口，不能用于业务页面。新增控件与 Props 同名、公开事件用对象载荷，值由调用方控制，行为局部状态只保留一份。props 和信号在绑定／回调读取，不在组件 body 解构为快照。

控件只接受有意义的有限变体和布局契约，不接受任意颜色、圆角、内距、字体覆盖。旧 `primary`／`compact` 保留为同实现兼容选项，新代码使用 `variant`／`size`。不要删除已验证的焦点适配来换取表面一致。

普通布局用 `View` 的配方，不给每个原语建立改名包装。日期条、账号验证、榜单和媒体状态仍是 app 组合与业务，不因设计样板存在就进入基础包。

## 资源与演进

主题唯一源是 `theme.json`。官方 Lucide 0.468.0 SVG、ISC 许可证及每图 SHA256 位于 `assets/lucide/`。`pnpm ui:icons` 从这些源生成 NSH 几何和浏览器图标；`pnpm ui:icons:check` 检查漂移。原始 SVG 和生成结果都不能手工改图形。升级时从同一官方版本更新源与校验，再生成三方输出。

浏览器产品原型与组件板复用 `design/prototype/shared`。HTML 与 NSH 使用各自渲染适配，共享视觉契约和图标来源；不可把 DOM/CSS 运行时导入 NSH。新增状态同步更新 [设计交接](../../docs/design/component-design.md)、[覆盖清单](../../docs/design/component-coverage-audit.md)、[演进规划](../../docs/design/component-roadmap.md) 与原生验收页。

## 验证

- `pnpm ui:check`：三端对组件验收入口执行 NSH check **和** build。
- `pnpm ui:test`：三端入口的真实引擎行为测试。
- `pnpm ui:host`：macOS 可见宿主中的深浅主题与两端密度验收，证据写入 ignored artifacts；它不代表 Android TV。
- `pnpm ui:preview --target desktop`：显式组件预览；可选 web／tv。
- 完整工程仍运行 `pnpm verify`；依赖变化运行 `pnpm security`。缺工具必须失败。

还原度检查比较原设计与宿主中的颜色、字级、几何、对齐、状态、图标及动效；完整度检查逐项映射公共导出、样例、状态和行为证据。编译通过或 headless 通过均不能替代视觉与真机。待验收项如读屏、系统大字、真实遥控、输入法、物理电视必须明确记录。
