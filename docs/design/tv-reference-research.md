# TV 竞品研究依据

取证日期：2026-11-23～24。本文是本次TV重设计外部证据的唯一记录，记录选定版本、静态代码／资源、有限运行观察和公开截图；不表示此后版本或所有设备行为。设计决定见[TV重设计](tv-redesign.md)，实现方式与验收任务见[组件化规划](../../openspec/changes/compose-tv-v4-from-shared-components/design.md)。

## 证据边界

- REA反编译与Android SDK资源解析只能确认所列静态路径和声明值，不能恢复完整原始工程或证明全部运行行为。动态模块、反射、JNI及后续绑定覆盖未穷尽。
- 飞牛安装和初始页面有模拟器运行证据，影视服务器未连通；片库、详情和播放仅有公开截图／静态证据。
- 云视听小电视受ABI与模拟器架构限制，没有本机运行画面。公开截图来自不同版本，不是当前APK的运行验收。
- 界面画布、设备输出和视频解码分辨率分别记录；原始sp／dp／px不可直接跨实现比较。厂商没有统一采用某一个适配库。

## 公开截图

共19张原图已在取证时查看。以下只保留来源索引，图片仍在原站；不将第三方品牌、海报或图标用于红果生产素材。截图支持视觉结构观察，不能证明焦点缩放、自动隐藏、按键路径或返回恢复。

| 来源                                                                            | 图片性质／版本边界                                                             | 图号    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| [飞牛官方帮助中心](https://help.fnnas.com/articles/v1/start/install-tv)         | 登录操作截图，具体客户端版本未标注                                             | F08–F09 |
| [飞牛官方 App Store TV 页面](https://apps.apple.com/cn/app/飞牛tv/id6751794344) | **Apple TV 宣传图**，可参考结构，不能认作 Android 1.5.1 实拍                   | F05–F07 |
| [电视猫飞牛页面](https://www.tvmao.com/hmsoft/477407.html)                      | 第三方转载；图片可见飞牛 TV 标识，截图版本未知；不采用页面的直播／社交介绍文案 | F01–F03 |
| [东坡下载飞牛 TV 页面](https://www.uzzf.com/ydapp/729066.html)                  | 页面标注 Android 1.0.8，画面是宣传合成图，不能确定截图对应版本                 | F04     |
| [沙发管家小电视页面](https://app.shafa.com/apk/yunshitingxiaodianshi.html)      | 页面标注 1.8.9；图片未标版本，不能用页面版本号替图片定版本                     | B01–B04 |
| [投影网搜索示例](https://www.touying.com/t-45646-1.html)                        | 2021-06-04 发布的旧版搜索图，仅参考分区结构                                    | B05     |
| [简单下载站教程](https://www.pejdw.com/app/2188.html)                           | 只采用带云视听标识的三张播控教程图；剔除该页混入的紫色旧界面图；版本未知       | B06–B08 |
| [土豆下载个人中心教程](https://www.tdxz.net/azrj/3540.html)                     | 第三方教程，有红色标注箭头；版本未知                                           | B09–B10 |

| 页面                           | 图像                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F01 · 首页                     | [原图](https://apic.tvzhe.com/images/53/05/ec9587094c127b72a6bad7151c288f1da4a80553.png)                                                 |
| F02 · 片库                     | [原图](https://apic.tvzhe.com/images/91/37/ec94340ae17c20b7b82fa7f794c19d761a5c3791.png)                                                 |
| F03 · 播放参数                 | [原图](https://apic.tvzhe.com/images/55/ec/f483ec74d60091fbd553bf6f2c6cda63cec9ec55.png)                                                 |
| F04 · 详情宣传图               | [原图](https://pic.uzzf.com/up/2025-3/202533194654552640.png)                                                                            |
| F05 · 官方 Apple TV 首页宣传图 | [原图](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/64/ee/03/64ee0309-e403-2baa-2cd3-5e05853ab002/01.png/1286x724bb.webp) |
| F06 · 官方 Apple TV 筛选宣传图 | [原图](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/9c/d4/2e/9cd42e83-cef4-86f3-c662-ec3da6e80a6c/04.png/1286x724bb.webp) |
| F07 · 官方 Apple TV 播控宣传图 | [原图](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/58/97/bd/5897bdaf-d902-1ab9-b428-89bbf9f1cb5c/03.png/1286x724bb.webp) |
| F08 · 官方扫码登录示例         | [原图](https://help-static.fnnas.com/images/image-20240826204353433.png)                                                                 |
| F09 · 官方账号登录示例         | [原图](https://help-static.fnnas.com/images/image-20240824170606365.png)                                                                 |
| B01 · 推荐                     | [原图](http://img.sfcdn.org/f80c41e9e6346c6f86a3601984918042319da66b.jpg!545x307)                                                        |
| B02 · 热门                     | [原图](http://img.sfcdn.org/be30d773c1fdd2e339d520e7f2f10d8fd7ac2e52.jpg!545x307)                                                        |
| B03 · 电影频道                 | [原图](http://img.sfcdn.org/1fbf4218b16b66b471fe676280d72b8411c9814f.jpg!545x307)                                                        |
| B04 · 频道选择                 | [原图](http://img.sfcdn.org/67641016b91ccb8c1e0753f681b727f7b92f199e.jpg!545x307)                                                        |
| B05 · 搜索（2021 年旧图）      | [原图](https://tydata.touying.com/forum/202106/04/174344g9rz6k3lx9w36mff.png%21w800)                                                     |
| B06 · 播控                     | [原图](https://pics.pejdw.com/img/30141901kixjm4o3ruxszw.jpg)                                                                            |
| B07 · 播放设置一级菜单         | [原图](https://pics.pejdw.com/img/30141901d34cbqyjsnmvoel.jpg)                                                                           |
| B08 · 更多播放设置             | [原图](https://pics.pejdw.com/img/30141901ai3srrokuo3vl.jpg)                                                                             |
| B09 · 我的内容                 | [原图](http://pic.tdxz.net/up/2024-11/17316531296954969.png)                                                                             |
| B10 · 个人中心                 | [原图](http://pic.tdxz.net/up/2024-11/17316531678059645.png)                                                                             |

外部画面显示：飞牛将续播、媒体库和分类分行，播放参数分组；小电视将搜索输入、历史／建议和结果分区，个人内容与播放设置各有独立页面。官方Apple TV宣传图仅用于结构参考。红果如何采用这些线索由设计说明维护，不在研究文档重复列页面改造要求。

## 安装与运行观察

### 飞牛

用户提供的文件为`/Users/admin/Downloads/FNTV_1.5.1_0211111649.apk`，包内包含arm64-v8a、armeabi-v7a和armeabi。完整包身份及hash见下方静态样本表，不另维护一份。

在`hongguo-tv-api34-arm64`（Android TV API34、1920×1080、宿主density320）安装成功，实际观察协议、服务器选择、添加服务器与系统键盘。协议经用户接受并授权点击；安装期间按授权临时调整的测试AVD验证设置已恢复。没有连接影视服务器，不据此宣称已操作片库、详情、搜索、播放器或设置。

服务器选择页将低亮度海报背景与前景操作分离；添加服务器表单居中、地址单行、端口与协议并排，地址焦点有白色轮廓。系统键盘打开时地址／端口可见，连接按钮被遮住。完整方向键与返回恢复未验收。

截图在本机`artifacts/tv-fntv-research/`：`01-agreement.png`、`02-server-selection.png`、`03-add-server.png`、`04-keyboard.png`；不提交二进制产物。

### 云视听小电视

样本来自[哔哩哔哩下载中心](https://app.bilibili.com/)的[TV包](https://dl.hdslb.com/mobile/latest/android_tv_yst/iBiliTV-master.apk)。截至取证时，该入口只提供这一TV下载，手机32／64位链接不能作为TV其他架构的证据；样本原生库为armeabi-v7a。

固定arm64 AVD安装返回`INSTALL_FAILED_NO_MATCHING_ABIS`；另尝试官方API21 armeabi-v7a TV镜像，Apple Silicon Android Emulator返回`CPU Architecture 'arm' is not supported by the QEMU2 emulator`，classic入口也未启动。因此没有可复核的小电视运行画面。

包容器覆盖3427个条目，v1／v2／v3签名声明者一致、内容摘要自洽；这不等于发布者证书真实性已验证。早期缺工具的推测已由下方REA方法及资源证据取代。

## 飞牛与小电视静态证据

实际使用 REA CLI 6.8.0、JADX headless 0.7.1、Node 26.12.1、JDK25.0.3。JADX JAR SHA256 为 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`，已与上游 GitHub Release digest 比对，并校验 ZIP CRC。初始缓存工具损坏，不作为取证来源；完整工具使用版本固定下载并验 hash。没有修改 MCP 注册或系统配置。

资源表／二进制 XML 使用 Android SDK build-tools35.0.1 的 aapt2／aapt 读取。资源结果明确标为 Android SDK 证据，不冒充 REA Evidence；DEX 中的调用候选经 REA 反编译再确认。反编译得到 Java 表示和资源声明，不能保证恢复原始 Kotlin/Java 工程、未混淆命名或原生 C++ 源码。

| APK                      | 版本                       | SHA256                                                             |
| ------------------------ | -------------------------- | ------------------------------------------------------------------ |
| `com.xiaodianshi.tv.yst` | 云视听小电视1.9.0 / 109000 | `bdee21c78d4da7ebac8a9030292f41be005a50950fad844a18cecd350023209e` |
| `com.trim.tv`            | 飞牛TV1.5.1 / 15102        | `b2cc8c3c45ccdca2678eb91d6a42ff4fbcbc0ead3e1673f6de74dfba504c0ae8` |

本机完整证据保存于 `.local/tv-apk-source-audit/`（忽略提交）。下文列出稳定的 APK 成员、资源ID、类／方法与 Evidence ID，便于按同一包复核。缺失工具必须报告，不静默换成截图推测。

## 飞牛：以设计宽1920重算 density

已在 manifest 中观察到 `design_width_in_dp=1920`、`design_height_in_dp=1080`，并注册 `me.jessyan.autosize.InitProvider`。REA 反编译确认了以下链路：

1. `InitProvider.onCreate()` 初始化 `AutoSizeConfig`，并设置 `setUseDeviceSize(false)`。
2. `AutoSizeConfig.init(Application)` 使用默认宽度基准；静态引用查询中没有找到应用对 `setBaseOnWidth` 的调用。
3. `AutoSize.autoConvertDensity` 按目标屏幕宽／设计宽计算 density；scaledDensity 默认保留初始字体密度与初始density的比值，也包含私有字体倍率／排除系统倍率分支。
4. `com.trim.tv.ui.main.MainActivity.getResources()` 在主线程调用 `AutoSizeCompat.autoConvertDensityOfGlobal(resources)`，后者读取同一全局配置，没有另传新的设计尺寸。

核心公式的简化表达（静态代码，不是运行日志）：

```text
density = screenWidthPx / 1920
scaledDensity = density × (initialScaledDensity / initialDensity)
```

本包没有查到 `setExcludeFontScale`、`setPrivateFontScale` 的静态调用。由此支持默认路径保留系统字体倍率；不能据此排除反射、动态代码或某些非sp文字绕过倍率。

在屏幕宽1920、系统字体倍率1、DP/SP支持开启且没有其他覆盖的条件下：`28sp → 28px`，归一到红果960宽逻辑坐标等效14。不能将资源中的28sp与红果14直接比较为“大一倍”。字体倍率变化时，使用dp而非sp声明的文字也不自动获得同样的字体放大。

### 飞牛应用自有资源

以下为原始声明值；最后一列只是在上述条件下换算到960设计坐标，不能当成任何设备的运行实测。

| 归属                 | APK资源／XML控件                                    | 原始值                        | 960坐标等效             |
| -------------------- | --------------------------------------------------- | ----------------------------- | ----------------------- |
| 首页导航             | `res/qI.xml` / `item_home_tag` / `tv_home`          | 36sp，左右27dp                | 字号18、左右13.5        |
| 顶部账号／搜索／设置 | `res/nU.xml` / `view_menu_info` / `FocusButtonView` | 60×60dp                       | 30×30                   |
| 顶部工具内部文字     | `res/Dt.xml` / `view_focus_button_inner`            | 图标32sp、文字28sp            | 图标16、文字14          |
| 竖封面卡片           | `res/Z7.xml` / `item_movies`                        | 宽260dp、标题28sp、副标题24sp | 宽130、标题14、副标题12 |
| 详情信息             | `res/Mc.xml` / `view_media_detail_info`             | 标题56sp、副标题32sp          | 标题28、副标题16        |
| 播放参数标签         | `res/06.xml` / `PlayControlTextStyle`               | 文字32dp、高64dp              | 文字16、高32            |
| 媒体工具栏播放图标   | `res/0x.xml` / `view_media_button`                  | 高80dp、最小宽80dp            | 高40、最小宽40          |

最后一行不是已确认的详情主播放 CTA。`activity_media_detail` 只有根 FrameLayout，主 CTA 的程序化构建本轮没有完整追查，不能用媒体工具栏控件替代其证据。完整原始链与v22/default区别见本机 Android SDK 报告。

### 飞牛 REA 关键证据

| 方法／检查                       | Evidence ID                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| InitProvider.onCreate            | `ev_ef790646d134e2855b5aba7a5fea15fd4ab8a3c620ec9fc2766178d78532841c` |
| AutoSize.autoConvertDensity      | `ev_581e63ca40caa2a1979ef997ff290bfbb07789cc964bfcdb3bd43645d08d0e4a` |
| AutoSizeConfig.init(Application) | `ev_1d7380ec62feaecaf8c48438a3ee2d0d503bcfa989de7652d44d46652bc7234b` |
| MainActivity.getResources        | `ev_912be453c24d677acf4c7b0c01d1dc526cfb3ce8adccc73ee3cc09b5ad390c79` |
| AutoSizeCompat 全局适配          | `ev_b52b38c0f453e2b03dc1006a1b1dbcb6bcba0dd2fd3ef5230c916e2fbc36134b` |

## 小电视：分辨率限定资源与px尺寸

REA `inspect_android_package` 已加载本包17121个类。Android SDK 对资源表的解析显示多套 `nodpi-<宽>x<高>` 配置，包含960×540、1366×768、1920×1008、1920×1080、2560×1440、3840×2160、4096×2160等。这里是资源配置标签，不是原 APK 内未经混淆的目录名。

尺寸主要通过 `@dimen` 引用，所列条目单位为 **px**。同一个布局控件引用同一个资源ID，由 Android 根据应用当前配置选择对应值；不是把资源数字当成sp再乘一次系统density。Android 的替代资源匹配机制见[官方资源说明](https://developer.android.com/guide/topics/resources/providing-resources)。

| 资源ID／用途                             | 960×540配置 | 1920×1080配置 | 3840×2160配置 |
| ---------------------------------------- | ----------: | ------------: | ------------: |
| `0x7f070284`：卡片标题资源               |        14px |          28px |          56px |
| `0x7f070242`：卡片副标题资源             |        11px |          22px |          44px |
| `0x7f07042b`：搜索键盘宽度               |       330px |         660px |        1320px |
| `0x7f070457`：首页导航／搜索方式标签高度 |        35px |          70px |         140px |
| `0x7f07030a`：首页导航／搜索方式标签字号 |        20px |          40px |          80px |

资源链：

- `layout0x7f0c0052 → r/gc.xml → SearchKeyboardView(id/keyboard_view)`，宽度引用 `0x7f07042b`。
- `layout0x7f0c01b9 → r/l#.xml → search_system_tab/search_phone_tab`，高度引用 `0x7f070457`，字号引用 `0x7f07030a`。
- `MainTitleRecyclerAdapter.onCreateViewHolder()` 在普通导航分支加载 `R.layout.item_main_title`；REA 的 R.layout 字段值将其对应到 `layout0x7f0c012f → r/jw.xml`。该布局的导航高度／文字也引用 `0x7f070457`／`0x7f07030a`，即960配置下35px／20px。分区管理分支另加载 `layout0x7f0c03c8 → r/tr.xml`，不与普通导航混为一种控件。这里是布局声明值，未穷尽绑定或焦点状态中的覆盖。
- 卡片候选 `layout0x7f0c0281 → r/oz.xml`，包含 `main_item_container`、`iv_cover`、`tv_title`、`tv_sub_title`；标题／副标题引用上表资源，960配置外框213×124px。候选的实际适配器绑定需单独建立，不能只凭资源名认定所有首页卡都使用这一布局。
- 已建立的另一条卡片链是 `VideoVHItemBinderV3.onCreateViewHolder` → `VideoVHV3.Companion.create` → `bl.vj4.recycler_item_topic_video_cts_v3` → `layout0x7f0c026c → r/oe.xml`，声明外框为960配置204×115px、1920配置408×230px。该布局标题为18／36px、副标题12／24px，XML初始为INVISIBLE；尚未核对后续绑定如何显隐或覆盖。它与上面的14px标题候选不是同一布局，不能将14说成小电视所有首页卡片的字号。绑定器方法的 REA 表示为smali，Companion.create为Java。

### 小电视适配代码核对边界

- `BaseActivity.attachBaseContext()` 包裹字体Context；`onCreate()` 加载页面布局。已查看方法里没有飞牛式重算density的逻辑。
- Android SDK 对包内7个DEX的有界指令扫描未发现直接写入 `DisplayMetrics.density` / `scaledDensity` 的指令。应用侧 `Resources.updateConfiguration` 候选 `bl.o74.g` 经 REA 确认是在替换AssetManager后沿用现有Configuration刷新资源，未传新的DisplayMetrics。这是包内静态查询边界，不是“所有路径绝无修改”的证明。
- 已确认的资源机制支持相同控件在分辨率配置下保持近似占屏比例；不能从资源表推出55/75英寸电视分别采用不同字号，也不能由4K面板直接断言应用一定命中3840×2160资源。设备暴露的应用画布与资源配置仍需运行观察。
- 未穷尽下载的动态模块、JNI改写或每一种异常分辨率的最终匹配。未测字体系统倍率对全部px控件的最终影响。

| 方法／检查                                      | REA Evidence ID                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| 包身份、加载覆盖                                | `ev_aca8f901b9107ca80394a74f59ca0cc1394aecdcb3d6ca379c6bb25d9dfc04ff` |
| BaseActivity.attachBaseContext                  | `ev_5efa2b3e451b4460a4493968dad1c9796477bcd83b3bd5a14fa4588b2b8c8d6e` |
| BaseActivity.onCreate                           | `ev_fb8763892e5a65f65ba0fb9fd88f3a6fa1b2ad3ad93174859e3dca0d5b073348` |
| bl.o74.g                                        | `ev_32958d49f9d260df8346ca193bbfe8590b22af0597e3ccbc403d2e7469fa8535` |
| MainTitleRecyclerAdapter.onCreateViewHolder     | `ev_1fda22c614d8813c75015f4caa4e1caf8f4f01e1430ecb29036ac5c26be68a69` |
| R.layout字段与布局ID                            | `ev_87f6b899f1403b3be33e9b133f3849df35dcce3661b8699613ae86c51b70f3f2` |
| VideoVHItemBinderV3.onCreateViewHolder（smali） | `ev_dcad47af516de3c78c4ec48faf111240a6e3c411f6f48c18597834615de98853` |
| VideoVHV3.Companion.create                      | `ev_7f13ec2237a584c8745338b7a7eaf56e6384049f67c8c923757890fee925a737` |
| bl.vj4字段与卡片布局ID                          | `ev_2dafbd8deec8f794ea3cec33b74ddf731bff38c2806ec2146e0c2d234af29471` |

## 其他厂商静态证据

本节由本轮 REA／Android SDK 静态取证补齐。版本、下载来源、入口与限制随各样本一起记录；未恢复原始完整工程，不将方法反编译描述为运行观察。

### 腾讯 · 云视听极光

来源链为[腾讯视频官方下载](https://v.qq.com/download.html) → 官方JS → `cache.wuji.qq.com`的 `downloadpage_config` → `vmat.gtimg.com` APK。包名 `com.ktcp.video`，20.5.0.1015／1279006，SHA256 `0996e1b777c26ebb3812953becbfa6d0e899b343d3662e33fa8c63387e635903`。原始下载配置和最终地址保存在本机报告，未用市场包替代。

实际接入 `com.ktcp.video.helper.autosize` 命名空间内的AutoSize实现：manifest注册InitProvider，`onCreate`初始化全局配置；默认按宽度计算，设计尺寸getter直接返回960／540。`TaskAutosize.execute → a()`设置SP支持开关，并通过provider查询触发多进程初始化。初始化代码还注册Activity生命周期适配。

简化公式为 `density = screenWidthPx / 960`；默认SP路径为 `scaledDensity = density × (initialScaledDensity / initialDensity)`。例如1920宽输入对应density2，但这是公式示例，不是本次实际运行值。

SP支持由MMKV键 `is_support_sp`控制，默认字符串“1”开启；关闭分支仍写scaledDensity，改用新建Configuration的默认fontScale。因此不能将其概括为“所有设置下永远跟随系统字号”。资源表同时含dp／sp／px及屏幕、密度限定配置，也不意味着每个控件都只靠同一公式。

| REA方法                 | Evidence ID                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| InitProvider.onCreate   | `ev_f38368ca2d1ca350239dfa7bb0061da9fd3baa217c5757c9209700ccf2bcbb1e` |
| AutoSizeConfig.init三参 | `ev_4b63242e066ff589f189f4802f03542361e6b5cafd5d0940c38e4a9e51c352f8` |
| 设计宽960               | `ev_714c677ecae53a56e3eeeff961bf53027b87725f936be03fda2eb7f820121e27` |
| TaskAutosize设置与入口  | `ev_8004b72a07e1cd752db7ca04743cec903642cf8e478d99cd73031430baff1b4f` |
| 密度换算                | `ev_e38763692ff8340fd9f10d7161d28f9e64e89c97d4d96dc443e50c33154ed5ef` |
| SP开关                  | `ev_464db47f8b2b9f4f7cb2509d9b41986373885d4d7bc0f8d2a6f9fe85f8239947` |
| metrics写入与关闭SP分支 | `ev_3ffa7abc0adae0b23005584a2c591ad7c5b65a888dfcd7a558200261f0b730c8` |

### 爱奇艺 · 银河奇异果

官网[下载页](https://www.iqiyi.com/appstore.html)直接链接 `https://app.iqiyi.com/lequ/20260908/qiyiguo_official16.9.0.apk`。本次实际包名 `com.gitvdemo.video`，版本16.9.0.221245／221245，SHA256 `b8709e436c6b2f8f36ee79dfe2ca996d6a5439b343bef57d97d3c1232392e674`。身份按实际 manifest 记录，不由文件名推断。

主要观察到按可用宽度分档的资源：`w480dp`、`w640dp`、`w768dp`、`w853dp`、`w960dp`、`w1181dp`、`w1280dp`、`w1442dp`、`w1920dp` 等。**这些是宽度 dp 限定符，不是物理像素分辨率。** Android 按当前配置匹配可用资源，不能把w1920dp说成所有1080p电视会命中的档位。[Android资源机制](https://developer.android.com/guide/topics/resources/providing-resources)

| 资源                    | w960dp | w1280dp | w1920dp |
| ----------------------- | -----: | ------: | ------: |
| `dimen_40dp`            |   30dp |    40dp |    60dp |
| `dimen_24sp`            |   18sp |    24sp |    36sp |
| `text_size_title_small` |   15dp |    20dp |    30dp |

默认资源与w1280dp的数值相同，支持其资源数值以该档为基准；不据此宣称恢复了原始设计稿。`epg_home_tab_item`（0x7f0a009b，`r/o/zq.xml`）根高度引用 `dimen_40dp`，内部 `KiwiMarqueeText` 字号引用 `text_size_title_small`。表内是声明值，未追全部绑定或焦点覆盖。

REA确认的代码：

- `ResourceUtil.getDimensionPixelSize(int)` 最终调用 `Resources.getDimensionPixelSize` 并缓存；在ToB支持分支，先把 `Configuration.fontScale` 设为1再刷新配置。
- `BaseActivity.getResources()`、`QBaseActivity.getResources()` 初次调用时将Configuration设为默认值，沿用当前DisplayMetrics刷新资源。选定方法中没有按固定设计宽重算density的代码。
- 包内六个DEX的有界扫描没有检出直接写入DisplayMetrics的density／scaledDensity／densityDpi。热修复、反射、JNI、动态插件或其他Context路径仍未穷尽，不能将此结果扩大为“全部路径绝不改density”。

| REA方法                            | Evidence ID                                                           |
| ---------------------------------- | --------------------------------------------------------------------- |
| 包身份                             | `ev_c684bb96ef82fbfd28deb268ddc5270e99cef9358104b9146dfd266755de92d3` |
| BaseActivity.getResources          | `ev_f0e56f4d398be3533d0ca5b32e835192ddd7fe049e69dd143a1d1099ac07a124` |
| QBaseActivity.getResources         | `ev_62e3391c0dee72fb9f1c4e2307a3cd0e31f4316845bab91baa75cf138d45c885` |
| ResourceUtil.getDimensionPixelSize | `ev_ba244f7d7d3dfa2c0989678621b3a7b2c6684269ea75268738c12aa946304857` |

### 优酷 · 酷喵

[酷喵官网](https://pd.youku.com/CIBN?screen=phone)的 `window.__KUMIAO_LINK`直接指向`gtvappstore.alicdn.com` APK。样本 `com.cibn.tv`，13.0.1.3／2131300103，外层SHA256 `4ace7997cc498c265428bf4c2d53ab37a3d8ea1dfc9743b495f3cbbdcf8a16a7`。外层还嵌入 `assets/com.cibn.tv.apk`，其SHA256为 `5266451fcddd9a5656489e205d8d28c6a232f5bb0d0d05618a1132b6e71c57f2`；插件声明使用宿主DEX，故需同时查看外层代码与内层业务资源。

`BaseActivity.onCreate`在super调用前，在代理非空时调用`ScreenResolutionProxy.getProxy().updateDensity(this)`；`OneServiceInitEntry.injectByInitJob`明确配置实现类；该实现更新Application和当前Activity的Context。最后的 `d.t.f.o.i.a(Context)`执行：

```text
density = widthPixels / 1280
scaledDensity = density
densityDpi = int(160 × density)
configuration.fontScale = 1
resources.updateConfiguration(configuration, metrics)
```

包内还有A80／IME机型将宽度修正到1024的特例。这里明确固定字体倍率，不建议将此行为直接搬入红果。

部分卡片不是直接使用dp数值：`ResourceKit.canvasToPixel(value)`先除以1.5，再经当前density将dp换成px；`ItemVideoComFlex.bindData`实际用它消费布局width／height。与上方公式组合，可推导这部分布局为 `px ≈ canvasValue × widthPixels / 1920`，含取整误差。**这是选定卡片链的组合推断，不是全应用统一1920画布的证明。**

内嵌资源另有dp／sp常规资源，以及 `nodpi-1280x672`、`nodpi-1920x1032`、`nodpi-3840x2112`等旧式分辨率限定px表。资源存在不证明当前页面选中；aapt2报告21条文件引用缺失警告，资源表读取成功，但未保证图片资源完整。

`injectByInitJob`的静态incoming references为0，可能由反射或生成调度接入，未建立Application到该注入方法的完整可达链。因此本轮确认的是“业务基类的真实静态调用、明确注入配置与具体公式”，不是运行时已验证启用；也未追动态插件替换或云端模板覆盖。

| REA方法                   | Evidence ID                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| BaseActivity.onCreate     | `ev_bb3b235619d5136eece033c48924858098bcfe51e5555497cfe6ee27acb4a2cd` |
| 实现注入配置              | `ev_2a4b4e5a0de07a6f6266e3590278cb1bd253184978d7854da3960df642eaa422` |
| UpdateDensity具体公式     | `ev_234d729377804660e9c83f89c07d5c1283b722f4e90043862eb0131d37e32999` |
| ResourceKit.canvasToPixel | `ev_0948fef578d5b8705599e8d345765c89102addb550dbe75afd9835a34ed71d30` |
| ItemVideoComFlex.bindData | `ev_4087833c7b14d9636efef356d31f80e39c81713c414a6e7de8cc2676457d6ef2` |
| 注入入口引用查询          | `ev_df2a0cb2d710b6d06dd1e5d8133c775475c9363df673a4a52eeaf1c8b40e1e55` |

### 芒果 TV · 沙发渠道样本

本轮未从当前芒果官网取得可确认的电视APK入口，实际分析的是[沙发市场TV页面](https://app.shafa.com/apk/mangguotv.html)提供的渠道包。包名 `com.starcor.mango`，版本 `7.1.901.390.3.SHAFA_TVAPP.0.0_Release`／26101218，SHA256 `b35494a452d848bd2bd72396df6893f9b86758f3125de697ead691e8da9c67e9`。manifest的leanback启动入口与横屏声明已确认；未建立该包与官网原包的字节一致性，不外推酷开／当贝／其他版本。

`com.mgtv.tv.screen.DensityHelper`构造时将设计宽设为960，按 `density = applicationMetrics.widthPixels / 960` 换算；`scaledDensity = density × (savedScaledDensity / savedDensity)`，densityDpi取 `int(160 × density)`。随后写入Application、非空Activity及可选附加Resources。注册配置回调，在fontScale变化时更新保存的scaledDensity。

这不是仅发现一个类：`ResourceInit.init`直接创建并调用DensityHelper，`BaseActivity.onCreate`也在super调用前接入；`skipScreenFix()`基类默认返回false。没有穷尽子类override或动态覆盖，因此只确认该默认静态路径。

资源以dp为主，`sp_20`虽然名字含sp，实际声明为**20dp**，再次说明不能用资源名代替实际单位，也不能将保留字体倍率的换算公式扩大成“每个标签都跟随系统字号”。

| REA方法                         | Evidence ID                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| DensityHelper构造（smali，960） | `ev_8cc2fdfe15e95c4a81f0f1f6333a5cc2a3c5d705658c06a4c6c5997655327b72` |
| applyCustomDensity四参          | `ev_fbe3d698d0a4fdffc5ade6bcd84ef4f1e9ceed68539f256172d70887673ddcb0` |
| ResourceInit.init               | `ev_0783085fdc32a24ed247340731054c4d29ae0ea4c78ddeea0c7498aa0b3f31ae` |
| BaseActivity.onCreate           | `ev_ea45d2c31171a472fef975139b7637b1749d82320e95c63dba9798cd1f40d649` |
| skipScreenFix                   | `ev_0cca008b043e4b357ca29a9c6302640a74f7188a8e46053b188aa824e1d43c21` |

## 平台规范对照

以下是平台给应用开发者的要求／建议，不是Netflix、YouTube或各厂商系统桌面的源码结论。

| 平台                                   | 官方机制／建议                                                                                                      | 对设计的意义                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Google Android TV                      | 以960×540 MDPI设计，使用dp，按比例适配HD／4K                                                                        | 统一逻辑尺寸，不按屏幕像素重新放大控件                         |
| Amazon Fire TV（Android／Fire OS范围） | 文档列出1080p画布1920×1080、density320；720p画布1280×720、density213，均约960×540dp                                 | 正常使用dp即可稳定占屏比例；UI画布可与连接电视的输出分辨率不同 |
| Samsung Tizen Web应用                  | 固定应用坐标／viewport与平台缩放；当前General Specifications将应用分辨率列为1920×1080                               | 4K／8K视频能力不代表应用布局按同样像素数绘制                   |
| LG webOS Web应用                       | 官方列出FHD机型1280×720图形画布、UHD机型1920×1080图形画布；`appinfo.json`的resolution选择画布，建议按目标提交两种包 | 图形分辨率与视频分辨率分开，UHD视频3840×2160不等于Web界面4K    |

来源：[Google布局规范](https://developer.android.com/design/ui/tv/guides/styles/layouts)、[Amazon显示与布局](https://developer.amazon.com/docs/fire-tv/display-and-layout)、[Samsung General Specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)、[Samsung分辨率管理](https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html)、[LG应用分辨率](https://webostv.developer.lge.com/develop/specifications/app-resolution)。

Samsung文档存在口径差异：分辨率管理页仍列UHD1920×1080／FHD1280×720，而当前General Specifications列Application1920×1080（All models）。因此保留页面与机型边界，不把旧表写成所有当前设备的唯一事实。两页均支持“界面画布与面板／视频分辨率分开处理”的结论，目标电视仍需实际确认。

## 证据位置与未覆盖项

其他厂商的完整REA JSON、Android SDK资源／manifest、下载来源与hash保存在忽略提交的`.local/tv-vendor-adaptation-research/`。本轮未启动这些厂商APK，酷喵启动注入可达性、动态覆盖及资源警告按各节保留；芒果仅代表所选沙发渠道包。

原生字体倍率、每页全部控件、详情主CTA、异常分辨率最终资源匹配及真实媒体流程未完整验证；物理电视观看距离按平台限制记录。公开截图、公式换算或静态方法调用均不计作这些验收通过。原始反编译与APK不进入生产源码。
