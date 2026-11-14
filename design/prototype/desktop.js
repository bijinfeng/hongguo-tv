/* Desktop presentation. Shared demo state and actions are owned by app.js. */
function desktopHome() {
  const history = state.history.map(dramaById);
  return `<div class="page-head"><h1>首页</h1>${button('刷一部短剧', 'feed', { image: 'play' })}</div>
    ${
      history.length
        ? `<section aria-labelledby="continue-title"><div class="section-head first-section"><h2 id="continue-title">继续观看</h2>${routeButton('全部记录', 'history', 'forward')}</div><div class="continue-grid">${history
            .slice(0, 2)
            .map(
              (d) =>
                `<article class="continue-card content-continue"><button class="continue-cover content-continue-cover" data-detail="${d.id}" aria-label="查看${d.title}详情">${posterImage(d)}</button><div class="continue-copy content-continue-body"><h3>${d.title}</h3><p class="muted small">第 ${d.episode} 集 · 看到 ${formatTime(d.position || 0)}</p><div class="progress content-watch-progress"><span style="width:${Math.round(((d.position || 0) / 102) * 100)}%"></span></div>${button(`继续第 ${d.episode} 集`, 'resume', { value: d.id, image: 'play' })}</div></article>`,
            )
            .join('')}</div></section>`
        : ''
    }
    <section><div class="section-head"><h2>为你推荐</h2>${button('换一批', 'shuffle', { image: 'refresh', variant: 'quiet' })}</div>${statusContent() || posters()}</section>
    <section class="release-preview"><div><h2>春山不负 · 第三季</h2><p class="muted small">明天 18:00 上线</p></div><div class="actions">${reservationButton('spring-third')}${routeButton('上新日历', 'new', 'forward')}</div></section>`;
}
function episodePicker(d = current(), { tv = false } = {}) {
  if (isUpcomingSeason(d))
    return `<div class="episode-unreleased"><h3>${selectedSeason(d).title}即将上线</h3><p class="muted">明天 18:00 上线</p>${reservationButton(selectedSeason(d).id)}</div>`;
  d = dramaById(selectedSeason(d)?.id) || d;
  const size = tv ? 12 : 24;
  const total = Math.ceil(d.count / size);
  const page = Math.min(Math.max(0, state.episodePage || 0), total - 1);
  const start = page * size;
  return `<div class="episode-tools"><label><span class="sr-only">集数区间</span><select id="episode-range" aria-label="集数区间">${Array.from({ length: total }, (_, i) => `<option value="${i}" ${i === page ? 'selected' : ''}>${i * size + 1}–${Math.min(d.count, (i + 1) * size)} 集</option>`).join('')}</select></label>${button('定位当前集', 'locate-episode', { variant: 'quiet' })}</div><div class="episodes ${tv ? 'tv-episodes' : ''}" aria-label="选择集数">${Array.from(
    { length: Math.min(size, d.count - start) },
    (_, i) => {
      const n = start + i + 1;
      const locked = d.id === 'spring' && n > 48;
      const active = state.episode === n && state.id === d.id;
      return `<button class="ui-button" data-episode="${n}" ${active ? 'aria-current="true"' : ''} ${locked ? 'disabled' : ''} aria-label="${locked ? '尚未开放' : '播放'}第 ${n} 集">${locked ? icon('lock') : ''}<span>${tv ? `第 ${n} 集` : String(n).padStart(2, '0')}</span>${tv && active ? '<small>当前集</small>' : ''}</button>`;
    },
  ).join(
    '',
  )}</div><p class="episode-note">${d.id === 'spring' ? '更新至 48 集，后续剧集尚未开放' : `全 ${d.count} 集`}</p>`;
}
function seasonPicker(panel = false) {
  const seasons = prototypeSeasons();
  if (!seasons.length) return '';
  return `<div class="season-row dx-seasons" aria-label="系列季">${seasons.map((season) => `<button class="ui-button" data-action="${panel ? 'panel-season' : 'season'}" data-value="${season.number}" aria-pressed="${state.season === season.number}">${season.title}${!season.available ? ' · 待上线' : season.id === state.id && ['player', 'feed'].includes(state.route) ? ' · 播放中' : state.history.includes(season.id) ? ' · 可续播' : ''}</button>`).join('')}</div>`;
}
function desktopDetail() {
  const d = dramaById(selectedSeason()?.id) || current();
  const upcoming = isUpcomingSeason();
  const seen = state.history.includes(d.id);
  return `<div class="back-row">${button('返回', 'back', { image: 'back' })}</div>${statusContent() || `<section class="desktop-detail"><div class="detail-poster">${posterImage(d, '', `${d.title}概念封面`)}</div><div class="detail-information"><h1>${d.title}</h1><p class="muted">${d.note}　${d.tags.join(' · ')}</p><p class="synopsis">${d.desc}</p><p class="muted small">${d.cast}</p><div class="actions">${upcoming ? reservationButton(d.id, { variant: 'primary' }) : button(seen ? `继续第 ${state.episode} 集` : '开始观看', seen ? 'resume' : 'play', { value: d.id, variant: 'primary', image: 'play' })}${button(state.favorites.has(d.id) ? '已收藏' : '收藏', 'favorite', { value: d.id, image: 'bookmark' })}${button(state.follows.has(d.id) ? '已追更' : '追更', 'follow', { value: d.id, image: 'bell' })}</div></div></section><section class="detail-episodes"><div class="section-head"><h2>选集</h2><span class="muted small">${d.note}</span></div>${seasonPicker()}${episodePicker(d)}</section>${detailExtras(d)}`}`;
}
function detailExtras(d = current()) {
  const actors = prototypeActors.filter((actor) => actor.works.includes(d.id));
  const relatedIds =
    {
      return: ['night'],
      spring: ['spring-second'],
      'spring-second': ['spring'],
      night: ['return'],
    }[d.id] || [];
  const related = relatedIds.map(dramaById).filter(Boolean);
  return `${actors.length ? `<section><div class="section-head"><h2>演员</h2></div><div class="actions">${actors.map((actor) => button(actor.name, 'actor', { value: actor.id })).join('')}</div></section>` : ''}${related.length ? `<section><div class="section-head"><h2>相关作品</h2></div>${posters(related)}</section>` : ''}`;
}
function desktopPlayerRail() {
  return `<aside class="player-rail" aria-label="选集"><h2>选集</h2><div class="rail-scroll"><p class="muted small">${current().title} · ${current().note}</p>${seasonPicker(true)}${episodePicker()}</div></aside>`;
}
function desktopPlayer(feed = false) {
  const d = current();
  return `${feed ? `<div class="page-head"><h1>刷剧</h1>${button('查看详情', 'detail', { value: d.id, image: 'info' })}</div>${tabs(['推荐', '真人剧', '漫剧', '关注'], state.channel, 'channel')}` : `<div class="back-row">${button('返回', 'back', { image: 'back' })}</div><div class="player-title"><h1>${d.title}<span class="muted">第 ${state.episode} 集 · ${d.note}</span></h1></div>`}${feed && state.channel === '漫剧' ? empty('暂无漫剧样例', '当前演示保留完整频道入口。', '查看真人剧', 'real-channel') : feed && state.channel === '关注' && !state.loggedIn ? empty('登录后查看关注', '登录后继续当前频道。', '登录', 'login', 'bell') : `<div class="watch-layout ${feed ? 'feed-layout' : ''}"><div class="watch-main">${desktopCinema(d)}<div class="watch-under"><div class="actions">${feed ? `<h2>${d.title}<small>第 ${state.episode} 集</small></h2>` : ''}${button(state.favorites.has(d.id) ? '已收藏' : '收藏', 'favorite', { value: d.id, image: 'bookmark' })}${button(state.follows.has(d.id) ? '已追更' : '追更', 'follow', { value: d.id, image: 'bell' })}${feed ? button('下一部', 'recommend-next', { image: 'next' }) : ''}</div><div class="compact-panels">${button('选集', 'episodes', { image: 'list' })}</div></div></div>${desktopPlayerRail()}</div>`}`;
}

function desktopCinema(d = current()) {
  return `<section class="cinema" aria-label="静态播放器设计演示"><div class="picture" id="picture">${posterImage(d, '', '播放器静态示意画面')}<span class="demo-caption">静态画面 · 非真实视频</span>${state.scenario === 'loading' ? '<span class="buffering" role="status">缓冲中…</span>' : state.scenario === 'error' ? button('播放失败，重试', 'retry', { variant: 'play-overlay' }) : `<button class="play-overlay icon-button" data-action="toggle-play" data-value="picture" aria-label="${state.playing ? '暂停' : '播放'}">${icon(state.playing ? 'pause' : 'play')}</button>`}</div><div class="player-controls"><label><span class="sr-only">播放进度，秒</span><input id="position" type="range" min="0" max="102" value="${state.position}" /></label><div class="control-row"><button class="ui-button quiet icon-only icon-button" data-action="toggle-play" data-value="controls" aria-label="${state.playing ? '暂停' : '播放'}">${icon(state.playing ? 'pause' : 'play')}</button><button class="ui-button quiet icon-only icon-button" data-action="next-episode" aria-label="下一集" ${state.episode >= playableEpisodeCount(d) ? 'disabled' : ''}>${icon('next')}</button><span class="numeral" id="time-label">${formatTime(state.position)} / 01:42</span><span class="spacer"></span><button class="ui-button quiet icon-only icon-button" data-action="mute" aria-label="${state.volume ? '静音' : '取消静音'}">${icon(state.volume ? 'volume' : 'mute')}</button><label class="volume-label"><span class="sr-only">音量</span><input id="volume" class="volume" type="range" min="0" max="100" value="${state.volume}" /></label><label><span class="sr-only">播放速度</span><select id="speed">${[0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${Number(state.speed || 1) === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label><label><span class="sr-only">清晰度</span><select id="quality">${['自动', '1080P', '720P', '480P'].map((v) => `<option ${state.quality === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><span class="fullscreen-panels">${button('选集', 'episodes', { image: 'list' })}</span><button class="ui-button quiet icon-only icon-button" data-action="fullscreen" aria-label="${document.fullscreenElement ? '退出全屏' : '全屏'}" title="${document.fullscreenElement ? '退出全屏' : '全屏'}">${icon('fullscreen')}</button></div></div></section>`;
}
