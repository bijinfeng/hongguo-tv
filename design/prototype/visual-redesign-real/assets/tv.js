(() => {
  "use strict";
  const T = window.Theater,
    $ = (s) => document.querySelector(s),
    I = (n) => `<i data-icon="${n}"></i>`;
  let page = "home",
    genre = "全部",
    drama = "song",
    season = 11,
    episodePage = 0,
    episode = 1,
    feedChannel = "16",
    feedIndex = 0,
    position = 0,
    playing = false,
    controls = true,
    overlay = "",
    accountMethod = "qr",
    previousFocus = null,
    interval = null,
    toastTimer;
  const read = (k, f) => {
      try {
        return JSON.parse(localStorage.getItem("night-theater:" + k)) ?? f;
      } catch {
        return f;
      }
    },
    write = (k, v) => {
      try {
        localStorage.setItem("night-theater:" + k, JSON.stringify(v));
      } catch {}
    };
  let library = read("library-real-v1", structuredClone(T.initial));
  for (const k of Object.keys(T.initial))
    if (!Array.isArray(library[k])) library[k] = structuredClone(T.initial[k]);
  $("#preview-nav").innerHTML = T.nav("tv");
  document.documentElement.dataset.theme = read("theme", "dark");
  function fit() {
    const r = $(".tv-viewport").getBoundingClientRect(),
      scale = Math.min(r.width / 1920, r.height / 1080);
    $("#tv-stage").style.transform =
      `translate(${(r.width - 1920 * scale) / 2}px,${(r.height - 1080 * scale) / 2}px) scale(${scale})`;
  }
  window.addEventListener("resize", fit);
  fit();
  function card(d, resume = false) {
    const h = library.history.find((h) => h.id === d.id);
    return `<button class="tv-card" ${resume && h ? `data-tv-resume="${d.id}"` : `data-tv-open="${d.id}"`} data-od-id="tv-card-${page}-${d.id}" aria-label="${d.title}，${resume && h ? "第 " + h.episode + " 集" : T.status(d)}"><div class="tv-card-art">${T.poster(d)}${resume && h ? `<span class="tv-continue-label">第 ${h.episode} 集</span><div class="progress-track"><div class="progress-fill" style="--progress:${(h.position / d.duration) * 100}%"></div></div>` : ""}</div><h3>${d.title}</h3><p>${resume && h ? "剩余 " + T.time(d.duration - h.position) : d.genre + " · " + T.status(d)}</p></button>`;
  }
  function home() {
    const d = T.get("song");
    return `<div class="tv-home"><section class="tv-hero" data-od-id="tv-recommendation"><div class="tv-hero-copy"><div class="meta"><span>宫廷 · 古代</span><span>第十一季 · 全 113 集</span></div><h1>持械入宋</h1><p>西北战局再度升级。<br>五人小队一边打仗，一边争分夺秒。</p><div class="row"><button class="btn primary" data-tv-play="song" data-od-id="tv-primary-play">${I("play")}立即观看</button><button class="btn outline" data-tv-open="song">查看详情${I("chevron-right")}</button></div></div><div class="tv-hero-art" aria-hidden="true"><span class="hero-word">宋</span><div class="hero-poster back">${T.poster(T.get("eighties"))}</div><div class="hero-poster">${T.poster(d)}</div></div></section><section data-od-id="tv-continue-rail"><h2 class="tv-rail-title">接着上次的故事</h2><div class="tv-rail">${library.history
      .slice(0, 3)
      .map((h) => card(T.get(h.id), true))
      .join("")}${T.dramas
      .filter((d) => !library.history.some((h) => h.id === d.id))
      .slice(0, Math.max(0, 5 - library.history.length))
      .map((d) => card(d))
      .join("")}</div></section></div>`;
  }
  function tvFeedItems(channel = feedChannel) {
    if (channel === "45") {
      return read("logged", false)
        ? library.following.map((id) => T.get(id)).filter(Boolean)
        : null;
    }
    if (channel === "36") return [];
    if (channel === "39") return T.dramas.filter((d) => !["玄幻", "脑洞"].includes(d.genre));
    return T.dramas;
  }
  function feed() {
    const channels = [["16", "推荐"], ["39", "真人剧"], ["36", "漫剧"], ["45", "关注"]];
    const list = tvFeedItems();
    const d = list?.length ? list[feedIndex % list.length] : null;
    return `<section class="tv-page tv-feed" data-od-id="tv-feed"><div class="tv-feed-head"><h1>刷剧</h1><div class="filters" role="tablist" aria-label="刷剧频道">${channels
      .map(([id, label]) => `<button class="chip ${feedChannel === id ? "active" : ""}" role="tab" aria-selected="${feedChannel === id}" data-tv-feed-channel="${id}">${label}</button>`)
      .join("")}</div></div>${
      feedChannel === "45" && !read("logged", false)
        ? `<div class="tv-feed-empty"><h2>登录后查看关注</h2><button class="btn primary" data-tv-action="account-login">登录账号</button></div>`
        : d
          ? `<div class="tv-feed-feature"><div class="tv-feed-cover">${T.poster(d)}</div><div class="tv-feed-copy"><div class="meta"><span>${d.genre} · ${d.tone}</span><span>${T.status(d)}</span></div><h2>${d.title}</h2>${d.description ? `<p>${d.description}</p>` : ""}<div class="row"><button class="btn primary" data-tv-play="${d.id}">${I("play")}立即观看</button><button class="btn outline" data-tv-open="${d.id}">${I("list-video")}选集与详情</button><button class="btn ghost" data-tv-feed-next>${I("skip-forward")}下一部</button></div></div></div>`
          : `<div class="tv-feed-empty"><h2>暂无公开内容</h2><button class="btn outline" data-tv-feed-channel="16">回到推荐</button></div>`
    }</section>`;
  }
  function settings() {
    return `<section class="tv-page"><h1>设置</h1><div class="setting-line"><div><h3>我的账号</h3><p>账号状态仅用于演示</p></div><button class="btn outline" data-tv-route="account">查看账号</button></div><div class="setting-line"><div><h3>界面主题</h3><p>深色模式 / 浅色模式</p></div><button class="btn outline" data-tv-action="theme">${document.documentElement.dataset.theme === "dark" ? "切换到浅色" : "切换到深色"}</button></div><div class="setting-line"><div><h3>自动播放下一集</h3><p>模拟播放结束后继续下一集</p></div><button class="switch" data-tv-action="autoplay" role="switch" aria-label="自动播放下一集" aria-checked="${read("autoplay", true)}"></button></div><div class="setting-line"><div><h3>自动检查更新</h3></div><button class="switch" data-tv-action="auto-updates" role="switch" aria-label="自动检查更新" aria-checked="${read("auto-updates", true)}"></button></div><div class="setting-line"><div><h3>应用版本</h3><p>0.1.0 · 已是最新版本</p></div><button class="btn outline" data-tv-action="check-updates">检查更新</button></div></section>`;
  }
  function listing() {
    let list =
      page === "history"
        ? library.history.map((h) => T.get(h.id))
        : ["favorites", "following", "reservations"].includes(page)
          ? library[page].map((id) => T.get(id))
          : T.dramas.filter((d) => genre === "全部" || d.tags.includes(genre));
    return `<section class="tv-page" data-od-id="tv-catalog"><h1>${{ browse: "找一部，合心意的剧", history: "观看记录", favorites: "收藏", following: "追更", reservations: "预约" }[page]}</h1>${
      ["favorites", "following", "reservations"].includes(page)
        ? `<div class="filters">${[
            ["favorites", "收藏"],
            ["following", "追更"],
            ["reservations", "预约"],
          ]
            .map(
              ([id, name]) =>
                `<button class="chip ${page === id ? "active" : ""}" data-tv-route="${id}" aria-pressed="${page === id}">${name}</button>`,
            )
            .join("")}</div>`
        : ""
    }${page === "browse" ? `<div class="filters">${T.genres.map((g) => `<button class="chip ${genre === g ? "active" : ""}" aria-pressed="${genre === g}" data-tv-genre="${g}">${g}</button>`).join("")}</div>` : ""}${list.length ? `<div class="tv-rail">${list.map((d) => card(d, page === "history")).join("")}</div>` : `<div class="empty">${I("bookmark")}<h3>这里还没有内容</h3><p>去发现一部想看的剧。</p><button class="btn outline" data-tv-route="home">返回发现</button></div>`}</section>`;
  }
  function account() {
    const on = read("logged", false);
    return `<section class="tv-page"><h1>账号</h1><div class="tv-account-summary"><div class="tv-account-avatar">${on ? "观" : "未"}</div><h2>${on ? "已登录" : "还未登录"}</h2><button class="btn ${on ? "outline" : "primary"}" data-tv-action="${on ? "logout" : "account-login"}">${on ? "退出登录" : "登录账号"}</button></div><div class="tv-account-links"><button class="btn outline" data-tv-route="following">查看追更</button><button class="btn outline" data-tv-route="reservations">查看预约</button></div></section>`;
  }
  function accountLogin() {
    previousFocus = document.activeElement;
    overlay = "account-login";
    const qr = accountMethod === "qr";
    $("#tv-overlay").innerHTML = `<div class="tv-overlay-backdrop"><section class="tv-login-panel" role="dialog" aria-modal="true" aria-label="登录账号"><div class="tv-panel-head"><h2>登录账号</h2><button class="btn ghost icon-btn" data-tv-action="close" aria-label="关闭登录">${I("x")}</button></div><div class="tv-login-tabs"><button class="btn ${qr ? "selected" : "outline"}" data-tv-account-method="qr" aria-pressed="${qr}">扫码登录</button><button class="btn ${qr ? "outline" : "selected"}" data-tv-account-method="phone" aria-pressed="${!qr}">手机号登录</button></div>${qr ? `<div class="tv-login-qr"><div class="tv-qr-placeholder">扫码</div><p>请用红果短剧 App 扫码</p><button class="btn primary" data-tv-action="start-qr">获取登录二维码</button></div>` : `<form id="tv-auth-form" class="tv-phone-login"><label>国家或地区<select class="select" aria-label="国家或地区"><option>+86 中国大陆</option><option>+852 中国香港</option><option>+886 中国台湾</option></select></label><label>手机号<div class="input-wrap"><input type="tel" aria-label="手机号" placeholder="请输入手机号" required></div></label><label>验证码<div class="tv-code-row"><div class="input-wrap"><input type="text" inputmode="numeric" aria-label="验证码" placeholder="请输入验证码" required></div><button class="btn outline" type="button" data-tv-action="send-code">获取验证码</button></div></label><p class="muted">验证码登录</p><button class="btn primary wide" type="submit">登录</button></form>`}</section></div>`;
    $("#tv-main").inert = true;
    $(".tv-header").inert = true;
    window.paintIcons();
    $("#tv-overlay .tv-login-tabs button")?.focus({ preventScroll: true });
  }
  function render() {
    clearInterval(interval);
    $("#tv-main").innerHTML =
      page === "home"
        ? home()
        : page === "feed"
          ? feed()
        : page === "account"
          ? account()
          : page === "settings"
            ? settings()
            : page === "player"
              ? player()
              : listing();
    document.querySelectorAll(".tv-nav-item").forEach((b) => {
      b.classList.toggle(
        "active",
        b.dataset.tvRoute === page ||
          (b.dataset.tvRoute === "favorites" &&
            ["following", "reservations"].includes(page)),
      );
      b.setAttribute(
        "aria-current",
        b.dataset.tvRoute === page ? "page" : "false",
      );
    });
    window.paintIcons();
    if (page === "player" && playing) tick();
  }
  function focusDefault() {
    const target =
      page === "player"
        ? $('#tv-main [data-tv-action="pause"]')
        : page === "home"
          ? $("#tv-main [data-tv-play]")
          : $("#tv-main button");
    target?.focus({ preventScroll: true });
  }
  function route(p) {
    $("#tv-main").inert = false;
    $(".tv-header").inert = false;
    overlay = "";
    $("#tv-overlay").innerHTML = "";
    page = p;
    playing = false;
    render();
    focusDefault();
  }
  function detail(id, fromPlayer = false) {
    drama = id;
    if (!overlay) previousFocus = document.activeElement;
    overlay = "detail";
    const d = T.get(id),
      available =
        d.status === "upcoming"
          ? 0
          : d.status === "updating"
            ? d.episodes
            : d.episodes;
    $("#tv-overlay").innerHTML =
      `<div class="tv-overlay-backdrop ${fromPlayer ? "over-player" : ""}"><section class="tv-detail-panel" role="dialog" aria-modal="true" aria-label="${d.title}详情" data-od-id="tv-detail-panel"><div class="tv-panel-head"><span>剧集详情</span><button class="btn ghost icon-btn" data-tv-action="close" aria-label="关闭详情">${I("x")}</button></div><div class="tv-detail-top"><div class="detail-cover" style="${T.posterStyle(d)}">${T.poster(d)}</div><div><h2>${d.title}</h2><div class="meta"><span>${d.genre} · ${d.tone}</span><span>${T.status(d)}</span></div><p>${d.description || "本次预览未收录该剧简介。"}</p></div></div><div class="detail-actions"><button class="btn primary" ${d.status === "upcoming" ? `data-tv-toggle="reservations" data-id="${d.id}"` : `data-tv-play="${d.id}"`}>${I(d.status === "upcoming" ? "calendar-days" : "play")}${d.status === "upcoming" ? (library.reservations.includes(d.id) ? "已预约" : "预约上线") : "开始观看"}</button><button class="btn outline ${library.favorites.includes(d.id) ? "selected" : ""}" data-tv-toggle="favorites" data-id="${d.id}" aria-pressed="${library.favorites.includes(d.id)}">${I("bookmark")}${library.favorites.includes(d.id) ? "已收藏" : "收藏"}</button>${d.status !== "upcoming" ? `<button class="btn outline ${library.following.includes(d.id) ? "selected" : ""}" data-tv-toggle="following" data-id="${d.id}" aria-pressed="${library.following.includes(d.id)}">${I("bell")}${library.following.includes(d.id) ? "已追更" : "追更"}</button>` : ""}<button class="btn outline ${library.reservations.includes(d.id) ? "selected" : ""}" data-tv-toggle="reservations" data-id="${d.id}" aria-pressed="${library.reservations.includes(d.id)}">${I("calendar-days")}${library.reservations.includes(d.id) ? "已预约" : "预约后续"}</button></div><div class="panel-top"><h2>选集</h2><div class="row">${T.seasonNumbers(
        d,
      )
        .map(
          (n) =>
            `<button class="btn selected" data-tv-season="${n}" aria-pressed="true">${T.seasonName(d, n)}</button>`,
        )
        .join(
          "",
        )}</div></div>${tvEpisodes(d)}<p class="episode-meta">${d.status === "upcoming" ? "尚未上线 · 可预约此剧" : "Enter 播放选中剧集 · Esc 返回"}</p></section></div>`;
    window.paintIcons();
    $("#tv-overlay .detail-actions button")?.focus({ preventScroll: true });
    $("#tv-main").inert = true;
    $(".tv-header").inert = true;
  }
  function tvEpisodes(d) {
    const size = 24,
      total = Math.ceil(d.episodes / size),
      p = Math.min(episodePage, total - 1),
      start = p * size;
    return `<div class="episode-pagination"><button class="btn ghost icon-btn" data-tv-page="${p - 1}" ${p === 0 ? "disabled" : ""} aria-label="上一组剧集">${I("chevron-left")}</button><span>${start + 1}–${Math.min(start + size, d.episodes)} / ${d.episodes} 集</span><button class="btn ghost icon-btn" data-tv-page="${p + 1}" ${p === total - 1 ? "disabled" : ""} aria-label="下一组剧集">${I("chevron-right")}</button></div><div class="episodes">${Array.from({ length: Math.min(size, d.episodes - start) }, (_, i) => `<button class="episode ${episode === start + i + 1 ? "active" : ""}" data-tv-episode="${start + i + 1}" aria-pressed="${episode === start + i + 1}">${start + i + 1}</button>`).join("")}</div>`;
  }
  function close() {
    overlay = "";
    $("#tv-overlay").innerHTML = "";
    $("#tv-main").inert = false;
    $(".tv-header").inert = false;
    if (previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
    else focusDefault();
  }
  function saveProgress() {
    library.history = [
      { id: drama, season, episode, position },
      ...library.history.filter((h) => h.id !== drama),
    ].slice(0, 20);
    write("library-real-v1", library);
  }
  function play(id, resume = false) {
    if (T.get(id).status === "upcoming") {
      detail(id);
      return;
    }
    const h = resume
      ? library.history.find((h) => h.id === id)
      : overlay === "detail" && drama === id
        ? { season, episode, position: 0 }
        : null;
    drama = id;
    episode = h?.episode || 1;
    season = h?.season || T.get(id).seasonNumber || 1;
    episodePage = Math.floor((episode - 1) / 24);
    position = h?.position || 0;
    overlay = "";
    $("#tv-main").inert = false;
    $(".tv-header").inert = false;
    $("#tv-overlay").innerHTML = "";
    $("#tv-main").inert = false;
    $(".tv-header").inert = false;
    page = "player";
    playing = true;
    controls = true;
    saveProgress();
    render();
    focusDefault();
  }
  function player() {
    const d = T.get(drama);
    return `<section class="tv-player ${controls ? "" : "controls-hidden"}" data-od-id="tv-player" tabindex="0"><div class="player-scene"><div class="scene-frame"></div></div><div class="tv-player-top"><button class="btn ghost icon-btn" data-tv-action="back" aria-label="返回详情">${I("arrow-left")}</button><h2>${d.title}<span>${T.seasonName(d, season)} · 第 ${episode} 集</span></h2></div><div class="scene-title">${d.title}</div><span class="scene-label">视觉样片 · 非真实视频</span>${!playing ? `<button class="center-play" data-tv-action="pause" aria-label="开始模拟播放">${I("play")}</button>` : ""}<div class="player-controls" data-od-id="tv-player-controls"><input id="tv-progress" class="range" type="range" min="0" max="${d.duration}" value="${position}" aria-label="播放进度"><div class="row"><button class="btn icon-btn" data-tv-action="pause" aria-label="${playing ? "暂停" : "播放"}">${I(playing ? "pause" : "play")}</button><button class="btn icon-btn" data-tv-action="next" aria-label="下一集">${I("skip-forward")}</button><span class="time-code"><span id="tv-time">${T.time(position)}</span> / ${T.time(d.duration)}</span><span class="spacer"></span><button class="btn compact" data-tv-action="speed">1.0×</button><button class="btn compact" data-tv-action="quality">高清</button><button class="btn compact" data-tv-action="episodes">${I("list-video")}选集</button><button class="btn icon-btn" data-tv-action="mute" aria-label="静音">${I("volume-2")}</button></div></div></section>`;
  }
  function tick() {
    clearInterval(interval);
    interval = setInterval(() => {
      if (!playing) return;
      const d = T.get(drama);
      position = Math.min(position + 1, d.duration);
      $("#tv-progress") && ($("#tv-progress").value = position);
      $("#tv-time") && ($("#tv-time").textContent = T.time(position));
      saveProgress();
      if (position >= d.duration) {
        playing = false;
        clearInterval(interval);
        if (read("autoplay", true)) next();
        else {
          render();
          focusDefault();
        }
      }
    }, 1000);
  }
  function next() {
    const d = T.get(drama),
      max = d.status === "updating" ? d.episodes : d.episodes;
    if (episode < max) {
      episode++;
      episodePage = Math.floor((episode - 1) / 24);
      position = 0;
      playing = true;
      saveProgress();
      render();
      focusDefault();
    } else {
      playing = false;
      render();
      focusDefault();
      toast("已看到当前可播放的最后一集");
    }
  }
  function toast(msg) {
    clearTimeout(toastTimer);
    $("#toast-region").innerHTML =
      `<div class="toast">${I("check")}${T.esc(msg)}</div>`;
    window.paintIcons();
    toastTimer = setTimeout(() => ($("#toast-region").innerHTML = ""), 3000);
  }
  function search() {
    previousFocus = document.activeElement;
    overlay = "search";
    $("#tv-overlay").innerHTML =
      `<section class="tv-overlay-search" role="dialog" aria-modal="true" aria-label="搜索剧目"><div class="row spread"><h2>搜索剧名、题材</h2><button class="btn ghost icon-btn" data-tv-action="close" aria-label="关闭搜索">${I("x")}</button></div><form id="tv-search-form" class="row"><label class="input-wrap grow">${I("search")}<input id="tv-search" placeholder="输入剧名" aria-label="输入剧名" required></label><button class="btn primary" type="submit">搜索</button></form><p class="small muted">试试：持械入宋、穿越、少夫人来自东北3</p><div id="tv-search-results" class="tv-page" style="padding:50px 0 0"></div></section>`;
    $("#tv-main").inert = true;
    $(".tv-header").inert = true;
    window.paintIcons();
    $("#tv-search").focus();
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id === "tv-auth-form") {
      e.preventDefault();
      write("logged", true);
      render();
      focusDefault();
      toast("已进入演示账号");
      return;
    }
    if (e.target.id === "tv-search-form") {
      e.preventDefault();
      const q = $("#tv-search").value.trim(),
        list = T.dramas.filter((d) => (d.title + d.tags.join("")).includes(q));
      $("#tv-search-results").innerHTML = list.length
        ? `<div class="tv-rail">${list.map((d) => card(d)).join("")}</div>`
        : '<p class="muted" style="font-size:25px">暂时没有找到，换个关键词试试。</p>';
      window.paintIcons();
      $("#tv-search-results button")?.focus({ preventScroll: true });
    }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.tvRoute) {
      route(b.dataset.tvRoute);
      return;
    }
    if (b.dataset.tvResume) {
      play(b.dataset.tvResume, true);
      return;
    }
    if (b.hasAttribute("data-tv-page")) {
      episodePage = Number(b.dataset.tvPage);
      detail(drama, page === "player");
      document
        .querySelector('[data-tv-page="' + (episodePage + 1) + '"]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.tvOpen) {
      season = T.get(b.dataset.tvOpen).seasonNumber || 1;
      episodePage = 0;
      episode = 1;
      detail(b.dataset.tvOpen);
      return;
    }
    if (b.dataset.tvPlay) {
      play(b.dataset.tvPlay, page === "home");
      return;
    }
    if (b.dataset.tvGenre) {
      genre = b.dataset.tvGenre;
      render();
      document
        .querySelector(`[data-tv-genre="${genre}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.tvFeedChannel) {
      feedChannel = b.dataset.tvFeedChannel;
      feedIndex = 0;
      render();
      document
        .querySelector(`[data-tv-feed-channel="${feedChannel}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.hasAttribute("data-tv-feed-next")) {
      const list = tvFeedItems();
      if (list?.length) {
        feedIndex = (feedIndex + 1) % list.length;
        render();
      }
      return;
    }
    if (b.dataset.tvToggle) {
      const kind = b.dataset.tvToggle,
        id = b.dataset.id,
        on = library[kind].includes(id);
      library[kind] = on
        ? library[kind].filter((x) => x !== id)
        : [id, ...library[kind]];
      write("library-real-v1", library);
      b.classList.toggle("selected", !on);
      b.setAttribute("aria-pressed", !on);
      b.innerHTML =
        I(
          kind === "favorites"
            ? "bookmark"
            : kind === "following"
              ? "bell"
              : "calendar-days",
        ) +
        (on ? "" : "已") +
        { favorites: "收藏", following: "追更", reservations: "预约后续" }[
          kind
        ];
      window.paintIcons();
      toast(on ? "已取消" : "已添加");
      return;
    }
    if (b.dataset.tvAccountMethod) {
      accountMethod = b.dataset.tvAccountMethod;
      accountLogin();
      return;
    }
    if (b.dataset.tvEpisode) {
      episode = Number(b.dataset.tvEpisode);
      position = 0;
      overlay = "";
      $("#tv-overlay").innerHTML = "";
      $("#tv-main").inert = false;
      $(".tv-header").inert = false;
      page = "player";
      playing = true;
      saveProgress();
      render();
      focusDefault();
      return;
    }
    if (b.dataset.tvSeason) {
      season = Number(b.dataset.tvSeason);
      episode = 1;
      episodePage = 0;
      const restore = document.activeElement.dataset.tvSeason;
      detail(drama, page === "player");
      document
        .querySelector(`[data-tv-season="${restore}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    switch (b.dataset.tvAction) {
      case "account-login":
        accountMethod = "qr";
        accountLogin();
        break;
      case "start-qr":
        toast("登录二维码已准备");
        break;
      case "send-code":
        toast("验证码已发送");
        break;
      case "logout":
        write("logged", false);
        render();
        focusDefault();
        toast("已退出演示账号");
        break;
      case "close":
        close();
        break;
      case "search":
        search();
        break;
      case "back":
        route("home");
        detail(drama);
        break;
      case "pause":
        playing = !playing;
        controls = true;
        if (playing) saveProgress();
        render();
        focusDefault();
        break;
      case "next":
        next();
        break;
      case "episodes":
        detail(drama, true);
        break;
      case "theme":
        document.documentElement.dataset.theme =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        write("theme", document.documentElement.dataset.theme);
        render();
        $('[data-tv-action="theme"]').focus({ preventScroll: true });
        break;
      case "autoplay": {
        const on = b.getAttribute("aria-checked") !== "true";
        b.setAttribute("aria-checked", on);
        write("autoplay", on);
        break;
      }
      case "auto-updates": {
        const on = b.getAttribute("aria-checked") !== "true";
        b.setAttribute("aria-checked", on);
        write("auto-updates", on);
        break;
      }
      case "check-updates":
        toast("当前已是最新版本");
        break;
      case "speed": {
        const values = ["1.0×", "1.25×", "1.5×", "2.0×"];
        b.textContent =
          values[(values.indexOf(b.textContent) + 1) % values.length];
        toast("模拟播放速度：" + b.textContent);
        break;
      }
      case "quality":
        b.textContent = b.textContent === "高清" ? "标清" : "高清";
        break;
      case "mute": {
        const muted = b.getAttribute("aria-label") === "静音";
        b.setAttribute("aria-label", muted ? "开启声音" : "静音");
        b.innerHTML = I(muted ? "volume-x" : "volume-2");
        window.paintIcons();
        break;
      }
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "tv-progress") {
      position = Number(e.target.value);
      $("#tv-time").textContent = T.time(position);
      if (playing) saveProgress();
    }
  });
  function focusables() {
    const root = overlay
      ? $("#tv-overlay")
      : page === "player"
        ? $("#tv-main")
        : $("#tv-stage");
    return [...root.querySelectorAll("button,a[href],input,select")].filter(
      (el) =>
        !el.disabled &&
        !el.closest("[inert]") &&
        el.getBoundingClientRect().width > 0 &&
        !el.closest(
          ".controls-hidden .player-controls,.controls-hidden .tv-player-top",
        ),
    );
  }
  function move(key) {
    const list = focusables(),
      current = document.activeElement;
    if (!list.includes(current)) {
      list[0]?.focus({ preventScroll: true });
      return;
    }
    const a = current.getBoundingClientRect(),
      ax = a.x + a.width / 2,
      ay = a.y + a.height / 2,
      horizontal = key === "ArrowLeft" || key === "ArrowRight",
      sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    let best = null,
      score = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const b = el.getBoundingClientRect(),
        dx = b.x + b.width / 2 - ax,
        dy = b.y + b.height / 2 - ay,
        primary = (horizontal ? dx : dy) * sign,
        secondary = Math.abs(horizontal ? dy : dx);
      if (primary <= 4) continue;
      const s =
        primary + secondary * 2.5 + (secondary > primary * 1.5 ? 500 : 0);
      if (s < score) {
        score = s;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      const rail = best.closest(".tv-rail,.tv-detail-panel");
      if (rail) {
        const r = rail.getBoundingClientRect(),
          b = best.getBoundingClientRect(),
          scale = $("#tv-stage").getBoundingClientRect().width / 1920;
        if (b.bottom > r.bottom)
          rail.scrollTop += (b.bottom - r.bottom + 18) / scale;
        if (b.top < r.top) rail.scrollTop -= (r.top - b.top + 18) / scale;
      }
    }
  }
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" ||
      (e.key === "Backspace" && !["INPUT"].includes(e.target.tagName))
    ) {
      e.preventDefault();
      if (overlay) close();
      else if (page === "player") {
        route("home");
        detail(drama);
      } else route("home");
      return;
    }
    if (e.key === "Tab" && overlay) {
      e.preventDefault();
      const list = [
        ...$("#tv-overlay").querySelectorAll(
          "button:not([disabled]),input,select,a",
        ),
      ];
      const i = list.indexOf(document.activeElement);
      list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length]?.focus({
        preventScroll: true,
      });
      return;
    }
    if (
      e.target.tagName === "INPUT" &&
      e.target.type !== "range" &&
      !["ArrowUp", "ArrowDown", "Tab"].includes(e.key)
    )
      return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      if (
        e.target.type === "range" &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      )
        return;
      e.preventDefault();
      if (page === "player" && !controls) {
        controls = true;
        $(".tv-player").classList.remove("controls-hidden");
        focusDefault();
      } else move(e.key);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const list = focusables(),
        idx = list.indexOf(document.activeElement);
      list[(idx + (e.shiftKey ? -1 : 1) + list.length) % list.length]?.focus({
        preventScroll: true,
      });
    }
    if (e.key === " " && page === "player" && !overlay) {
      e.preventDefault();
      playing = !playing;
      controls = true;
      render();
      focusDefault();
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".tv-player") && !e.target.closest("button,input")) {
      controls = !controls;
      $(".tv-player")?.classList.toggle("controls-hidden", !controls);
      if (!controls) $(".tv-player")?.focus({ preventScroll: true });
    }
  });
  render();
  focusDefault();
  window.TVPreview = {
    route,
    detail,
    play,
    move,
    getState: () => ({
      page,
      drama,
      season,
      episode,
      position,
      playing,
      overlay,
    }),
  };
})();
