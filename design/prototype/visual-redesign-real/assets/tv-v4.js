/* TV candidate only. No account, catalog mutation, playback or update API requests. */
(() => {
  'use strict';
  const C = globalThis.HongguoComponents,
    T = globalThis.Theater;
  const E = C.escape,
    I = C.icon,
    all = T.dramas;
  const root = document.querySelector('#tv4'),
    modal = document.querySelector('#modal');
  const params = new URLSearchParams(location.search);
  const fontScales = new Set(['1', '1.15', '1.3', '1.5', '2']);
  const names = {
    home: '精选',
    discover: '找剧',
    rank: '榜单',
    mine: '我的',
    search: '搜索',
    new: '新剧日历',
    detail: '剧集详情',
    player: '播放器',
    history: '继续观看',
    favorites: '收藏',
    following: '追更',
    reservations: '预约',
    account: '账号',
    settings: '设置',
    about: '关于',
    support: '支持与打赏',
    apps: '应用推荐',
    components: '组件规范',
  };
  const states = {
    home: ['ready', 'nohistory', 'loading', 'empty', 'error'],
    discover: ['ready', 'empty', 'loading', 'error', 'moreerror'],
    search: ['ready', 'loading', 'empty', 'error'],
    rank: ['ready', 'loading', 'empty', 'error', 'expired'],
    new: ['ready', 'empty', 'loading', 'error'],
    mine: ['ready', 'guest', 'empty', 'error'],
    history: ['ready', 'empty', 'error'],
    favorites: ['ready', 'guest', 'empty', 'error'],
    following: ['ready', 'guest', 'empty', 'error'],
    reservations: ['ready', 'guest', 'empty', 'error'],
    detail: ['ready', 'loading', 'error', 'missing', 'locked', 'upcoming'],
    player: ['ready', 'paused', 'buffering', 'error', 'last'],
    account: ['ready', 'guest', 'confirm', 'expired', 'signedin', 'error', 'mergeerror'],
    settings: ['ready', 'error', 'unavailable'],
    about: ['ready'],
    support: ['ready'],
    apps: ['ready'],
    components: ['ready'],
  };
  const stateNames = {
    ready: '默认',
    nohistory: '无观看历史',
    loading: '加载中',
    empty: '空内容',
    error: '失败',
    moreerror: '续页失败',
    expired: '已过期',
    guest: '游客',
    missing: '字段缺失',
    locked: '锁定集',
    upcoming: '待上线',
    paused: '暂停',
    buffering: '缓冲',
    last: '末集',
    confirm: '手机确认中',
    signedin: '已登录样例',
    mergeerror: '合并失败',
    unavailable: '宿主能力缺失',
  };
  const s = {
    screen: names[params.get('screen')] ? params.get('screen') : 'home',
    state: params.get('state') || 'ready',
    id: params.get('id') || 'song',
    episode: 8,
    range: 0,
    genre: '全部',
    rank: '热播榜',
    shelf: 'history',
    setting: 'playback',
    login: 'qr',
    query: '',
    searched: false,
    history: ['持械入宋', '穿越', '少夫人'],
    day: 0,
    drawer: '',
    rate: '1',
    volume: 70,
    paused: false,
    controls: true,
    seek: 43,
    seekSaved: 43,
    seeking: false,
    favorite: new Set(['song', 'northeast', 'eighties', 'basin', 'guard', 'mortal']),
    follow: new Set(['nova', 'song']),
    reserved: new Set(['nova']),
    watched: ['song', 'northeast', 'eighties', 'basin', 'guard', 'mortal'],
    manage: false,
    selected: new Set(),
    prefs: { autoplayNext: true, rememberPosition: true, autoCheckUpdates: true },
    theme: params.get('theme') || 'dark',
    font: fontScales.has(params.get('font')) ? params.get('font') : '1',
    safe: params.get('safe') === 'overscan' ? 'overscan' : 'standard',
    statistics: 42,
    stack: [],
    signedIn: false,
    sms: false,
    phone: '',
    code: '',
    update: 'idle',
  };
  const B = (label, action, value = '', options = {}) =>
    C.button(label, {
      ...options,
      action,
      value,
      extra: `data-key="${E(action + ':' + value)}" ${options.extra || ''}`,
    });
  const goButton = (label, screen, icon, variant = 'quiet') =>
    B(label, 'go', screen, { glyph: icon, variant });
  const drama = () => T.get(s.id) || all[0];
  const title = (d) => d.displayTitle || d.title;
  const sectionHead = (name, action = '') =>
    `<div class="section-head"><h2>${name}</h2>${action}</div>`;
  const notice = (text, action = 'retry', label = '重试') =>
    `<div class="notice error" role="status">${I('circle-alert')}<span>${text}</span>${B(label, action, '', { variant: 'quiet' })}</div>`;
  const listIds = (ids) => ids.map((id) => T.get(id)).filter(Boolean);
  function poster(d, index, rank = false, manage = false) {
    const action = manage ? 'select' : 'detail',
      selected = s.selected.has(d.id);
    return `<button class="poster" data-action="${action}" data-value="${d.id}" data-key="${action}:${d.id}" aria-label="${E(d.title)}${manage ? (selected ? '，已选择' : '，未选择') : ''}" ${manage ? `aria-pressed="${selected}"` : ''}><div class="poster-art"><img src="${d.poster}" alt="" loading="eager">${rank ? `<span class="rank-no">${index + 1}</span>` : ''}<span class="art-label">${manage ? (selected ? '已选择' : '选择') : d.status === 'updating' ? '更新中' : `全${d.episodes}集`}</span></div><span class="poster-title">${E(title(d))}</span><span class="poster-meta">${E(d.genre)}</span></button>`;
  }
  const grid = (items = all, rank = false, manage = false) =>
    `<div class="grid">${items.map((d, i) => poster(d, i, rank, manage)).join('')}</div>`;
  function empty(message, description, screen = 'discover', label = '去找剧') {
    return `<div class="empty-state">${I(s.state === 'error' ? 'circle-alert' : 'tv')}<h2>${message}</h2>${description ? `<p>${description}</p>` : ''}${screen ? goButton(label, screen, 'search') : s.state === 'error' ? B('重新加载', 'retry', '', { variant: 'primary' }) : ''}</div>`;
  }
  function contentState(body, emptyText = '暂时没有内容') {
    if (s.state === 'loading')
      return `<div role="status" aria-label="正在加载"><div class="grid">${Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('')}</div><p class="muted">正在加载…</p></div>`;
    if (s.state === 'empty') return empty(emptyText, '换个条件，看看其他短剧。');
    if (
      s.state === 'error' &&
      ![
        'mine',
        'history',
        'favorites',
        'following',
        'reservations',
        'search',
        'settings',
        'account',
      ].includes(s.screen)
    )
      return empty('内容加载失败', '请检查网络后重试。', '', '');
    return body;
  }
  function continueRail() {
    return `<div class="continue-row">${listIds(s.watched.slice(0, 3))
      .map(
        (d, i) =>
          `<button class="continue-item" data-action="resume" data-value="${d.id}" data-key="resume:${d.id}" aria-label="继续观看${E(title(d))}第${8 + i * 3}集"><img src="${d.poster}" alt=""><span class="continue-copy"><strong>${E(title(d))}</strong><span class="muted">第${8 + i * 3}集 · 剩余 1 分钟</span><span class="progress" style="--progress:${36 + i * 14}%"><span></span></span></span></button>`,
      )
      .join('')}</div>`;
  }
  function home() {
    const d = all[0];
    return contentState(
      `<div class="hero"><div class="hero-copy"><h1>${E(title(d))}</h1><div class="muted">第十一季 · 宫廷 · 全113集</div><div class="row">${B('立即播放', 'play', '', { glyph: 'play', variant: 'primary', className: 'play' })}${B('查看详情', 'detail', d.id, { variant: 'quiet', glyph: 'forward' })}</div></div><div class="hero-art"><img src="${d.poster}" alt="持械入宋封面"><img src="${all[1].poster}" alt="少夫人来自东北3封面"></div></div><section class="section">${sectionHead('为你精选', B('换一批', 'refresh-recommend', '', { glyph: 'refresh', variant: 'quiet' }))}${grid(s.recommend || all.slice(0, 6))}</section>${s.state !== 'nohistory' && s.watched.length ? `<section class="section">${sectionHead('继续观看', goButton('全部记录', 'history', 'forward'))}${continueRail()}</section>` : ''}`,
    );
  }
  function discover() {
    const choices = ['全部', '宫廷', '家庭温情', '脑洞', '剧情'];
    const items = s.genre === '全部' ? all : all.filter((d) => d.genre === s.genre);
    return `<div class="page-top"><h1>找剧</h1><div class="trailing row">${goButton('新剧日历', 'new', 'calendar')}</div></div><div class="chips" aria-label="分类">${choices.map((v) => B(v, 'genre', v, { variant: v === s.genre ? 'selected' : 'quiet', extra: `aria-pressed="${v === s.genre}"` })).join('')}</div>${contentState(grid(items), '没有符合条件的短剧')}${s.state === 'moreerror' ? notice('更多内容加载失败，已显示的结果仍可打开。', 'retry', '重试加载') : ''}`;
  }
  function ranking() {
    const items =
      s.rank === '新剧榜'
        ? [...all].reverse()
        : s.rank === '收藏榜'
          ? [...all.slice(3), ...all.slice(0, 3)]
          : all;
    return `<div class="page-top"><h1>榜单</h1>${B('刷新', 'ranking-refresh', '', { glyph: 'refresh', variant: 'quiet', className: 'trailing' })}</div><div class="ranking-layout"><nav class="rail-nav" aria-label="榜别">${['热播榜', '新剧榜', '收藏榜', '第三方快照'].map((v) => B(v, 'rank', v, { variant: s.rank === v ? 'selected' : 'quiet', extra: `aria-pressed="${s.rank === v}"` })).join('')}</nav><div>${s.rank === '第三方快照' ? `<p class="muted">快照：2026年11月23日 ${s.state === 'expired' ? '· 已过期' : ''}</p>${s.state === 'expired' ? notice('快照已过期，可刷新获取新榜单。', 'ranking-refresh', '刷新快照') : ''}` : ''}${contentState(grid(items, true), '暂时没有榜单内容')}</div></div>`;
  }
  function newPage() {
    return `<div class="page-top"><h1>新剧日历</h1><span class="muted">2026年11月</span></div><div class="date-strip">${Array.from({ length: 7 }, (_, i) => B(`<small>${i === 0 ? '今天' : ['周三', '周四', '周五', '周六', '周日', '周一'][i - 1]}</small><span>${24 + i}</span>`, 'day', String(i), { variant: s.day === i ? 'selected' : 'quiet', extra: `aria-label="11月${24 + i}日" aria-pressed="${s.day === i}"` })).join('')}</div>${contentState(s.day === 0 ? `<section>${sectionHead('已上线')}${grid(all.slice(6))}</section>` : `<section>${sectionHead('待上线', B(s.reserved.has('nova') ? '取消预约' : '预约提醒', 'reservation', 'nova', { glyph: 'calendar', variant: s.reserved.has('nova') ? 'selected' : '' }))}<div class="detail-layout"><img class="detail-cover" src="${T.get('nova').poster}" alt=""><div class="detail-copy"><h2>${E(title(T.get('nova')))}</h2><p>11月${24 + s.day}日上线</p><p class="muted">上线后可在「我的 · 预约」中查看。</p></div></div></section>`, '这一天暂无上新')}`;
  }
  function search() {
    const q = s.query.trim().toLowerCase(),
      pinyin = {
        song: 'cxrs',
        northeast: 'sfrlzd b',
        eighties: 'cybl',
        exam: 'qqsk',
        basin: 'jp',
        demon: 'ym',
        mortal: 'fr',
        marriage: 'hy',
        demons: 'zj',
        guard: 'sw',
        nova: 'xx',
      };
    const results = !s.searched
      ? all.slice(0, 4)
      : all.filter(
          (d) =>
            d.title.includes(q) ||
            d.tags.some((v) => v.includes(q)) ||
            (pinyin[d.id] || '').replaceAll(' ', '').includes(q),
        );
    return `<div class="search-layout"><div class="search-left"><form class="search-form" id="search-form"><label style="flex:1;min-width:0"><span class="sr-only">剧名或拼音首字母</span><input class="field" id="query" name="query" placeholder="剧名 / 拼音首字母" value="${E(s.query)}" autocomplete="off"></label>${B('搜索', 'submit-search', '', { glyph: 'search', iconOnly: true, type: 'submit' })}</form><div class="keyboard" aria-label="遥控搜索键盘">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .map((v) => B(v, 'key', v, { extra: `aria-label="字母 ${v}"` }))
      .join(
        '',
      )}${B('退格', 'key', 'backspace', { glyph: 'back', className: 'wide' })}${B('清空', 'key', 'clear', { className: 'wide' })}</div><div>${sectionHead('搜索记录', B('清空', 'clear-search', '', { variant: 'quiet' }))}<div class="search-hist">${s.history.length ? s.history.map((v) => B(E(v), 'history-query', v, { variant: 'quiet' })).join('') : '<span class="muted">暂无搜索记录</span>'}</div></div></div><div class="search-results"><div class="section-head"><h1>${s.searched ? '搜索结果' : '大家都在看'}</h1>${s.searched ? `<span class="muted">${results.length}部</span>` : ''}</div>${s.state === 'error' ? notice('搜索失败，输入与已有结果已保留。') : ''}${contentState(results.length ? grid(results) : empty('没有找到相关短剧', '试试更短的剧名或拼音首字母。', '', ''), '没有找到相关短剧')}</div></div>`;
  }
  const shelfNames = {
    history: '继续观看',
    favorites: '收藏',
    following: '追更',
    reservations: '预约',
  };
  function shelfItems(key) {
    return listIds(
      key === 'history'
        ? s.watched
        : key === 'favorites'
          ? [...s.favorite]
          : key === 'following'
            ? [...s.follow]
            : [...s.reserved],
    );
  }
  function historyList(items) {
    return `<div class="history-list">${items.map((d, i) => `<div class="history-entry"><button class="continue-item" data-action="resume" data-value="${d.id}" data-key="resume:${d.id}" aria-label="继续观看${E(title(d))}第${8 + i * 3}集"><img src="${d.poster}" alt=""><span class="continue-copy"><strong>${E(title(d))}</strong><span class="muted">第${8 + i * 3}集 · 已看 ${36 + i * 7}%</span><span class="progress" style="--progress:${36 + i * 7}%"><span></span></span></span>${I('play')}</button>${B('查看详情', 'detail', d.id, { glyph: 'forward', iconOnly: true, variant: 'quiet' })}</div>`).join('')}</div>`;
  }
  function accountEntry() {
    const guest = s.state === 'guest' || !s.signedIn;
    const label = guest ? '登录账号' : '账号与同步';
    return B(
      `<span class="avatar">${I('user')}</span><span class="account-copy"><span class="account-name">${guest ? '游客' : '设计账号'}</span><span class="account-action">${label}</span></span>${I('forward')}`,
      'go',
      'account',
      { variant: 'quiet', className: 'account-trigger', extra: `aria-label="${label}"` },
    );
  }
  function mine() {
    return `<h1 class="sr-only">我的片库</h1><div class="account-strip">${accountEntry()}</div><div class="chips">${Object.entries(
      shelfNames,
    )
      .map(([k, v]) =>
        B(v, 'shelf', k, {
          variant: s.shelf === k ? 'selected' : 'quiet',
          extra: `aria-pressed="${s.shelf === k}"`,
        }),
      )
      .join(
        '',
      )}</div>${s.state === 'error' ? notice('账号同步失败，本机记录仍可观看。', 'sync-retry', '重试同步') : ''}<div class="section-head"><h2>${shelfNames[s.shelf]}</h2>${goButton(s.shelf === 'history' ? '管理记录' : '查看全部', s.shelf, s.shelf === 'history' ? 'list' : 'forward')}</div>${s.state === 'empty' || !shelfItems(s.shelf).length ? empty('这里还没有短剧', '找到喜欢的内容后，可以从这里继续。') : s.shelf === 'history' ? historyList(shelfItems(s.shelf)) : grid(shelfItems(s.shelf))}`;
  }
  function collection(key) {
    const isHistory = key === 'history',
      items = shelfItems(key),
      labels = {
        history: '还没有观看记录',
        favorites: '还没有收藏',
        following: '还没有追更',
        reservations: '还没有预约',
      };
    return `<div class="page-top"><h1>${shelfNames[key]}</h1><div class="trailing row">${isHistory ? B('观看统计', 'statistics', '', { variant: 'quiet', glyph: 'chart' }) : ''}${B(s.manage ? '完成' : '管理', 'manage', '', { variant: s.manage ? 'selected' : 'quiet' })}</div></div>${s.state === 'guest' && key !== 'history' ? `<div class="notice"><span>登录后可同步${shelfNames[key]}。</span>${goButton('登录账号', 'account', 'user')}</div>` : ''}${s.state === 'error' ? notice('同步失败，本机内容已保留。', 'sync-retry', '重试同步') : ''}${s.manage ? `<div class="chips">${B('全选', 'select-all')}${B(`移除${s.selected.size ? ' ' + s.selected.size + ' 部' : ''}`, 'remove-selected', '', { variant: 'destructive', disabled: !s.selected.size })}${isHistory ? B('清空本机历史', 'clear-history', '', { variant: 'destructive' }) : ''}</div>` : ''}${s.state === 'empty' || !items.length ? empty(labels[key], '去发现下一部想看的短剧。') : isHistory && !s.manage ? historyList(items) : grid(items, false, s.manage)}`;
  }
  function episodeGrid(start = s.range, count = 30) {
    const d = drama(),
      end = Math.min(start + count, d.episodes);
    return `<div class="episode-grid" aria-label="选集">${Array.from(
      { length: Math.max(0, end - start) },
      (_, i) => {
        const n = start + i + 1,
          locked = s.state === 'locked' && n > 10;
        return B(locked ? `${n} ${I('lock')}` : String(n), 'episode', String(n), {
          className: n === s.episode ? 'playing' : '',
          extra: `aria-label="第${n}集${locked ? '，需登录解锁' : ''}${n === s.episode ? '，当前播放' : ''}" ${n === s.episode ? 'aria-current="true"' : ''}`,
        });
      },
    ).join('')}</div>`;
  }
  function episodeRanges() {
    return `<div class="chips range-strip" aria-label="选集范围">${Array.from({ length: Math.ceil(drama().episodes / 30) }, (_, i) => B(`${i * 30 + 1}–${Math.min((i + 1) * 30, drama().episodes)}`, 'range', String(i * 30), { variant: s.range === i * 30 ? 'selected' : 'quiet', extra: `aria-pressed="${s.range === i * 30}"` })).join('')}</div>`;
  }
  function detail() {
    const d = drama(),
      up = s.state === 'upcoming';
    return contentState(
      `<div class="detail-layout"><img class="detail-cover" src="${d.poster}" alt="${E(d.title)}封面"><div class="detail-copy"><h1>${E(d.title)}</h1><p>${E(d.tags.join(' · '))} · ${up ? '待上线' : d.status === 'updating' ? '更新中' : `全${d.episodes}集`}</p>${s.state !== 'missing' && d.description ? `<p class="description">${E(d.description)}</p>${B('完整简介', 'synopsis', '', { variant: 'quiet' })}` : ''}<div class="detail-actions">${up ? B(s.reserved.has(d.id) ? '取消预约' : '预约上线提醒', 'reservation', d.id, { glyph: 'calendar', variant: 'primary', className: 'play' }) : B(`播放第${s.episode}集`, 'play', '', { glyph: 'play', variant: 'primary', className: 'play' })}${B(s.favorite.has(d.id) ? '已收藏' : '收藏', 'favorite', d.id, { glyph: s.favorite.has(d.id) ? 'bookmark' : 'bookmark', variant: s.favorite.has(d.id) ? 'selected' : '', extra: `aria-pressed="${s.favorite.has(d.id)}"` })}${B(s.follow.has(d.id) ? '已追更' : '追更', 'follow', d.id, { glyph: 'bell', variant: s.follow.has(d.id) ? 'selected' : '', extra: `aria-pressed="${s.follow.has(d.id)}"` })}</div></div></div>${up ? `<section class="section">${notice('尚未上线，预约后可在「我的 · 预约」中查看。', 'reservation', '预约提醒')}</section>` : `<section class="episodes">${sectionHead('选集', B(d.seasonNumber ? `第${d.seasonNumber}季` : '当前剧集', 'series', '', { glyph: 'list', variant: 'quiet' }))}${episodeRanges()}${episodeGrid()}</section>`}`,
    );
  }
  const time = (n) => `0${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  function player() {
    const d = drama(),
      failed = s.state === 'error',
      buffer = s.state === 'buffering';
    return `<section class="player ${s.controls ? '' : 'hidden-controls'}" aria-label="${E(d.title)}播放器"><img class="video-poster" src="${d.poster}" alt="剧集封面，设计样例播放器"><div class="player-back" ${!s.controls || s.drawer ? 'inert' : ''}>${B('返回详情', 'back', '', { glyph: 'back', variant: 'quiet', iconOnly: true })}<h1>${E(title(d))} · 第${s.episode}集</h1></div>${failed ? `<div class="play-status">${I('circle-alert')}<h2>播放失败</h2><p>暂时无法连接片源</p>${B('重新加载', 'retry-play', '', { glyph: 'refresh' })}</div>` : buffer ? `<div class="play-status">${I('loader-circle')}<h2>正在缓冲</h2></div>` : s.paused ? `<div class="play-status">${I('pause')}<h2>已暂停</h2></div>` : ''}<div class="player-controls" ${!s.controls || s.drawer ? 'inert' : ''}><div class="seek-row"><span>${time(s.seek)}</span><input type="range" id="seek" aria-label="播放进度" min="0" max="120" value="${s.seek}"><span>02:00</span></div><div class="player-actions">${B(s.paused ? '播放' : '暂停', 'toggle-play', '', { glyph: s.paused ? 'play' : 'pause', iconOnly: true })}${B('下一集', 'next', '', { glyph: 'next', disabled: s.episode >= d.episodes })}${B('选集', 'drawer', 'episodes', { glyph: 'list' })}${B(`${s.rate}×`, 'drawer', 'rate')}${B('片源', 'drawer', 'source', { className: 'end', glyph: 'list' })}${B('音量', 'drawer', 'volume', { glyph: 'volume', iconOnly: true })}${B('设置', 'drawer', 'preferences', { glyph: 'settings', iconOnly: true })}</div></div>${s.drawer ? playerDrawer() : ''}</section>`;
  }
  function playerDrawer() {
    const body =
      s.drawer === 'episodes'
        ? `${episodeRanges()}${episodeGrid()}`
        : s.drawer === 'rate'
          ? `<div class="chips">${['0.75', '1', '1.25', '1.5', '2'].map((v) => B(`${v}×`, 'rate', v, { variant: s.rate === v ? 'selected' : '', extra: `aria-pressed="${s.rate === v}"` })).join('')}</div>`
          : s.drawer === 'source'
            ? '<p class="muted">当前片源未提供可切换的清晰度，按原始片源播放。</p>'
            : s.drawer === 'volume'
              ? `<label class="row">音量 ${s.volume}% <input id="volume" type="range" min="0" max="100" value="${s.volume}" aria-label="音量"></label>`
              : `${toggleRow('自动播放下一集', 'autoplayNext')}${toggleRow('记住播放位置', 'rememberPosition')}`;
    return `<div class="player-drawer" aria-label="播放参数"><div class="section-head"><h2>${{ episodes: '选集', rate: '播放倍速', source: '片源', volume: '音量', preferences: '播放设置' }[s.drawer]}</h2>${B('关闭面板', 'close-drawer', '', { glyph: 'close', iconOnly: true, variant: 'quiet' })}</div>${body}</div>`;
  }
  function toggleRow(label, key) {
    return `<div class="setting-row"><span>${label}</span><button class="switch" role="switch" aria-label="${label}" aria-checked="${s.prefs[key]}" data-action="toggle" data-value="${key}" data-key="toggle:${key}"></button></div>`;
  }
  function account() {
    const signed = ['signedin', 'mergeerror'].includes(s.state) || s.signedIn;
    if (signed)
      return `<div class="account-layout"><nav class="rail-nav">${B('账号信息', 'login-method', 'profile', { variant: 'selected' })}${goButton('返回片库', 'mine', 'back')}</nav><div class="column"><h1>账号与同步</h1><div class="setting-row"><div class="row">${I('user')}<span>设计账号</span></div>${B('退出登录', 'logout', '', { variant: 'quiet' })}</div>${s.state === 'error' ? notice('同步失败，请检查网络后重试。', 'sync-retry', '重试同步') : '<p class="muted">本机记录与账号记录分开保存。</p>'}<div class="setting-row"><span>登录前的本机历史</span>${B('合并到账号', 'merge', '', { variant: 'quiet' })}</div>${s.state === 'mergeerror' ? notice('历史合并失败，本机原记录已保留。', 'merge', '重新合并') : ''}</div></div>`;
    return `<div class="account-layout"><nav class="rail-nav" aria-label="登录方式">${B('扫码登录', 'login-method', 'qr', { glyph: 'qr', variant: s.login === 'qr' ? 'selected' : 'quiet' })}${B('手机号登录', 'login-method', 'phone', { glyph: 'monitor', variant: s.login === 'phone' ? 'selected' : 'quiet' })}</nav><div><h1>登录账号</h1>${s.login === 'qr' ? `<div class="login-surface"><div class="qr-placeholder">${I(s.state === 'expired' ? 'refresh-cw' : 'qr')}<span class="muted">${s.state === 'expired' ? '二维码已过期' : '登录码占位'}</span></div><div class="login-copy"><h2>${s.state === 'confirm' ? '请在手机上确认' : '使用手机扫码登录'}</h2><p class="muted">${s.state === 'confirm' ? '确认后返回电视继续。' : '登录后同步你的收藏、追更和预约。'}</p>${s.state === 'expired' ? B('刷新二维码', 'refresh-qr', '', { glyph: 'refresh' }) : s.state === 'confirm' ? B('取消登录', 'cancel-login', '', { variant: 'quiet' }) : '<p class="muted">原型不生成有效登录凭据。</p>'}</div></div>` : `<form class="phone-form" id="phone-form"><label>手机号<input class="field" type="tel" inputmode="tel" name="phone" autocomplete="tel" required pattern="1[0-9]{10}" value="${E(s.phone)}" ${s.sms ? 'readonly' : ''} placeholder="输入11位手机号"></label>${s.sms ? `<p class="muted">验证码接收号码：${E(s.phone)}</p><label>短信验证码<input class="field" inputmode="numeric" name="code" autocomplete="one-time-code" required pattern="[0-9]{4,6}" value="${E(s.code)}" placeholder="输入验证码"></label>` : ''}${B(s.sms ? '确认验证码' : '获取验证码', 'phone-submit', '', { type: 'submit', variant: 'primary' })}${s.sms ? B('更换手机号', 'change-phone', '', { variant: 'quiet' }) : ''}<p class="muted">仅演示表单状态，不发送短信或登录请求。</p></form>`}${s.state === 'error' ? notice('登录服务暂时不可用，请稍后重试。', 'refresh-qr', '重试') : ''}</div></div>`;
  }
  function settings() {
    const groups = {
      playback: '播放',
      appearance: '外观',
      account: '账号',
      updates: '应用更新',
      local: '本机数据',
      about: '关于与帮助',
    };
    let body = '';
    if (s.setting === 'playback')
      body = `${toggleRow('自动播放下一集', 'autoplayNext')}${toggleRow('记住播放位置', 'rememberPosition')}<div class="setting-row"><span>默认倍速</span><div class="row">${['0.75', '1', '1.25', '1.5', '2'].map((v) => B(`${v}×`, 'rate', v, { variant: s.rate === v ? 'selected' : 'quiet' })).join('')}</div></div>`;
    if (s.setting === 'appearance')
      body = `<div class="setting-row"><span>主题</span><div class="row">${[
        ['system', '跟随系统'],
        ['dark', '深色'],
        ['light', '浅色'],
      ]
        .map(([v, n]) => B(n, 'theme', v, { variant: s.theme === v ? 'selected' : 'quiet' }))
        .join('')}</div></div>`;
    if (s.setting === 'account')
      body = `<div class="setting-row"><span>${s.signedIn ? '设计账号' : '尚未登录'}</span>${goButton('管理账号', 'account', 'user')}</div>`;
    if (s.setting === 'updates')
      body =
        s.state === 'unavailable'
          ? '<p class="muted">当前宿主未提供更新服务。</p>'
          : `${toggleRow('自动检查更新', 'autoCheckUpdates')}<div class="setting-row"><div class="row-copy">检查应用更新<small>${s.update === 'checked' ? '当前设计样例已是最新版本' : '更新由电视宿主提供'}</small></div>${B(s.update === 'checking' ? '检查中…' : '检查更新', 'check-update', '', { disabled: s.update === 'checking' })}</div>`;
    if (s.setting === 'local')
      body = `<div class="setting-row"><div class="row-copy">恢复默认设置<small>重置本机偏好，保留观看记录和收藏。</small></div>${B('恢复默认', 'reset-prefs', '', { variant: 'quiet' })}</div>`;
    if (s.setting === 'about')
      body = `${Object.entries({ about: '关于红果', support: '支持与打赏', apps: '应用推荐' })
        .map(
          ([k, v]) =>
            `<div class="setting-row"><span>${v}</span>${goButton('查看', k, 'forward')}</div>`,
        )
        .join('')}`;
    return `<div class="settings-layout"><nav class="rail-nav" aria-label="设置分组">${Object.entries(
      groups,
    )
      .map(([k, v]) =>
        B(v, 'setting', k, {
          variant: s.setting === k ? 'selected' : 'quiet',
          extra: `aria-pressed="${s.setting === k}"`,
        }),
      )
      .join(
        '',
      )}</nav><div class="settings-content"><h1>${groups[s.setting]}</h1>${s.state === 'error' ? notice('设置保存失败，已恢复原值。', 'retry', '重试保存') : ''}${body}</div></div>`;
  }
  function textPage() {
    if (s.screen === 'about')
      return `<div class="text-page"><div class="brand"><img src="assets/media/brand-logo.png" alt="红果短剧"></div><h1>让短剧回到大屏</h1><p>Android TV 独立界面设计。使用遥控器浏览、选集和继续观看。</p><div class="row">${goButton('支持与打赏', 'support', 'heart')}${goButton('应用推荐', 'apps', 'list')}${B('版本信息', 'version-info', '', { variant: 'quiet' })}</div></div>`;
    return `<div class="text-page"><h1>${names[s.screen]}</h1><p>${s.screen === 'support' ? '感谢你的支持。当前没有配置可用的支持说明或打赏资产。' : '当前没有配置可用的应用推荐。'}</p>${goButton('返回设置', 'settings', 'back')}</div>`;
  }
  function components() {
    return `<div class="page-top"><h1>TV 候选组件</h1><span class="muted">960 × 540 · 遥控器</span></div><div class="spec-grid"><section><h2>操作与焦点</h2><div class="row">${B('立即播放', 'spec', '', { variant: 'primary', glyph: 'play', className: 'play' })}${B('已收藏', 'spec', 'saved', { variant: 'selected' })}${B('已聚焦', 'spec', 'focus', { className: 'force-focus' })}${B('不可用', 'spec', 'disabled', { disabled: true })}</div></section><section><h2>输入与开关</h2><label><span class="sr-only">剧名</span><input class="field" placeholder="输入剧名"></label>${toggleRow('自动播放下一集', 'autoplayNext')}</section><section><h2>选集</h2>${episodeGrid(0, 10)}</section><section><h2>结果反馈</h2>${notice('加载失败，保留当前内容。')}</section><section><h2>账号入口</h2>${accountEntry()}</section></div>`;
  }
  const renderers = {
    home,
    discover,
    rank: ranking,
    new: newPage,
    search,
    mine,
    history: () => collection('history'),
    favorites: () => collection('favorites'),
    following: () => collection('following'),
    reservations: () => collection('reservations'),
    detail,
    player,
    account,
    settings,
    about: textPage,
    support: textPage,
    apps: textPage,
    components,
  };
  function selectedNav() {
    return ['discover', 'search', 'new'].includes(s.screen)
      ? 'discover'
      : s.screen === 'rank'
        ? 'rank'
        : [
              'mine',
              'history',
              'favorites',
              'following',
              'reservations',
              'account',
              'settings',
              'about',
              'support',
              'apps',
            ].includes(s.screen)
          ? 'mine'
          : 'home';
  }
  function header() {
    return `<header class="app-header"><div class="brand"><img src="assets/media/brand-logo.png" alt="红果短剧"></div><nav class="main-nav" aria-label="主导航">${['home', 'discover', 'rank', 'mine'].map((k) => B(names[k], 'nav', k, { className: 'nav', variant: selectedNav() === k ? 'selected' : 'quiet', extra: selectedNav() === k ? 'aria-current="page"' : '' })).join('')}</nav><div class="tools">${B('搜索', 'go', 'search', { glyph: 'search', iconOnly: true, variant: 'quiet' })}${B('设置', 'go', 'settings', { glyph: 'settings', iconOnly: true, variant: 'quiet' })}</div></header>`;
  }
  function render(key) {
    if (!states[s.screen].includes(s.state)) s.state = 'ready';
    const sub = [
      'detail',
      'account',
      'settings',
      'about',
      'support',
      'apps',
      'components',
    ].includes(s.screen);
    root.innerHTML =
      s.screen === 'player'
        ? player()
        : `${sub ? `<header class="sub-header">${B('返回', 'back', '', { glyph: 'back', variant: 'quiet' })}<span class="muted">${names[s.screen]}</span>${s.screen === 'detail' ? B('搜索', 'go', 'search', { glyph: 'search', iconOnly: true, variant: 'quiet', className: 'trailing' }) : ''}</header>` : header()}<div class="page" id="page">${renderers[s.screen]()}</div>`;
    document.documentElement.dataset.theme =
      s.theme === 'system'
        ? matchMedia('(prefers-color-scheme:dark)').matches
          ? 'dark'
          : 'light'
        : s.theme;
    document.body.style.setProperty('--font', s.font);
    document.body.dataset.safe = s.safe;
    syncTypography();
    C.syncRanges(root);
    const strip = root.querySelector('.range-strip'),
      selected = strip?.querySelector('[aria-pressed="true"]');
    if (selected)
      strip.scrollLeft = Math.max(
        0,
        selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2,
      );
    syncReview();
    if (key) focusKey(key);
    fit();
  }
  function syncReview() {
    const screenSelect = document.querySelector('#review-screen');
    screenSelect.innerHTML = Object.entries(names)
      .map(([k, v]) => `<option value="${k}" ${s.screen === k ? 'selected' : ''}>${v}</option>`)
      .join('');
    document.querySelector('#review-state').innerHTML = states[s.screen]
      .map(
        (v) => `<option value="${v}" ${s.state === v ? 'selected' : ''}>${stateNames[v]}</option>`,
      )
      .join('');
    document.querySelector('#review-theme').value = s.theme === 'system' ? 'dark' : s.theme;
    document.querySelector('#review-font').value = s.font;
    document.querySelector('#review-safe').value = s.safe;
    const p = new URLSearchParams({
      screen: s.screen,
      state: s.state,
      id: s.id,
      theme: s.theme,
      font: s.font,
      safe: s.safe,
    });
    if (document.querySelector('#review').hidden) p.set('review', '0');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }
  const focusKey = (key) => {
    const el = [...root.querySelectorAll('[data-key]')].find((el) => el.dataset.key === key);
    if (el) el.focus({ preventScroll: true });
    return el;
  };
  function focusFirst() {
    const scope = s.drawer ? root.querySelector('.player-drawer') : root;
    scope?.querySelector('button:not(:disabled),input')?.focus({ preventScroll: true });
  }
  function snapshot() {
    return {
      screen: s.screen,
      state: s.state,
      key: document.activeElement?.dataset.key,
      scroll: document.querySelector('#page')?.scrollTop || 0,
      id: s.id,
      range: s.range,
    };
  }
  function go(screen, { replace = false, id } = {}) {
    if (!replace) s.stack.push(snapshot());
    s.screen = screen;
    s.state = 'ready';
    s.drawer = '';
    s.manage = false;
    s.selected.clear();
    if (id) s.id = id;
    if (screen === 'player') {
      s.controls = true;
      s.paused = false;
      s.range = Math.floor((s.episode - 1) / 30) * 30;
    }
    render();
    focusFirst();
  }
  function back(skipControls = false) {
    if (s.drawer) {
      s.drawer = '';
      render('drawer:episodes');
      return;
    }
    if (s.screen === 'player' && s.seeking) {
      s.seek = s.seekSaved;
      s.seeking = false;
      render();
      root.querySelector('#seek')?.focus();
      return;
    }
    if (!skipControls && s.screen === 'player' && s.controls && s.state !== 'error') {
      s.controls = false;
      render();
      root.focus({ preventScroll: true });
      return;
    }
    const prev = s.stack.pop();
    if (prev) {
      Object.assign(s, { screen: prev.screen, state: prev.state, id: prev.id, range: prev.range });
      render();
      const page = document.querySelector('#page');
      if (page) page.scrollTop = prev.scroll;
      focusKey(prev.key) || focusFirst();
    } else if (['home', 'discover', 'rank', 'mine'].includes(s.screen))
      openDialog(
        '退出红果？',
        '下次打开后可以继续观看。',
        B('继续观看', 'close-modal', '', { extra: 'autofocus' }) +
          B('退出应用', 'demo-exit', '', { variant: 'destructive' }),
      );
    else {
      s.screen = s.screen === 'player' ? 'detail' : 'home';
      s.state = 'ready';
      render();
      focusFirst();
    }
  }
  function openDialog(title, body, actions = '') {
    modal.innerHTML = `<h2 id="modal-title">${title}</h2>${body.startsWith('<') ? body : `<p>${body}</p>`}${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
    modal.showModal();
  }
  function toast(text) {
    const node = document.querySelector('#toast');
    node.textContent = text;
    node.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('visible'), 2400);
  }
  const closeDialog = () => modal.close();
  function rerender(key = document.activeElement?.dataset.key) {
    const scroll = document.querySelector('#page')?.scrollTop;
    render(key);
    if (scroll) document.querySelector('#page').scrollTop = scroll;
  }
  function handle(action, value, el) {
    const key = el?.dataset.key;
    switch (action) {
      case 'nav':
        s.stack = [];
        go(value, { replace: true });
        break;
      case 'go':
        go(value);
        break;
      case 'back':
        back(true);
        break;
      case 'detail':
        s.episode = 8;
        s.range = 0;
        go('detail', { id: value });
        break;
      case 'resume':
        s.episode = 8 + Math.max(0, s.watched.indexOf(value)) * 3;
        go('player', { id: value });
        break;
      case 'play':
        go('player');
        break;
      case 'episode':
        if (s.state === 'locked' && Number(value) > 10) {
          openDialog(
            '这集需要登录',
            '登录后返回这里，重新选择要播放的集数。',
            B('取消', 'close-modal', '', { extra: 'autofocus' }) +
              B('去登录', 'login-from-dialog', '', { variant: 'primary' }),
          );
          break;
        }
        s.episode = Number(value);
        if (s.screen === 'player') {
          s.drawer = '';
          s.controls = true;
          s.paused = false;
          render('drawer:episodes');
        } else go('player');
        break;
      case 'range':
        s.range = Number(value);
        rerender(key);
        break;
      case 'synopsis':
        openDialog(
          E(drama().title),
          E(drama().description),
          B('关闭', 'close-modal', '', { extra: 'autofocus' }),
        );
        break;
      case 'series':
        openDialog(
          '系列与季',
          `<p>当前已知：${E(drama().title)}</p><p>没有其他已确认的季记录。</p>`,
          B('返回选集', 'close-modal', '', { extra: 'autofocus' }),
        );
        break;
      case 'favorite': {
        const id = value || s.id;
        s.favorite.has(id) ? s.favorite.delete(id) : s.favorite.add(id);
        rerender(key);
        toast(s.favorite.has(id) ? '已收藏' : '已取消收藏');
        break;
      }
      case 'follow': {
        const id = value || s.id;
        s.follow.has(id) ? s.follow.delete(id) : s.follow.add(id);
        rerender(key);
        toast(s.follow.has(id) ? '已追更' : '已取消追更');
        break;
      }
      case 'reservation':
        if (s.reserved.has(value))
          openDialog(
            '取消这部剧的预约？',
            E(title(T.get(value))),
            B('保留预约', 'close-modal', '', { extra: 'autofocus' }) +
              B('取消预约', 'confirm-reservation', value, { variant: 'destructive' }),
          );
        else {
          s.reserved.add(value);
          rerender(key);
          toast('已预约');
        }
        break;
      case 'confirm-reservation':
        s.reserved.delete(value);
        closeDialog();
        rerender();
        toast('已取消预约');
        break;
      case 'genre':
        s.genre = value;
        s.state = 'ready';
        rerender(key);
        break;
      case 'rank':
        s.rank = value;
        rerender(key);
        break;
      case 'ranking-refresh':
        s.state = 'ready';
        rerender(key);
        toast('榜单样例已刷新');
        break;
      case 'day':
        s.day = Number(value);
        rerender(key);
        break;
      case 'shelf':
        s.shelf = value;
        rerender(key);
        break;
      case 'refresh-recommend':
        s.recommend = s.recommend
          ? all.slice(0, 6)
          : [...all.slice(5), ...all.slice(0, 1)].slice(0, 6);
        rerender(key);
        break;
      case 'key':
        s.query =
          value === 'clear' ? '' : value === 'backspace' ? s.query.slice(0, -1) : s.query + value;
        s.searched = !!s.query;
        s.state = 'ready';
        rerender(key);
        break;
      case 'history-query':
        s.query = value;
        submitSearch(key);
        break;
      case 'submit-search':
        break; // Native form submit owns Enter, including IME composition.
      case 'clear-search':
        openDialog(
          '清空搜索记录？',
          '只清除这台设备上的搜索记录。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('清空记录', 'confirm-clear-search', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-clear-search':
        s.history = [];
        closeDialog();
        rerender('clear-search:');
        break;
      case 'manage':
        s.manage = !s.manage;
        s.selected.clear();
        rerender(key);
        break;
      case 'select':
        s.selected.has(value) ? s.selected.delete(value) : s.selected.add(value);
        rerender(key);
        break;
      case 'select-all':
        shelfItems(s.screen).forEach((d) => s.selected.add(d.id));
        rerender(key);
        break;
      case 'remove-selected':
        openDialog(
          `移除已选择的${s.selected.size}部短剧？`,
          '仅影响当前列表，其他收藏和观看记录不受影响。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('确认移除', 'confirm-remove', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-remove':
        if (s.screen === 'history') s.watched = s.watched.filter((v) => !s.selected.has(v));
        else {
          const set =
            s.screen === 'favorites'
              ? s.favorite
              : s.screen === 'following'
                ? s.follow
                : s.reserved;
          s.selected.forEach((v) => set.delete(v));
        }
        s.selected.clear();
        closeDialog();
        rerender('manage:');
        toast('已移除');
        break;
      case 'clear-history':
        openDialog(
          '清空本机观看历史？',
          '这台设备将不再显示续播记录；账号记录与观看统计不受影响。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('清空本机历史', 'confirm-clear-history', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-clear-history':
        s.watched = [];
        closeDialog();
        rerender('manage:');
        toast('本机历史已清空');
        break;
      case 'statistics':
        openDialog(
          '观看统计',
          `<p>本机累计观看：${s.statistics}分钟</p><p>统计独立于观看历史，仅为设计样例。</p>`,
          B('关闭', 'close-modal', '', { extra: 'autofocus' }) +
            B('重置统计', 'reset-statistics', '', { variant: 'quiet' }),
        );
        break;
      case 'reset-statistics':
        closeDialog();
        openDialog(
          '重置本机观看统计？',
          '观看历史和续播位置会保留。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('重置', 'confirm-statistics', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-statistics':
        s.statistics = 0;
        closeDialog();
        toast('样例统计已重置');
        break;
      case 'toggle-play':
        s.paused = !s.paused;
        rerender(key);
        break;
      case 'next':
        if (s.episode < drama().episodes) {
          s.episode++;
          s.seek = 0;
          s.seekSaved = 0;
          s.range = Math.floor((s.episode - 1) / 30) * 30;
          rerender(key);
          toast(`第${s.episode}集`);
        }
        break;
      case 'drawer':
        s.drawer = value;
        s.controls = true;
        render();
        root.querySelector('.player-drawer button')?.focus();
        break;
      case 'close-drawer': {
        const drawer = s.drawer;
        s.drawer = '';
        render(`drawer:${drawer}`);
        break;
      }
      case 'rate':
        s.rate = value;
        rerender(key);
        toast(`播放倍速 ${value}×`);
        break;
      case 'toggle':
        s.prefs[value] = !s.prefs[value];
        rerender(key);
        break;
      case 'retry-play':
        s.state = 'ready';
        s.controls = true;
        render('toggle-play:');
        break;
      case 'login-method':
        s.login = value;
        rerender(key);
        break;
      case 'refresh-qr':
        s.state = 'ready';
        rerender(key);
        toast('已回到扫码准备状态');
        break;
      case 'cancel-login':
        s.state = 'ready';
        rerender(key);
        break;
      case 'phone-submit':
        break;
      case 'change-phone':
        s.sms = false;
        s.code = '';
        rerender();
        document.querySelector('[name=phone]')?.focus();
        break;
      case 'login-from-dialog':
        closeDialog();
        go('account');
        break;
      case 'logout':
        openDialog(
          '退出当前账号？',
          '退出后显示游客本机记录。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('退出登录', 'confirm-logout', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-logout':
        s.signedIn = false;
        s.state = 'guest';
        closeDialog();
        render();
        focusFirst();
        break;
      case 'merge':
        openDialog(
          '合并登录前的历史？',
          '把符合规则的较新本机记录合并到当前账号。保留游客原记录。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('确认合并', 'confirm-merge', '', { variant: 'primary' }),
        );
        break;
      case 'confirm-merge':
        closeDialog();
        s.state = 'mergeerror';
        rerender();
        toast('原型未连接账号服务');
        break;
      case 'sync-retry':
        toast('原型未连接同步服务，当前记录已保留');
        break;
      case 'setting':
        s.setting = value;
        rerender(key);
        break;
      case 'theme':
        s.theme = value;
        rerender(key);
        break;
      case 'check-update':
        s.update = 'checking';
        rerender(key);
        setTimeout(() => {
          s.update = 'checked';
          if (s.screen === 'settings') rerender('check-update:');
          toast('更新检查样例完成');
        }, 700);
        break;
      case 'reset-prefs':
        openDialog(
          '恢复默认设置？',
          '重置主题、倍速和播放偏好，保留观看记录和收藏。',
          B('取消', 'close-modal', '', { extra: 'autofocus' }) +
            B('恢复默认', 'confirm-reset-prefs', '', { variant: 'destructive' }),
        );
        break;
      case 'confirm-reset-prefs':
        s.prefs = { autoplayNext: true, rememberPosition: true, autoCheckUpdates: true };
        s.rate = '1';
        s.theme = 'dark';
        closeDialog();
        rerender('reset-prefs:');
        toast('已恢复默认设置');
        break;
      case 'version-info':
        openDialog(
          '版本信息',
          '这是候选设计原型，不是已发布的电视安装包。',
          B('关闭', 'close-modal', '', { extra: 'autofocus' }),
        );
        break;
      case 'retry':
        s.state = 'ready';
        rerender(key);
        break;
      case 'close-modal':
        closeDialog();
        break;
      case 'demo-exit':
        closeDialog();
        toast('退出交互已演示，浏览器原型保持打开');
        break;
      case 'spec':
        toast('同一套 TV 控件');
        break;
    }
  }
  function submitSearch(key = 'submit-search:') {
    s.searched = !!s.query.trim();
    s.state = 'ready';
    if (s.query.trim())
      s.history = [s.query.trim(), ...s.history.filter((v) => v !== s.query.trim())].slice(0, 5);
    rerender(key);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && !el.disabled) handle(el.dataset.action, el.dataset.value || '', el);
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'search-form') {
      e.preventDefault();
      s.query = new FormData(e.target).get('query') || '';
      submitSearch();
    }
    if (e.target.id === 'phone-form') {
      e.preventDefault();
      s.phone = String(new FormData(e.target).get('phone') || s.phone);
      if (s.sms) {
        s.code = String(new FormData(e.target).get('code') || '');
        toast('原型不提交真实验证码');
      } else {
        s.sms = true;
        rerender();
        toast('仅演示验证码输入，不发送短信');
        document.querySelector('[name=code]')?.focus();
      }
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'query') s.query = e.target.value;
    if (e.target.name === 'phone') s.phone = e.target.value;
    if (e.target.name === 'code') s.code = e.target.value;
    if (e.target.id === 'seek') {
      s.seek = Number(e.target.value);
      s.seeking = true;
      e.target.previousElementSibling.textContent = time(s.seek);
      C.syncRange(e.target);
    }
    if (e.target.id === 'volume') {
      s.volume = Number(e.target.value);
      e.target.parentElement.firstChild.textContent = `音量 ${s.volume}% `;
      C.syncRange(e.target);
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (e.target.id === 'seek') {
      s.seekSaved = s.seek;
      s.seeking = false;
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'seek' && !s.seeking) {
      s.seekSaved = s.seek;
    }
  });
  function spatial(event) {
    const current = document.activeElement,
      scope = modal.open ? modal : s.drawer ? root.querySelector('.player-drawer') : root;
    const elements = [...scope.querySelectorAll('button:not(:disabled),input,select')].filter(
      (el) =>
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== 'hidden' &&
        !(el.closest('.player-controls,.player-back') && !s.controls),
    );
    if (!elements.length) return;
    if (!elements.includes(current)) {
      elements[0].focus();
      return;
    }
    const a = current.getBoundingClientRect(),
      cx = a.x + a.width / 2,
      cy = a.y + a.height / 2,
      dir = event.key;
    const candidates = elements
      .filter((el) => el !== current)
      .map((el) => {
        const b = el.getBoundingClientRect(),
          dx = b.x + b.width / 2 - cx,
          dy = b.y + b.height / 2 - cy;
        const forward =
          dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
        const cross = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
        return { el, forward, cross, score: forward + cross * 3 };
      })
      .filter((c) => c.forward > 2)
      .sort((a, b) => a.score - b.score);
    const next = candidates[0]?.el;
    if (next) {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.closest('#review')) return;
    const input = e.target.matches('input,select,textarea');
    if (modal.open) {
      if (e.key.startsWith('Arrow') && !input) {
        e.preventDefault();
        spatial(e);
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'BrowserBack') {
      e.preventDefault();
      back();
      return;
    }
    if (s.screen === 'player' && e.target.id === 'seek') {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (!s.seeking) s.seekSaved = s.seek;
        s.seeking = true;
        s.seek = Math.max(0, Math.min(120, s.seek + (e.key === 'ArrowRight' ? 5 : -5)));
        e.target.value = s.seek;
        e.target.previousElementSibling.textContent = time(s.seek);
        C.syncRange(e.target);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        s.seekSaved = s.seek;
        s.seeking = false;
        toast(`跳转到 ${time(s.seek)}`);
        return;
      }
    }
    if (input && e.target.type !== 'range') return;
    if (s.screen === 'player' && !s.drawer && !s.controls) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') s.drawer = 'episodes';
        else if (e.key === 'Enter' || e.key === ' ') s.paused = !s.paused;
        s.controls = true;
        render();
        focusFirst();
      }
      return;
    }
    if (e.key.startsWith('Arrow') && !input) {
      e.preventDefault();
      spatial(e);
    }
  });
  document.querySelector('#review-screen').addEventListener('change', (e) => {
    s.stack = [];
    s.screen = e.target.value;
    s.state = 'ready';
    s.drawer = '';
    s.manage = false;
    s.controls = true;
    render();
  });
  document.querySelector('#review-state').addEventListener('change', (e) => {
    s.state = e.target.value;
    if (s.state === 'expired' && s.screen === 'rank') s.rank = '第三方快照';
    s.paused = s.state === 'paused';
    if (s.state === 'last') s.episode = drama().episodes;
    else if (s.screen === 'player') s.episode = 8;
    if (['signedin', 'mergeerror'].includes(s.state)) s.signedIn = true;
    else if (s.screen === 'account' || s.state === 'guest') s.signedIn = false;
    render();
  });
  document.querySelector('#review-theme').addEventListener('change', (e) => {
    s.theme = e.target.value;
    render();
  });
  document.querySelector('#review-font').addEventListener('change', (e) => {
    s.font = e.target.value;
    render();
  });
  document.querySelector('#review-safe').addEventListener('change', (e) => {
    s.safe = e.target.value;
    rerender();
  });
  document.querySelector('#review-hide').addEventListener('click', () => {
    document.querySelector('#review').hidden = true;
    syncReview();
    fit();
  });
  function syncTypography() {
    const effectiveScale =
      (parseFloat(getComputedStyle(document.documentElement).fontSize) / 16) * Number(s.font);
    document.body.dataset.textSize =
      effectiveScale >= 1.75 ? 'extra-large' : effectiveScale >= 1.25 ? 'large' : 'standard';
  }
  function fit() {
    syncTypography();
    const viewport = document.querySelector('#viewport').getBoundingClientRect(),
      tokens = getComputedStyle(document.body),
      width = parseFloat(tokens.getPropertyValue('--canvas-inline')),
      height = parseFloat(tokens.getPropertyValue('--canvas-block')),
      scale = Math.min(viewport.width / width, viewport.height / height);
    document.body.style.setProperty('--fit', scale);
    document.body.style.setProperty('--stage-center-x', `${viewport.x + viewport.width / 2}px`);
    document.body.style.setProperty('--stage-center-y', `${viewport.y + viewport.height / 2}px`);
    document.querySelector('#review-metrics').textContent =
      `${width}×${height} · ${scale.toFixed(2)}×`;
  }
  addEventListener('resize', fit);
  if ('ResizeObserver' in globalThis) {
    const observer = new ResizeObserver(fit);
    observer.observe(document.querySelector('#viewport'));
    observer.observe(document.querySelector('#type-scale-probe'));
  }
  if (params.get('review') === '0') document.querySelector('#review').hidden = true;
  const style = document.createElement('style');
  style.textContent =
    '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}#review[hidden]{display:none}';
  document.head.append(style);
  root.tabIndex = -1;
  s.paused = s.state === 'paused';
  if (s.state === 'last') s.episode = drama().episodes;
  if (['signedin', 'mergeerror'].includes(s.state)) s.signedIn = true;
  if (s.state === 'expired' && s.screen === 'rank') s.rank = '第三方快照';
  render();
  if (s.screen === 'home') focusKey('play:');
  else if (s.screen === 'detail') focusKey('play:');
})();
