(() => {
  "use strict";
  const T = window.Theater,
    $ = (s) => document.querySelector(s),
    main = $("#main");
  const store = {
    get(k, f) {
      try {
        return JSON.parse(localStorage.getItem("night-theater:" + k)) ?? f;
      } catch {
        return f;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("night-theater:" + k, JSON.stringify(v));
      } catch {}
    },
  };
  let saved = structuredClone(store.get("library-real-v1", T.initial));
  for (const k of Object.keys(T.initial))
    if (!Array.isArray(saved[k])) saved[k] = structuredClone(T.initial[k]);
  let state = {
    page: "home",
    drama: "song",
    episodePage: 0,
    genre: "全部",
    query: "",
    sort: "curated",
    feedChannel: "16",
    feedIndex: 0,
    season: 11,
    episode: 1,
    position: 0,
    playing: false,
    controls: true,
    volume: true,
    auth: "login",
    logged: store.get("logged", false),
    accountMethod: "qr",
  };
  let timer = null,
    toastTimer = null,
    lastFocus = null;
  document.documentElement.dataset.theme = store.get("theme", "dark");
  $("#preview-nav").innerHTML = T.nav("desktop");
  const icon = (n) => `<i data-icon="${n}"></i>`;
  const persist = () => store.set("library-real-v1", saved);
  const footer = () => "";
  function hero() {
    const d = T.get("song");
    return `<section class="hero" data-od-id="recommendation-hero"><div class="hero-copy"><div class="meta"><span>宫廷 · 古代</span><span>第十一季 · 全 113 集</span></div><h2 data-od-id="hero-title">持械入宋</h2><p>西北战局再度升级。<br>五人小队一边打仗，一边争分夺秒。</p><div class="row"><button class="btn primary" data-play="song" data-od-id="hero-play">${icon("play")}立即观看</button><button class="btn ghost" data-open="song" data-od-id="hero-details">查看详情${icon("arrow-up-right")}</button></div></div><div class="hero-art" aria-hidden="true"><span class="hero-word">宋</span><div class="hero-poster back">${T.poster(T.get("eighties"))}</div><div class="hero-poster">${T.poster(d)}</div></div></section>`;
  }
  function feedItems(channel = state.feedChannel) {
    if (channel === "45") {
      return state.logged ? saved.following.map((id) => T.get(id)).filter(Boolean) : null;
    }
    if (channel === "36") return [];
    if (channel === "39")
      return T.dramas.filter((d) => !["玄幻", "脑洞"].includes(d.genre));
    return T.dramas;
  }
  function feed() {
    const channels = [
      ["16", "推荐"],
      ["39", "真人剧"],
      ["36", "漫剧"],
      ["45", "关注"],
    ];
    const items = feedItems();
    const current = items?.length ? items[state.feedIndex % items.length] : null;
    return `<div class="page-heading feed-heading"><h1>刷剧</h1><div class="feed-channels" role="tablist" aria-label="刷剧频道">${channels
      .map(
        ([id, label]) =>
          `<button class="chip ${state.feedChannel === id ? "active" : ""}" role="tab" aria-selected="${state.feedChannel === id}" data-feed-channel="${id}">${label}</button>`,
      )
      .join("")}</div></div>${
      state.feedChannel === "45" && !state.logged
        ? `<section class="feed-empty"><h2>登录后查看关注</h2><button class="btn primary" data-action="account-login">登录账号${icon("arrow-right")}</button></section>`
        : current
          ? `<section class="feed-feature" data-od-id="feed-feature"><div class="feed-cover">${T.poster(current)}</div><div class="feed-copy"><div class="meta"><span>${current.genre} · ${current.tone}</span><span>${T.status(current)}</span></div><h2>${T.esc(current.title)}</h2>${current.description ? `<p>${T.esc(current.description)}</p>` : ""}<div class="row"><button class="btn primary" data-play="${current.id}">${icon("play")}立即观看</button><button class="btn outline" data-open="${current.id}">${icon("list-video")}选集与详情</button><button class="btn ghost" data-feed-next>${icon("skip-forward")}下一部</button></div></div></section>`
          : `<section class="feed-empty"><h2>暂无公开内容</h2><button class="btn outline" data-feed-channel="16">回到推荐${icon("arrow-right")}</button></section>`
    }`;
  }
  function continueCards() {
    return saved.history
      .slice(0, 3)
      .map((h) => {
        const d = T.get(h.id);
        return `<button class="continue-card" data-resume="${d.id}" data-od-id="continue-${d.id}"><div class="continue-art">${T.poster(d)}</div><div class="continue-info"><h3>${d.title}</h3><p>第 ${h.episode} 集 · 演示剩余 ${T.time(d.duration - h.position)}</p><div class="progress-track"><div class="progress-fill" style="--progress:${Math.round((h.position / d.duration) * 100)}%"></div></div></div>${icon("play")}</button>`;
      })
      .join("");
  }
  function filters() {
    return `<div class="filters" data-od-id="catalog-filters">${T.genres.map((g) => `<button class="chip ${state.genre === g ? "active" : ""}" data-genre="${g}" aria-pressed="${state.genre === g}">${g}</button>`).join("")}<label class="sort"><span class="sr-only">排序方式</span><select class="select" id="sort-select"><option value="curated" ${state.sort === "curated" ? "selected" : ""}>精选推荐</option><option value="short" ${state.sort === "short" ? "selected" : ""}>集数从少到多</option><option value="complete" ${state.sort === "complete" ? "selected" : ""}>完结优先</option></select></label></div>`;
  }
  function filtered() {
    let list = T.dramas.filter(
      (d) =>
        (state.genre === "全部" || d.tags.includes(state.genre)) &&
        (!state.query || (d.title + d.tags.join("")).includes(state.query)),
    );
    if (state.sort === "short") list.sort((a, b) => a.episodes - b.episodes);
    if (state.sort === "complete")
      list.sort(
        (a, b) =>
          (a.status === "complete" ? -1 : 1) -
          (b.status === "complete" ? -1 : 1),
      );
    return list;
  }
  function empty(title, desc, action = "去发现", route = "home") {
    return `<div class="empty" data-od-id="empty-state">${icon("bookmark")}<h3>${title}</h3><p>${desc}</p><button class="btn outline" data-route="${route}">${action}${icon("arrow-right")}</button></div>`;
  }
  function catalog() {
    const list = filtered();
    return `<section class="section" data-od-id="discover-catalog"><div class="section-head"><h2>${state.query ? "“" + T.esc(state.query) + "” 的搜索结果" : state.page === "browse" ? "按心情，找一部剧" : "今晚，想看什么"}</h2><span class="small muted">${list.length} 部剧</span></div>${filters()}${list.length ? `<div class="poster-grid">${list.map((d) => T.card(d)).join("")}</div>` : empty("暂时没有找到这部剧", "换个剧名或题材，再找找。", "重置筛选", "reset-search")}</section>`;
  }
  function home() {
    return `<div class="page-heading home-head"><h1>${state.page === "browse" ? "找一部，合心意的剧" : "把今晚，留给好故事。"}</h1></div>${state.page === "home" ? hero() + `<section class="section" data-od-id="continue-watching"><div class="section-head"><h2>继续观看</h2><button class="text-link" data-route="history">全部记录${icon("chevron-right")}</button></div>${saved.history.length ? `<div class="continue-grid">${continueCards()}</div>` : empty("今晚的故事，从这里开始", "播放后的进度会保存在此预览中。")}</section>` : ""}${catalog()}${footer()}`;
  }
  function toggleButton(kind, id, label, done, ico) {
    let on = saved[kind].includes(id);
    return `<button class="btn outline ${on ? "selected" : ""}" data-toggle="${kind}" data-id="${id}" aria-pressed="${on}" data-od-id="${kind}-action">${icon(ico)}${on ? done : label}</button>`;
  }
  function actions(d, primary = true) {
    return `${primary ? `<div class="detail-actions"><button class="btn primary" ${d.status === "upcoming" ? `data-toggle="reservations" data-id="${d.id}"` : `data-play="${d.id}"`} data-od-id="detail-main-action">${icon(d.status === "upcoming" ? "calendar-days" : "play")}${d.status === "upcoming" ? (saved.reservations.includes(d.id) ? "已预约 · 点击取消" : "预约上线") : "开始观看"}</button>${toggleButton("favorites", d.id, "收藏", "已收藏", "bookmark")}</div>` : ""}<div class="detail-actions-secondary">${d.status === "upcoming" ? "" : toggleButton("following", d.id, "追更", "已追更", "bell")}${toggleButton("reservations", d.id, "预约后续", "已预约", "calendar-days")}</div>`;
  }
  function episodeButtons(d, player = false) {
    const size = 40,
      total = Math.ceil(d.episodes / size),
      page = Math.max(0, Math.min(state.episodePage, total - 1)),
      start = page * size;
    const pager =
      total > 1
        ? `<div class="episode-pagination"><button class="btn ghost icon-btn" data-episode-page="${page - 1}" aria-label="上一组剧集" ${page === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><span>${start + 1}–${Math.min(start + size, d.episodes)} / ${d.episodes} 集</span><button class="btn ghost icon-btn" data-episode-page="${page + 1}" aria-label="下一组剧集" ${page === total - 1 ? "disabled" : ""}>${icon("chevron-right")}</button></div>`
        : "";
    return (
      pager +
      `<div class="episodes" data-od-id="episode-grid">${Array.from(
        { length: Math.min(size, d.episodes - start) },
        (_, i) => {
          const n = start + i + 1;
          return `<button class="episode ${state.episode === n ? "active" : ""}" data-episode="${n}" aria-label="第 ${n} 集" aria-pressed="${state.episode === n}" data-od-id="episode-${n}">${state.episode === n ? icon("play") : ""}${n.toString().padStart(2, "0")}</button>`;
        },
      ).join("")}</div>`
    );
  }
  function season(d) {
    return `<select id="season-select" class="select" aria-label="当前季">${T.seasonNumbers(
      d,
    )
      .map((n) => `<option value="${n}">${T.seasonName(d, n)}</option>`)
      .join("")}</select>`;
  }
  function detail() {
    const d = T.get(state.drama);
    return `<div class="back-row"><button class="btn ghost" data-route="home">${icon("arrow-left")}返回发现</button></div><section class="detail-hero" data-od-id="drama-detail"><div class="detail-cover" style="${T.posterStyle(d)}">${T.poster(d)}</div><div class="detail-copy"><h1>${d.title}</h1><div class="meta"><span>${d.genre} · ${d.tone}</span><span>${T.status(d)}</span></div><p class="synopsis">${d.description || "本次预览未收录该剧简介。"}</p>${actions(d)}</div></section><section class="content-panel" data-od-id="detail-episodes"><div class="panel-top"><h2>选集</h2><div class="row"><span class="small muted">片长与播放进度仅为演示</span>${season(d)}</div></div>${episodeButtons(d)}<p class="episode-meta">${d.status === "upcoming" ? "预约后可在「预约」中找到这部剧。" : "当前选中第 " + state.episode + " 集 · 点击剧集进入播放"}</p></section><section class="content-panel about-grid" data-od-id="story-information"><div><h3>故事简介</h3><p>${d.description || "本次预览未收录该剧简介。"}</p></div><div><h3>剧集信息</h3><dl><dt>内容性质</dt><dd>官网公开剧目</dd><dt>封面形式</dt><dd>官网海报 / 缺图中性占位</dd><dt>视频状态</dt><dd>仅模拟播放交互</dd></dl></div></section>${footer()}`;
  }
  function playerControls(d) {
    return `<div class="player-controls" data-od-id="player-controls"><label><span class="sr-only">播放进度</span><input type="range" class="range" id="play-progress" min="0" max="${d.duration}" value="${state.position}"></label><div class="row"><button class="btn icon-btn" data-action="play-pause" aria-label="${state.playing ? "暂停" : "播放"}">${icon(state.playing ? "pause" : "play")}</button><button class="btn icon-btn" data-action="next-episode" aria-label="下一集">${icon("skip-forward")}</button><span class="time-code"><span id="current-time">${T.time(state.position)}</span> / ${T.time(d.duration)}</span><span class="spacer"></span><button class="btn icon-btn volume-button" data-action="mute" aria-label="${state.volume ? "静音" : "开启声音"}">${icon(state.volume ? "volume-2" : "volume-x")}</button><button class="btn compact" data-action="speed">1.0×</button><button class="btn compact" data-action="quality">高清</button><button class="btn icon-btn" data-action="theater" aria-label="影院模式">${icon("maximize")}</button></div></div>`;
  }
  function player() {
    const d = T.get(state.drama);
    return `<div class="back-row"><button class="btn ghost" data-route="detail">${icon("arrow-left")}返回详情</button></div><div class="player-layout" data-od-id="player-layout"><div><section class="player-canvas ${state.controls ? "" : "controls-hidden"}" data-od-id="cinema-player" tabindex="0" aria-label="模拟播放器，空格播放或暂停，方向键调整进度"><div class="player-scene" aria-hidden="true"><div class="scene-frame"></div></div><span class="scene-label">视觉样片 · 非真实视频</span><div class="scene-title">${d.title}</div>${!state.playing ? `<button class="center-play" data-action="play-pause" aria-label="开始模拟播放">${icon("play")}</button>` : ""}<button class="btn ghost icon-btn exit-theater hidden" data-action="theater" aria-label="退出影院模式">${icon("minimize")}</button>${playerControls(d)}</section><div class="player-below"><div><h1>${d.title}</h1><div class="meta"><span>${T.seasonName(d, state.season)} · 第 ${state.episode} 集</span><span>${d.genre}</span><span>${T.status(d)}</span></div></div><div class="row">${toggleButton("favorites", d.id, "收藏", "已收藏", "bookmark")}${toggleButton("following", d.id, "追更", "已追更", "bell")}${toggleButton("reservations", d.id, "预约后续", "已预约", "calendar-days")}</div></div><div class="player-status">空格 播放 / 暂停 · ← / → 调整进度 · Esc 退出影院</div><div class="notice">${icon("info")}<span>当前仅演示播放器视觉与控制，不加载真实视频。</span></div></div><aside class="player-side" data-od-id="player-episode-panel"><h3>选集</h3><span class="small muted">${T.status(d)}</span>${season(d)}${episodeButtons(d, true)}</aside></div>${footer()}`;
  }
  const labels = {
    home: "发现",
    feed: "刷剧",
    browse: "找剧",
    detail: "剧集详情",
    player: "正在观看",
    history: "观看记录",
    favorites: "收藏",
    following: "追更",
    reservations: "预约",
    settings: "设置",
    account: "我的账号",
  };
  function library() {
    const kind = state.page,
      title = labels[kind];
    const entries =
      kind === "history"
        ? saved.history.map((h) => T.get(h.id))
        : saved[kind].map((id) => T.get(id));
    const header = `<div class="page-heading"><h1>${title}</h1>${kind === "history" && entries.length ? `<button class="text-link" data-action="clear-history">${icon("trash-2")}清空记录</button>` : ""}</div>`;
    const tabs = `<div class="tab-list library-tabs" role="tablist" aria-label="我的片单分类">${["history", "favorites", "following", "reservations"].map((p) => `<button class="tab ${p === kind ? "active" : ""}" role="tab" aria-selected="${p === kind}" data-route="${p}">${labels[p]}</button>`).join("")}</div>`;
    let content;
    if (!entries.length) {
      content = empty(
        "这里还没有" + (kind === "history" ? "观看记录" : title) + "内容",
        kind === "history"
          ? "开始播放后，可以从这里接着看。"
          : "去发现一部想看的剧，加入你的" + title + "。",
      );
    } else if (kind === "history") {
      content = `<div class="history-list">${saved.history
        .map((h) => {
          const d = T.get(h.id);
          return `<article class="history-row" data-od-id="history-${d.id}"><button class="poster-card history-art" data-open="${d.id}" aria-label="查看${d.title}">${T.poster(d)}</button><div class="grow"><h3>${d.title}</h3><p>${T.seasonName(d, h.season)} · 第 ${h.episode} 集 · 演示进度 ${T.time(h.position)}</p><div class="progress-track"><div class="progress-fill" style="--progress:${(h.position / d.duration) * 100}%"></div></div></div><button class="btn outline" data-resume="${d.id}">${icon("play")}继续观看</button><button class="btn ghost icon-btn" data-remove="${d.id}" aria-label="移除${d.title}观看记录">${icon("x")}</button></article>`;
        })
        .join("")}</div>`;
    } else
      content = `<div class="poster-grid">${entries.map((d) => T.card(d)).join("")}</div>`;
    return `${header}${tabs}${content}${footer()}`;
  }
  function settings() {
    return `<div class="page-heading"><h1>设置</h1></div><div class="settings-layout"><section class="settings-section"><h2>外观</h2><div class="setting-line"><div><h3>界面主题</h3><p>白天看得清，夜晚不刺眼</p></div><select class="select" id="theme-select" aria-label="界面主题"><option value="dark" ${document.documentElement.dataset.theme === "dark" ? "selected" : ""}>深色模式</option><option value="light" ${document.documentElement.dataset.theme === "light" ? "selected" : ""}>纸张浅色</option></select></div></section><section class="settings-section"><h2>播放</h2>${[
      ["autoplay", "自动播放下一集", "当前剧集结束后继续观看", true],
      ["resume", "记住播放位置", "重新打开时接着看", true],
      ["quiet", "安静观看", "界面不显示额外的观看提示", true],
    ]
      .map(
        ([id, title, desc, on]) =>
          `<div class="setting-line"><div><h3>${title}</h3><p>${desc}</p></div><span class="switch-hit"><button class="switch" role="switch" aria-checked="${store.get(id, on)}" aria-label="${title}" data-switch="${id}"></button></span></div>`,
      )
      .join(
        "",
      )}</section><section class="settings-section" data-od-id="app-updates"><h2>应用更新</h2><div class="setting-line"><div><h3>自动检查更新</h3></div><span class="switch-hit"><button class="switch" role="switch" aria-checked="${store.get("auto-updates", true)}" aria-label="自动检查更新" data-switch="auto-updates"></button></span></div><div class="setting-line"><div><h3>应用版本</h3><p>0.1.0 · 已是最新版本</p></div><button class="btn outline compact" data-action="check-updates">检查更新</button></div></section><section class="settings-section"><h2>本地数据</h2><div class="setting-line"><div><h3>重置设计预览</h3><p>恢复演示片单与观看记录</p></div><button class="btn outline compact" data-action="reset-demo">重置</button></div></section></div>${footer()}`;
  }
  function account() {
    const logged = state.logged;
    return `<div class="page-heading"><h1>账号</h1></div><div class="account-layout" data-od-id="account-summary"><section class="account-identity-card"><div class="account-identity"><div class="avatar">${logged ? "观" : "未"}</div><div><span class="small muted">账号状态</span><h2>${logged ? "已登录" : "还未登录"}</h2></div></div><button class="btn ${logged ? "outline" : "primary"}" data-action="${logged ? "logout" : "account-login"}">${logged ? "退出登录" : "登录账号"}</button></section><section class="account-actions-card"><h2>我的内容</h2><button class="account-action-row" data-route="following"><span>追更</span>${icon("chevron-right")}</button><button class="account-action-row" data-route="reservations"><span>预约</span>${icon("chevron-right")}</button></section></div>${footer()}`;
  }
  function loginDialog() {
    lastFocus = document.activeElement;
    const qr = state.accountMethod === "qr";
    const d = $("#app-dialog");
    d.classList.add("account-dialog");
    d.innerHTML = `<button class="btn ghost icon-btn dialog-close" data-action="close-dialog" aria-label="关闭弹窗">${icon("x")}</button><h2 id="dialog-title">登录账号</h2><div class="tab-list account-methods" role="tablist" aria-label="登录方式"><button class="tab ${qr ? "active" : ""}" role="tab" aria-selected="${qr}" data-account-method="qr">扫码登录</button><button class="tab ${qr ? "" : "active"}" role="tab" aria-selected="${!qr}" data-account-method="phone">手机号登录</button></div>${qr ? `<div class="qr-login"><div class="qr-placeholder" aria-hidden="true">扫码</div><p>请用红果短剧 App 扫码</p><button class="btn primary" data-action="start-qr">${state.qrStarted ? "刷新二维码" : "获取登录二维码"}</button></div>` : `<form id="account-phone-form" class="phone-login"><label>国家或地区<select class="select" id="account-country" aria-label="国家或地区"><option>+86 中国大陆</option><option>+852 中国香港</option><option>+886 中国台湾</option></select></label><label>手机号<div class="input-wrap"><input id="account-phone" type="tel" placeholder="请输入手机号" autocomplete="tel" required /></div></label><label>验证码<div class="code-row"><div class="input-wrap"><input id="account-code" type="text" inputmode="numeric" placeholder="请输入验证码" autocomplete="one-time-code" required /></div><button class="btn outline" type="button" data-action="send-code">获取验证码</button></div></label><p class="auth-note" id="auth-note">验证码登录</p><button class="btn primary wide" type="submit">登录</button></form>`}`;
    window.paintIcons?.();
    d.showModal();
  }
  function render(keepFocus = false) {
    clearInterval(timer);
    const pos = window.scrollY,
      active = document.activeElement,
      wasTheater = !!$(".theater-expanded");
    const focusKey = active?.id
      ? "#" + active.id
      : active?.dataset?.toggle
        ? '[data-toggle="' +
          active.dataset.toggle +
          '"][data-id="' +
          active.dataset.id +
          '"]'
        : active?.dataset?.action
          ? '[data-action="' + active.dataset.action + '"]'
            : active?.dataset?.feedChannel
              ? '[data-feed-channel="' + active.dataset.feedChannel + '"]'
              : active?.dataset?.feedNext !== undefined
                ? '[data-feed-next]'
          : active?.dataset?.genre
            ? '[data-genre="' + active.dataset.genre + '"]'
            : null;
    main.innerHTML =
      state.page === "home" || state.page === "browse"
        ? home()
        : state.page === "feed"
          ? feed()
        : state.page === "detail"
          ? detail()
          : state.page === "player"
            ? player()
            : state.page === "settings"
              ? settings()
              : state.page === "account"
                ? account()
                : library();
    $("#page-crumb") && ($("#page-crumb").textContent = labels[state.page]);
    document.querySelectorAll("[data-route]").forEach((b) => {
      let on = b.dataset.route === state.page;
      b.classList.toggle("active", on);
      if (b.closest("nav") && b.classList.contains("nav-item"))
        b.setAttribute("aria-current", on ? "page" : "false");
    });
    window.paintIcons?.();
    if (state.page === "player" && state.playing) startTimer();
    if (keepFocus) {
      window.scrollTo(0, pos);
      if (wasTheater && state.page === "player") {
        $(".player-canvas").classList.add("theater-expanded");
        $(".exit-theater").classList.remove("hidden");
      }
      if (focusKey)
        document.querySelector(focusKey)?.focus({ preventScroll: true });
    }
  }
  function route(page, push = true) {
    if (page === "reset-search") {
      state.query = "";
      state.genre = "全部";
      $("#global-search") && ($("#global-search").value = "");
      page = "browse";
    }
    if (page === "home" && state.page === "browse") {
      state.query = "";
      $("#global-search") && ($("#global-search").value = "");
    }
    if (!labels[page]) page = "home";
    clearInterval(timer);
    state.playing = false;
    state.page = page;
    if (push) {
      const hash =
        page === "detail" || page === "player"
          ? `${page}/${state.drama}`
          : page;
      history.pushState({}, "", `#${hash}`);
    }
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  function open(id) {
    state.drama = id;
    state.season = T.get(id).seasonNumber || 1;
    state.episodePage = 0;
    state.episode = 1;
    state.position = 0;
    route("detail");
  }
  function play(id, resume = false) {
    const d = T.get(id);
    if (d.status === "upcoming") {
      open(id);
      return;
    }
    const selection =
      state.page === "detail" && state.drama === id
        ? { season: state.season, episode: state.episode, position: 0 }
        : null;
    state.drama = id;
    const h = resume ? saved.history.find((x) => x.id === id) : selection;
    state.episode = h?.episode || 1;
    state.season = h?.season || d.seasonNumber || 1;
    state.episodePage = Math.floor((state.episode - 1) / 40);
    state.position = h?.position || 0;
    state.controls = true;
    route("player");
    state.playing = true;
    saveProgress();
    render();
  }
  function saveProgress() {
    let h = {
      id: state.drama,
      episode: state.episode,
      season: state.season,
      position: state.position,
    };
    saved.history = [h, ...saved.history.filter((x) => x.id !== h.id)].slice(
      0,
      20,
    );
    persist();
  }
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!state.playing || state.page !== "player") return;
      const d = T.get(state.drama);
      state.position = Math.min(d.duration, state.position + 1);
      const r = $("#play-progress");
      if (r) r.value = state.position;
      const tm = $("#current-time");
      if (tm) tm.textContent = T.time(state.position);
      saveProgress();
      if (state.position >= d.duration) {
        state.playing = false;
        clearInterval(timer);
        if (store.get("autoplay", true)) nextEpisode();
        else render(true);
      }
    }, 1000);
  }
  function nextEpisode() {
    const d = T.get(state.drama),
      max = d.status === "updating" ? d.episodes : d.episodes;
    if (state.episode < max) {
      state.episode++;
      state.episodePage = Math.floor((state.episode - 1) / 40);
      state.position = 0;
      state.playing = true;
      saveProgress();
      render(true);
      toast("已切换到第 " + state.episode + " 集");
    } else {
      state.playing = false;
      render(true);
      toast(d.status === "updating" ? "已看到最新一集" : "本季已看完");
    }
  }
  function toast(msg) {
    clearTimeout(toastTimer);
    $("#toast-region").innerHTML =
      `<div class="toast">${icon("check")}${T.esc(msg)}</div>`;
    window.paintIcons?.();
    toastTimer = setTimeout(() => {
      $("#toast-region").innerHTML = "";
    }, 3000);
  }
  function dialog(title, text, confirm = "知道了", action = "close") {
    lastFocus = document.activeElement;
    const d = $("#app-dialog");
    d.innerHTML = `<button class="btn ghost icon-btn dialog-close" data-action="close-dialog" aria-label="关闭弹窗">${icon("x")}</button><h2 id="dialog-title">${title}</h2><p>${text}</p><div class="dialog-actions">${action !== "close" ? '<button class="btn outline" data-action="close-dialog">取消</button>' : ""}<button class="btn primary" data-confirm="${action}">${confirm}</button></div>`;
    window.paintIcons?.();
    d.showModal();
  }
  function closeDialog() {
    $("#app-dialog").close();
    $("#app-dialog").classList.remove("account-dialog");
    lastFocus?.focus({ preventScroll: true });
  }
  function toggle(kind, id) {
    const list = saved[kind];
    if (!list) return;
    const on = list.includes(id);
    saved[kind] = on ? list.filter((x) => x !== id) : [id, ...list];
    persist();
    toast(
      (on ? "已取消" : "已加入") +
        { favorites: "收藏", following: "追更", reservations: "预约" }[kind],
    );
    render(true);
  }
  function setTheme(v) {
    document.documentElement.dataset.theme = v;
    store.set("theme", v);
    $("#theme-select") && ($("#theme-select").value = v);
    document
      .querySelector('[data-action="theme"]')
      ?.setAttribute("aria-label", v === "dark" ? "切换到浅色" : "切换到深色");
  }
  function click(e) {
    const b = e.target.closest("button,[data-open]");
    if (!b || b.disabled) return;
    if (b.dataset.route) {
      route(b.dataset.route);
      return;
    }
    if (b.dataset.open) {
      open(b.dataset.open);
      return;
    }
    if (b.dataset.play) {
      play(b.dataset.play);
      return;
    }
    if (b.dataset.resume) {
      play(b.dataset.resume, true);
      return;
    }
    if (b.dataset.genre) {
      state.genre = b.dataset.genre;
      render(true);
      return;
    }
    if (b.dataset.feedChannel) {
      state.feedChannel = b.dataset.feedChannel;
      state.feedIndex = 0;
      render(true);
      return;
    }
    if (b.hasAttribute("data-feed-next")) {
      const items = feedItems();
      if (items?.length) {
        state.feedIndex = (state.feedIndex + 1) % items.length;
        render(true);
      }
      return;
    }
    if (b.dataset.toggle) {
      toggle(b.dataset.toggle, b.dataset.id);
      return;
    }
    if (b.dataset.accountMethod) {
      state.accountMethod = b.dataset.accountMethod;
      loginDialog();
      return;
    }
    if (b.hasAttribute("data-episode-page")) {
      state.episodePage = Number(b.dataset.episodePage);
      render(true);
      document
        .querySelector('[data-episode-page="' + (state.episodePage + 1) + '"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.episode) {
      state.episode = Number(b.dataset.episode);
      state.position = 0;
      if (state.page === "detail") {
        route("player");
        state.controls = true;
      }
      state.playing = true;
      saveProgress();
      render(true);
      return;
    }
    if (b.dataset.remove) {
      saved.history = saved.history.filter((h) => h.id !== b.dataset.remove);
      persist();
      render(true);
      return;
    }
    if (b.dataset.switch) {
      let on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", on);
      store.set(b.dataset.switch, on);
      return;
    }
    if (b.dataset.auth) {
      state.auth = b.dataset.auth;
      render();
      return;
    }
    if (b.dataset.confirm) {
      if (b.dataset.confirm === "clear") {
        saved.history = [];
        persist();
        closeDialog();
        render();
        toast("观看记录已清空");
      } else if (b.dataset.confirm === "reset") {
        saved = structuredClone(T.initial);
        persist();
        closeDialog();
        render();
        toast("演示内容已恢复");
      } else closeDialog();
      return;
    }
    switch (b.dataset.action) {
      case "account-login":
        state.accountMethod = "qr";
        state.qrStarted = false;
        loginDialog();
        break;
      case "start-qr":
        state.qrStarted = true;
        loginDialog();
        break;
      case "send-code":
        $("#auth-note").textContent = "验证码已发送";
        toast("验证码已发送");
        break;
      case "theme":
        setTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        );
        break;
      case "play-pause":
        state.playing = !state.playing;
        if (state.playing) saveProgress();
        render(true);
        break;
      case "next-episode":
        nextEpisode();
        break;
      case "mute":
        state.volume = !state.volume;
        b.innerHTML = icon(state.volume ? "volume-2" : "volume-x");
        b.setAttribute("aria-label", state.volume ? "静音" : "开启声音");
        window.paintIcons?.();
        break;
      case "speed": {
        const speeds = ["1.0×", "1.25×", "1.5×", "2.0×"];
        b.textContent =
          speeds[(speeds.indexOf(b.textContent) + 1) % speeds.length];
        toast("模拟播放速度：" + b.textContent);
        break;
      }
      case "quality":
        b.textContent = b.textContent === "高清" ? "标清" : "高清";
        toast("模拟画质：" + b.textContent);
        break;
      case "check-updates":
        toast("当前已是最新版本");
        break;
      case "theater": {
        const c = $(".player-canvas");
        c.classList.toggle("theater-expanded");
        c.querySelector(".exit-theater").classList.toggle(
          "hidden",
          !c.classList.contains("theater-expanded"),
        );
        c.focus();
        break;
      }
      case "clear-history":
        dialog(
          "清空观看记录？",
          "仅清空此浏览器中的演示观看记录。收藏、追更和预约会保留。",
          "清空记录",
          "clear",
        );
        break;
      case "reset-demo":
        dialog(
          "恢复演示内容？",
          "当前预览中的片单和观看记录将恢复到初始状态。",
          "恢复演示",
          "reset",
        );
        break;
      case "close-dialog":
        closeDialog();
        break;
      case "logout":
        state.logged = false;
        store.set("logged", false);
        state.auth = "login";
        render();
        toast("已退出演示账号");
        break;
    }
  }
  document.addEventListener("click", click);
  document.addEventListener("click", (e) => {
    if (
      e.target.closest(".player-canvas") &&
      !e.target.closest("button,input")
    ) {
      state.controls = !state.controls;
      $(".player-canvas")?.classList.toggle("controls-hidden", !state.controls);
    }
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.closest?.(".player-controls")) {
      state.controls = true;
      document
        .querySelector(".player-canvas")
        ?.classList.remove("controls-hidden");
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "sort-select") {
      state.sort = e.target.value;
      render(true);
    }
    if (e.target.id === "season-select") {
      state.season = Number(e.target.value);
      state.episode = 1;
      state.episodePage = 0;
      state.position = 0;
      state.playing = false;
      render(true);
    }
    if (e.target.id === "theme-select") setTheme(e.target.value);
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "play-progress") {
      state.position = Number(e.target.value);
      $("#current-time").textContent = T.time(state.position);
      if (state.playing) saveProgress();
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "search-form") {
      e.preventDefault();
      state.query = new FormData(e.target).get("search").trim();
      route("browse");
    }
    if (e.target.id === "auth-form") {
      e.preventDefault();
      if (state.auth === "recover") {
        $("#auth-note").textContent = "重置链接已模拟发送";
        toast("重置链接已模拟发送，未发送真实邮件");
        return;
      }
      if (
        state.auth === "register" &&
        $("#auth-password").value !== $("#confirm-password").value
      ) {
        $("#auth-note").textContent = "两次密码不一致";
        $("#auth-note").classList.add("error-text");
        $("#confirm-password").focus();
        return;
      }
      state.logged = true;
      store.set("logged", true);
      render();
      toast("已进入演示账号");
    }
    if (e.target.id === "account-phone-form") {
      e.preventDefault();
      state.logged = true;
      store.set("logged", true);
      closeDialog();
      render();
      toast("已进入演示账号");
    }
  });
  $("#app-dialog").addEventListener("click", (e) => {
    if (e.target === $("#app-dialog")) {
      const r = e.target.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        closeDialog();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("#global-search")?.focus();
      return;
    }
    if (e.key === "Escape") {
      $(".theater-expanded")?.classList.remove("theater-expanded");
      $(".exit-theater")?.classList.add("hidden");
    }
    if (
      ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName) ||
      $("#app-dialog").open
    )
      return;
    if (state.page === "player") {
      if (e.key === " ") {
        e.preventDefault();
        state.playing = !state.playing;
        state.controls = true;
        if (state.playing) saveProgress();
        render(true);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        state.position = Math.max(
          0,
          Math.min(
            T.get(state.drama).duration,
            state.position + (e.key === "ArrowRight" ? 5 : -5),
          ),
        );
        if (state.playing) saveProgress();
        render(true);
      }
    }
  });
  window.addEventListener("popstate", loadHash);
  function loadHash() {
    const [p, id] = location.hash.slice(1).split("/");
    if (id && T.dramas.some((d) => d.id === id)) {
      state.drama = id;
      state.season = T.get(id).seasonNumber || 1;
    }
    route(labels[p] ? p : "home", false);
  }
  loadHash();
  window.TheaterPreview = {
    getState: () => structuredClone(state),
    getLibrary: () => structuredClone(saved),
    open,
    play,
    route,
  };
})();
