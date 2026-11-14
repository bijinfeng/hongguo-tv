const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const icon = (name) => HongguoComponents.icon(name);
function button(label, action, options = {}) {
  const { variant = '', image = '', attrs = '', value = '' } = options;
  const collection = {
    favorite: 'favorites',
    follow: 'follows',
    reserve: 'reservations',
  }[action];
  const toggle = state.mode === 'desktop' && collection;
  const pressed = toggle && state[collection].has(value || state.id);
  return HongguoComponents.button(label, {
    variant: `${variant}${pressed ? ' selected' : ''}`,
    glyph: image,
    action,
    value,
    className: 'btn',
    extra: `${toggle ? `aria-pressed="${!!pressed}"` : ''} ${attrs}`,
  });
}
function routeButton(label, route, image = '') {
  return `<button class="ui-button quiet" data-route="${route}">${image ? icon(image) : ''}${label}</button>`;
}
function reservationButton(id, { label = '预约提醒', attrs = '', ...options } = {}) {
  const pending = state.reservationPending.has(id);
  return button(
    pending ? '已提交 · 待确认' : state.reservations.has(id) ? '取消预约' : label,
    'reserve',
    { image: 'bell', ...options, value: id, attrs: `${attrs} ${pending ? 'disabled' : ''}`.trim() },
  );
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
  ['favorites', '收藏', 'bookmark'],
  ['following', '追更与预约', 'bell'],
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
  notificationsRead: false,
  guestMerged: false,
  follows: new Set(['spring']),
  reservations: new Set(),
  history: ['return', 'night'],
  playing: false,
  playbackStarted: false,
  position: 36,
  volume: 60,
  favoriteTab: '收藏',
  rankTab: '热播榜',
  rankView: '红果榜',
  rankCategory: '总榜',
  rankSub: '热播榜',
  rankPanel: '全部',
  radarView: '官方快照',
  radarCategory: '综合',
  radarMetric: '热度日增',
  radarType: '全部',
  radarScenario: '正常',
  newMode: '上新日历',
  newGender: '全部',
  reservationPending: new Set(),
  newDate: 0,
  followingTab: '追更',
  settingTab: '通用',
  loginTab: '扫码登录',
  loginStep: 'waiting',
  manage: false,
  selectedHistory: new Set(),
};
const stack = [];
let content = $('#content');
const overlay = $('#overlay');
const seasonDramas = [
  {
    ...dramas[1],
    id: 'spring-second',
    title: '春山不负 · 第二季',
    count: 12,
    note: '全 12 集',
    episode: 1,
    position: 0,
  },
  {
    ...dramas[1],
    id: 'spring-third',
    title: '春山不负 · 第三季',
    count: 0,
    note: '待上线',
    episode: 1,
    position: 0,
  },
];
const dramaById = (id) => [...dramas, ...seasonDramas].find((d) => d.id === id);
const current = () => dramaById(state.id) || dramas[0];
function prototypeSeasons(d = current()) {
  if (!['spring', 'spring-second', 'spring-third'].includes(d.id)) return [];
  return [
    { number: 1, id: 'spring', title: '第一季', available: true },
    { number: 2, id: 'spring-second', title: '第二季', available: true },
    { number: 3, id: 'spring-third', title: '第三季', available: false },
  ];
}
function selectedSeason(d = current()) {
  const seasons = prototypeSeasons(d);
  return (
    seasons.find((season) => season.number === state.season) ||
    seasons.find((season) => season.id === d.id)
  );
}
function isUpcomingSeason(d = current()) {
  return selectedSeason(d)?.available === false;
}
function playableEpisodeCount(d = current()) {
  return d.id === 'spring' ? 48 : d.count;
}
const posterImage = (d, cls = '', alt = '') =>
  `<img class="${cls}" src="assets/${d.id.startsWith('spring-') ? 'spring' : d.id}.png" alt="${alt}" loading="lazy" width="1024" height="1536" />`;
function poster(d) {
  return `<article class="poster"><button class="poster-link content-poster-button" data-detail="${d.id}"><span class="poster-art content-poster-cover">${posterImage(d)}<span class="tag content-cover-label">${d.note}</span></span><span class="poster-title">${d.title}</span><span class="poster-meta content-meta">${d.tags.slice(0, 2).join(' · ')}</span></button></article>`;
}
function posters(items = dramas) {
  return `<div class="poster-grid">${items.map(poster).join('')}</div>`;
}
function chips(items, active, action) {
  return `<div class="chips">${items.map((item) => `<button class="ui-button" aria-pressed="${active === item}" data-action="${action}" data-value="${item}">${item}</button>`).join('')}</div>`;
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
  return `<div class="empty-state fb-empty">${icon(symbol)}<h2>${title}</h2><p>${message}</p>${button(label, action)}</div>`;
}
function statusContent() {
  if (state.scenario === 'loading')
    return `<div role="status" aria-busy="true"><p class="muted">正在加载内容…</p><div class="skeleton-grid">${Array.from({ length: 4 }, () => '<div class="skeleton fb-skeleton-poster"></div>').join('')}</div></div>`;
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
    `<button class="ui-button quiet nav-button" data-route="${route}" ${active === route ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`;
  $('#navigation').innerHTML =
    `<div class="brand">${icon('play')}红果</div><nav aria-label="内容与片库"><div class="nav-group">${nav.slice(0, 5).map(item).join('')}</div><div class="nav-divider"></div><div class="nav-group">${nav.slice(5).map(item).join('')}</div></nav><div class="nav-bottom"><button class="ui-button quiet nav-button" data-route="account" ${active === 'account' ? 'aria-current="page"' : ''}>${icon('user')}<span>${state.loggedIn ? '我的账号' : '账号'}</span></button><button class="ui-button quiet nav-button" data-route="settings" ${active === 'settings' ? 'aria-current="page"' : ''}>${icon('settings')}<span>设置</span></button></div>`;
  $('#account-button').innerHTML =
    `<span class="avatar avatar-spec">${state.loggedIn ? '林' : icon('user')}</span><span class="account-name">${state.loggedIn ? '林间听风' : '登录'}</span>`;
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
  if (id) {
    state.id = id;
    state.season = prototypeSeasons().find((season) => season.id === id)?.number || 1;
  }
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
  HongguoComponents.syncRanges(content);
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
  syncUpdateReview();
  document.title = `红果 · ${{ detail: current().title, player: current().title, map: '页面地图', account: '账号', settings: '设置', updates: '应用更新', support: '支持', apps: '应用推荐' }[state.route] || nav.find((n) => n[0] === state.route)?.[1] || '设计原型'}`;
}

// Illustrative selector metadata, not API parameter names or live metrics.
const prototypeDiscoverData = {
  return: {
    kind: '真人剧',
    audience: '男频',
    status: '已完结',
    age: 3,
    setting: '逆袭',
    background: '现代',
    hot: 8600,
    favorites: 9000,
    published: 1,
  },
  spring: {
    kind: '真人剧',
    audience: '女频',
    status: '连载中',
    age: 10,
    setting: '成长',
    background: '古代',
    hot: 4200,
    favorites: 42000,
    published: 2,
  },
  night: {
    kind: 'AI剧',
    audience: '男频',
    status: '已完结',
    age: 20,
    setting: '探案',
    background: '现代',
    hot: 9800,
    favorites: 36000,
    published: 3,
  },
  home: {
    kind: '漫剧',
    audience: '女频',
    status: '已完结',
    age: 60,
    setting: '成长',
    background: '现代',
    hot: 6400,
    favorites: 0,
    published: 4,
  },
};
function discoverItems(selection) {
  const { query = '', genre = '全部', kind = '全部', sort = '综合' } = selection;
  const q = query.trim().toLowerCase();
  // Keyword relevance is an independent result set; browse filters never trim it.
  if (q)
    return dramas.filter((drama) =>
      `${drama.title}${drama.tags.join('')}${drama.cast}`.toLowerCase().includes(q),
    );
  const items = dramas.filter((drama) => {
    const data = prototypeDiscoverData[drama.id];
    const days = { 近7天: 7, 近14天: 14, 近30天: 30, 近90天: 90 }[selection.discoverTime];
    return (
      (kind === '全部' || data.kind === kind) &&
      (genre === '全部' || drama.tags.includes(genre)) &&
      (!selection.discoverAudience ||
        selection.discoverAudience === '全部' ||
        data.audience === selection.discoverAudience) &&
      (!selection.discoverStatus ||
        selection.discoverStatus === '全部' ||
        data.status === selection.discoverStatus) &&
      (!selection.discoverSetting ||
        selection.discoverSetting === '全部' ||
        data.setting === selection.discoverSetting) &&
      (!selection.discoverBackground ||
        selection.discoverBackground === '全部' ||
        data.background === selection.discoverBackground) &&
      (!days || data.age <= days)
    );
  });
  const metric = { 最新: 'published', 热度: 'hot', 收藏: 'favorites' }[sort];
  if (metric)
    items.sort((a, b) => prototypeDiscoverData[b.id][metric] - prototypeDiscoverData[a.id][metric]);
  return items;
}
function discoverFilters(tv = false) {
  const primary = [
    ['kind', '类型', ['全部', '真人剧', '漫剧', 'AI剧']],
    [
      'genre',
      '题材',
      state.kind === '漫剧'
        ? ['全部', '都市', '家庭']
        : state.kind === 'AI剧'
          ? ['全部', '都市', '悬疑']
          : ['全部', '重生', '古装', '都市', '悬疑', '家庭'],
    ],
    ['sort', '排序', ['综合', '最新', '热度', '收藏']],
  ];
  const advanced = [
    ['discover-audience', '受众', ['全部', '男频', '女频'], 'discoverAudience'],
    ['discover-status', '状态', ['全部', '已完结', '连载中'], 'discoverStatus'],
    ['discover-time', '上线时间', ['全部', '近7天', '近14天', '近30天', '近90天'], 'discoverTime'],
    [
      'discover-setting',
      '设定',
      state.kind === '漫剧'
        ? ['全部', '成长']
        : state.kind === 'AI剧'
          ? ['全部', '探案']
          : ['全部', '逆袭', '成长'],
      'discoverSetting',
    ],
    [
      'discover-background',
      '背景',
      state.kind === '真人剧' || state.kind === '全部'
        ? ['全部', '现代', '古代']
        : ['全部', '现代'],
      'discoverBackground',
    ],
  ];
  const row = ([action, label, options, key = action]) => {
    const value = state[key] || (action === 'sort' ? '综合' : '全部');
    return tv
      ? `<label><span>${label}</span><select id="tv-${action}" class="field-input ui-input" data-discover-filter="${action}">${options.map((option) => `<option ${option === value ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`
      : `<div class="filter-row"><span class="filter-label">${label}</span>${chips(options, value, action)}</div>`;
  };
  const selected = advanced
    .filter(([, , , key]) => state[key] && state[key] !== '全部')
    .map(([, label, , key]) => `${label}：${state[key]}`)
    .join(' · ');
  return `<section class="reality-discover-filters" aria-label="分类筛选"><div class="${tv ? 'tv-filter' : 'filters'}">${primary.map(row).join('')}</div><div class="reality-filter-toggle">${button(state.discoverExpanded ? '收起筛选' : '更多筛选', 'discover-expand', { attrs: `aria-expanded="${!!state.discoverExpanded}" aria-controls="discover-more-filters"` })}${!state.discoverExpanded && selected ? `<span class="small muted">${selected}</span>` : ''}</div><div id="discover-more-filters" ${state.discoverExpanded ? '' : 'hidden'}><div class="${tv ? 'tv-filter' : 'filters'}">${advanced.map(row).join('')}</div></div><p class="small muted">筛选与指标为演示样例；实际选项随内容类型提供。</p></section>`;
}
function discoverPageKey() {
  return state.query.trim()
    ? `search:${state.query.trim()}`
    : JSON.stringify([
        state.kind,
        state.genre,
        state.sort,
        state.discoverAudience,
        state.discoverStatus,
        state.discoverTime,
        state.discoverSetting,
        state.discoverBackground,
      ]);
}
function discoverPage(tv = false) {
  const q = state.query.trim();
  const allItems = discoverItems(state);
  const page = state.discoverPages?.[discoverPageKey()] || { limit: 2, status: 'idle' };
  const items = allItems.slice(0, page.limit);
  const actors = q ? prototypeActors.filter((actor) => actor.name.includes(q) || q === '演员') : [];
  const actorResults = actors.length
    ? `<section><div class="section-head"><h2>演员</h2></div><div class="actions">${actors.map((actor) => button(actor.name, 'actor', { value: actor.id })).join('')}</div></section>`
    : '';
  const board = state.searchHotBoard || '短剧热搜';
  const hotItems =
    board === '漫剧热搜' ? [dramaById('home')] : [dramaById('return'), dramaById('spring')];
  const landing = q
    ? ''
    : `<section class="reality-search-discovery" aria-label="搜索发现">${state.searches.length ? `<div class="section-head"><h2>最近搜索</h2>${button('清空', 'clear-searches')}</div>${chips(state.searches, '', 'recent-search')}` : ''}${state.searchDiscoveryUnavailable ? `<p class="muted" role="status">热门搜索暂不可用。</p>${button('重试热门搜索', 'search-discovery-retry')}` : `<div class="section-head"><h2>猜你想搜</h2></div>${chips(['重生', '古装', '悬疑'], '', 'recent-search')}<div class="section-head"><h2>热门搜索</h2></div>${chips(['短剧热搜', '漫剧热搜'], board, 'search-hot-board')}<ol class="reality-hot-search">${hotItems.map((drama) => `<li>${button(drama.title, 'detail', { value: drama.id, variant: 'quiet' })}</li>`).join('')}</ol><p class="small muted">热搜词与顺序为演示数据</p>`}</section>`;
  const paging = items.length
    ? `<div class="reality-pagination" aria-live="polite">${page.status === 'error' ? '<p class="error-text" role="alert">后续内容加载失败，当前结果已保留。</p>' : ''}${page.status === 'end' ? '<p class="muted small">没有更多内容</p>' : button(page.status === 'loading' ? '正在加载…' : page.status === 'error' ? '重试加载' : '加载更多', 'discover-more', { attrs: page.status === 'loading' ? 'disabled aria-busy="true"' : '' })}</div>`
    : '';
  const review = `<details class="reality-review"><summary>数据状态演示</summary>${chips(['正常', '续页失败', '续页中', '热搜失败'], '', 'discover-page-state')}<p>桌面搜索建议</p>${chips(['正常', '建议读取中', '建议失败', '建议为空'], '', 'search-suggestion-state')}<p>本机搜索记录</p>${chips(['正常', '保存失败'], '', 'search-history-state')}<p class="small muted">仅切换设计状态，不发送或保存真实数据。</p></details>`;
  return `<div class="${tv ? 'tv-page-heading' : 'page-head'}"><h1>${q ? `“${escapeHTML(q)}”的搜索结果` : '找一部想看的'}</h1>${q ? button('按分类找剧', 'clear-query') : tv ? button('搜索短剧', 'search', { image: 'search' }) : ''}</div>${searchHistoryNotice()}${q ? '' : discoverFilters(tv)}${statusContent() || `${actorResults}<div class="section-head"><h2>${q ? '短剧' : '全部短剧'}</h2><span class="small muted">已加载 ${items.length} 部${actors.length ? ` · ${actors.length} 位演员` : ''}</span></div>${items.length ? (tv ? tvCards(items) : posters(items)) : actors.length ? '' : empty('没有找到相关短剧', q ? '试试更短的关键词。' : '试试放宽筛选。', q ? '按分类找剧' : '清除筛选', q ? 'clear-query' : 'reset-discover', 'search')}${paging}`}${landing}${review}${tv ? `<div class="tv-destination-row tv-discover-destinations">${button('排行榜', 'ranking', { image: 'chart' })}${button('上新日历', 'new', { image: 'calendar' })}${button('刷剧', 'feed', { image: 'play' })}</div>` : ''}`;
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
  return `<article class="content-result-row media-row ${rank ? 'ranked' : ''}">${rank ? `<span class="rank ${rank === 1 ? 'first' : ''}">${rank}</span>` : ''}${manage ? `<input type="checkbox" data-history-select="${d.id}" aria-label="选择${d.title}" ${state.selectedHistory.has(d.id) ? 'checked' : ''}/>` : ''}<button class="poster-link content-result-cover" data-detail="${d.id}" aria-label="查看${d.title}详情">${posterImage(d)}</button><div class="row-body content-result-body"><h2>${d.title}</h2><p>${subtitle}</p><p>${d.tags.join(' · ')}</p>${progress ? `<div class="progress fb-progress"><span style="width:${Math.round(((d.position || 0) / 102) * 100)}%"></span></div>` : ''}</div><div class="row-actions content-row-actions">${button(label, action, { value: d.id, image: action === 'resume' ? 'play' : '' })}</div></article>`;
}
const prototypeActors = [
  { id: 'demo-actor-1', name: '林川（演示演员）', works: ['return', 'night'] },
  { id: 'demo-actor-2', name: '沈知微（演示演员）', works: ['spring'] },
];
function actorWorksDialog() {
  const actor = prototypeActors.find((item) => item.id === state.actorWorksId);
  const status = state.actorWorksStatus || 'ready';
  const works =
    actor && status !== 'empty' ? dramas.filter((drama) => actor.works.includes(drama.id)) : [];
  const body =
    status === 'loading'
      ? '<p role="status" aria-busy="true">正在加载演员作品…</p>'
      : status === 'error'
        ? `<p role="alert" class="error-text">演员作品加载失败。</p>${button('重试加载', 'actor-retry')}`
        : works.length
          ? posters(works)
          : '<p class="muted" role="status">暂无作品。</p>';
  showDialog(
    actor ? `${actor.name} · 作品` : '演员作品',
    `${body}<details class="reality-review"><summary>作品状态演示</summary>${chips(['正常', '读取中', '读取失败', '暂无作品'], '', 'actor-state')}<p class="small muted">演示状态，不发送作品请求。</p></details>`,
  );
}
function desktopSearchItems(query) {
  const items = [
    ...dramas.map((drama) => ({
      kind: 'short_play_name',
      name: drama.title,
      drama: drama.id,
      type: '短剧',
      meta: drama.note,
    })),
    ...prototypeActors.map((actor) => ({
      kind: 'short_play_actor',
      name: actor.name,
      actorId: actor.id,
      type: '演员',
      meta: '查看作品',
    })),
    { kind: 'short_play_role', name: '春山 · 沈知微', type: '角色', meta: '搜索相关短剧' },
    { kind: 'album', name: '春山故事集', type: '专辑', meta: '搜索相关短剧' },
    { kind: 'common_query', name: '重生', type: '关键词', meta: '' },
  ];
  const q = query.trim().toLocaleLowerCase();
  return q ? items.filter((item) => item.name.toLocaleLowerCase().includes(q)).slice(0, 8) : [];
}
function hideSearchSuggestions() {
  $('#search-suggestion-panel').hidden = true;
  $('#search').setAttribute('aria-expanded', 'false');
  $('#search').removeAttribute('aria-activedescendant');
  state.searchSuggestionIndex = -1;
}
function updateSearchSuggestions() {
  const input = $('#search');
  const query = input.value.trim();
  if (!query || state.mode !== 'desktop') {
    hideSearchSuggestions();
    return;
  }
  const status = state.searchSuggestionStatus || 'ready';
  const items = status === 'ready' ? desktopSearchItems(query) : [];
  state.searchSuggestionItems = items;
  state.searchSuggestionIndex = -1;
  input.removeAttribute('aria-activedescendant');
  input.setAttribute('aria-expanded', 'true');
  $('#search-suggestion-panel').hidden = false;
  $('#search-suggestions').innerHTML = items
    .map(
      (item, index) =>
        `<button type="button" id="search-suggestion-${index}" role="option" aria-selected="false" tabindex="-1" data-action="search-suggestion" data-value="${index}" class="reality-suggestion">${item.drama ? `<span class="reality-suggestion-cover">${posterImage(dramaById(item.drama))}</span>` : `<span class="reality-suggestion-icon">${icon(item.actorId ? 'user' : 'search')}</span>`}<span><strong>${escapeHTML(item.name)}</strong><small>${item.type}${item.meta ? ` · ${escapeHTML(item.meta)}` : ''}</small></span></button>`,
    )
    .join('');
  $('#search-suggestion-status').innerHTML =
    status === 'loading'
      ? '<p aria-busy="true">正在加载建议…</p>'
      : status === 'error'
        ? `<p class="error-text">搜索建议暂不可用，可以直接搜索。</p>${button('重试建议', 'search-suggestions-retry', { attrs: 'type="button"' })}`
        : items.length
          ? '<p>搜索建议为演示数据</p>'
          : '<p>暂无建议，可以直接搜索。</p>';
}
function chooseSearchSuggestion(index) {
  const item = state.searchSuggestionItems?.[Number(index)];
  if (!item) return;
  $('#search').focus({ preventScroll: true });
  hideSearchSuggestions();
  if (item.actorId) handleAction('actor', item.actorId);
  else if (item.drama) handleAction('detail', item.drama);
  else searchFor(item.name);
}
function handleSearchSuggestionKey(event) {
  if (
    event.target.id !== 'search' ||
    event.isComposing ||
    state.mode !== 'desktop' ||
    $('#search-suggestion-panel').hidden
  )
    return false;
  const items = state.searchSuggestionItems || [];
  if (event.key === 'Escape' || event.key === 'Tab') {
    hideSearchSuggestions();
    if (event.key === 'Escape') event.preventDefault();
    return event.key === 'Escape';
  }
  if (['ArrowDown', 'ArrowUp'].includes(event.key) && items.length) {
    event.preventDefault();
    const index = state.searchSuggestionIndex ?? -1;
    state.searchSuggestionIndex =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : index < 0
          ? items.length - 1
          : (index - 1 + items.length) % items.length;
    items.forEach((_, i) =>
      $(`#search-suggestion-${i}`).setAttribute(
        'aria-selected',
        String(i === state.searchSuggestionIndex),
      ),
    );
    const active = $(`#search-suggestion-${state.searchSuggestionIndex}`);
    event.target.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (event.key === 'Enter' && state.searchSuggestionIndex >= 0) {
    event.preventDefault();
    chooseSearchSuggestion(state.searchSuggestionIndex);
    return true;
  }
  return false;
}
function searchHistoryNotice() {
  return state.searchHistoryError
    ? `<div class="status-line notice" role="alert"><span>搜索记录未保存，当前搜索仍可查看。</span>${button('重试保存', 'search-history-retry')}</div>`
    : '';
}
const prototypeRankCategories = [
  { label: '总榜', children: ['热播榜', '预约榜'] },
  { label: '真人剧', children: ['热播榜', '新季榜'] },
  { label: '漫剧', children: ['热播榜'] },
  { label: 'AI剧', children: ['热播榜'] },
  { label: '演员', children: ['星光榜'] },
];
function rankingPage(tv = false) {
  return `<div class="${tv ? 'tv-page-heading' : 'page-head'}"><h1>排行榜</h1></div>${tabs(['红果榜', '榜单雷达'], state.rankView, 'rank-view')}${state.rankView === '榜单雷达' ? radarPage() : officialRanking(tv)}`;
}
function officialRanking(tv) {
  const category =
    prototypeRankCategories.find((item) => item.label === state.rankCategory) ||
    prototypeRankCategories[0];
  const sub = category.children.includes(state.rankSub) ? state.rankSub : category.children[0];
  const actors = category.label === '演员';
  const categoryItems =
    { 总榜: [0, 1, 2, 3], 真人剧: [0, 1], 漫剧: [3], AI剧: [2] }[category.label] || [];
  const audienceItems =
    state.rankPanel === '男频' ? [0, 2] : state.rankPanel === '女频' ? [1, 3] : [0, 1, 2, 3];
  const order = (sub === '预约榜' || sub === '新季榜' ? [1, 3, 0, 2] : [0, 1, 2, 3]).filter(
    (index) => categoryItems.includes(index) && audienceItems.includes(index),
  );
  const rows = actors
    ? prototypeActors
        .map(
          (actor, index) =>
            `<article class="media-row reality-actor"><span class="rank">${index + 1}</span><span class="reality-avatar" aria-hidden="true">${icon('user')}</span><div class="row-body content-result-body"><h2>${actor.name}</h2><p>演员 · 星光榜</p></div>${button('查看作品', 'actor', { value: actor.id })}</article>`,
        )
        .join('')
    : order
        .map((index, rank) =>
          mediaRow(dramas[index], { rank: rank + 1, action: 'play', label: '播放' }),
        )
        .join('');
  return `<section class="reality-ranking ${tv ? 'reality-tv' : ''}" aria-label="红果榜"><div class="reality-controls" aria-label="榜单分类">${chips(
    prototypeRankCategories.map((item) => item.label),
    category.label,
    'rank-category',
  )}${chips(category.children, sub, 'rank-sub')}${!actors ? `<div class="reality-filter"><span>受众</span>${chips(['全部', '男频', '女频'], state.rankPanel, 'rank-panel')}</div>` : ''}</div><p class="small muted">分类、条目与顺序为演示数据</p>${statusContent() || (rows ? `<div class="list">${rows}</div><div class="reality-tail">${button('加载更多', 'rank-more')}</div>` : '<p class="muted" role="status">当前筛选暂无榜单条目。</p>')}</section>`;
}
const prototypeRadarRows = [
  {
    id: 'return',
    type: '真人',
    rank: 1,
    delta: 2,
    hot: 128000,
    d_hot: 1200,
    d_fav: 80,
    r_hot: 0.12,
    d7_hot: 7200,
    score: 8.6,
    streak: 12,
  },
  {
    id: 'spring',
    type: '真人',
    rank: 2,
    delta: 0,
    hot: 0,
    d_hot: 0,
    d_fav: 0,
    r_hot: 0,
    d7_hot: 0,
    score: null,
    streak: 0,
  },
  {
    id: 'night',
    type: 'AI',
    rank: 3,
    delta: -1,
    hot: 36000,
    d_hot: -1200,
    d_fav: -20,
    r_hot: -0.03,
    d7_hot: null,
    score: 8.1,
    streak: 4,
  },
  {
    id: 'home',
    type: '漫剧',
    rank: 4,
    delta: null,
    badge: '新进',
    hot: null,
    d_hot: null,
    d_fav: null,
    r_hot: null,
    d7_hot: null,
    score: null,
    streak: null,
  },
];
function radarValue(value, { signed = false, percent = false } = {}) {
  if (value === null || value === undefined) return '—';
  if (percent) return `${Number((value * 100).toFixed(2))}%`;
  return `${signed && value > 0 ? '+' : ''}${value.toLocaleString('zh-CN')}`;
}
function radarPage() {
  const snapshot = state.radarView === '官方快照';
  const missing = state.radarScenario === (snapshot ? '快照失败' : '增长失败');
  const stale = state.radarScenario === '使用缓存';
  const metric = { 热度日增: 'd_hot', 收藏日增: 'd_fav', 热度增长率: 'r_hot' }[state.radarMetric];
  const type = snapshot ? state.radarCategory : state.radarType;
  const growthMissing = state.radarScenario === '增长失败';
  const rows = prototypeRadarRows
    .filter((row) => type === '综合' || type === '全部' || row.type === type)
    .slice();
  if (!snapshot) rows.sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity));
  const headings = snapshot
    ? ['名次', '变化', '短剧', '类型', '热度', '热度日增', '收藏日增', '连续在榜']
    : ['排序', '短剧', '类型', '热度', '热度日增', '增长率', '收藏日增', '7日热度增量'];
  const table = `<div class="reality-table-scroll" role="region" aria-label="${state.radarView}数据" tabindex="0"><table class="reality-table"><thead><tr>${headings.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row, index) => {
      const drama = dramaById(row.id);
      const title = `<th scope="row">${button(drama.title, 'detail', { value: row.id, variant: 'quiet' })}</th>`;
      const cells = snapshot
        ? [
            radarValue(row.rank),
            row.delta === null
              ? row.badge || '—'
              : row.delta === 0
                ? '持平'
                : `${row.delta > 0 ? '上升' : '下降'} ${Math.abs(row.delta)}`,
            title,
            row.type,
            radarValue(growthMissing ? null : row.hot),
            radarValue(growthMissing ? null : row.d_hot, { signed: true }),
            radarValue(growthMissing ? null : row.d_fav, { signed: true }),
            row.streak === null ? '—' : `${row.streak}天`,
          ]
        : [
            String(index + 1),
            title,
            row.type,
            radarValue(row.hot),
            radarValue(row.d_hot, { signed: true }),
            radarValue(row.r_hot, { percent: true }),
            radarValue(row.d_fav, { signed: true }),
            radarValue(row.d7_hot, { signed: true }),
          ];
      return `<tr>${cells.map((cell) => (cell.startsWith('<th') ? cell : `<td>${cell}</td>`)).join('')}</tr>`;
    })
    .join('')}</tbody></table></div>`;
  return `<section aria-label="榜单雷达" class="reality-radar"><div class="section-head"><h2>榜单雷达</h2>${button('刷新', 'radar-refresh', { image: 'refresh' })}</div><p class="small muted">2026年11月13日 · 数据演示 · 来源：hongguo-radar 外部聚合</p>${tabs(['官方快照', '飙升榜'], state.radarView, 'radar-view')}<div class="reality-controls">${snapshot ? chips(['综合', '真人', 'AI', '漫剧'], state.radarCategory, 'radar-category') : `${chips(['热度日增', '收藏日增', '热度增长率'], state.radarMetric, 'radar-metric')}${chips(['全部', '真人', 'AI', '漫剧', '未知'], state.radarType, 'radar-type')}`}</div>${stale ? '<p class="status-line notice" role="status">刷新失败，显示最近成功数据 · 获取于11月13日18:00（演示）</p>' : state.radarScenario === '快照失败' || growthMissing ? `<p class="status-line notice" role="status">${state.radarScenario === '快照失败' ? '官方快照' : '增长数据'}暂不可用，另一分支可继续查看。</p>` : ''}${statusContent() || (missing ? `<div class="empty-state fb-empty"><h3>${snapshot ? '暂无官方快照' : '暂无增长数据'}</h3>${button('重新读取', 'radar-refresh')}</div>` : rows.length ? table : '<p class="muted" role="status">当前分类暂无数据。</p>')}<p class="small muted">热度为来源分值；日增按采样间隔折算。缺失值以 — 表示。</p><details class="reality-review"><summary>数据状态演示</summary>${chips(['正常', '使用缓存', '快照失败', '增长失败'], state.radarScenario, 'radar-scenario')}</details></section>`;
}
function newPageKey(branch = 'recommend') {
  return branch === 'recommend'
    ? `recommend:${state.newGender}`
    : `calendar:${state.newDate}:${branch}`;
}
function newContinuation(items, branch, tv = false) {
  const page = state.newPages?.[newPageKey(branch)] || {
    limit: branch === 'upcoming' ? 1 : 2,
    status: 'idle',
  };
  const visible = items.slice(0, page.limit);
  const rows = branch === 'upcoming' ? visible.join('') : tv ? tvCards(visible) : posters(visible);
  const paging = `<div class="reality-pagination" aria-live="polite">${page.status === 'error' ? '<p class="error-text" role="alert">后续内容加载失败，已有内容已保留。</p>' : ''}${page.limit >= items.length && !['loading', 'error'].includes(page.status) ? '<p class="small muted">没有更多内容</p>' : button(page.status === 'loading' ? '正在加载…' : page.status === 'error' ? '重试加载' : '加载更多', 'new-more', { value: branch, attrs: `${page.status === 'loading' ? 'disabled aria-busy="true" ' : ''}aria-label="${page.status === 'error' ? '重试加载' : '加载更多'}${branch === 'released' ? '已上线' : branch === 'upcoming' ? '待上线' : '推荐'}短剧"` })}</div>`;
  return `<section aria-label="${branch === 'released' ? '已上线' : branch === 'upcoming' ? '待上线' : '新剧推荐'}">${rows}${items.length ? paging : ''}</section>`;
}
function newPage(tv = false) {
  const dates = ['今天', '明天', '周日', '周一', '周二', '周三', '周四'];
  const upcoming = dramaById('spring-third');
  const pending = state.reservationPending.has(upcoming.id);
  const reserved = state.reservations.has(upcoming.id);
  const announcement = `<article class="media-row"><div class="reality-announcement-cover">${posterImage(upcoming)}</div><div class="row-body content-result-body"><h2>${escapeHTML(upcoming.title)}</h2><p>待上线 · 11月14日18:00（演示）</p>${pending ? '<p class="error-text" role="status">请求已提交，等待列表确认。稍后刷新“我的预约”核对。</p>' : ''}</div>${button(pending ? '已提交 · 待确认' : reserved ? '取消预约' : '预约', 'reserve', { value: upcoming.id, attrs: pending ? 'disabled' : '' })}</article>`;
  const undated = `<article class="media-row"><div class="reality-announcement-cover">${posterImage({ ...dramas[2], title: '山海来信（演示）' })}</div><div class="row-body content-result-body"><h2>山海来信（演示）</h2><p>待上线 · 上线时间待定</p></div></article>`;
  const recommended =
    state.newGender === '男频'
      ? [dramas[0], dramas[2]]
      : state.newGender === '女频'
        ? [dramas[1], dramas[3]]
        : dramas;
  const content =
    state.newMode === '新剧推荐'
      ? `<div class="reality-filter"><span>受众</span>${chips(['全部', '男频', '女频'], state.newGender, 'new-gender')}</div><p class="small muted">推荐内容与顺序为演示数据</p>${statusContent() || newContinuation(recommended, 'recommend', tv)}`
      : `<div class="${tv ? 'tv-date-row' : 'date-strip'}" aria-label="上新日期">${dates.map((day, i) => `<button class="ui-button dx-date" aria-pressed="${state.newDate === i}" data-action="new-date" data-value="${i}"><span>${day}</span><strong>${13 + i}</strong><span>11月</span></button>`).join('')}</div><div class="section-head"><h2>11月${13 + state.newDate}日上新安排</h2><span class="small muted">2026年11月 · 固定日期演示</span></div>${statusContent() || (state.newDate === 0 ? `<h3>已上线</h3>${newContinuation([dramas[3], dramas[2], dramas[0], dramas[1]], 'released', tv)}<h3>待上线</h3>${newContinuation([announcement, undated], 'upcoming', tv)}` : state.newDate === 1 ? `<h3>待上线</h3>${newContinuation([announcement, undated], 'upcoming', tv)}` : empty('这天暂未安排上新', '', '查看今天', 'today', 'calendar'))}`;
  return `<div class="${tv ? 'tv-page-heading' : 'page-head'}"><h1>新剧与上新日历</h1></div>${tabs(['新剧推荐', '上新日历'], state.newMode, 'new-mode')}<section class="reality-calendar">${content}</section><details class="reality-review"><summary>数据状态演示</summary>${chips(['正常', '续页中', '续页失败'], '', 'new-page-state')}</details>`;
}
function watchStatisticsSection() {
  const reset = state.statisticsReset;
  const kind = state.statisticsKind || '类型';
  return `<section class="watch-statistics"><div class="section-head"><h2>观看统计</h2>${button('重置统计', 'reset-statistics', { variant: 'danger' })}</div><p class="small muted">本机演示数据 · 仅累计实际播放时长，与观看记录独立</p><dl class="statistics-totals"><div><dt>今日</dt><dd>${reset ? '0' : '12'} 分钟</dd></div><div><dt>本周</dt><dd>${reset ? '0' : '48'} 分钟</dd></div><div><dt>本月</dt><dd>${reset ? '0' : '126'} 分钟</dd></div></dl><h3>近七日</h3><p class="numeral">${reset ? '暂无统计' : '11/07 8分 · 11/08 0分 · 11/09 11分 · 11/10 9分 · 11/11 7分 · 11/12 9分 · 11/13 12分'}</p>${tabs(['类型', '题材'], kind, 'statistics-kind')}<p>${reset ? '开始观看后再累计' : kind === '类型' ? '真人剧 92 分钟 · 漫剧 21 分钟 · AI 剧 13 分钟' : '都市 60 分钟 · 古装 40 分钟 · 悬疑 26 分钟'}</p></section>`;
}
function historyPage() {
  return `<div class="page-head"><h1>继续观看</h1><div class="actions">${state.history.length ? button(state.manage ? '完成' : '管理', 'manage-history') : ''}${state.history.length ? button('清空记录', 'clear-history', { variant: 'danger' }) : ''}</div></div><p class="muted">本周看过 ${state.history.length} 部短剧，观看统计单独保留</p>${state.loggedIn ? `<div class="status-line notice">${icon(state.syncError ? 'info' : 'check')}<span>${state.syncError ? '记录同步失败，本机进度已保留' : '观看进度已同步'}</span>${button(state.syncError ? '重试同步' : '查看账号', state.syncError ? 'sync' : 'account')}</div>` : ''}${state.manage ? `<div class="actions">${button('全选', 'select-history')}${button(`删除所选（${state.selectedHistory.size}）`, 'delete-history', { attrs: state.selectedHistory.size ? '' : 'disabled', variant: 'danger' })}</div>` : ''}${statusContent() || (state.history.length ? `<div class="list">${state.history.map((id) => mediaRow(dramaById(id), { subtitle: `第 ${dramaById(id).episode} 集 · 看到 ${formatTime(dramaById(id).position || 0)} · 今天`, action: 'resume', label: '继续观看', progress: true, manage: state.manage })).join('')}</div>` : empty('还没有观看记录', '开始观看后，这里会记住你的进度。'))}${watchStatisticsSection()}`;
}
function favoritesPage() {
  const items = [...state.favorites].map(dramaById).filter(Boolean);
  return `<h1>收藏</h1><p class="small muted">${state.loggedIn ? '账号片库' : '本机收藏'} · ${items.length} 部</p>${statusContent() || (items.length ? `<div class="list">${items.map((d) => mediaRow(d, { action: 'favorite', label: '取消收藏' })).join('')}</div>` : empty('还没有收藏的短剧', '遇到想看的故事，可以把它留在这里。'))}`;
}
function followingPage() {
  const notices = state.followingTab === '更新提醒';
  const reserved = state.followingTab === '预约';
  const items = [...(reserved ? state.reservations : state.follows)].map(dramaById).filter(Boolean);
  return `<div class="page-head"><h1>追更与预约</h1>${button('刷新', 'refresh-following')}</div>${tabs(['更新提醒', '追更', '预约'], state.followingTab, 'following-tab')}${!state.loggedIn ? empty('登录后查看追更与预约', '更新提醒会保留在这里。', '登录', 'login', 'bell') : statusContent() || (notices ? `<div class="section-head"><h2>更新提醒</h2>${button('全部标为已读', 'read-notifications', { attrs: state.notificationsRead ? 'disabled' : '' })}</div>${mediaRow(dramas[1], { subtitle: `${state.notificationsRead ? '已读' : '未读'} · 新更新 8 集 · 演示提醒`, action: 'detail', label: '查看更新' }) + (state.notificationsRead ? '' : button('标为已读', 'read-notifications'))}` : items.length ? `<div class="list">${items.map((d) => mediaRow(d, { subtitle: reserved ? '待上线 · 演示预约记录' : '更新至第 48 集', action: reserved ? 'reserve' : 'follow', label: reserved ? '取消预约' : '取消追更' })).join('')}</div>` : empty(reserved ? '暂时没有预约' : '暂时没有追更', '可以去上新日历看看将要上线的故事。', '查看新剧', 'new', 'bell'))}`;
}
function formatTime(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function accountPage() {
  const demoNote =
    '<p class="account-demo-note small muted">设计演示，不发送登录、短信、合并或同步请求。</p>';
  if (!state.loggedIn)
    return `<h1>账号</h1>${demoNote}<section class="account-profile"><span class="avatar avatar-spec avatar-large">${icon('user')}</span><div><h2>还未登录</h2><p class="muted">登录后同步片库和观看进度</p></div></section>${button('登录账号', 'login', { variant: 'primary' })}<div class="section-head"><h2>本机记录</h2></div><p class="prose muted">未登录也能找剧、观看和收藏。登录不会自动合并本机历史，退出后仍可查看游客记录。</p>${button('查看观看记录', 'history')}`;
  const mergeState = state.guestMergeStatus || (state.guestMerged ? 'complete' : 'idle');
  const mergeCopy = {
    idle: '仅合并较新的观看历史，不合并收藏；游客原记录继续保留。',
    complete: '演示合并完成，游客原记录仍保留；真实同步结果需单独确认。',
    failed: '合并失败，账号与游客原记录均保留。可以重试。',
  }[mergeState];
  return `<h1>账号</h1>${demoNote}<section class="account-profile"><span class="avatar avatar-spec avatar-large">林</span><div><h2>林间听风</h2><p class="muted small">演示账号 · 138 **** 0000</p></div></section><section class="settings-section">${settingRow('片库同步', button(state.syncError ? '重试同步' : '立即同步', 'sync'), state.syncError ? '同步失败，待同步记录保留在本机。' : '本次演示无待同步记录，不代表已连接红果账号。')}${settingRow('合并登录前记录', button(mergeState === 'failed' ? '重试合并' : mergeState === 'complete' ? '已合并' : '合并记录', 'account-merge-history', { attrs: mergeState === 'complete' ? 'disabled' : '' }), mergeCopy)}${settingRow('更新提醒', button('查看追更与预约', 'following'), '在应用内查看更新；不承诺系统推送。')}${settingRow('本机与账号记录', button('退出登录', 'logout', { variant: 'danger' }), '退出后恢复游客片库，不清空游客原记录。')}<details class="account-demo-states"><summary>查看失败状态</summary><div class="actions">${button('演示同步失败', 'sync-error')}${button('演示合并失败', 'account-merge-failed')}${button('重置合并演示', 'account-merge-reset')}</div></details></section>`;
}
function settingRow(label, control, description = '') {
  return `<div class="setting-row"><div><strong>${label}</strong>${description ? `<p>${description}</p>` : ''}</div>${control}</div>`;
}
function switchControl(label, checked = true) {
  return `<button class="switch" role="switch" aria-checked="${checked}" aria-label="${label}" data-action="switch"><span></span></button>`;
}
function settingSelect(label, values) {
  const selected = state.preferences?.[label] || (label === '默认倍速' ? '1×' : values[0]);
  return `<label><span class="sr-only">${label}</span><select data-setting="${label}">${values.map((v) => `<option${v === selected ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
}
function settingsSections() {
  const section = (body) =>
    `<div class="account-settings-reality"><p class="account-demo-note small muted">选项只保存在本次演示，不向设备或服务写入。</p>${body}</div>`;
  return {
    通用: section(
      `${settingRow('启动时打开', settingSelect('启动页面', ['推荐', '排行榜', '新剧', '历史', '收藏']), '重新打开时生效，返回前台保持原页面。')}${state.mode === 'desktop' ? settingRow('侧栏显示', settingSelect('侧栏显示', ['展开显示', '仅显示图标'])) : ''}${state.mode === 'tv' ? settingRow('电视首页频道', button('查看入口', 'tv-channel'), '可用时显示。') : ''}`,
    ),
    外观与语言: section(
      `${settingRow('外观', `<label><span class="sr-only">外观主题</span><select id="appearance"><option value="light" ${state.theme === 'light' ? 'selected' : ''}>浅色</option><option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>深色</option></select></label>`)}${settingRow('语言', settingSelect('语言', ['简体中文', '繁體中文', '日本語']))}${settingRow('减少动态效果', switchControl('减少动态效果', typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))}`,
    ),
    播放: section(
      `${settingRow('推荐自动播放方向', settingSelect('推荐自动播放方向', ['全部剧', '仅横屏剧', '仅竖屏剧']), '只影响推荐页自动播放。')}${settingRow('默认倍速', settingSelect('默认倍速', ['0.5×', '0.75×', '1×', '1.25×', '1.5×', '2×']))}${settingRow('清晰度', '<span class="muted">按片源提供</span>', '可用时在播放器切换。')}${settingRow('播放解码', settingSelect('播放解码', ['自动解码', '软件解码']), '下次播放或切集时生效。')}${settingRow('竖屏背景', settingSelect('竖屏背景', ['黑色', '动态模糊']), '动态模糊不可用时显示黑边。')}${state.mode === 'tv' ? settingRow('推荐页自动全屏', switchControl('推荐页自动全屏', false)) : settingRow('播放时隐藏侧栏', switchControl('播放时隐藏侧栏'), '单剧观看时收起侧栏。')}`,
    ),
    缓存与预加载: section(
      `${settingRow('下一集预取方式', settingSelect('下一集预取方式', ['边播边下', '整集预下载']), '整集预下载会增加网络、存储和电量消耗。')}`,
    ),
    诊断: section(
      `${settingRow('连接状态', '<span class="muted">未连接真实服务</span>')}${settingRow('诊断信息', button('查看', 'diagnostics'))}${settingRow('网络恢复', button('演示网络失败', 'network-error'))}`,
    ),
    关于: section(
      `${settingRow('红果 · NSH', '<span class="muted">设计原型</span>', '版本与发行信息待正式构建提供。')}${settingRow('应用更新', button('查看更新', 'update'), updateModel().stage === 'idle' ? '' : updateStages[updateModel().stage])}${settingRow('开源许可', button('查看', 'licenses'))}${settingRow('支持项目', button('查看', 'support'))}${settingRow('应用推荐', button('查看', 'apps'))}`,
    ),
  };
}
function settingsPage() {
  const sections = settingsSections();
  const tab = Object.hasOwn(sections, state.settingTab)
    ? state.settingTab
    : Object.keys(sections)[0];
  return `<h1>设置</h1><div class="settings-layout"><nav class="settings-nav" aria-label="设置分类">${Object.keys(
    sections,
  )
    .map(
      (t) =>
        `<button class="ui-button quiet" data-action="setting-tab" data-value="${t}" ${t === tab ? 'aria-current="page"' : ''}>${t}</button>`,
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
        ['演员与相关作品', 'detail'],
      ],
      '续播、倍速、清晰度、音量、全屏、下一集',
    ],
    [
      '我的片库',
      [
        ['继续观看与管理', 'history'],
        ['收藏', 'favorites'],
        ['追更与预约', 'following'],
      ],
      '进度、统计、批量管理、更新提醒',
    ],
    [
      '账号',
      [
        ['账号与同步', 'account'],
        ['扫码／手机号登录', 'login'],
        ['同步失败', 'demo-sync'],
      ],
      '扫码、手机确认、过期、验证码、短信验证、历史合并与同步',
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
  return `<div class="page-head"><h1>页面与流程地图</h1>${button('返回原型', 'back', { image: 'back' })}</div><p class="prose muted">选择任意入口查看设计。顶部可切换浅色／深色、平台以及加载、空内容和网络失败状态。</p><div class="map-columns">${groups.map(([title, links, desc]) => `<section class="map-group"><h2>${title}</h2>${links.map(([label, action]) => `<button class="ui-button quiet" data-action="${action}">${label}${icon('forward')}</button>`).join('')}<p>${desc}</p></section>`).join('')}</div>`;
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
  overlay.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="ui-button quiet icon-only icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer}`;
  bindTabPanels(overlay);
  HongguoComponents.syncRanges(overlay);
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

function loginDialog() {
  const demo = (state.accountDemo ||= {
    view: 'login',
    country: '+86',
    digits: { phone: '13800000000', code: '' },
    scan: 'waiting',
    codeState: '',
  });
  const countries = [
    ['+86', '中国大陆'],
    ['+852', '中国香港'],
    ['+853', '中国澳门'],
    ['+886', '中国台湾'],
    ['+60', '马来西亚'],
    ['+65', '新加坡'],
    ['+62', '印度尼西亚'],
    ['+95', '缅甸'],
    ['+63', '菲律宾'],
    ['+84', '越南'],
    ['+855', '柬埔寨'],
    ['+81', '日本'],
    ['+82', '韩国'],
    ['+971', '阿拉伯联合酋长国'],
  ];
  const country = countries.find(([code]) => code === demo.country) || countries[0];
  const note =
    '<p class="account-demo-note small muted">静态设计演示，不发送登录或短信请求，不生成二维码、口令或配对凭据。请勿输入个人信息。</p>';
  const review = (body) =>
    `<details class="account-demo-states"><summary>查看登录状态</summary><div class="actions">${body}</div></details>`;
  const phone = escapeHTML(demo.digits.phone);
  const code = escapeHTML(demo.digits.code);
  const qrLabel =
    {
      preparing: '正在准备二维码',
      waiting: '扫码区域示意 · 无可扫描内容',
      confirm: '已扫码，等待手机确认',
      expired: '二维码已过期',
      failed: '二维码读取失败',
      unavailable: '当前暂不支持扫码登录',
    }[state.loginStep] || '扫码区域示意';
  const qrFailure = ['expired', 'failed', 'unavailable', 'preparing'].includes(state.loginStep);
  const scanBody = `<section class="account-login-step" aria-label="扫码登录"><div class="qr-sample ax-scan-placeholder" role="img" aria-label="不可扫描的二维码占位">${icon('qr')}<span class="small" role="status">${qrLabel}</span></div><div class="account-centered-actions">${qrFailure ? button(state.loginStep === 'expired' ? '刷新二维码' : '重新尝试', 'qr-refresh', { variant: 'primary' }) : state.loginStep === 'confirm' ? button('模拟手机确认', 'login-success', { variant: 'primary' }) : button('模拟扫码', 'qr-scan', { variant: 'primary' })}${button('改用手机号登录', 'login-tab', { value: '手机号登录' })}</div>${review(`${button('准备中', 'account-qr-state', { value: 'preparing' })}${button('模拟过期', 'qr-expire')}${button('读取失败', 'account-qr-state', { value: 'failed' })}${button('扫码不可用', 'account-qr-state', { value: 'unavailable' })}${button('取消扫码', 'account-login-cancel')}`)}</section>`;
  const codeStatus =
    {
      sent: '验证码发送状态演示：请使用 000000；未发送真实短信。',
      failed: '验证码获取失败，请重试；当前未发送任何短信。',
      wait: '请等待重试时间结束；此处只演示限流状态。',
    }[demo.codeState] || '';
  const phoneBody = `<section class="account-login-step" aria-label="手机号登录"><form id="phone-form"><label class="field"><span>国家或地区</span>${button(`${country[1]} ${country[0]}`, 'account-country', { attrs: 'type="button" aria-haspopup="dialog"' })}</label><label class="field"><span>演示手机号</span><input class="field-input ui-input" type="tel" value="${phone}" readonly tabindex="-1" aria-label="演示手机号 ${phone}" /></label>${state.mode === 'tv' ? `<div class="account-input-tools">${button('数字键盘', 'phone-keypad', { value: 'phone', attrs: 'type="button"' })}${button('同局域网手机输入', 'phone-scan', { value: 'phone', attrs: 'type="button"' })}</div>` : ''}<label class="field"><span>验证码</span><span class="verification"><input class="field-input ui-input" id="code" inputmode="numeric" autocomplete="off" value="${code}" placeholder="输入演示验证码 000000" maxlength="6" required aria-describedby="code-error account-code-state" />${button(demo.codeState === 'sent' ? '重新获取' : demo.codeState === 'wait' ? '等待后重试' : '获取验证码', 'account-code-send', { attrs: `type="button" ${demo.codeState === 'wait' ? 'disabled' : ''}` })}</span></label>${state.mode === 'tv' ? `<div class="account-input-tools">${button('验证码键盘', 'phone-keypad', { value: 'code', attrs: 'type="button"' })}${button('手机输入验证码', 'phone-scan', { value: 'code', attrs: 'type="button"' })}</div>` : ''}<p id="account-code-state" class="small ${demo.codeState === 'failed' ? 'error-text' : 'muted'}" role="status">${codeStatus}</p><p class="small muted">App 验证码仅在红果返回“可用”时适用；否则使用短信验证码。此处统一用 000000 演示。</p><p id="code-error" class="small error-text" role="alert"></p><button type="submit" class="ui-button btn primary account-wide-action">登录演示账号</button></form>${review(`${button('需要额外短信验证', 'account-mfa-open')}${button('验证码获取失败', 'account-code-state', { value: 'failed' })}${button('等待后重试', 'account-code-state', { value: 'wait' })}${button('重置验证码状态', 'account-code-state', { value: '' })}`)}</section>`;
  let body = `${tabs(['扫码登录', '手机号登录'], state.loginTab, 'login-tab')}${state.loginTab === '扫码登录' ? scanBody : phoneBody}<p class="small muted account-return-note">登录后回到当前任务，不自动合并历史；收藏、追更和预约仍由你再次确认。</p>`;
  if (demo.view === 'country')
    body = `<section class="account-login-step"><h3>选择国家或地区</h3><div class="account-country-list">${countries.map(([value, name]) => button(`${name} ${value}`, 'account-country-select', { value, attrs: `aria-pressed="${demo.country === value}"` })).join('')}</div>${button('返回手机号登录', 'account-input-return')}</section>`;
  if (demo.view === 'keypad') {
    const kind = demo.kind === 'code' ? 'code' : 'phone';
    const label = kind === 'code' ? '验证码' : '手机号';
    body = `<section class="account-login-step"><h3>输入演示${label}</h3><p class="small muted">遥控器方向键选择数字，确认输入；返回可取消，不会提交账号请求。</p><output class="account-keypad-value" aria-live="polite" aria-label="演示${label}">${escapeHTML(demo.digits[kind]) || '尚未输入'}</output><div class="account-number-pad" aria-label="${label}数字键盘">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'done'].map((digit) => button(digit === 'delete' ? '删除' : digit === 'done' ? '完成' : digit, digit === 'done' ? 'account-keypad-done' : 'account-keypad-digit', { value: digit, attrs: 'type="button"' })).join('')}</div><p class="small error-text" role="status">${demo.inputError || ''}</p>${button('取消输入', 'account-input-cancel')}</section>`;
  }
  if (demo.view === 'scan') {
    const label = demo.kind === 'code' ? '验证码' : '手机号';
    const scanLabel = {
      waiting: '等待手机输入 · 配对图示不可扫描',
      expired: '配对已过期',
      failed: '读取失败，请重试',
      unavailable: '手机输入暂不可用',
    }[demo.scan];
    body = `<section class="account-login-step"><h3>同局域网手机输入${label}</h3><p class="small muted">正式客户端需手机与电视处于同一局域网。此处不创建会话或配对地址，不会接收手机数据。</p><div class="qr-sample ax-scan-placeholder" role="img" aria-label="无配对凭据的扫码占位">${icon('qr')}<span class="small" role="status">${scanLabel}</span></div><div class="actions">${demo.scan === 'waiting' ? button('模拟手机填入', 'account-scan-complete', { variant: 'primary' }) : button('重新尝试', 'account-scan-state', { value: 'waiting', variant: 'primary' })}${button('改用数字键盘', 'phone-keypad', { value: demo.kind })}${button('取消输入', 'account-input-cancel')}</div>${review(`${button('模拟过期', 'account-scan-state', { value: 'expired' })}${button('读取失败', 'account-scan-state', { value: 'failed' })}${button('不可用', 'account-scan-state', { value: 'unavailable' })}`)}</section>`;
  }
  if (
    state.loginTab === '手机号登录' &&
    ['mfa', 'mfa-failed', 'mfa-expired'].includes(state.loginStep)
  )
    body = `<section class="account-login-step"><h3>还需要短信验证</h3><p>部分登录需要用本人的手机号手动发送红果指定短信，再检查验证结果。</p><dl class="account-mfa-details"><dt>接收号码</dt><dd>由真实服务提供；演示不生成</dd><dt>短信内容</dt><dd>由真实服务提供；演示不生成</dd></dl><p class="${state.loginStep === 'mfa' ? 'muted' : 'error-text'}" role="status">${state.loginStep === 'mfa-expired' ? '验证会话已过期，需要重新登录。' : state.loginStep === 'mfa-failed' ? '尚未确认短信验证，保留当前步骤，可重新检查或取消。' : '发送短信后再检查。当前不会发送或读取短信。'}</p><div class="actions">${state.loginStep === 'mfa-expired' ? button('重新登录', 'account-mfa-cancel', { variant: 'primary' }) : button('检查验证结果', 'account-mfa-check', { variant: 'primary' })}${button('取消验证', 'account-mfa-cancel')}</div>${review(`${button('模拟过期', 'account-mfa-expire')}${state.loginStep !== 'mfa-expired' ? button('演示验证通过', 'account-mfa-complete') : ''}`)}</section>`;
  showDialog('登录账号', `<div class="account-reality-dialog">${note}${body}</div>`);
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
  document.documentElement.dataset.platform = mode;
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
  state.season = prototypeSeasons().find((season) => season.id === id)?.number || 1;
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
    case 'account-merge-history':
      if (!state.loggedIn) {
        loginDialog();
        break;
      }
      confirmDialog(
        '合并登录前记录？',
        '仅把较新的游客观看历史合并到当前演示账号；游客原记录保留，不合并收藏，也不发送真实请求。',
        '确认合并',
        () => {
          state.guestMergeStatus = state.scenario === 'error' ? 'failed' : 'complete';
          state.guestMerged = state.guestMergeStatus === 'complete';
          render();
          toast(state.guestMerged ? '演示合并完成，游客原记录保留' : '演示合并失败，原记录保留');
        },
      );
      break;
    case 'account-merge-failed':
    case 'account-merge-reset':
      state.guestMergeStatus = action === 'account-merge-failed' ? 'failed' : 'idle';
      state.guestMerged = false;
      render();
      break;
    case 'phone-keypad':
    case 'phone-scan':
    case 'account-country':
    case 'account-country-select':
    case 'account-input-return':
    case 'account-input-cancel':
    case 'account-keypad-digit':
    case 'account-keypad-done':
    case 'account-scan-state':
    case 'account-scan-complete':
    case 'account-code-send':
    case 'account-code-state':
    case 'account-qr-state':
    case 'account-login-cancel':
    case 'account-mfa-open':
    case 'account-mfa-check':
    case 'account-mfa-expire':
    case 'account-mfa-cancel':
    case 'account-mfa-complete': {
      const demo = (state.accountDemo ||= {
        view: 'login',
        country: '+86',
        digits: { phone: '13800000000', code: '' },
        scan: 'waiting',
        codeState: '',
      });
      if (action === 'phone-keypad' || action === 'phone-scan') {
        if (value !== 'phone' && value !== 'code') break;
        if (demo.view === 'login') {
          const draftCode = $('#code', overlay)?.value;
          if (typeof draftCode === 'string' && /^[0-9]{0,8}$/.test(draftCode))
            demo.digits.code = draftCode;
          demo.inputBefore = { ...demo.digits };
        }
        state.loginTab = '手机号登录';
        state.loginStep = 'waiting';
        demo.kind = value;
        demo.view = action === 'phone-keypad' ? 'keypad' : 'scan';
        demo.scan = 'waiting';
        demo.inputError = '';
      } else if (action === 'account-country') {
        demo.view = 'country';
      } else if (action === 'account-country-select') {
        if (
          ![
            '+86',
            '+852',
            '+853',
            '+886',
            '+60',
            '+65',
            '+62',
            '+95',
            '+63',
            '+84',
            '+855',
            '+81',
            '+82',
            '+971',
          ].includes(value)
        )
          break;
        demo.country = value;
        demo.codeState = '';
        demo.view = 'login';
        state.loginTab = '手机号登录';
      } else if (action === 'account-input-return' || action === 'account-input-cancel') {
        if (action === 'account-input-cancel' && demo.inputBefore)
          demo.digits = { ...demo.inputBefore };
        demo.view = 'login';
      } else if (action === 'account-keypad-digit') {
        if (demo.view !== 'keypad') break;
        const kind = demo.kind === 'code' ? 'code' : 'phone';
        if (value === 'delete') demo.digits[kind] = demo.digits[kind].slice(0, -1);
        else if (/^[0-9]$/.test(value) && demo.digits[kind].length < (kind === 'code' ? 6 : 13))
          demo.digits[kind] += value;
        demo.inputError = '';
      } else if (action === 'account-keypad-done') {
        const kind = demo.kind === 'code' ? 'code' : 'phone';
        if (!demo.digits[kind]) demo.inputError = '请先输入演示数字，或取消返回。';
        else {
          demo.inputError = '';
          demo.view = 'login';
        }
      } else if (action === 'account-scan-state') {
        if (!['waiting', 'expired', 'failed', 'unavailable'].includes(value)) break;
        demo.scan = value;
      } else if (action === 'account-scan-complete') {
        if (demo.view !== 'scan' || demo.scan !== 'waiting') break;
        demo.digits[demo.kind === 'code' ? 'code' : 'phone'] =
          demo.kind === 'code' ? '000000' : '13800000000';
        demo.view = 'login';
      } else if (action === 'account-code-send') {
        demo.codeState = state.scenario === 'error' ? 'failed' : 'sent';
      } else if (action === 'account-code-state') {
        if (!['', 'failed', 'wait'].includes(value)) break;
        demo.codeState = value;
      } else if (action === 'account-qr-state') {
        if (!['preparing', 'failed', 'unavailable'].includes(value)) break;
        state.loginStep = value;
      } else if (action === 'account-login-cancel') {
        state.loginStep = 'waiting';
        demo.view = 'login';
        overlay.close();
        toast('已取消演示登录，没有发送请求');
        break;
      } else if (action === 'account-mfa-open') {
        state.loginTab = '手机号登录';
        state.loginStep = 'mfa';
      } else if (action === 'account-mfa-check') {
        if (state.loginStep === 'mfa-expired') break;
        state.loginStep = 'mfa-failed';
      } else if (action === 'account-mfa-expire') {
        state.loginStep = 'mfa-expired';
      } else if (action === 'account-mfa-cancel') {
        state.loginStep = 'waiting';
        demo.view = 'login';
      } else if (action === 'account-mfa-complete') {
        if (!['mfa', 'mfa-failed'].includes(state.loginStep)) break;
        state.loginStep = 'waiting';
        demo.view = 'login';
        handleAction('login-success');
        break;
      }
      loginDialog();
      break;
    }
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
    case 'tv-text-scan':
      tvTextScan(value);
      break;
    case 'tv-radar': {
      state.rankView = '榜单雷达';
      navigate('ranking');
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
      state.genre = '全部';
      state.discoverSetting = '全部';
      state.discoverBackground = '全部';
      render();
      break;
    case 'sort':
      state.sort = value;
      render();
      break;
    case 'discover-expand':
      state.discoverExpanded = !state.discoverExpanded;
      render();
      break;
    case 'discover-audience':
    case 'discover-status':
    case 'discover-time':
    case 'discover-setting':
    case 'discover-background': {
      const key = {
        'discover-audience': 'discoverAudience',
        'discover-status': 'discoverStatus',
        'discover-time': 'discoverTime',
        'discover-setting': 'discoverSetting',
        'discover-background': 'discoverBackground',
      }[action];
      state[key] = value;
      render();
      break;
    }
    case 'search-hot-board':
      state.searchHotBoard = value;
      render();
      break;
    case 'search-discovery-retry':
      state.searchDiscoveryUnavailable = false;
      render();
      break;
    case 'discover-page-state': {
      const key = discoverPageKey();
      const pages = (state.discoverPages ||= {});
      const previous = pages[key] || { limit: 2 };
      pages[key] = {
        ...previous,
        status: value === '续页失败' ? 'error' : value === '续页中' ? 'loading' : 'idle',
      };
      state.searchDiscoveryUnavailable = value === '热搜失败';
      render();
      break;
    }
    case 'discover-more': {
      const key = discoverPageKey();
      const pages = (state.discoverPages ||= {});
      const previous = pages[key] || { limit: 2, status: 'idle' };
      if (previous.status === 'loading') break;
      const count = discoverItems(state).length;
      const limit = Math.min(count, previous.limit + 2);
      pages[key] = { limit, status: limit >= count ? 'end' : 'idle' };
      render();
      break;
    }
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
      state.sort = '综合';
      state.discoverAudience = '全部';
      state.discoverStatus = '全部';
      state.discoverTime = '全部';
      state.discoverSetting = '全部';
      state.discoverBackground = '全部';
      state.discoverPages = {};
      state.query = '';
      state.scenario = 'normal';
      $('#scenario').value = 'normal';
      $('#search').value = '';
      navigate('discover');
      break;
    case 'clear-searches':
      confirmDialog('清空搜索记录？', '仅清除本次演示中的搜索记录。', '清空记录', () => {
        state.searches = [];
        state.searchHistoryError = false;
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
    case 'rank-view':
      state.rankView = value;
      render();
      break;
    case 'rank-category': {
      const category = prototypeRankCategories.find((item) => item.label === value);
      if (!category) break;
      state.rankCategory = value;
      state.rankSub = category.children[0];
      state.rankPanel = '全部';
      render();
      break;
    }
    case 'rank-sub':
      state.rankSub = value;
      state.rankPanel = '全部';
      render();
      break;
    case 'rank-panel':
      state.rankPanel = value;
      render();
      break;
    case 'rank-more':
      toast('已显示全部演示条目');
      source.disabled = true;
      source.textContent = '已显示全部';
      break;
    case 'actor': {
      state.actorWorksId = value;
      state.actorWorksStatus = 'ready';
      actorWorksDialog();
      break;
    }
    case 'actor-state':
      state.actorWorksStatus =
        { 正常: 'ready', 读取中: 'loading', 读取失败: 'error', 暂无作品: 'empty' }[value] ||
        'ready';
      actorWorksDialog();
      break;
    case 'actor-retry':
      state.actorWorksStatus = 'ready';
      actorWorksDialog();
      break;
    case 'search-suggestion':
      chooseSearchSuggestion(value);
      break;
    case 'search-suggestion-state':
      state.searchSuggestionStatus =
        { 正常: 'ready', 建议读取中: 'loading', 建议失败: 'error', 建议为空: 'empty' }[value] ||
        'ready';
      if (!$('#search').value) $('#search').value = '春';
      updateSearchSuggestions();
      $('#search').focus();
      break;
    case 'search-suggestions-retry':
      state.searchSuggestionStatus = 'ready';
      updateSearchSuggestions();
      $('#search').focus();
      break;
    case 'search-history-state':
      state.searchHistoryFailureScenario = value === '保存失败';
      state.searchHistoryError = state.searchHistoryFailureScenario;
      render();
      break;
    case 'search-history-retry':
      state.searchHistoryFailureScenario = false;
      state.searchHistoryError = false;
      render();
      toast('已恢复保存状态演示');
      break;
    case 'radar-view':
      state.radarView = value;
      render();
      break;
    case 'radar-category':
      state.radarCategory = value;
      render();
      break;
    case 'radar-metric':
      state.radarMetric = value;
      render();
      break;
    case 'radar-type':
      state.radarType = value;
      render();
      break;
    case 'radar-scenario':
      state.radarScenario = value;
      render();
      break;
    case 'radar-refresh':
      state.radarScenario = '正常';
      state.scenario = 'normal';
      $('#scenario').value = 'normal';
      render();
      toast('已恢复演示数据');
      break;
    case 'new-mode':
      state.newMode = value;
      render();
      break;
    case 'new-gender':
      state.newGender = value;
      render();
      break;
    case 'new-date':
      state.newDate = Number(value);
      render();
      break;
    case 'new-more': {
      if (!['recommend', 'released', 'upcoming'].includes(value)) break;
      state.newPages ||= {};
      const key = newPageKey(value);
      const page = (state.newPages[key] ||= {
        limit: value === 'upcoming' ? 1 : 2,
        status: 'idle',
      });
      if (page.status === 'loading') break;
      page.limit += 2;
      page.status = 'idle';
      render();
      break;
    }
    case 'new-page-state': {
      state.newPages ||= {};
      const branches = state.newMode === '新剧推荐' ? ['recommend'] : ['released', 'upcoming'];
      for (const branch of branches) {
        const page = (state.newPages[newPageKey(branch)] ||= {
          limit: branch === 'upcoming' ? 1 : 2,
          status: 'idle',
        });
        page.status = { 续页中: 'loading', 续页失败: 'error' }[value] || 'idle';
      }
      render();
      break;
    }
    case 'today':
      state.newDate = 0;
      render();
      break;
    case 'favorite-tab':
      state.favoriteTab = value;
      render();
      break;
    case 'refresh-following':
      toast(state.scenario === 'error' ? '刷新失败，已有记录保留' : '已刷新演示记录');
      break;
    case 'read-notifications':
      state.notificationsRead = true;
      render();
      break;
    case 'open-following':
      state.followingTab = '追更';
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
    case 'follow':
      if (!state.loggedIn) loginDialog();
      else toggleSet('follows', value || state.id, '已追更，有更新时提醒你', '已取消追更');
      break;
    case 'reserve':
      if (!state.loggedIn) loginDialog();
      else {
        const id = value || state.id;
        if (state.reservationPending.has(id)) break;
        state.reservationPending.add(id);
        render();
        toast('请求已提交，等待列表确认。稍后刷新“我的预约”核对。');
      }
      break;
    case 'statistics-kind':
      state.statisticsKind = value;
      render();
      break;
    case 'reset-statistics':
      confirmDialog('重置本机观看统计？', '观看记录、收藏和播放进度会保留。', '重置统计', () => {
        state.statisticsReset = true;
        render();
      });
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
        '会清除本机的观看位置。观看统计单独保留；账号云端记录需要另行管理，收藏不会被清除。',
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
      state.episodePage = 0;
      state.season = Number(value);
      render();
      break;
    case 'panel-season':
      state.episodePage = 0;
      state.season = Number(value);
      if (overlay.open) episodePanel();
      else render();
      break;
    case 'episodes':
      episodePanel();
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
      if (state.episode < playableEpisodeCount()) {
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
    case 'setting-tab':
      state.settingTab = Object.hasOwn(settingsSections(), value)
        ? value
        : Object.keys(settingsSections())[0];
      render();
      break;
    case 'switch': {
      const checked = source.getAttribute('aria-checked') !== 'true';
      source.setAttribute('aria-checked', String(checked));
      state.preferences ||= {};
      state.preferences[source.getAttribute('aria-label')] = checked;
      if (source.getAttribute('aria-label') === '减少动态效果')
        document.documentElement.classList.toggle('reduce-motion', checked);
      toast('偏好已保存在本次演示');
      break;
    }
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
  if (!event.target.closest('#search-form')) hideSearchSuggestions();
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
    const targetSeason = selectedSeason();
    const targetId = targetSeason?.available ? targetSeason.id : state.id;
    if (isUpcomingSeason()) return;
    if (overlay.open) overlay.close();
    if (targetId !== state.id) {
      startPlayback(targetId, ep);
      return;
    }
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
  state.query = query.trim().slice(0, 100);
  state.genre = '全部';
  state.kind = '全部';
  $('#search').value = state.query;
  if (state.query)
    state.searches = [state.query, ...state.searches.filter((q) => q !== state.query)].slice(0, 10);
  if (state.query) state.searchHistoryError = !!state.searchHistoryFailureScenario;
  hideSearchSuggestions();
  navigate('discover');
}
document.addEventListener('focusin', (event) => {
  if (event.target.id === 'search') updateSearchSuggestions();
});
document.addEventListener('focusout', (event) => {
  if (event.target.closest('#search-form') && !event.relatedTarget?.closest('#search-form'))
    hideSearchSuggestions();
});
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
});
document.addEventListener('input', (event) => {
  HongguoComponents.syncRange(event.target);
  if (event.target.id === 'search') updateSearchSuggestions();
  if (event.target.id === 'position') {
    state.position = Number(event.target.value);
    rememberPlayback();
    $('#time-label').textContent = `${formatTime(state.position)} / 01:42`;
  }
  if (event.target.id === 'volume') state.volume = Number(event.target.value);
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
  if (handleSearchSuggestionKey(event)) return;
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
      HongguoComponents.syncRange($('#position'));
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
