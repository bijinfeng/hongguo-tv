const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

/** Presentation only. Values and actions are owned by the board's shared controller. */
export function foundationSheet(ctx) {
  const { icon, section, row, sample, state } = ctx;
  const tv = state.platform === 'tv';
  const gaps = tv ? [8, 12, 16, 24, 32, 48] : [4, 8, 12, 16, 24, 32, 40];
  const glyphs = [
    ['play', '播放'],
    ['search', '搜索'],
    ['bookmark', '收藏'],
    ['bell', '预约'],
    ['settings', '设置'],
    ['arrow-left', '返回'],
    ['check', '已选'],
    ['circle-alert', '读取失败'],
  ];
  return (
    section(
      '文字',
      row(
        '层级',
        `<div class="type-scale">
          <div><span class="type-page">找一部想看的</span><small>页面标题 · ${tv ? '48' : '32'}</small></div>
          <div><span class="type-section">继续观看</span><small>栏目标题 · ${tv ? '32' : '24'}</small></div>
          <div><span class="type-title">选集</span><small>面板标题 · ${tv ? '24' : '20'}</small></div>
          <div><span class="type-content-title">重返1998</span><small>卡片剧名 · ${tv ? '24' : '18'}</small></div>
          <div><span class="type-body">从上次看到的地方继续。</span><small>正文与操作 · ${tv ? '22' : '16'}</small></div>
          <div><span class="type-meta">都市 · 已完结</span><small>元信息 · ${tv ? '20' : '14'}</small></div>
        </div>`,
      ) +
        row(
          '数字与长文',
          `<div class="foundation-text-pair"><div class="numeric-spec"><time>00:36 / 02:00</time><span>第 12 集 / 共 72 集</span></div><p class="long-copy">${tv ? '在客厅里，剧名和当前操作需要一眼看清。标题可换行，操作名称完整保留。' : '从搜索结果进入详情，选好剧集后开始观看。阅读文字自然换行；剧名较长时优先保留完整标题。'}</p></div>`,
        ),
    ) +
    section(
      '间距与表面',
      row(
        '间距档位',
        `<div class="spacing-scale">${gaps.map((gap) => `<div class="spacing-sample"><span style="--space:${gap}px" aria-hidden="true"></span><small>${gap}</small></div>`).join('')}</div>`,
      ) +
        row(
          '表面关系',
          `<div class="surface-spec"><div class="surface-content"><strong>内容对象</strong><span>共 72 集 · 已完结</span></div><div class="surface-muted"><strong>次级状态</strong><span>暂无观看记录</span></div><div class="surface-page"><strong>边界分组</strong><span>自动播放下一集</span></div><div class="surface-cinema"><strong>影院内容</strong><span>00:36 / 02:00</span>${icon('play')}</div></div>`,
        ) +
        row(
          '边界与焦点',
          `<div class="samples">${sample('普通边界', '<div class="boundary-sample">输入与选择</div>')}${sample('选中', `<div class="boundary-sample is-selected">${icon('check')}已收藏</div>`)}${sample('选中与焦点', `<div class="boundary-sample is-selected force-focus">${icon('check')}已收藏</div>`)}</div>`,
        ) +
        row(
          '分隔',
          '<div class="separator-spec"><div><span>观看记录</span><span class="type-meta">本地保存</span></div><hr /><div><span>自动播放下一集</span><span class="type-meta">开启</span></div></div>',
        ),
    ) +
    section(
      '图标与身份',
      row(
        '统一图标',
        `<div class="foundation-icons">${glyphs.map(([name, label]) => sample(label, icon(name))).join('')}</div>`,
      ) +
        row(
          '头像占位',
          `<div class="samples">${sample('标准', '<span class="avatar-spec" role="img" aria-label="游客头像">访</span>')}${sample('大号', '<span class="avatar-spec avatar-large" role="img" aria-label="游客头像">访</span>')}${sample('账号行', '<div class="identity-spec"><span class="avatar-spec" aria-hidden="true">访</span><div><strong>游客</strong><span>观看记录保存在本机</span></div></div>')}</div>`,
        ),
    ) +
    section(
      '状态标签',
      row(
        '内容状态',
        '<div class="inline"><span class="status-tag">已完结</span><span class="status-tag">更新至 18 集</span><span class="status-tag tag-selected">已预约</span></div>',
      ) +
        row(
          '操作状态',
          `<div class="inline"><span class="status-tag tag-selected">${icon('check')}已收藏</span><span class="status-tag">${icon('loader-circle')}正在加载</span><span class="status-tag tag-error">${icon('circle-alert')}加载失败</span></div>`,
        ),
    ) +
    '<div class="contract"><span>同一套文字角色与语义颜色</span><span>头像和标签不伪装操作</span><span>标题、状态和动作不只靠颜色区分</span></div>'
  );
}

export function navigationSheet(ctx) {
  const { icon, button, section, row, state } = ctx;
  const tv = state.platform === 'tv';
  const navItems = ['首页', '刷剧', '找剧', '排行榜', '新剧'];
  const current = navItems.includes(state.navDemo) ? state.navDemo : '首页';
  const page = Math.max(1, Math.min(3, Number(state.pageDemo) || 1));
  const tabs = ['总榜', '真人剧', '漫剧'];
  const selectedTab = tabs.includes(state.sectionDemo) ? state.sectionDemo : '总榜';
  const navAction = (label, group, extra = '') =>
    `data-action="nav-demo" data-nav-group="${group}" data-value="${escape(label)}" ${extra}`;
  const nav = `<nav class="product-nav ${tv ? 'nav-horizontal' : 'nav-vertical'}" aria-label="主导航示例">${navItems.map((label) => `<button type="button" ${navAction(label, 'main')} aria-current="${label === current ? 'page' : 'false'}">${label}</button>`).join('')}</nav>`;
  return (
    section(
      '导航',
      `<div class="navigation-frame ${tv ? 'tv-navigation-frame' : ''}">${nav}<div class="navigation-content"><h3 data-nav-current>${escape(current)}</h3><span>内容区域</span></div></div>`,
    ) +
    section(
      '位置与返回',
      row(
        '返回来源',
        `<div class="inline">${button('返回搜索结果', { variant: 'quiet', glyph: 'arrow-left', action: 'nav-demo', extra: 'data-nav-group="trail" data-value="搜索结果"' })}<span class="type-meta">保留查询和列表位置</span></div>`,
      ) +
        row(
          '位置路径',
          `<nav class="breadcrumb-spec" aria-label="位置路径示例"><button type="button" ${navAction('搜索结果', 'trail')}>搜索结果</button>${icon('chevron-right')}<span aria-current="page">重返1998</span></nav>`,
        ),
    ) +
    section(
      '分区与分页',
      row(
        '页面内分区',
        `<div class="tabs" role="tablist" aria-label="排行榜分区示例">${tabs.map((label) => `<button type="button" role="tab" data-tab="${label}" ${navAction(label, 'section')} aria-selected="${label === selectedTab}" tabindex="${label === selectedTab ? 0 : -1}">${label}</button>`).join('')}</div><div class="tab-content" role="tabpanel" aria-label="排行榜分区内容" data-navigation-panel>${escape(selectedTab)}</div>`,
      ) +
        row(
          '已知页数',
          `<nav class="pagination-spec" aria-label="目录分页示例">${button('上一页', { glyph: 'chevron-left', action: 'nav-demo', disabled: page === 1, extra: 'data-nav-group="page" data-value="上一页"' })}${[1, 2, 3].map((value) => button(String(value), { variant: page === value ? 'selected' : '', action: 'nav-demo', extra: `data-nav-group="page" data-value="${value}" aria-label="第 ${value} 页" aria-current="${page === value ? 'page' : 'false'}"` })).join('')}${button('下一页', { glyph: 'chevron-right', action: 'nav-demo', disabled: page === 3, extra: 'data-nav-group="page" data-value="下一页"' })}</nav><p class="player-note">样例已知 3 页；不据此推断真实接口总页数。</p>`,
        ) +
        row(
          '未知总数',
          `<div class="load-more-spec">${button('加载更多', { action: 'nav-demo', extra: 'data-nav-group="page" data-value="加载更多"' })}<span class="type-meta">追加失败保留已加载内容，原位重试。</span></div>`,
        ),
    ) +
    '<div class="contract"><span>主导航、页面分区和分页各自持有状态</span><span>返回恢复来源；分页保留查询条件</span><span>同一动作与值，仅按空间改变排列</span></div>'
  );
}
