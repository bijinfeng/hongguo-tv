const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chart: '<path d="M5 20V11h4v9m2 0V4h4v16m2 0v-6h4v6M3 20h19"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.4 7M3 4v7h7m2-5v6l4 2"/>',
  heart:
    '<path d="M20.8 4.6a5.3 5.3 0 0 0-7.5 0L12 5.9l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 21l8.8-8.9a5.3 5.3 0 0 0 0-7.5Z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  next: '<path d="m5 5 10 7-10 7Zm13 0v14"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  forward: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5Zm5 5 6 6m0-6-6 6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  comment: '<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/><path d="M8 10h8m-8 4h5"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  screen: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  qr: '<path d="M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h3v3h3v3h-6Zm6-3h-3m-6 0v3m0 3v3M6 6h.1m12 0h.1M6 18h.1"/>',
  folder: '<path d="M3 6h7l2 3h9v11H3Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.1"/>',
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
}
function button(label, action, options = {}) {
  const { variant = '', image = '', attrs = '', value = '' } = options;
  const collection = {
    favorite: 'favorites',
    like: 'likes',
    follow: 'follows',
    reserve: 'reservations',
  }[action];
  const toggle = state.mode === 'desktop' && collection;
  const pressed = toggle && state[collection].has(value || state.id);
  return `<button class="btn ${variant}${pressed ? ' selected' : ''}" data-action="${action}" ${value ? `data-value="${escapeHTML(value)}"` : ''} ${toggle ? `aria-pressed="${!!pressed}"` : ''} ${attrs}>${image ? icon(image) : ''}${label}</button>`;
}
function routeButton(label, route, image = '') {
  return `<button data-route="${route}">${image ? icon(image) : ''}${label}</button>`;
}
const dramas = [
  {
    id: 'return',
    title: '重返1998',
    count: 72,
    genre: '重生',
    tags: ['都市', '重生', '成长'],
    cast: '林川、许静（虚构角色）',
    desc: '一觉醒来，林川回到了人生的岔路口。这一次，他想守住家人，也找回当年被搁置的梦想。从街角的一间修车铺开始，一个普通人的故事重新启程。',
    note: '全 72 集',
    episode: 12,
    position: 36,
  },
  {
    id: 'spring',
    title: '春山不负',
    count: 68,
    genre: '古装',
    tags: ['古装', '女性成长', '情感'],
    cast: '沈知微、陆庭舟（虚构角色）',
    desc: '离开旧日深宅，沈知微在江南开了一间小小的绣坊。她不再等人替自己选择，而是一针一线，织出属于自己的春天。',
    note: '更新至 48 集',
    episode: 1,
  },
  {
    id: 'night',
    title: '长夜有声',
    count: 36,
    genre: '悬疑',
    tags: ['都市', '悬疑', '探寻'],
    cast: '陈默、顾言（虚构角色）',
    desc: '一封没有署名的信，让旧书店老板陈默再次想起十年前的雨夜。每一本被归还的书里，都藏着一段未曾说出口的真相。',
    note: '全 36 集',
    episode: 4,
    position: 36,
  },
  {
    id: 'home',
    title: '晚风知我意',
    count: 60,
    genre: '家庭',
    tags: ['都市', '家庭', '治愈'],
    cast: '周晚、方慧（虚构角色）',
    desc: '在大城市奔忙多年的周晚回到了母亲身边。阳台的花、傍晚的饭菜，还有那些说不出口的关心，让她重新看见生活的答案。',
    note: '全 60 集',
    episode: 1,
  },
];
const nav = [
  ['home', '首页', 'home'],
  ['feed', '刷剧', 'play'],
  ['discover', '找剧', 'search'],
  ['ranking', '排行榜', 'chart'],
  ['new', '新剧', 'calendar'],
  ['history', '继续观看', 'history'],
  ['favorites', '收藏与点赞', 'bookmark'],
  ['following', '追更与预约', 'bell'],
  ['downloads', '下载', 'download'],
];
const state = {
  route: 'home',
  id: 'return',
  episode: 12,
  season: 1,
  channel: '推荐',
  genre: '全部',
  kind: '全部',
  query: '',
  searches: ['重生', '古装'],
  theme: 'light',
  mode: 'desktop',
  scenario: 'normal',
  loggedIn: false,
  syncError: false,
  favorites: new Set(['spring']),
  likes: new Set(['night']),
  follows: new Set(['spring']),
  reservations: new Set(),
  history: ['return', 'night'],
  playing: false,
  playbackStarted: false,
  position: 36,
  volume: 60,
  danmaku: true,
  danmakuText: '这一集的细节好温暖',
  favoriteTab: '收藏',
  rankTab: '热播榜',
  newDate: 0,
  followingTab: '追更',
  downloadTab: '进行中',
  settingTab: '通用',
  loginTab: '扫码登录',
  loginStep: 'waiting',
  commentThreads: {},
  manage: false,
  selectedHistory: new Set(),
  tasks: [
    { id: 1, drama: 'return', range: '第 1–12 集', progress: 42, status: '下载中' },
    { id: 2, drama: 'night', range: '第 1–4 集', progress: 18, status: '失败' },
    { id: 3, drama: 'home', range: '第 1–3 集', progress: 100, status: '已完成' },
  ],
};
const stack = [];
let content = $('#content');
const overlay = $('#overlay');
const current = () => dramas.find((d) => d.id === state.id) || dramas[0];
const dramaById = (id) => dramas.find((d) => d.id === id);
function commentThread() {
  return (state.commentThreads[state.id] ||= {
    draft: '',
    replyTo: '',
    comments: [
      {
        id: 1,
        name: '小满',
        text: '喜欢这种从日常小事慢慢讲起的故事。',
        time: '今天 10:24',
        likes: 12,
      },
      {
        id: 2,
        name: '晚风',
        text: {
          return: '修车铺的那场戏，让我想起小时候的街道。',
          spring: '绣坊这一段，能看见她一点点走出自己的路。',
          night: '旧书里的线索，让那个雨夜更让人在意了。',
          home: '阳台上的花和晚饭，让人想起了家。',
        }[state.id],
        time: '今天 09:18',
        likes: 8,
      },
    ],
  });
}
const posterImage = (d, cls = '', alt = '') =>
  `<img class="${cls}" src="assets/${d.id}.png" alt="${alt}" loading="lazy" width="1024" height="1536" />`;
function poster(d) {
  return `<article class="poster"><button class="poster-link" data-detail="${d.id}"><span class="poster-art">${posterImage(d)}<span class="tag">${d.note}</span></span><span class="poster-title">${d.title}</span><span class="poster-meta">${d.tags.slice(0, 2).join(' · ')}</span></button></article>`;
}
function posters(items = dramas) {
  return `<div class="poster-grid">${items.map(poster).join('')}</div>`;
}
function chips(items, active, action) {
  return `<div class="chips">${items.map((item) => `<button aria-pressed="${active === item}" data-action="${action}" data-value="${item}">${item}</button>`).join('')}</div>`;
}
function tabs(items, active, action) {
  return `<div class="tabs" role="tablist" aria-label="${action === 'player-panel' ? '播放面板' : '内容分类'}">${items.map((item, index) => `<button role="tab" id="tab-${action}-${index}" aria-controls="panel-${action}" aria-selected="${active === item}" tabindex="${active === item ? 0 : -1}" data-action="${action}" data-value="${item}">${item}</button>`).join('')}</div>`;
}
function bindTabPanels(root) {
  for (const group of $$('[role="tablist"]', root)) {
    const selected = $('[aria-selected="true"]', group);
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = selected.getAttribute('aria-controls');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', selected.id);
    while (group.nextSibling) panel.append(group.nextSibling);
    group.after(panel);
  }
}

function empty(title, message, label = '去找剧', action = 'discover', symbol = 'folder') {
  return `<div class="empty-state">${icon(symbol)}<h2>${title}</h2><p>${message}</p>${button(label, action)}</div>`;
}
function statusContent() {
  if (state.scenario === 'loading')
    return `<div role="status" aria-busy="true"><p class="muted">正在加载内容…</p><div class="skeleton-grid">${Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join('')}</div></div>`;
  if (state.scenario === 'error')
    return empty(
      '暂时无法加载',
      '网络连接失败，你的观看位置和操作草稿仍然保留。',
      '重新加载',
      'retry',
      'info',
    );
  if (state.scenario === 'empty')
    return empty(
      '这里还没有内容',
      '可以换个分类，或去找一部想看的短剧。',
      '去找剧',
      'reset-discover',
    );
  return '';
}
function renderNav() {
  const active =
    state.route === 'updates'
      ? 'settings'
      : ['detail', 'player'].includes(state.route)
        ? ''
        : state.route;
  const item = ([route, label, symbol]) =>
    `<button class="nav-button" data-route="${route}" ${active === route ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`;
  $('#navigation').innerHTML =
    `<div class="brand">${icon('play')}红果</div><nav aria-label="内容与片库"><div class="nav-group">${nav.slice(0, 5).map(item).join('')}</div><div class="nav-divider"></div><div class="nav-group">${nav.slice(5).map(item).join('')}</div></nav><div class="nav-bottom"><button class="nav-button" data-route="account" ${active === 'account' ? 'aria-current="page"' : ''}>${icon('user')}<span>${state.loggedIn ? '我的账号' : '账号'}</span></button><button class="nav-button" data-route="settings" ${active === 'settings' ? 'aria-current="page"' : ''}>${icon('settings')}<span>设置</span></button></div>`;
  $('#account-button').innerHTML =
    `<span class="avatar">${state.loggedIn ? '林' : icon('user')}</span><span class="account-name">${state.loggedIn ? '林间听风' : '登录'}</span>`;
}
function navigate(route, id, { push = true } = {}) {
  if (overlay.open) overlay.close();
  if (push)
    stack.push({
      route: state.route,
      id: state.id,
      scroll: window.scrollY,
      focus: focusKey(document.activeElement),
      episode: state.episode,
      season: state.season,
      episodePage: state.episodePage || 0,
    });
  state.route = route;
  if (id) state.id = id;
  state.manage = false;
  state.selectedHistory.clear();
  $('#navigation').classList.remove('mobile-open');
  $('.mobile-menu').setAttribute('aria-expanded', 'false');
  render();
  window.scrollTo(0, 0);
  if (state.mode === 'tv') focusTVInitial();
  else content.focus({ preventScroll: true });
  content.classList.remove('enter');
  void content.offsetWidth;
  content.classList.add('enter');
}
function back() {
  if (overlay.open) {
    overlay.close();
    return;
  }
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  const previous = stack.pop();
  if (previous) {
    state.route = previous.route;
    state.id = previous.id;
    state.episode = previous.episode;
    state.season = previous.season;
    state.episodePage = previous.episodePage;
    render();
    window.scrollTo(0, previous.scroll);
    if (!restoreFocus(previous.focus)) {
      if (state.mode === 'tv') focusTVInitial();
      else content.focus({ preventScroll: true });
    }
  } else if (state.route === 'updates') {
    state.settingTab = '关于';
    navigate('settings', null, { push: false });
  } else if (state.mode === 'tv')
    confirmDialog(
      '退出观看？',
      '这是 TV 根级返回的设计演示，浏览器标签页会保留。',
      '留在首页',
      () => {
        navigate('home', null, { push: false });
        toast('已回到首页');
      },
    );
  else navigate('home', null, { push: false });
}
function render() {
  if (
    state.mode === 'desktop' &&
    document.fullscreenElement?.matches('.cinema') &&
    ['player', 'feed'].includes(state.route)
  ) {
    refreshFullscreenCinema();
    return;
  }
  const focus = focusKey(document.activeElement);
  const tv = state.mode === 'tv';
  const view = [
    state.route,
    state.id,
    state.playerPanel || '选集',
    state.season,
    state.episodePage || 0,
  ].join(':');
  const railScroll =
    !tv && content.dataset.view === view ? $('.rail-scroll', content)?.scrollTop : undefined;
  const inactive = tv ? $('#content') : $('#tv-content');
  inactive.innerHTML = '';
  content = tv ? $('#tv-content') : $('#content');
  $('#desktop-shell').hidden = tv;
  $('#tv-shell').hidden = !tv;
  $('.skip').href = tv ? '#tv-content' : '#content';
  $('#tv-shell').classList.toggle('is-playing', tv && state.route === 'player');
  if (tv) $('#tv-header').innerHTML = tvHeader();
  else renderNav();
  const pages = {
    home: desktopHome,
    feed: () => desktopPlayer(true),
    discover: discoverPage,
    ranking: rankingPage,
    new: newPage,
    history: historyPage,
    favorites: favoritesPage,
    following: followingPage,
    downloads: downloadsPage,
    detail: desktopDetail,
    player: desktopPlayer,
    account: accountPage,
    settings: settingsPage,
    updates: updatePage,
    support: supportPage,
    apps: appsPage,
    map: mapPage,
  };
  content.innerHTML = tv ? tvPage() : (pages[state.route] || desktopHome)();
  content.dataset.view = view;
  bindTabPanels(content);
  if (!restoreFocus(focus) && tv && !overlay.open) focusTVInitial();
  if (railScroll !== undefined && $('.rail-scroll', content))
    $('.rail-scroll', content).scrollTop = railScroll;
  for (const node of $$('[role="switch"]', content)) {
    const saved = state.preferences?.[node.getAttribute('aria-label')];
    if (saved !== undefined) node.setAttribute('aria-checked', String(saved));
  }
  for (const node of $$('[data-setting]', content)) {
    const saved = state.preferences?.[node.dataset.setting];
    if (saved !== undefined) node.value = saved;
  }
  if ($('#danmaku-input')) $('#danmaku-input').value = state.danmakuDraft || '';
  syncUpdateReview();
  document.title = `红果 · ${{ detail: current().title, player: current().title, map: '页面地图', account: '账号', settings: '设置', updates: '应用更新', support: '支持', apps: '应用推荐' }[state.route] || nav.find((n) => n[0] === state.route)?.[1] || '设计原型'}`;
}

function discoverItems({ query = '', genre = '全部', kind = '全部', sort = '综合' }) {
  const q = query.trim().toLowerCase();
  const items = dramas.filter(
    (d) =>
      (!q || `${d.title}${d.tags.join('')}${d.cast}`.toLowerCase().includes(q)) &&
      (genre === '全部' || d.tags.includes(genre)) &&
      kind !== '漫剧',
  );
  if (sort === '最新') items.reverse();
  else if (sort === '热度') items.sort((a, b) => b.count - a.count);
  return items;
}
function discoverPage() {
  const q = state.query.trim();
  const items = discoverItems(state);
  return `<div class="page-head"><h1>${q ? `“${escapeHTML(q)}”的搜索结果` : '找一部想看的'}</h1>${q ? button('清除搜索', 'clear-query') : ''}</div><div class="filters"><div class="filter-row"><span class="filter-label">类型</span>${chips(['全部', '真人剧', '漫剧'], state.kind, 'kind')}</div><div class="filter-row"><span class="filter-label">题材</span>${chips(['全部', '重生', '古装', '都市', '悬疑', '家庭'], state.genre, 'genre')}</div><div class="filter-row"><span class="filter-label">排序</span>${chips(['综合', '最新', '热度'], state.sort || '综合', 'sort')}</div></div>${!q && state.searches.length ? `<div class="section-head"><h2>最近搜索</h2><button data-action="clear-searches">清空</button></div>${chips(state.searches, '', 'recent-search')}<div class="section-head"><h2>热门短剧</h2></div>` : `<p class="muted small">${items.length} 部短剧</p>`}${statusContent() || (items.length ? posters(items) : empty('没有找到相关短剧', '试试更短的关键词，或清除当前筛选。', '清除筛选', 'reset-discover', 'search'))}<div class="section-head"><span class="small muted">${items.length ? '已显示全部演示内容' : ''}</span>${button('演示续页失败', 'page-error')}</div>`;
}
function mediaRow(d, options = {}) {
  const {
    rank = 0,
    subtitle = d.note,
    action = 'detail',
    label = '查看详情',
    progress = false,
    manage = false,
  } = options;
  return `<article class="media-row ${rank ? 'ranked' : ''}">${rank ? `<span class="rank ${rank === 1 ? 'first' : ''}">${rank}</span>` : ''}${manage ? `<input type="checkbox" data-history-select="${d.id}" aria-label="选择${d.title}" ${state.selectedHistory.has(d.id) ? 'checked' : ''}/>` : ''}<button class="poster-link" style="width:auto;flex:none" data-detail="${d.id}" aria-label="查看${d.title}详情">${posterImage(d)}</button><div class="row-body"><h2>${d.title}</h2><p>${subtitle}</p><p>${d.tags.join(' · ')}</p>${progress ? `<div class="progress"><span style="width:${Math.round(((d.position || 0) / 102) * 100)}%"></span></div>` : ''}</div><div class="row-actions">${button(label, action, { value: d.id, image: action === 'resume' ? 'play' : '' })}</div></article>`;
}
function rankingPage() {
  const order =
    state.rankTab === '飙升榜'
      ? [2, 0, 3, 1]
      : state.rankTab === '口碑榜'
        ? [3, 1, 2, 0]
        : [0, 1, 2, 3];
  return `<h1>排行榜</h1>${tabs(['热播榜', '飙升榜', '口碑榜'], state.rankTab, 'rank-tab')}<div class="split-layout"><section>${statusContent() || `<p class="muted small">今天 · 榜单顺序为演示数据</p><div class="list">${order.map((i, n) => mediaRow(dramas[i], { rank: n + 1 })).join('')}</div>`}</section><aside class="radar"><h2>榜单雷达</h2><p class="small muted">${dramas[order[0]].title} · 指标示意</p><svg viewBox="0 0 260 240" role="img" aria-label="热度、追更、完播、讨论、收藏五项指标示意"><path class="radar-grid" d="M130 35 220 100 185 205 75 205 40 100ZM130 70 187 111 165 177 95 177 73 111ZM130 105 154 122 145 149 115 149 106 122ZM130 35v100m90-35-90 35m55 70-55-70m-55 70 55-70m-90-35 90 35"/><path class="radar-value" d="M130 47 206 105 169 188 86 191 67 109Z"/><text x="116" y="20">热度</text><text x="226" y="100">追更</text><text x="180" y="229">完播</text><text x="50" y="229">讨论</text><text x="0" y="100">收藏</text></svg></aside></div>`;
}
function newPage() {
  const dates = ['今天', '明天', '周日', '周一', '周二', '周三', '周四'];
  return `<h1>新剧与上新日历</h1><div class="date-strip" aria-label="上新日期">${dates.map((day, i) => `<button aria-pressed="${state.newDate === i}" data-action="new-date" data-value="${i}"><span>${day}</span><strong>${13 + i}</strong><span>11 月</span></button>`).join('')}</div>${chips(['全部', '真人剧', '漫剧'], state.kind, 'kind')}<div class="section-head"><h2>${state.newDate === 0 ? '今天上线' : `${dates[state.newDate]}预告`}</h2><span class="small muted">2026 年 11 月</span></div>${statusContent() || (state.kind === '漫剧' ? empty('这天暂无漫剧', '可以看看其他日期或真人剧。', '查看真人剧', 'real-kind') : state.newDate === 0 ? posters([dramas[3], dramas[2]]) : state.newDate === 1 ? `${mediaRow(dramas[1], { subtitle: '第二季 · 明天 18:00 上线', action: 'reserve', label: state.reservations.has('spring') ? '已预约' : '预约提醒' })}` : empty('这天暂未安排上新', '有新剧上线时会在这里展示。', '查看今天', 'today', 'calendar'))}`;
}
function historyPage() {
  return `<div class="page-head"><h1>继续观看</h1><div class="actions">${state.history.length ? button(state.manage ? '完成' : '管理', 'manage-history') : ''}${state.history.length ? button('清空记录', 'clear-history', { variant: 'danger' }) : ''}</div></div><p class="muted">本周看过 ${state.history.length} 部短剧，累计 48 分钟 <span class="small">· 演示统计</span></p>${state.loggedIn ? `<div class="status-line">${icon(state.syncError ? 'info' : 'check')}<span>${state.syncError ? '记录同步失败，本机进度已保留' : '观看进度已同步'}</span>${button(state.syncError ? '重试同步' : '查看账号', state.syncError ? 'sync' : 'account')}</div>` : ''}${state.manage ? `<div class="actions">${button('全选', 'select-history')}${button(`删除所选（${state.selectedHistory.size}）`, 'delete-history', { attrs: state.selectedHistory.size ? '' : 'disabled', variant: 'danger' })}</div>` : ''}${statusContent() || (state.history.length ? `<div class="list">${state.history.map((id) => mediaRow(dramaById(id), { subtitle: `第 ${dramaById(id).episode} 集 · 看到 ${formatTime(dramaById(id).position || 0)} · 今天`, action: 'resume', label: '继续观看', progress: true, manage: state.manage })).join('')}</div>` : empty('还没有观看记录', '开始观看后，这里会记住你的进度。'))}`;
}
function favoritesPage() {
  const source = state.favoriteTab === '收藏' ? state.favorites : state.likes;
  const items = dramas.filter((d) => source.has(d.id));
  return `<h1>收藏与点赞</h1>${tabs(['收藏', '点赞'], state.favoriteTab, 'favorite-tab')}<p class="small muted">${state.loggedIn ? '账号片库' : '保存在本机，登录后可同步'} · ${items.length} 部</p>${statusContent() || (items.length ? `<div class="list">${items.map((d) => mediaRow(d, { action: state.favoriteTab === '收藏' ? 'favorite' : 'like', label: state.favoriteTab === '收藏' ? '取消收藏' : '取消点赞' })).join('')}</div>` : empty(`还没有${state.favoriteTab}的短剧`, '遇到想看的故事，可以先把它留在这里。'))}`;
}
function followingPage() {
  const items = dramas.filter((d) =>
    (state.followingTab === '追更' ? state.follows : state.reservations).has(d.id),
  );
  return `<h1>追更与预约</h1>${tabs(['追更', '预约'], state.followingTab, 'following-tab')}${!state.loggedIn ? `<div class="status-line"><span>登录后接收更新提醒</span>${button('登录', 'login')}</div>` : ''}${statusContent() || (items.length ? `<div class="list">${items.map((d) => mediaRow(d, { subtitle: state.followingTab === '追更' ? '新更新 8 集 · 更新至第 48 集' : '第二季 · 明天 18:00 上线', action: state.followingTab === '追更' ? 'resume' : 'reserve', label: state.followingTab === '追更' ? '查看更新' : '取消预约' })).join('')}</div>` : empty(state.followingTab === '追更' ? '暂时没有追更' : '暂时没有预约', '可以去上新日历看看将要上线的故事。', '查看新剧', 'new', 'bell'))}`;
}
function downloadsPage() {
  const tasks = state.tasks.filter((t) =>
    state.downloadTab === '已完成' ? t.status === '已完成' : t.status !== '已完成',
  );
  return `<div class="page-head"><h1>下载</h1>${button('添加任务', 'download', { image: 'download', value: state.id })}</div><p class="small muted">下载流程演示，不会下载或占用存储空间。</p>${tabs(['进行中', '已完成'], state.downloadTab, 'download-tab')}${statusContent() || (tasks.length ? tasks.map((t) => `<article class="task-row"><div class="task-heading"><div><h2>${dramaById(t.drama).title}</h2><span class="muted small">${t.range} · ${t.status === '已完成' ? '已保存在本机' : t.status === '失败' ? '网络中断，已下载部分保留' : t.status === '空间不足' ? '可用空间不足，请先清理缓存' : t.status}</span></div><div class="actions">${t.status === '已完成' ? button('播放', 'offline-play', { value: t.drama }) : button(t.status === '下载中' ? '暂停' : '继续', 'task-toggle', { value: t.id })}${button('移除', 'task-remove', { value: t.id })}</div></div><div class="progress"><span style="width:${t.progress}%"></span></div><p class="small muted numeral">${t.progress}% · ${t.status === '下载中' ? '演示 2.4 MB/s' : t.status}</p></article>`).join('') : empty('还没有下载任务', '在短剧详情选择集数，即可加入下载。'))}<div class="section-head"><span></span>${button('演示空间不足', 'space-error')}</div>`;
}

function formatTime(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function accountPage() {
  if (!state.loggedIn)
    return `<h1>账号</h1><section class="account-profile"><span class="avatar">${icon('user')}</span><div><h2>还未登录</h2><p class="muted" style="margin:0">登录后同步片库和观看进度</p></div></section>${button('登录账号', 'login', { variant: 'primary' })}<div class="section-head"><h2>本机记录</h2></div><p class="prose muted">未登录时也能找剧、观看和收藏。账号记录与游客记录分别保留，退出账号后回到游客片库。</p>${button('查看观看记录', 'history')}`;
  return `<h1>账号</h1><section class="account-profile"><span class="avatar">林</span><div><h2>林间听风</h2><p class="muted small" style="margin:0">演示账号 · 138 **** 0000</p></div></section><section class="settings-section"><div class="setting-row"><div><strong>片库同步</strong><p>${state.syncError ? '同步失败，待同步记录保留在本机' : '上次同步：刚刚'}</p></div>${button(state.syncError ? '重试同步' : '立即同步', 'sync')}</div><div class="setting-row"><div><strong>更新提醒</strong><p>查看追更和预约的上线状态</p></div>${button('查看', 'following')}</div><div class="setting-row"><div><strong>本机与云端记录</strong><p>退出不会清空游客片库</p></div>${button('退出登录', 'logout', { variant: 'danger' })}</div><div class="setting-row"><span class="muted">设计状态</span>${button('演示同步失败', 'sync-error')}</div></section>`;
}
function settingRow(label, control, description = '') {
  return `<div class="setting-row"><div><strong>${label}</strong>${description ? `<p>${description}</p>` : ''}</div>${control}</div>`;
}
function switchControl(label, checked = true) {
  return `<button class="switch" role="switch" aria-checked="${checked}" aria-label="${label}" data-action="switch"><span></span></button>`;
}
function settingSelect(label, values) {
  return `<label><span class="sr-only">${label}</span><select data-setting="${label}">${values.map((v) => `<option>${v}</option>`).join('')}</select></label>`;
}
function settingsSections() {
  return {
    通用: `${settingRow('启动时打开', settingSelect('启动页面', ['推荐', '继续观看', '找剧']))}${settingRow('系统通知', switchControl('系统通知'), '用于追更与预约提醒')}${settingRow('电视首页频道', button('查看入口', 'tv-channel'), 'Android TV 宿主能力设计')}`,
    外观与语言: `${settingRow('外观', `<label><span class="sr-only">外观主题</span><select id="appearance"><option value="light" ${state.theme === 'light' ? 'selected' : ''}>浅色</option><option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>深色</option></select></label>`)}${settingRow('语言', settingSelect('语言', ['简体中文', '繁體中文（待翻译）']))}${settingRow('减少动态效果', switchControl('减少动态效果', matchMedia('(prefers-reduced-motion: reduce)').matches), '跟随系统偏好，可在此演示关闭动效')}`,
    播放: `${settingRow('连续播放', switchControl('连续播放'))}${settingRow('默认清晰度', settingSelect('默认清晰度', ['自动', '1080P', '720P']))}${settingRow('默认倍速', settingSelect('默认倍速', ['1×', '1.25×', '1.5×', '2×']))}${settingRow('弹幕', switchControl('默认弹幕', state.danmaku))}${settingRow('弹幕字号', settingSelect('弹幕字号', ['标准', '大', '小']))}`,
    缓存与预加载: `${settingRow('预加载下一集', switchControl('预加载下一集'))}${settingRow('缓存上限', settingSelect('缓存上限', ['1 GB', '2 GB', '512 MB']))}${settingRow('本机缓存', button('清理缓存', 'clear-cache'), '演示占用 286 MB；不包含下载剧集')}`,
    诊断: `${settingRow('连接状态', '<span class="tag">设计演示 · 未连接核心</span>')}${settingRow('诊断日志', button('查看', 'diagnostics'), '不包含手机号、账号凭据或媒体地址')}${settingRow('网络恢复', button('演示网络失败', 'network-error'))}`,
    关于: `${settingRow('红果 · NSH', '<span class="muted">设计原型</span>', '版本与发行信息待正式构建提供')}${settingRow('应用更新', button('查看更新', 'update'), updateModel().stage === 'idle' ? '' : updateStages[updateModel().stage])}${settingRow('开源许可', button('查看', 'licenses'))}${settingRow('支持项目', button('查看', 'support'))}${settingRow('应用推荐', button('查看', 'apps'))}`,
  };
}
function settingsPage() {
  const tab = state.settingTab;
  const sections = settingsSections();
  return `<h1>设置</h1><div class="settings-layout"><nav class="settings-nav" aria-label="设置分类">${Object.keys(
    sections,
  )
    .map(
      (t) =>
        `<button data-action="setting-tab" data-value="${t}" ${t === tab ? 'aria-current="page"' : ''}>${t}</button>`,
    )
    .join(
      '',
    )}</nav><section class="settings-section"><h2>${tab}</h2>${sections[tab]}</section></div>`;
}
function supportPage() {
  return `<div class="back-row">${button('返回设置', 'back', { image: 'back' })}</div><h1>支持项目</h1><div class="prose"><p>感谢你愿意支持这个开源客户端。可以通过反馈问题、参与开发或完善文档帮助项目成长。</p><h2>打赏与支持</h2><p class="muted">当前设计原型未配置经确认的收款信息。正式入口会明确展示收款方与用途，并在打开外部支付前确认。</p>${button('支付入口尚未配置', 'noop', { attrs: 'disabled' })}<h2>问题反馈</h2><p>反馈时可附上复现步骤和不含隐私的诊断信息。</p>${button('查看诊断', 'diagnostics')}</div>`;
}
function appsPage() {
  return `<div class="back-row">${button('返回设置', 'back', { image: 'back' })}</div><h1>应用推荐</h1>${empty('还没有配置推荐应用', '正式发布前确认应用来源、平台和外部链接。', '返回设置', 'settings', 'screen')}`;
}
function mapPage() {
  const groups = [
    [
      '发现故事',
      [
        ['首页', 'home'],
        ['刷剧与频道', 'feed'],
        ['找剧与筛选', 'discover'],
        ['排行榜与雷达', 'ranking'],
        ['新剧与日历', 'new'],
      ],
      '推荐频道、搜索联想与历史、分类、榜单、预约',
    ],
    [
      '观看故事',
      [
        ['短剧详情', 'detail'],
        ['播放器', 'player'],
        ['选集与系列季', 'episodes'],
        ['评论与回复', 'comments'],
      ],
      '续播、倍速、清晰度、音量、弹幕、全屏、下一集',
    ],
    [
      '我的片库',
      [
        ['继续观看与管理', 'history'],
        ['收藏与点赞', 'favorites'],
        ['追更与预约', 'following'],
        ['下载任务', 'downloads'],
      ],
      '进度、统计、批量管理、更新提醒、任务状态',
    ],
    [
      '账号',
      [
        ['账号与同步', 'account'],
        ['扫码／手机号登录', 'login'],
        ['同步失败', 'demo-sync'],
      ],
      '扫码等待、手机确认、过期、验证码、同步重试与退出',
    ],
    [
      '偏好与辅助',
      [
        ['设置', 'settings'],
        ['支持项目', 'support'],
        ['应用推荐', 'apps'],
      ],
      '外观、语言、播放、缓存、诊断、更新与许可',
    ],
    [
      'TV 适配',
      [
        ['切换 TV 预览', 'tv-preview'],
        ['电视首页频道', 'tv-channel'],
      ],
      '远距离字号、方向键焦点、确认、返回、媒体键语义',
    ],
  ];
  return `<div class="page-head"><h1>页面与流程地图</h1>${button('返回原型', 'back', { image: 'back' })}</div><p class="prose muted">选择任意入口查看设计。顶部可切换浅色／深色、平台以及加载、空内容和网络失败状态。</p><div class="map-columns">${groups.map(([title, links, desc]) => `<section class="map-group"><h2>${title}</h2>${links.map(([label, action]) => `<button data-action="${action}">${label}${icon('forward')}</button>`).join('')}<p>${desc}</p></section>`).join('')}</div>`;
}

let lastFocus = null;
let lastFocusKey = null;
let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}
function showDialog(title, body, { sheet = false, footer = '' } = {}) {
  const sameDialog = overlay.open && overlay.dataset.context === `${state.id}:${title}`;
  const scroll = sameDialog ? $('.dialog-body', overlay)?.scrollTop : 0;
  const focus = sameDialog ? focusKey(document.activeElement) : null;
  if (!overlay.open) {
    lastFocus = document.activeElement;
    lastFocusKey = focusKey(lastFocus);
  }
  delete overlay.dataset.updateStep;
  overlay.dataset.context = `${state.id}:${title}`;
  overlay.className = sheet ? 'sheet' : '';
  overlay.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer}`;
  bindTabPanels(overlay);
  if (!overlay.open) overlay.showModal();
  else if (!restoreFocus(focus)) $('button', overlay)?.focus();
  $('.dialog-body', overlay).scrollTop = scroll || 0;
}
function confirmDialog(title, message, label, callback) {
  showDialog(
    title,
    `<p>${message}</p><div class="actions">${button('取消', 'close')}${button(label, 'confirm', { variant: 'primary' })}</div>`,
  );
  pendingConfirm = callback;
}
let pendingConfirm = null;
function episodePanel() {
  if (
    state.mode === 'desktop' &&
    ['player', 'feed'].includes(state.route) &&
    innerWidth > 1050 &&
    !document.fullscreenElement
  ) {
    state.playerPanel = '选集';
    render();
    return;
  }
  showDialog(
    '选集',
    `<p class="muted">${current().title}</p>${seasonPicker(true)}${episodePicker(current(), { tv: state.mode === 'tv' })}`,
    { sheet: true },
  );
}

function commentsPanel() {
  const focus = focusKey(document.activeElement);
  if (
    state.mode === 'desktop' &&
    ['player', 'feed'].includes(state.route) &&
    innerWidth > 1050 &&
    !document.fullscreenElement
  ) {
    state.playerPanel = '评论';
    render();
  } else showDialog('评论', commentsBody(), { sheet: true, footer: commentForm() });
  restoreFocus(focus);
}

function loginDialog() {
  if ($('#comment-form')) state.loginReturn = 'comments';
  const scanBody = `<div class="qr-sample">${icon('qr')}<span class="small">${state.loginStep === 'expired' ? '二维码已过期' : state.loginStep === 'confirm' ? '已扫码，等待手机确认' : '扫码区域示意'}</span></div><p class="login-copy muted small">此处不生成可扫描凭据，不会连接真实账号。</p><div class="actions" style="justify-content:center">${state.loginStep === 'expired' ? button('刷新二维码', 'qr-refresh', { variant: 'primary' }) : state.loginStep === 'confirm' ? button('模拟手机确认', 'login-success', { variant: 'primary' }) : button('模拟扫码', 'qr-scan', { variant: 'primary' })}${state.loginStep !== 'expired' ? button('模拟过期', 'qr-expire') : ''}</div>`;
  const phoneBody = `<p class="small muted">使用下方演示号码与验证码 000000，无需输入个人信息。</p><form id="phone-form"><label class="field"><span>手机号</span><input class="field-input" type="tel" value="13800000000" readonly tabindex="-1" aria-label="演示手机号 13800000000" /></label><label class="field"><span>验证码</span><span class="verification"><input class="field-input" id="code" inputmode="numeric" autocomplete="off" placeholder="输入 000000" maxlength="6" required aria-describedby="code-error" />${button(state.codeSent ? '已发送' : '获取验证码', 'send-code', { attrs: `type="button" ${state.codeSent ? 'disabled' : ''}` })}</span></label><p id="code-error" class="small error-text" role="alert"></p><button type="submit" class="btn primary" style="width:100%">登录演示账号</button></form>`;
  showDialog(
    '登录账号',
    `${tabs(['扫码登录', '手机号登录'], state.loginTab, 'login-tab')}${state.loginTab === '扫码登录' ? scanBody : phoneBody}<p class="small muted" style="margin:24px 0 0">登录后回到当前任务；收藏、追更和评论仍由你再次确认。</p>`,
  );
}
function downloadDialog(id) {
  state.downloadId = id || state.id;
  const d = dramaById(state.downloadId);
  showDialog(
    '选择下载集数',
    `<p><strong>${d.title}</strong><span class="muted small"> · 下载流程演示</span></p><form id="download-form"><label class="field"><span>集数范围</span><select class="field-input" id="download-range"><option>第 1–12 集</option><option>第 13–24 集</option><option>当前集</option><option>全部已上线集数</option></select></label><label class="field"><span>清晰度</span><select class="field-input"><option>720P</option><option>1080P</option><option>480P</option></select></label><label class="checkbox-label"><input type="checkbox" checked />仅在 Wi-Fi 下下载</label><div class="actions">${button('取消', 'close', { attrs: 'type="button"' })}<button class="btn primary" type="submit">加入下载</button></div></form>`,
  );
}
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  $('#theme-button').textContent = theme === 'light' ? '深色' : '浅色';
}
function setMode(mode) {
  if (overlay.open) overlay.close();
  const updating = state.route === 'updates';
  state.mode = mode;
  state.route = updating ? 'updates' : 'home';
  state.season = 1;
  state.episodePage = 0;
  stack.length = 0;
  document.documentElement.dataset.mode = mode;
  $('#mode').value = mode;
  setTheme(mode === 'tv' ? 'dark' : 'light');
  render();
  window.scrollTo(0, 0);
  if (mode === 'tv') focusTVInitial();
}
function focusKey(node) {
  if (!node || !node.isConnected || node === content) return null;
  for (const key of ['detail', 'episode', 'action', 'route', 'historySelect']) {
    if (node.dataset[key])
      return {
        key,
        value: node.dataset[key],
        secondary: node.dataset.value || '',
        root: node.closest('#overlay')
          ? 'overlay'
          : node.closest('#tv-header')
            ? 'tv-header'
            : node.closest('#navigation')
              ? 'navigation'
              : 'content',
      };
  }
  return node.id ? { id: node.id } : null;
}
function restoreFocus(key) {
  if (!key) return false;
  const root = overlay.open
    ? overlay
    : key.root === 'tv-header'
      ? $('#tv-header')
      : key.root === 'navigation'
        ? $('#navigation')
        : content;
  const target = key.id
    ? $$('[id]', root).find((node) => node.id === key.id)
    : $$('[data-' + key.key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']', root).find(
        (n) => n.dataset[key.key] === key.value && (n.dataset.value || '') === key.secondary,
      );
  if (
    !target ||
    !target.getClientRects().length ||
    target.disabled ||
    (overlay.open && !overlay.contains(target))
  )
    return false;
  target.focus({ preventScroll: true });
  return true;
}

function refreshFullscreenCinema() {
  const cinema = document.fullscreenElement;
  const focus = focusKey(document.activeElement);
  const template = document.createElement('template');
  template.innerHTML = desktopCinema();
  const picture = $('.picture', cinema);
  const nextPicture = $('.picture', template.content);
  const image = $('img', picture);
  const nextImage = $('img', nextPicture);
  // Removing the fullscreen element (or its ancestors) exits browser fullscreen.
  if (image.getAttribute('src') !== nextImage.getAttribute('src'))
    image.src = nextImage.getAttribute('src');
  while (image.nextSibling) image.nextSibling.remove();
  picture.append(...[...nextPicture.childNodes].filter((node) => node !== nextImage));
  $('.player-controls', cinema).innerHTML = $('.player-controls', template.content).innerHTML;
  restoreFocus(focus);
}

document.addEventListener('fullscreenchange', () => {
  if (state.mode !== 'desktop') return;
  const focus = focusKey(document.activeElement);
  render();
  if (!document.fullscreenElement && !overlay.open) {
    if (!restoreFocus(focus)) $('[data-action="fullscreen"]', content)?.focus();
  }
});

function refreshPreservingFocus() {
  const focus = focusKey(document.activeElement);
  const scroll = window.scrollY;
  render();
  window.scrollTo(0, scroll);
  restoreFocus(focus);
}

function toggleSet(name, id, added, removed) {
  const moreOpen = overlay.open && $('#dialog-title')?.textContent === '播放选项';
  const set = state[name];
  if (set.has(id)) {
    set.delete(id);
    toast(removed);
  } else {
    set.add(id);
    toast(added);
  }
  refreshPreservingFocus();
  if (moreOpen) tvMoreDialog();
}
function rememberPlayback() {
  if (state.playbackStarted && state.history.includes(state.id)) {
    current().episode = state.episode;
    current().position = state.position;
  }
}
function startPlayback(id, episode = 1, position = 0) {
  state.id = id;
  state.episode = episode;
  state.position = position;
  state.season = 1;
  state.playing = false;
  state.playbackStarted = false;
  state.tvControls = true;
  state.tvSeek = false;
  state.tvSeekPosition = undefined;
  state.episodePage = Math.floor((episode - 1) / (state.mode === 'tv' ? 12 : 24));
  navigate('player', id);
}
const routeActions = new Set([
  'home',
  'feed',
  'search',
  'library',
  'discover',
  'ranking',
  'new',
  'history',
  'favorites',
  'following',
  'downloads',
  'account',
  'settings',
  'support',
  'apps',
  'map',
]);
function handleAction(action, value, source) {
  if (action.startsWith('update-')) {
    handleUpdateAction(action, value);
    return;
  }
  if (routeActions.has(action)) {
    navigate(action);
    return;
  }
  switch (action) {
    case 'player-panel':
      state.playerPanel = value;
      render();
      break;
    case 'locate-episode':
      state.episodePage = Math.floor((state.episode - 1) / (state.mode === 'tv' ? 12 : 24));
      if (overlay.open) episodePanel();
      else render();
      const selected = $(
        '[data-episode="' + state.episode + '"]',
        overlay.open ? overlay : content,
      );
      selected?.focus();
      break;
    case 'tv-wake':
      state.tvControls = !state.tvControls;
      render();
      focusTVInitial();
      break;
    case 'tv-leave':
      back();
      break;
    case 'tv-seek-back':
    case 'tv-seek-forward':
      state.tvSeek = true;
      state.tvControls = true;
      state.tvSeekPosition = Math.max(
        0,
        Math.min(
          102,
          (state.tvSeekPosition ?? state.position) + (action === 'tv-seek-forward' ? 10 : -10),
        ),
      );
      render();
      break;
    case 'tv-player-more':
      tvMoreDialog();
      break;
    case 'tv-danmaku':
      state.danmaku = !state.danmaku;
      render();
      tvMoreDialog();
      break;
    case 'tv-send-danmaku':
      showDialog(
        '发送弹幕',
        `<form id="danmaku-form"><label class="field"><span>弹幕内容</span><input id="danmaku-input" class="field-input" maxlength="40" value="${escapeHTML(state.danmakuDraft || '')}" /></label><button type="submit" class="btn primary">发送</button></form>`,
        { sheet: true },
      );
      break;
    case 'tv-radar': {
      const template = document.createElement('template');
      template.innerHTML = rankingPage();
      showDialog('榜单雷达', template.content.querySelector('.radar').innerHTML);
      break;
    }
    case 'back':
      back();
      break;
    case 'close':
      overlay.close();
      break;
    case 'confirm': {
      const callback = pendingConfirm;
      pendingConfirm = null;
      overlay.close();
      callback?.();
      break;
    }
    case 'menu': {
      const open = $('#navigation').classList.toggle('mobile-open');
      $('.mobile-menu').setAttribute('aria-expanded', String(open));
      break;
    }
    case 'theme':
      setTheme(state.theme === 'light' ? 'dark' : 'light');
      if (state.route === 'settings') render();
      break;
    case 'detail':
      state.season = 1;
      state.episode = dramaById(value || state.id).episode;
      state.episodePage = Math.floor((state.episode - 1) / (state.mode === 'tv' ? 12 : 24));
      navigate('detail', value);
      break;
    case 'play':
      startPlayback(
        value || state.id,
        !value || value === state.id ? state.episode : dramaById(value).episode,
      );
      break;
    case 'player':
      startPlayback(state.id, state.episode);
      break;
    case 'resume': {
      const d = dramaById(value || state.id);
      startPlayback(d.id, d.episode, d.position || 0);
      break;
    }
    case 'channel':
      state.channel = value;
      render();
      break;
    case 'real-channel':
      state.channel = '真人剧';
      render();
      break;
    case 'real-kind':
      state.kind = '真人剧';
      render();
      break;
    case 'home-genre':
      state.genre = value;
      state.query = '';
      $('#search').value = '';
      navigate('discover');
      break;
    case 'genre':
      state.genre = value;
      render();
      break;
    case 'kind':
      state.kind = value;
      render();
      break;
    case 'sort':
      state.sort = value;
      render();
      break;
    case 'recent-search':
      searchFor(value);
      break;
    case 'clear-query':
      state.query = '';
      $('#search').value = '';
      render();
      break;
    case 'reset-discover':
      state.genre = '全部';
      state.kind = '全部';
      state.query = '';
      state.scenario = 'normal';
      $('#scenario').value = 'normal';
      $('#search').value = '';
      navigate('discover');
      break;
    case 'clear-searches':
      confirmDialog('清空搜索记录？', '仅清除本次演示中的搜索记录。', '清空记录', () => {
        state.searches = [];
        render();
        toast('搜索记录已清空');
      });
      break;
    case 'shuffle':
      dramas.push(dramas.shift());
      render();
      toast('已更换推荐顺序');
      break;
    case 'page-error': {
      const existing = $('#page-error');
      if (!existing)
        source.insertAdjacentHTML(
          'beforebegin',
          '<span id="page-error" class="small error-text" role="alert">后续内容加载失败，当前结果已保留。</span>',
        );
      source.textContent = '重试加载';
      source.dataset.action = 'page-retry';
      break;
    }
    case 'page-retry':
      $('#page-error')?.remove();
      source.textContent = '已显示全部';
      source.disabled = true;
      break;
    case 'rank-tab':
      state.rankTab = value;
      render();
      break;
    case 'new-date':
      state.newDate = Number(value);
      render();
      break;
    case 'today':
      state.newDate = 0;
      render();
      break;
    case 'favorite-tab':
      state.favoriteTab = value;
      render();
      break;
    case 'following-tab':
      state.followingTab = value;
      render();
      break;
    case 'download-tab':
      state.downloadTab = value;
      render();
      break;
    case 'favorite':
      toggleSet('favorites', value || state.id, '已加入收藏', '已取消收藏');
      break;
    case 'like':
      toggleSet('likes', value || state.id, '已点赞', '已取消点赞');
      break;
    case 'follow':
      if (!state.loggedIn) loginDialog();
      else toggleSet('follows', value || state.id, '已追更，有更新时提醒你', '已取消追更');
      break;
    case 'reserve':
      if (!state.loggedIn) loginDialog();
      else {
        if (overlay.open) overlay.close();
        toggleSet('reservations', value || state.id, '已预约第二季上线提醒', '已取消预约');
      }
      break;
    case 'manage-history':
      state.manage = !state.manage;
      render();
      break;
    case 'select-history':
      state.selectedHistory = new Set(state.history);
      render();
      break;
    case 'delete-history':
      confirmDialog(
        '删除所选记录？',
        `将删除 ${state.selectedHistory.size} 部短剧的本机演示记录，收藏不受影响。`,
        '删除记录',
        () => {
          state.history = state.history.filter((id) => !state.selectedHistory.has(id));
          state.selectedHistory.clear();
          render();
          toast('所选记录已删除');
        },
      );
      break;
    case 'clear-history':
      confirmDialog(
        '清空本机观看记录？',
        '会清除本机的观看位置和统计。账号云端记录需要另行管理，收藏不会被清除。',
        '清空本机记录',
        () => {
          state.history = [];
          state.manage = false;
          render();
          toast('本机观看记录已清空');
        },
      );
      break;
    case 'season':
      state.season = Number(value);
      render();
      break;
    case 'panel-season':
      state.season = Number(value);
      if (overlay.open) episodePanel();
      else render();
      break;
    case 'episodes':
      episodePanel();
      break;
    case 'comments':
      commentsPanel();
      break;
    case 'retry-comments':
      state.scenario = 'normal';
      $('#scenario').value = 'normal';
      commentsPanel();
      break;
    case 'toggle-play':
      state.playing = !state.playing;
      if (state.playing) {
        state.playbackStarted = true;
        state.history = [state.id, ...state.history.filter((id) => id !== state.id)];
        rememberPlayback();
      }
      refreshPreservingFocus();
      toast(state.playing ? '已切换为播放状态（静态演示）' : '已暂停');
      break;
    case 'next-episode':
      if (state.episode < (current().id === 'spring' ? 48 : current().count)) {
        state.episode++;
        state.position = 0;
        state.playbackStarted = state.playing;
        if (state.playing) rememberPlayback();
        state.episodePage = Math.floor((state.episode - 1) / (state.mode === 'tv' ? 12 : 24));
        render();
        toast(`已切换到第 ${state.episode} 集`);
      }
      break;
    case 'mute':
      state.volume = state.volume ? 0 : 60;
      refreshPreservingFocus();
      break;
    case 'fullscreen': {
      const target = $('.cinema');
      if (document.fullscreenElement) document.exitFullscreen();
      else target?.requestFullscreen().catch(() => toast('当前宿主不支持全屏'));
      break;
    }
    case 'recommend-next':
      state.id = dramas[(dramas.findIndex((d) => d.id === state.id) + 1) % dramas.length].id;
      state.episode = 1;
      state.position = 0;
      state.playbackStarted = false;
      render();
      break;
    case 'login':
    case 'account-login':
      loginDialog();
      break;
    case 'login-tab':
      state.loginTab = value;
      loginDialog();
      break;
    case 'qr-scan':
      state.loginStep = 'confirm';
      loginDialog();
      break;
    case 'qr-expire':
      state.loginStep = 'expired';
      loginDialog();
      break;
    case 'qr-refresh':
      state.loginStep = 'waiting';
      loginDialog();
      break;
    case 'send-code':
      state.codeSent = true;
      source.textContent = '已发送';
      source.disabled = true;
      toast('演示验证码：000000');
      break;
    case 'login-success': {
      state.loggedIn = true;
      state.syncError = false;
      overlay.close();
      render();
      if (state.loginReturn === 'comments') commentsPanel();
      if (state.loginReturn === 'danmaku' && state.mode === 'tv') handleAction('tv-send-danmaku');
      state.loginReturn = '';
      toast('演示登录成功，请再次确认原操作');
      break;
    }
    case 'logout':
      confirmDialog(
        '退出当前账号？',
        '本机待同步记录会保留。退出后回到游客片库。',
        '退出登录',
        () => {
          state.loggedIn = false;
          render();
          toast('已退出演示账号');
        },
      );
      break;
    case 'sync':
      state.syncError = false;
      render();
      toast('演示同步完成');
      break;
    case 'sync-error':
      state.syncError = true;
      render();
      break;
    case 'demo-sync':
      state.loggedIn = true;
      state.syncError = true;
      navigate('account');
      break;
    case 'comment-like': {
      const c = commentThread().comments.find((c) => c.id === Number(value));
      c.liked = !c.liked;
      c.likes += c.liked ? 1 : -1;
      commentsPanel();
      break;
    }
    case 'reply': {
      const c = commentThread().comments.find((c) => c.id === Number(value));
      commentThread().replyTo = c.name;
      commentsPanel();
      $('#comment-draft', overlay.open ? overlay : content).focus();
      break;
    }
    case 'cancel-reply':
      commentThread().replyTo = '';
      commentsPanel();
      break;
    case 'replies': {
      const c = commentThread().comments.find((c) => c.id === Number(value));
      c.reply = c.reply ? '' : '我也喜欢这一段，期待接下来的故事。';
      commentsPanel();
      break;
    }
    case 'delete-comment':
      confirmDialog('删除这条评论？', '删除后将从本次演示中移除。', '删除评论', () => {
        commentThread().comments = commentThread().comments.filter((c) => c.id !== Number(value));
        commentsPanel();
      });
      break;
    case 'submit-comment':
      break;
    case 'download':
      downloadDialog(value);
      break;
    case 'task-toggle': {
      const t = state.tasks.find((t) => t.id === Number(value));
      t.status = t.status === '下载中' ? '已暂停' : '下载中';
      refreshPreservingFocus();
      break;
    }
    case 'task-remove':
      confirmDialog(
        '移除这个下载任务？',
        '演示任务与已下载部分将被移除，不影响观看记录。',
        '移除任务',
        () => {
          state.tasks = state.tasks.filter((t) => t.id !== Number(value));
          render();
          toast('任务已移除');
        },
      );
      break;
    case 'space-error':
      if (state.tasks.length) {
        state.tasks[0].status = '空间不足';
        state.downloadTab = '进行中';
        render();
      } else toast('先添加一个下载任务');
      break;
    case 'offline-play':
      toast('下载播放入口演示，未提供离线媒体文件');
      startPlayback(value);
      break;
    case 'setting-tab':
      state.settingTab = value;
      render();
      break;
    case 'switch': {
      const checked = source.getAttribute('aria-checked') !== 'true';
      source.setAttribute('aria-checked', String(checked));
      state.preferences ||= {};
      state.preferences[source.getAttribute('aria-label')] = checked;
      if (source.getAttribute('aria-label') === '默认弹幕') state.danmaku = checked;
      if (source.getAttribute('aria-label') === '减少动态效果')
        document.documentElement.classList.toggle('reduce-motion', checked);
      toast('偏好已保存在本次演示');
      break;
    }
    case 'clear-cache':
      confirmDialog(
        '清理本机缓存？',
        '清理演示缓存 286 MB，不删除已下载剧集、观看记录或账号信息。',
        '清理缓存',
        () => toast('演示缓存已清理'),
      );
      break;
    case 'diagnostics':
      showDialog(
        '诊断信息',
        '<dl><dt>运行环境</dt><dd>浏览器设计原型</dd><dt>核心连接</dt><dd>未连接 Rust API</dd><dt>媒体能力</dt><dd>静态画面，无解码验证</dd><dt>日志</dt><dd>未收集凭据与网络日志</dd></dl>',
      );
      break;
    case 'update':
      navigate('updates');
      break;
    case 'licenses':
      showDialog(
        '开源许可',
        '<p>正式客户端应列出实际随包分发的组件名称、版本及许可证全文。</p><p class="muted">此原型使用原生 HTML／CSS／JavaScript，未引入 UI 组件依赖。生成封面仅供设计演示。</p>',
      );
      break;
    case 'network-error':
      state.scenario = 'error';
      $('#scenario').value = 'error';
      navigate('discover');
      break;
    case 'retry':
      state.scenario = 'normal';
      $('#scenario').value = 'normal';
      render();
      toast('演示内容已恢复');
      break;
    case 'tv-preview':
      navigate('home');
      setMode('tv');
      break;
    case 'tv-channel':
      showDialog(
        '电视首页频道',
        `<p>系统首页展示继续观看与推荐卡片。选择卡片后直接进入对应剧集，返回遵循系统层级。</p><p class="muted small">以下是入口行为演示，未安装或发布 Android TV 系统频道。</p>${button('从系统卡片继续观看', 'resume', { value: 'return', variant: 'primary', image: 'play' })}`,
      );
      break;
    default:
      break;
  }
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.route) navigate(target.dataset.route);
  else if (target.dataset.detail) {
    state.season = 1;
    state.episode = dramaById(target.dataset.detail).episode;
    state.episodePage = Math.floor((state.episode - 1) / (state.mode === 'tv' ? 12 : 24));
    navigate('detail', target.dataset.detail);
  } else if (target.dataset.episode) {
    const ep = Number(target.dataset.episode);
    state.position = 0;
    state.season = 1;
    if (overlay.open) overlay.close();
    if (['player', 'feed'].includes(state.route)) {
      state.episode = ep;
      state.playbackStarted = state.playing;
      if (state.playing) rememberPlayback();
      render();
      if (state.mode === 'tv') focusTVInitial();
    } else startPlayback(state.id, ep);
  } else if (target.dataset.action === 'account') {
    if (state.loggedIn) navigate('account');
    else loginDialog();
  } else if (target.dataset.action)
    handleAction(target.dataset.action, target.dataset.value, target);
});
function searchFor(query) {
  state.query = query.trim();
  state.genre = '全部';
  state.kind = '全部';
  $('#search').value = state.query;
  if (state.query)
    state.searches = [state.query, ...state.searches.filter((q) => q !== state.query)].slice(0, 6);
  navigate('discover');
}
document.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'search-form') searchFor($('#search').value);
  if (event.target.id === 'tv-search-form') searchFor($('#tv-query').value);
  if (event.target.id === 'phone-form') {
    if ($('#code').value !== '000000') {
      $('#code-error').textContent = '验证码不正确，请输入演示验证码 000000。';
      $('#code').setAttribute('aria-invalid', 'true');
    } else handleAction('login-success');
  }
  if (event.target.id === 'download-form') {
    state.tasks.unshift({
      id: Date.now(),
      drama: state.downloadId,
      range: $('#download-range').value,
      progress: 0,
      status: '排队中',
    });
    overlay.close();
    state.downloadTab = '进行中';
    navigate('downloads');
    toast('已加入演示下载队列');
  }
  if (event.target.id === 'danmaku-form') {
    const text = $('#danmaku-input').value.trim();
    if (!text) {
      $('#danmaku-input').focus();
      return;
    }
    state.danmakuDraft = text;
    if (!state.loggedIn) {
      state.loginReturn = 'danmaku';
      loginDialog();
      return;
    }
    if (state.scenario === 'error') {
      toast('发送失败，输入已保留，请重试');
      return;
    }
    state.danmakuText = text;
    state.danmaku = true;
    if (state.mode === 'tv' && overlay.open) overlay.close();
    render();
    toast('弹幕已展示（本次演示）');
  }
  if (event.target.id === 'comment-form') {
    commentThread().draft = $('#comment-draft', event.target).value;
    if (!state.loggedIn) {
      loginDialog();
      return;
    }
    if (!commentThread().draft.trim()) {
      $('#comment-draft', overlay.open ? overlay : content).focus();
      toast('先写下你的看法');
      return;
    }
    if (state.scenario === 'error') {
      toast('发表失败，草稿已保留');
      return;
    }
    commentThread().comments.unshift({
      id: Date.now(),
      name: '林间听风',
      text: `${commentThread().replyTo ? `回复${commentThread().replyTo}：` : ''}${commentThread().draft}`,
      time: '刚刚',
      likes: 0,
      mine: true,
    });
    commentThread().draft = '';
    commentThread().replyTo = '';
    commentsPanel();
    toast('已发表演示评论，正式内容需按平台规则审核');
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'position') {
    state.position = Number(event.target.value);
    rememberPlayback();
    $('#time-label').textContent = `${formatTime(state.position)} / 01:42`;
  }
  if (event.target.id === 'volume') state.volume = Number(event.target.value);
  if (event.target.id === 'comment-draft') commentThread().draft = event.target.value;
  if (event.target.id === 'danmaku-input') state.danmakuDraft = event.target.value;
});
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.discoverFilter) handleAction(target.dataset.discoverFilter, target.value);
  if (target.id === 'episode-range') {
    state.episodePage = Number(target.value);
    if (overlay.open) episodePanel();
    else render();
    $('#episode-range', overlay.open ? overlay : content)?.focus();
  }
  if (target.id === 'mode') setMode(target.value);
  if (target.id === 'update-scenario') {
    if (overlay.open) overlay.close();
    updateModel().version = ['success', 'latest'].includes(target.value) ? '0.2.0' : '0.1.0';
    updateModel().permission = false;
    setUpdateStage(target.value, { run: false });
  }
  if (target.id === 'scenario') {
    state.scenario = target.value;
    render();
  }
  if (target.id === 'danmaku') {
    state.danmaku = target.checked;
    render();
  }
  if (target.id === 'speed') {
    state.speed = target.value;
    toast(`播放速度：${target.value}×`);
  }
  if (target.id === 'quality') {
    state.quality = target.value;
    toast(`下次播放使用 ${target.value}（演示）`);
  }
  if (target.id === 'appearance') {
    setTheme(target.value);
  }
  if (target.dataset.historySelect) {
    const id = target.dataset.historySelect;
    if (target.checked) state.selectedHistory.add(id);
    else state.selectedHistory.delete(id);
    const count = state.selectedHistory.size;
    const b = $('[data-action="delete-history"]');
    b.disabled = !count;
    b.textContent = `删除所选（${count}）`;
  }
  if (target.dataset.setting) {
    state.preferences ||= {};
    state.preferences[target.dataset.setting] = target.value;
    toast('偏好已保存在本次演示');
  }
});
overlay.addEventListener('cancel', (event) => {
  event.preventDefault();
  back();
});
overlay.addEventListener('close', () => {
  closeUpdateSystemStep();
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  else if (restoreFocus(lastFocusKey)) return;
  else if (state.mode === 'tv') focusTVInitial();
  else content.focus({ preventScroll: true });
});
overlay.addEventListener('click', (event) => {
  const box = overlay.getBoundingClientRect();
  if (
    event.target === overlay &&
    (event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom)
  )
    overlay.close();
});
function moveSpatialFocus(key) {
  const root = overlay.open ? overlay : document;
  const candidates = $$(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
    root,
  ).filter((el) => !el.closest('.review-bar') && el.tabIndex >= 0 && el.getClientRects().length);
  const active = document.activeElement;
  if (!candidates.includes(active)) {
    candidates[0]?.focus();
    return;
  }
  const a = active.getBoundingClientRect();
  const ax = a.x + a.width / 2,
    ay = a.y + a.height / 2;
  let best = null,
    bestScore = Infinity;
  for (const node of candidates) {
    if (node === active) continue;
    const b = node.getBoundingClientRect();
    const dx = b.x + b.width / 2 - ax,
      dy = b.y + b.height / 2 - ay;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const main = horizontal ? dx : dy,
      cross = horizontal ? dy : dx;
    if (key === 'ArrowLeft' || key === 'ArrowUp' ? main >= -2 : main <= 2) continue;
    const score = Math.abs(main) + Math.abs(cross) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editing = target.matches('input, textarea, select');
  if (state.mode === 'tv' && editing) {
    if (event.isComposing) return;
    const select = target.tagName === 'SELECT';
    const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
    const singleLine =
      target.tagName === 'INPUT' && !target.matches('input[type="range"], input[type="number"]');
    const textareaCaret =
      target.tagName === 'TEXTAREA' && target.selectionStart === target.selectionEnd;
    const leaveInput =
      (event.key === 'ArrowDown' &&
        (target.tagName === 'INPUT' ||
          (textareaCaret && target.selectionStart === target.value.length))) ||
      (event.key === 'ArrowUp' && (singleLine || (textareaCaret && target.selectionStart === 0)));
    if ((select && (horizontal || event.key === 'Enter')) || leaveInput) {
      event.preventDefault();
      moveSpatialFocus(event.key === 'Enter' ? 'ArrowDown' : event.key);
      return;
    }
  }
  if (state.mode === 'tv' && state.route === 'player' && !overlay.open && !editing) {
    if (state.tvSeek && ['Enter', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        handleAction(event.key === 'ArrowRight' ? 'tv-seek-forward' : 'tv-seek-back');
        return;
      }
      if (event.key === 'Enter') {
        state.position = state.tvSeekPosition;
        rememberPlayback();
      }
      state.tvSeek = false;
      state.tvSeekPosition = undefined;
      render();
      focusTVInitial();
      return;
    }
    if (event.key === 'Escape' && state.tvControls !== false) {
      event.preventDefault();
      state.tvControls = false;
      render();
      focusTVInitial();
      return;
    }
    if (state.tvControls === false && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      handleAction(event.key === 'ArrowRight' ? 'tv-seek-forward' : 'tv-seek-back');
      return;
    }
    if (state.tvControls === false && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      state.tvControls = true;
      render();
      focusTVInitial();
      return;
    }
  }
  if (event.key === 'Escape' && !overlay.open) {
    event.preventDefault();
    if ($('#navigation').classList.contains('mobile-open')) {
      $('#navigation').classList.remove('mobile-open');
      $('.mobile-menu').focus();
      $('.mobile-menu').setAttribute('aria-expanded', 'false');
    } else back();
    return;
  }
  if (editing) return;
  if (
    target.getAttribute('role') === 'tab' &&
    ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    const group = $$('[role="tab"]', target.parentElement);
    const index = group.indexOf(target);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? group.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + group.length) % group.length;
    const tab = group[next];
    const value = tab.dataset.value;
    const action = tab.dataset.action;
    handleAction(action, value, tab);
    $$(`[data-action="${action}"]`)
      .find((el) => el.dataset.value === value)
      ?.focus();
    return;
  }
  if (
    state.mode === 'tv' &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    event.preventDefault();
    moveSpatialFocus(event.key);
    return;
  }
  if (
    (state.route === 'player' || (state.mode !== 'tv' && state.route === 'feed')) &&
    !overlay.open
  ) {
    if (event.key === 'MediaPlayPause') {
      event.preventDefault();
      handleAction('toggle-play');
    }
    if (event.key === 'f') handleAction('fullscreen');
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && state.mode !== 'tv') {
      event.preventDefault();
      state.position = Math.max(
        0,
        Math.min(102, state.position + (event.key === 'ArrowRight' ? 10 : -10)),
      );
      rememberPlayback();
      $('#position').value = state.position;
      $('#time-label').textContent = `${formatTime(state.position)} / 01:42`;
    }
  }
});
$('#search-icon').innerHTML = icon('search');
$('#history-icon').innerHTML = icon('history');
$('.mobile-menu').innerHTML = icon('menu');
const previewParams = new URLSearchParams(location.search);
if (previewParams.get('screen') === 'updates') {
  state.route = 'updates';
  state.settingTab = '关于';
  updateDemos.desktop.stage = 'available';
  updateDemos.tv.stage = 'available';
}
if (previewParams.get('platform') === 'tv') setMode('tv');
else render();
