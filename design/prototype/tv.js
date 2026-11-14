/* TV presentation is independent of desktop layouts; only demo models/actions are shared. */
function tvHeader() {
  const section = ['home', 'feed'].includes(state.route)
    ? 'home'
    : ['discover', 'ranking', 'new', 'search'].includes(state.route)
      ? 'discover'
      : state.route === 'following'
        ? 'following'
        : ['library', 'history', 'favorites'].includes(state.route)
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
        `<button class="ui-button quiet" data-route="${route}" ${section === route ? 'aria-current="page"' : ''}>${label}</button>`,
    )
    .join(
      '',
    )}</nav><div class="tv-header-tools"><button class="ui-button quiet icon-only tv-icon" data-route="search" aria-label="搜索短剧">${icon('search')}</button><button class="ui-button quiet icon-only tv-icon" data-action="account" aria-label="${state.loggedIn ? '我的账号' : '登录账号'}">${icon('user')}</button><button class="ui-button quiet icon-only tv-icon" data-route="settings" aria-label="设置">${icon('settings')}</button></div>`;
}
function tvCards(items = dramas) {
  return `<div class="tv-poster-row" data-focus-group="posters">${items.map((d) => `<button class="tv-poster content-poster-button" data-detail="${d.id}"><span class="tv-poster-art content-poster-cover">${posterImage(d)}${state.history.includes(d.id) ? '<span class="tv-watched content-cover-label">看过</span>' : ''}</span><strong>${d.title}</strong><span>${d.note}</span></button>`).join('')}</div>`;
}
function tvFeature(d, detail = false) {
  if (detail) d = dramaById(selectedSeason(d)?.id) || d;
  const seen = state.history.includes(d.id);
  const upcoming = detail && isUpcomingSeason(d);
  const pending = upcoming && state.reservationPending.has(d.id);
  const primaryLabel = seen ? `继续第 ${d.episode} 集` : '开始观看';
  return `<section class="tv-feature cinema ${detail ? 'tv-detail-feature' : ''}"><div class="tv-feature-art">${posterImage(d, '', `${d.title}概念封面`)}</div><div class="tv-feature-copy"><h1>${d.title}</h1><p class="tv-meta">${upcoming ? '待上线' : d.note}　${d.tags.slice(0, 2).join(' · ')}</p><p class="tv-synopsis">${d.desc}</p><div class="tv-feature-actions">${upcoming ? reservationButton(d.id, { label: '预约上线提醒', variant: 'primary', attrs: 'data-tv-initial="true"' }) : button(primaryLabel, seen ? 'resume' : 'play', { value: d.id, variant: 'primary', image: 'play', attrs: 'data-tv-initial="true"' })}${detail ? button(state.favorites.has(d.id) ? '已收藏' : '收藏', 'favorite', { value: d.id, image: 'bookmark' }) : button('选集与详情', 'detail', { value: d.id, image: 'list' })}${detail && !upcoming ? button(state.follows.has(d.id) ? '已追更' : '追更', 'follow', { value: d.id, image: 'bell' }) : ''}</div>${pending ? '<p class="tv-resume-time" role="status">请求已提交，刷新预约列表确认结果。</p>' : !detail && seen ? `<p class="tv-resume-time">上次看到 ${formatTime(d.position || 0)}</p>` : ''}</div></section>`;
}
function tvHome() {
  const d = dramaById(state.history[0]) || dramas[0];
  return `${statusContent() || tvFeature(d)}<section class="tv-shelf"><div class="tv-section-heading"><h2>接下来想看</h2>${button('全部短剧', 'discover', { image: 'forward' })}</div>${tvCards(dramas.filter((item) => item.id !== d.id).concat(d))}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>新剧与热播</h2></div><div class="tv-destination-row">${button('上新日历', 'new', { image: 'calendar' })}${button('排行榜', 'ranking', { image: 'chart' })}${button('刷剧', 'feed', { image: 'play' })}</div></section>`;
}
function tvDiscover() {
  return discoverPage(true);
}
function tvSearchSuggestions(query) {
  const q = query.trim();
  if (!q) return '';
  const terms = [
    ...dramas.map((d) => d.title),
    ...prototypeActors.map((actor) => actor.name),
  ].filter((term) => term.includes(q));
  return terms.length
    ? `<div class="tv-section-heading"><h2>搜索建议</h2></div>${chips(terms, '', 'recent-search')}`
    : '';
}
function tvSearch() {
  return `<div class="tv-page-heading"><h1>搜索</h1>${button('扫码输入', 'tv-text-scan', { value: 'search' })}</div><form id="tv-search-form" class="tv-search-form" role="search"><label><span class="sr-only">短剧、演员或题材</span><span class="input-with-icon">${icon('search')}<input id="tv-query" class="ui-input" type="search" autocomplete="off" aria-controls="tv-search-suggestions" value="${escapeHTML(state.query)}" placeholder="输入剧名、演员或题材" /></span></label><button type="submit" class="ui-button btn primary">搜索</button></form><section id="tv-search-suggestions" aria-label="搜索建议">${tvSearchSuggestions(state.query)}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>最近搜索</h2>${state.searches.length ? button('清空记录', 'clear-searches') : ''}</div>${state.searches.length ? chips(state.searches, '', 'recent-search') : '<p class="tv-muted">暂无搜索记录</p>'}</section><section class="tv-shelf"><div class="tv-section-heading"><h2>热搜</h2></div><p class="tv-muted">搜索词与顺序为演示数据</p>${chips(
    dramas.map((d) => d.title),
    '',
    'recent-search',
  )}<div class="tv-section-heading"><h2>找演员</h2></div><div class="actions">${prototypeActors.map((actor) => button(actor.name, 'actor', { value: actor.id })).join('')}</div></section>`;
}
function tvDetail() {
  const d = dramaById(selectedSeason()?.id) || current();
  return `${statusContent() || `${tvFeature(d, true)}<section class="tv-shelf tv-detail-episodes"><div class="tv-section-heading"><h2>选集</h2></div>${seasonPicker()}${episodePicker(d, { tv: true })}</section><div class="tv-shared-content">${detailExtras(d)}</div>`}`;
}
function tvPlayer() {
  const d = current();
  const visible = state.tvControls !== false;
  const seek = state.tvSeek;
  return `<section class="tv-player cinema" aria-label="TV 静态播放演示"><div class="tv-player-picture">${posterImage(d, '', '播放器静态示意画面')}</div><span class="tv-demo-caption">静态画面 · 非真实视频</span><button id="tv-stage" class="tv-stage" data-action="tv-wake" aria-label="${visible ? '收起播放控制' : '显示播放控制'}" ${visible ? 'tabindex="-1"' : 'data-tv-initial="true"'}>${!visible && !state.playing ? icon('play') : ''}</button>${state.scenario === 'error' ? `<div class="tv-player-status"><h2>播放遇到问题</h2><p>观看位置已保留</p>${button('重试播放', 'retry', { variant: 'primary' })}</div>` : state.scenario === 'loading' ? '<div class="tv-player-status" role="status"><h2>正在缓冲…</h2><p>观看位置已保留</p></div>' : ''}<div class="tv-player-controls" ${!visible ? 'hidden' : ''}><div class="tv-playing-title"><div><h1>${d.title}</h1><p>第 ${state.episode} 集 / 共 ${d.count} 集</p></div>${button('返回', 'tv-leave', { image: 'back' })}</div>${seek ? `<div class="tv-seek-preview" role="status">定位到 ${formatTime(state.tvSeekPosition)} · 确认键应用，返回键取消</div>` : ''}<label class="tv-progress"><span class="sr-only">播放进度，秒</span><input id="position" type="range" min="0" max="102" value="${seek ? state.tvSeekPosition : state.position}"/><span class="numeral" id="time-label">${formatTime(seek ? state.tvSeekPosition : state.position)} / 01:42</span></label><div class="tv-play-actions"><div class="actions">${button(state.playing ? '暂停' : '播放', 'toggle-play', { image: state.playing ? 'pause' : 'play', attrs: 'data-tv-initial="true"' })}${button('后退 10 秒', 'tv-seek-back', { image: 'back' })}${button('前进 10 秒', 'tv-seek-forward', { image: 'forward' })}${button('下一集', 'next-episode', { image: 'next', attrs: state.episode >= playableEpisodeCount(d) ? 'disabled' : '' })}</div><div class="actions">${button('选集', 'episodes', { image: 'list' })}${button('更多', 'tv-player-more', { image: 'settings' })}</div></div></div></section>`;
}
function tvLibrary(kind) {
  kind =
    kind || (['history', 'favorites', 'following'].includes(state.route) ? state.route : 'history');
  const headings = {
    history: '继续观看',
    favorites: '收藏',
    following: '追更与预约',
  };
  const menu = `<nav class="tv-library-nav" aria-label="片库分类">${Object.entries(headings)
    .map(
      ([route, label]) =>
        `<button class="ui-button quiet" data-route="${route}" ${kind === route ? 'aria-current="page"' : ''}>${label}</button>`,
    )
    .join('')}</nav>`;
  if (kind === 'favorites' || kind === 'following')
    return `${menu}<section class="tv-library-content tv-shared-content">${kind === 'favorites' ? favoritesPage() : followingPage()}</section>`;
  let body = '';
  if (kind === 'history')
    body = `<div class="tv-section-heading"><h2>继续观看</h2><div class="actions">${button(state.manage ? '完成' : '管理记录', 'manage-history')}${button('清空记录', 'clear-history')}</div></div>${state.manage ? `<div class="actions">${button('全选', 'select-history')}${button(`删除所选（${state.selectedHistory.size}）`, 'delete-history', { attrs: state.selectedHistory.size ? '' : 'disabled' })}</div>` : ''}<div class="tv-history-list">${state.history
      .map((id) => {
        const d = dramaById(id);
        return `<article class="tv-library-item">${state.manage ? `<input type="checkbox" data-history-select="${id}" aria-label="选择${d.title}" ${state.selectedHistory.has(id) ? 'checked' : ''}/>` : ''}<button class="tv-item-art" data-detail="${id}" aria-label="查看${d.title}">${posterImage(d)}</button><div><h3>${d.title}</h3><p>第 ${d.episode} 集 · 看到 ${formatTime(d.position || 0)}</p></div>${button('继续观看', 'resume', { value: id, image: 'play' })}</article>`;
      })
      .join(
        '',
      )}</div>${!state.history.length ? empty('还没有观看记录', '开始观看后在这里继续。') : ''}${watchStatisticsSection()}`;
  return `<div class="tv-page-heading"><h1>${kind === 'following' ? '追剧' : '我的片库'}</h1>${button('账号与同步', 'account', { image: 'user' })}</div>${menu}<section class="tv-library-content">${statusContent() || body}</section>`;
}
function tvNew() {
  return newPage(true);
}
function tvRanking() {
  return rankingPage(true);
}
function tvSettings() {
  const sections = settingsSections();
  const tab = Object.hasOwn(sections, state.settingTab)
    ? state.settingTab
    : Object.keys(sections)[0];
  return `<div class="tv-page-heading"><h1>设置</h1></div><div class="tv-settings-layout"><nav class="tv-settings-categories" aria-label="设置分类">${Object.keys(
    sections,
  )
    .map(
      (t) =>
        `<button class="ui-button quiet" data-action="setting-tab" data-value="${t}" ${tab === t ? 'aria-current="page"' : ''}>${t}</button>`,
    )
    .join(
      '',
    )}</nav><section class="tv-settings-options"><h2>${tab}</h2>${sections[tab]}</section></div>`;
}
function tvAccount() {
  const merge = state.guestMergeStatus || (state.guestMerged ? 'complete' : 'idle');
  return `<div class="tv-page-heading"><h1>账号</h1></div><section class="tv-account"><div class="tv-account-identity">${icon('user')}<h2>${state.loggedIn ? '林间听风' : '游客观看'}</h2><p>${state.loggedIn ? '演示账号 · 138 **** 0000' : '无需登录也能找剧、观看和收藏'}</p>${button(state.loggedIn ? '退出登录' : '登录账号', state.loggedIn ? 'logout' : 'login', { variant: 'primary' })}</div><div class="tv-account-options"><h2>片库与观看进度</h2><p>${state.loggedIn ? (state.syncError ? '同步失败，本机记录已保留' : '账号片库 · 上次同步：刚刚') : '游客记录保存在本机，与账号片库分别保留'}</p>${button(state.loggedIn ? '立即同步' : '查看本机记录', state.loggedIn ? 'sync' : 'history', { image: 'history' })}${state.loggedIn ? `<div class="tv-account-merge"><h2>本机观看记录</h2><p>${merge === 'complete' ? '已合并，游客记录仍保留在本机' : merge === 'failed' ? '合并失败，游客与账号记录都已保留' : '确认后将登录前的观看记录合并到当前账号，游客记录仍保留'}</p>${button(merge === 'complete' ? '已合并' : merge === 'failed' ? '重试合并' : '合并本机观看记录', 'account-merge-history', { attrs: merge === 'complete' ? 'disabled' : '' })}</div>${button('演示同步失败', 'sync-error')}` : ''}${button('追更与预约', 'following', { image: 'bell' })}</div></section>`;
}
function tvFeed() {
  return `<div class="tv-page-heading"><h1>刷剧</h1><div class="actions">${button('下一部', 'recommend-next', { image: 'next' })}${button('进入全屏观看', 'play', { value: state.id, image: 'play', variant: 'primary' })}</div></div>${tabs(['推荐', '真人剧', '漫剧', '关注'], state.channel, 'channel')}${state.channel === '漫剧' ? empty('暂无漫剧样例', '当前演示保留频道入口。', '查看真人剧', 'real-channel') : state.channel === '关注' && !state.loggedIn ? empty('登录后查看关注', '登录后继续当前频道。', '登录', 'login', 'bell') : tvFeature(current())}`;
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
    $('[data-tv-initial]:not(:disabled)', root) ||
    $('button:not(:disabled), input:not(:disabled), select:not(:disabled)', root);
  target?.focus({ preventScroll: true });
}
function tvMoreDialog() {
  showDialog(
    '播放选项',
    `<div class="tv-more-options">${settingRow('音量', `<label><span class="sr-only">播放音量</span><input id="volume" type="range" min="0" max="100" value="${state.volume}" /></label>${button(state.volume ? '静音' : '取消静音', 'mute', { image: state.volume ? 'volume' : 'mute' })}`)}${settingRow('倍速', `<label><span class="sr-only">播放速度</span><select id="speed">${[0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${Number(state.speed || 1) === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>`)}${settingRow('清晰度', `<label><span class="sr-only">清晰度</span><select id="quality">${['自动', '1080P', '720P', '480P'].map((v) => `<option ${state.quality === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)}${button(state.favorites.has(state.id) ? '已收藏' : '收藏', 'favorite', { value: state.id, image: 'bookmark' })}${button(state.follows.has(state.id) ? '已追更' : '追更', 'follow', { value: state.id, image: 'bell' })}${button('查看详情', 'detail', { value: state.id, image: 'info' })}</div>`,
    { sheet: true },
  );
}

let tvTextScanSession = 0;
function tvTextScan() {
  const session = ++tvTextScanSession;
  const title = '手机扫码搜索';
  showDialog(
    title,
    `<div class="tv-scan-placeholder" aria-label="二维码展示区域，设计演示没有可扫描二维码">${icon('screen')}<span>二维码展示区域</span></div><p data-tv-scan-status role="status">等待手机输入…</p><p class="muted">手机和电视需在同一局域网。二维码 5 分钟有效，关闭后失效。</p><div class="actions"><button type="button" class="ui-button btn" data-tv-scan-refresh>刷新二维码</button>${button('返回搜索', 'close')}</div><details class="tv-scan-review"><summary>输入状态演示</summary><p class="muted">此原型不生成可扫描二维码。</p><label><span>手机输入样例</span><textarea class="field-input ui-input" data-tv-scan-text maxlength="100">${escapeHTML(state.query || dramas[0].title)}</textarea></label><div class="actions"><button type="button" class="ui-button btn" data-tv-scan-receive>接收输入样例</button><button type="button" class="ui-button btn" data-tv-scan-expire>模拟过期</button></div></details>`,
    { sheet: true },
  );
  let expired = false;
  let timer;
  const active = () =>
    session === tvTextScanSession &&
    overlay.open &&
    overlay.dataset.context === `${state.id}:${title}`;
  const expire = () => {
    clearTimeout(timer);
    expired = true;
    if (active()) {
      $('[data-tv-scan-status]', overlay).textContent = '二维码已过期，请刷新后重新输入。';
      const receive = $('[data-tv-scan-receive]', overlay);
      const focused = document.activeElement === receive;
      receive.disabled = true;
      if (focused) $('[data-tv-scan-refresh]', overlay).focus();
    }
  };
  const refresh = () => {
    clearTimeout(timer);
    expired = false;
    $('[data-tv-scan-status]', overlay).textContent = '等待手机输入…';
    $('[data-tv-scan-receive]', overlay).disabled = false;
    timer = setTimeout(expire, 5 * 60 * 1000);
  };
  $('[data-tv-scan-refresh]', overlay).addEventListener('click', refresh);
  $('[data-tv-scan-expire]', overlay).addEventListener('click', expire);
  $('[data-tv-scan-receive]', overlay).addEventListener('click', () => {
    if (!active() || expired) return;
    const text = $('[data-tv-scan-text]', overlay).value.trim();
    if (!text) {
      $('[data-tv-scan-status]', overlay).textContent = '请输入内容。';
      return;
    }
    overlay.close();
    searchFor(text);
  });
  overlay.addEventListener(
    'close',
    () => {
      clearTimeout(timer);
      expired = true;
    },
    { once: true },
  );
  refresh();
}

document.addEventListener('input', (event) => {
  if (event.target.id !== 'tv-query') return;
  const suggestions = $('#tv-search-suggestions');
  if (suggestions) suggestions.innerHTML = tvSearchSuggestions(event.target.value);
});
