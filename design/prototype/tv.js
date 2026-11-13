/* TV presentation is independent of desktop layouts; only demo models/actions are shared. */
function tvHeader() {
  const section = ['home', 'feed'].includes(state.route)
    ? 'home'
    : ['discover', 'ranking', 'new', 'search'].includes(state.route)
      ? 'discover'
      : state.route === 'following'
        ? 'following'
        : ['library', 'history', 'favorites', 'downloads'].includes(state.route)
          ? 'library'
          : '';
  return `<button class="tv-brand" data-route="home" aria-label="红果首页">${icon('play')}红果</button><nav class="tv-navigation" aria-label="TV 主导航">${[
    ['home', '精选'],
    ['discover', '找剧'],
    ['following', '追剧'],
    ['library', '我的'],
  ]
    .map(
      ([route, label]) =>
        `<button data-route="${route}" ${section === route ? 'aria-current="page"' : ''}>${label}</button>`,
    )
    .join(
      '',
    )}</nav><div class="tv-header-tools"><button class="tv-icon" data-route="search" aria-label="搜索短剧">${icon('search')}</button><button class="tv-icon" data-action="account" aria-label="${state.loggedIn ? '我的账号' : '登录账号'}">${icon('user')}</button><button class="tv-icon" data-route="settings" aria-label="设置">${icon('settings')}</button></div>`;
}
function tvCards(items = dramas) {
  return `<div class="tv-poster-row" data-focus-group="posters">${items.map((d) => `<button class="tv-poster" data-detail="${d.id}"><span class="tv-poster-art">${posterImage(d)}${state.history.includes(d.id) ? '<span class="tv-watched">看过</span>' : ''}</span><strong>${d.title}</strong><span>${d.note}</span></button>`).join('')}</div>`;
}
function tvFeature(d, detail = false) {
  const seen = state.history.includes(d.id);
  const primaryLabel =
    state.season === 2 && detail
      ? state.reservations.has(d.id)
        ? '已预约'
        : '预约第二季'
      : seen
        ? `继续第 ${d.episode} 集`
        : '开始观看';
  return `<section class="tv-feature ${detail ? 'tv-detail-feature' : ''}"><div class="tv-feature-art">${posterImage(d, '', `${d.title}概念封面`)}</div><div class="tv-feature-copy"><h1>${d.title}</h1><p class="tv-meta">${d.note}　${d.tags.slice(0, 2).join(' · ')}</p><p class="tv-synopsis">${d.desc}</p><div class="tv-feature-actions">${button(primaryLabel, detail && state.season === 2 ? 'reserve' : seen ? 'resume' : 'play', { value: d.id, variant: 'primary', image: detail && state.season === 2 ? 'bell' : 'play', attrs: 'data-tv-initial="true"' })}${detail ? button(state.favorites.has(d.id) ? '已收藏' : '收藏', 'favorite', { value: d.id, image: 'bookmark' }) : button('选集与详情', 'detail', { value: d.id, image: 'list' })}${detail ? button(state.follows.has(d.id) ? '已追更' : '追更', 'follow', { value: d.id, image: 'bell' }) : ''}</div>${detail ? `<p class="tv-cast">${d.cast}</p>` : seen ? `<p class="tv-resume-time">上次看到 ${formatTime(d.position || 0)}</p>` : ''}</div></section>`;
}
function tvHome() {
  const d = dramaById(state.history[0]) || dramas[0];
  return `${statusContent() || tvFeature(d)}<section class="tv-shelf"><div class="tv-section-heading"><h2>接下来想看</h2>${button('全部短剧', 'discover', { image: 'forward' })}</div>${tvCards(dramas.filter((item) => item.id !== d.id).concat(d))}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>新剧与热播</h2></div><div class="tv-destination-row">${button('上新日历', 'new', { image: 'calendar' })}${button('排行榜', 'ranking', { image: 'chart' })}${button('刷剧', 'feed', { image: 'play' })}</div></section>`;
}
function tvDiscover() {
  const q = state.query.trim();
  const items = discoverItems(state);
  const filters = [
    ['kind', '类型', ['全部', '真人剧', '漫剧']],
    ['genre', '题材', ['全部', '重生', '古装', '都市', '悬疑', '家庭']],
    ['sort', '排序', ['综合', '最新', '热度']],
  ];
  return `<div class="tv-page-heading"><h1>${q ? `“${escapeHTML(q)}”` : '找剧'}</h1>${button('搜索短剧', 'search', { image: 'search' })}</div><section class="tv-filter" aria-label="筛选短剧">${filters.map(([key, label, options]) => `<label><span class="sr-only">${label}</span><select class="field-input" id="tv-${key}" data-discover-filter="${key}">${options.map((value) => `<option value="${value}" ${value === (state[key] || '综合') ? 'selected' : ''}>${value === '全部' ? `全部${label}` : value === '综合' ? '综合排序' : value}</option>`).join('')}</select></label>`).join('')}</section>${q ? button('清除搜索', 'clear-query') : ''}${statusContent() || (items.length ? `<section class="tv-shelf"><div class="tv-section-heading"><h2>${q ? '搜索结果' : '全部短剧'}</h2><span>${items.length} 部</span></div>${tvCards(items)}</section>` : empty('没有找到相关短剧', '换个关键词或分类试试。', '清除筛选', 'reset-discover', 'search'))}<div class="tv-destination-row tv-discover-destinations">${button('排行榜', 'ranking', { image: 'chart' })}${button('上新日历', 'new', { image: 'calendar' })}${button('刷剧', 'feed', { image: 'play' })}</div>`;
}
function tvSearch() {
  return `<div class="tv-page-heading"><h1>搜索</h1></div><form id="tv-search-form" class="tv-search-form" role="search"><label><span class="sr-only">短剧、演员或题材</span><input id="tv-query" class="field-input" type="search" autocomplete="off" value="${escapeHTML(state.query)}" placeholder="输入剧名、演员或题材" /></label><button type="submit" class="btn primary">搜索</button></form><section class="tv-shelf"><div class="tv-section-heading"><h2>最近搜索</h2>${button('清空记录', 'clear-searches')}</div>${state.searches.length ? chips(state.searches, '', 'recent-search') : '<p class="tv-muted">暂无搜索记录</p>'}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>试试这些故事</h2></div>${tvCards()}</section>`;
}
function tvDetail() {
  const d = current();
  return `${statusContent() || `${tvFeature(d, true)}<section class="tv-shelf tv-detail-episodes"><div class="tv-section-heading"><h2>选集</h2>${button('下载剧集', 'download', { value: d.id, image: 'download' })}</div>${seasonPicker()}${episodePicker(d, { tv: true })}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>更多故事</h2></div>${tvCards(dramas.filter((item) => item.id !== d.id))}</section>`}`;
}
function tvPlayer() {
  const d = current();
  const visible = state.tvControls !== false;
  const seek = state.tvSeek;
  return `<section class="tv-player cinema" aria-label="TV 静态播放演示"><div class="tv-player-picture">${posterImage(d, '', '播放器静态示意画面')}</div><span class="tv-demo-caption">静态画面 · 非真实视频</span>${state.danmaku && state.danmakuText ? `<span class="tv-danmaku">${escapeHTML(state.danmakuText)}</span>` : ''}<button id="tv-stage" class="tv-stage" data-action="tv-wake" aria-label="${visible ? '收起播放控制' : '显示播放控制'}" ${visible ? 'tabindex="-1"' : 'data-tv-initial="true"'}>${!visible && !state.playing ? icon('play') : ''}</button>${state.scenario === 'error' ? `<div class="tv-player-status"><h2>播放遇到问题</h2><p>观看位置已保留</p>${button('重试播放', 'retry', { variant: 'primary' })}</div>` : state.scenario === 'loading' ? '<div class="tv-player-status" role="status"><h2>正在缓冲…</h2><p>观看位置已保留</p></div>' : ''}<div class="tv-player-controls" ${!visible ? 'hidden' : ''}><div class="tv-playing-title"><div><h1>${d.title}</h1><p>第 ${state.episode} 集 / 共 ${d.count} 集</p></div>${button('返回', 'tv-leave', { image: 'back' })}</div>${seek ? `<div class="tv-seek-preview" role="status">定位到 ${formatTime(state.tvSeekPosition)} · 确认键应用，返回键取消</div>` : ''}<label class="tv-progress"><span class="sr-only">播放进度，秒</span><input id="position" type="range" min="0" max="102" value="${seek ? state.tvSeekPosition : state.position}"/><span class="numeral" id="time-label">${formatTime(seek ? state.tvSeekPosition : state.position)} / 01:42</span></label><div class="tv-play-actions"><div class="actions">${button(state.playing ? '暂停' : '播放', 'toggle-play', { image: state.playing ? 'pause' : 'play', attrs: 'data-tv-initial="true"' })}${button('后退 10 秒', 'tv-seek-back', { image: 'back' })}${button('前进 10 秒', 'tv-seek-forward', { image: 'forward' })}${button('下一集', 'next-episode', { image: 'next', attrs: state.episode >= (d.id === 'spring' ? 48 : d.count) ? 'disabled' : '' })}</div><div class="actions">${button('选集', 'episodes', { image: 'list' })}${button('评论', 'comments', { image: 'comment' })}${button('更多', 'tv-player-more', { image: 'settings' })}</div></div></div></section>`;
}
function tvLibrary(kind) {
  kind =
    kind ||
    (['history', 'favorites', 'following', 'downloads'].includes(state.route)
      ? state.route
      : 'history');
  const headings = {
    history: '继续观看',
    favorites: '收藏与点赞',
    following: '追更与预约',
    downloads: '下载',
  };
  const menu = `<nav class="tv-library-nav" aria-label="片库分类">${Object.entries(headings)
    .map(
      ([route, label]) =>
        `<button data-route="${route}" ${kind === route ? 'aria-current="page"' : ''}>${label}</button>`,
    )
    .join('')}</nav>`;
  let body = '';
  if (kind === 'history')
    body = `<div class="tv-section-heading"><h2>继续观看</h2><div class="actions">${button(state.manage ? '完成' : '管理记录', 'manage-history')}${button('清空记录', 'clear-history')}</div></div>${state.manage ? `<div class="actions">${button('全选', 'select-history')}${button(`删除所选（${state.selectedHistory.size}）`, 'delete-history', { attrs: state.selectedHistory.size ? '' : 'disabled' })}</div>` : ''}<div class="tv-history-list">${state.history
      .map((id) => {
        const d = dramaById(id);
        return `<article class="tv-library-item">${state.manage ? `<input type="checkbox" data-history-select="${id}" aria-label="选择${d.title}" ${state.selectedHistory.has(id) ? 'checked' : ''}/>` : ''}<button class="tv-item-art" data-detail="${id}" aria-label="查看${d.title}">${posterImage(d)}</button><div><h3>${d.title}</h3><p>第 ${d.episode} 集 · 看到 ${formatTime(d.position || 0)}</p></div>${button('继续观看', 'resume', { value: id, image: 'play' })}</article>`;
      })
      .join(
        '',
      )}</div>${!state.history.length ? empty('还没有观看记录', '开始观看后在这里继续。') : ''}<p class="tv-muted">本周 ${state.history.length} 部 · 48 分钟（演示统计）</p>`;
  if (kind === 'favorites') {
    const source = state.favoriteTab === '收藏' ? state.favorites : state.likes;
    body = `${tabs(['收藏', '点赞'], state.favoriteTab, 'favorite-tab')}${tvCards(dramas.filter((d) => source.has(d.id)))}${!source.size ? empty(`还没有${state.favoriteTab}的短剧`, '去找一个喜欢的故事。') : ''}<div class="tv-manage-actions">${dramas
      .filter((d) => source.has(d.id))
      .map((d) =>
        button(
          `取消${state.favoriteTab}《${d.title}》`,
          state.favoriteTab === '收藏' ? 'favorite' : 'like',
          { value: d.id },
        ),
      )
      .join('')}</div>`;
  }
  if (kind === 'following') {
    const source = state.followingTab === '追更' ? state.follows : state.reservations;
    body = `${tabs(['追更', '预约'], state.followingTab, 'following-tab')}${!state.loggedIn ? `<div class="tv-section-heading"><p>登录后接收更新提醒</p>${button('登录', 'login')}</div>` : ''}${tvCards(dramas.filter((d) => source.has(d.id)))}${!source.size ? empty('暂时没有记录', '可以看看即将上线的新剧。', '上新日历', 'new', 'bell') : ''}<div class="tv-manage-actions">${dramas
      .filter((d) => source.has(d.id))
      .map((d) =>
        button(
          `取消${state.followingTab}《${d.title}》`,
          state.followingTab === '追更' ? 'follow' : 'reserve',
          { value: d.id },
        ),
      )
      .join('')}</div>`;
  }
  if (kind === 'downloads')
    body = `<div class="tv-section-heading"><h2>下载任务</h2>${button('添加任务', 'download', { value: state.id, image: 'download' })}</div><p class="tv-muted">流程演示，不会下载或占用存储</p>${tabs(['进行中', '已完成'], state.downloadTab, 'download-tab')}${state.tasks
      .filter((t) =>
        state.downloadTab === '已完成' ? t.status === '已完成' : t.status !== '已完成',
      )
      .map(
        (t) =>
          `<article class="tv-task"><div><h3>${dramaById(t.drama).title}</h3><p>${t.range} · ${t.status} · ${t.progress}%</p></div><div class="actions">${button(t.status === '已完成' ? '播放' : t.status === '下载中' ? '暂停' : '继续', t.status === '已完成' ? 'offline-play' : 'task-toggle', { value: t.status === '已完成' ? t.drama : t.id })}${button('移除', 'task-remove', { value: t.id })}</div></article>`,
      )
      .join('')}${button('演示空间不足', 'space-error')}`;
  return `<div class="tv-page-heading"><h1>${kind === 'following' ? '追剧' : '我的片库'}</h1>${button('账号与同步', 'account', { image: 'user' })}</div>${menu}<section class="tv-library-content">${statusContent() || body}</section>`;
}
function tvNew() {
  const days = ['今天', '明天', '周日', '周一', '周二', '周三', '周四'];
  return `<div class="tv-page-heading"><h1>上新日历</h1></div><div class="tv-date-row">${days.map((label, i) => `<button data-action="new-date" data-value="${i}" aria-pressed="${state.newDate === i}">${label}<strong>11 月 ${13 + i} 日</strong></button>`).join('')}</div>${chips(['全部', '真人剧', '漫剧'], state.kind, 'kind')}<section class="tv-shelf"><div class="tv-section-heading"><h2>${state.newDate === 0 ? '今天上线' : `${days[state.newDate]}预告`}</h2></div>${statusContent() || (state.kind === '漫剧' ? empty('这天暂无漫剧', '可以查看真人剧。', '查看真人剧', 'real-kind') : state.newDate === 0 ? tvCards([dramas[3], dramas[2]]) : state.newDate === 1 ? `${tvFeature(dramaById('spring'), true)}${button(state.reservations.has('spring') ? '已预约第二季' : '预约第二季', 'reserve', { value: 'spring', image: 'bell' })}` : empty('这天暂未安排上新', '可以查看今天的新剧。', '查看今天', 'today', 'calendar'))}</section>`;
}
function tvRanking() {
  const order =
    state.rankTab === '飙升榜'
      ? [2, 0, 3, 1]
      : state.rankTab === '口碑榜'
        ? [3, 1, 2, 0]
        : [0, 1, 2, 3];
  return `<div class="tv-page-heading"><h1>排行榜</h1>${button('榜单雷达', 'tv-radar', { image: 'chart' })}</div>${tabs(['热播榜', '飙升榜', '口碑榜'], state.rankTab, 'rank-tab')}<p class="tv-muted">榜单顺序为演示数据</p>${statusContent() || `<div class="tv-ranked-list">${order.map((i, n) => `<button class="tv-rank-item" data-detail="${dramas[i].id}"><span class="tv-rank-number">${n + 1}</span>${posterImage(dramas[i])}<span><strong>${dramas[i].title}</strong><small>${dramas[i].note} · ${dramas[i].genre}</small></span>${icon('forward')}</button>`).join('')}</div>`}`;
}
function tvSettings() {
  const sections = settingsSections();
  return `<div class="tv-page-heading"><h1>设置</h1></div><div class="tv-settings-layout"><nav class="tv-settings-categories" aria-label="设置分类">${Object.keys(
    sections,
  )
    .map(
      (t) =>
        `<button data-action="setting-tab" data-value="${t}" ${state.settingTab === t ? 'aria-current="page"' : ''}>${t}</button>`,
    )
    .join(
      '',
    )}</nav><section class="tv-settings-options"><h2>${state.settingTab}</h2>${sections[state.settingTab]}</section></div>`;
}
function tvAccount() {
  return `<div class="tv-page-heading"><h1>账号</h1></div><section class="tv-account"><div class="tv-account-identity">${icon('user')}<h2>${state.loggedIn ? '林间听风' : '游客观看'}</h2><p>${state.loggedIn ? '演示账号 · 138 **** 0000' : '无需登录也能找剧、观看和收藏'}</p>${button(state.loggedIn ? '退出登录' : '登录账号', state.loggedIn ? 'logout' : 'login', { variant: 'primary' })}</div><div class="tv-account-options"><h2>片库与观看进度</h2><p>${state.loggedIn ? (state.syncError ? '同步失败，本机记录已保留' : '账号片库 · 上次同步：刚刚') : '游客记录保存在本机，与账号片库分别保留'}</p>${button(state.loggedIn ? '立即同步' : '查看本机记录', state.loggedIn ? 'sync' : 'history', { image: 'history' })}${state.loggedIn ? button('演示同步失败', 'sync-error') : ''}${button('追更与预约', 'following', { image: 'bell' })}</div></section>`;
}
function tvFeed() {
  return `<div class="tv-page-heading"><h1>刷剧</h1><div class="actions">${button('下一部', 'recommend-next', { image: 'next' })}${button('进入全屏观看', 'play', { value: state.id, image: 'play', variant: 'primary' })}</div></div>${tabs(['推荐', '真人剧', '漫剧', '关注'], state.channel, 'channel')}${state.channel === '漫剧' ? empty('暂无漫剧样例', '当前演示保留频道入口。', '查看真人剧', 'real-channel') : state.channel === '关注' && !state.loggedIn ? empty('登录后查看关注', '登录后继续当前频道。', '登录', 'login', 'bell') : tvFeature(current(), true)}`;
}
function tvPage() {
  const pages = {
    home: tvHome,
    discover: tvDiscover,
    search: tvSearch,
    detail: tvDetail,
    player: tvPlayer,
    feed: tvFeed,
    library: tvLibrary,
    history: () => tvLibrary('history'),
    favorites: () => tvLibrary('favorites'),
    following: () => tvLibrary('following'),
    downloads: () => tvLibrary('downloads'),
    new: tvNew,
    ranking: tvRanking,
    settings: tvSettings,
    updates: updatePage,
    account: tvAccount,
    support: supportPage,
    apps: appsPage,
    map: mapPage,
  };
  return (pages[state.route] || tvHome)();
}
function focusTVInitial() {
  if (state.mode !== 'tv') return;
  const root = overlay.open ? overlay : content;
  const target =
    $('[data-tv-initial]', root) || $('button:not(:disabled), input:not(:disabled), select', root);
  target?.focus({ preventScroll: true });
}
function tvMoreDialog() {
  showDialog(
    '播放选项',
    `<div class="tv-more-options">${settingRow('倍速', `<label><span class="sr-only">播放速度</span><select id="speed">${[1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${Number(state.speed || 1) === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>`)}${settingRow('清晰度', `<label><span class="sr-only">清晰度</span><select id="quality">${['自动', '1080P', '720P'].map((v) => `<option ${state.quality === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)}${button(state.favorites.has(state.id) ? '已收藏' : '收藏', 'favorite', { value: state.id, image: 'bookmark' })}${button(state.likes.has(state.id) ? '已点赞' : '点赞', 'like', { value: state.id, image: 'heart' })}${button(state.follows.has(state.id) ? '已追更' : '追更', 'follow', { value: state.id, image: 'bell' })}${button(state.danmaku ? '关闭弹幕' : '打开弹幕', 'tv-danmaku')}${button('发送弹幕…', 'tv-send-danmaku', { image: 'comment' })}${button('查看详情', 'detail', { value: state.id, image: 'info' })}</div>`,
    { sheet: true },
  );
}
