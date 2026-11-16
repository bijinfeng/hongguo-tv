# 红果短剧官网风格
黑色与炭灰构成内容层级，红果橙只标记关键动作；海报留白、清晰对齐和系统中文字体建立跨端秩序。

```css
:root {
  --bg: #000;
  --surface: #131414;
  --fg: rgba(255, 255, 255, .92);
  --muted: rgba(255, 255, 255, .58);
  --border: rgba(255, 255, 255, .12);
  --accent: #fa7705;
  --display-font: "Songti SC", "STSong", "Noto Serif CJK SC", serif;
  --body-font: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  --mono-font: "SFMono-Regular", Consolas, monospace;
}
```

- 夜间阅读以黑色与炭灰表面分层，播放器保留深色。
- 大标题用中文系统宋体，导航和正文使用中文系统黑体；CJK 标题行高不低于 1.3。
- 12 列桌面网格；TV 使用 1920×1080 固定画布。
- 红果橙用于关键动作和当前焦点，不铺满导航与标签。
- 采用项目内的官网真实 Logo 与海报，保留原始宽高比及完整画幅；失效图片保留标题和中性占位，不使用远程热链或社交数据。
