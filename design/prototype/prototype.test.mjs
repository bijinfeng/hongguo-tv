import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const shared = readFileSync(new URL('./shared/controls.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const desktop = readFileSync(new URL('./desktop.js', import.meta.url), 'utf8');
const updates = readFileSync(new URL('./updates.js', import.meta.url), 'utf8');
const tv = readFileSync(new URL('./tv.js', import.meta.url), 'utf8');

function prototype() {
  const listeners = {};
  const node = {
    addEventListener() {},
    classList: { contains: () => false },
    querySelector() {
      return this;
    },
    focus() {},
  };
  const context = vm.createContext({
    window: { scrollY: 0, scrollTo() {} },
    document: {
      querySelector: () => node,
      addEventListener: (name, listener) => (listeners[name] = listener),
    },
    matchMedia: () => ({ matches: false }),
    setTimeout,
    clearTimeout,
  });
  // Skip browser bootstrap; exercise the actual model, rendering and event handlers.
  vm.runInContext(
    shared + desktop + tv + updates + source.slice(0, source.lastIndexOf("$('#search-icon')")),
    context,
  );
  vm.runInContext('render = () => {}; toast = () => {};', context);
  return {
    run: (code) => vm.runInContext(code, context),
    json: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    input(value, id = 'code') {
      listeners.input({ target: { id, value } });
    },
    change(value, dataset) {
      listeners.change({ target: { value, dataset } });
    },
    click(dataset) {
      listeners.click({ target: { closest: () => ({ dataset }) } });
    },
    key(key, target = {}, options = {}) {
      const event = {
        key,
        target: { matches: () => false, getAttribute: () => null, ...target },
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...options,
      };
      listeners.keydown(event);
      return event;
    },
    submit(value) {
      listeners.submit({
        preventDefault() {},
        target: { id: 'comment-form', querySelector: () => ({ value }) },
      });
    },
  };
}

test('sorting is repeatable, restores the default and leaves other pages unchanged', () => {
  const app = prototype();
  const initial = app.run('desktopHome()');
  const ranking = app.run('rankingPage()');
  const order = () => app.json('discoverItems(state).map(d => d.id)');
  const tvOrder = () =>
    [...app.run('tvDiscover()').matchAll(/data-detail="([^"]+)"/g)].map((m) => m[1]);
  const baseline = order();
  app.run("handleAction('sort', '最新')");
  assert.deepEqual(order(), baseline.toReversed());
  assert.deepEqual(tvOrder(), order().slice(0, 2));
  app.run("handleAction('sort', '最新')");
  assert.deepEqual(order(), baseline.toReversed());
  assert.deepEqual(tvOrder(), order().slice(0, 2));
  app.run("handleAction('sort', '热度')");
  assert.deepEqual(order(), ['night', 'return', 'home', 'spring']);
  assert.deepEqual(tvOrder(), order().slice(0, 2));
  app.run("handleAction('sort', '收藏')");
  assert.deepEqual(order(), ['spring', 'night', 'return', 'home']);
  app.run("handleAction('sort', '综合')");
  assert.deepEqual(order(), baseline);
  assert.deepEqual(tvOrder(), order().slice(0, 2));
  assert.equal(app.run('desktopHome()'), initial);
  assert.equal(app.run('rankingPage()'), ranking);
});

test('TV and desktop share browse filters while keyword results ignore browse selection', () => {
  const app = prototype();
  app.change('热度', { discoverFilter: 'sort' });
  assert.equal(app.run('state.sort'), '热度');
  app.change('都市', { discoverFilter: 'genre' });
  app.run("state.query = '  长夜  '");
  assert.deepEqual(app.json('discoverItems(state).map(d => d.id)'), ['night']);
  assert.match(app.run('tvDiscover()'), /长夜有声/);
  assert.match(app.run('discoverPage()'), /长夜有声/);
  assert.doesNotMatch(app.run('tvDiscover()'), /data-discover-filter/);
  assert.doesNotMatch(app.run('discoverPage()'), /data-action="sort"|data-action="kind"/);
  app.change('漫剧', { discoverFilter: 'kind' });
  assert.deepEqual(app.json('discoverItems(state).map(d => d.id)'), ['night']);
  app.run("state.query = ''");
  assert.deepEqual(app.json('discoverItems(state).map(d => d.id)'), ['home']);
  app.change('真人剧', { discoverFilter: 'kind' });
  app.change('已完结', { discoverFilter: 'discover-status' });
  assert.deepEqual(app.json('discoverItems(state).map(d => d.id)'), ['return']);
});

for (const mode of ['desktop', 'tv']) {
  test(`${mode}: starting and selecting reset time, resuming restores only that drama`, () => {
    const app = prototype();
    app.run(`navigate = (route) => { state.route = route; }; state.mode = '${mode}';
      state.position = 79; state.tvSeek = true; state.tvSeekPosition = 99;
      handleAction('play', 'home');`);
    assert.equal(app.run('state.id'), 'home');
    assert.equal(app.run('state.episode'), 1);
    assert.equal(app.run('state.position'), 0);
    assert.equal(app.run('state.tvSeek'), false);
    assert.equal(app.run('state.tvSeekPosition'), undefined);
    assert.equal(app.run("state.history.includes('home')"), false);
    app.run("startPlayback('spring', 20)");
    assert.equal(app.run('state.episode'), 20);
    assert.equal(app.run('state.position'), 0);
    app.run("startPlayback('night', 9)");
    app.input('57', 'position');
    assert.equal(app.run('state.position'), 57);
    assert.equal(app.run("dramaById('night').episode"), 4);
    assert.equal(app.run("dramaById('night').position"), 36);
    app.run("handleAction('resume', 'night'); handleAction('toggle-play');");
    assert.equal(app.run('state.episode'), 4);
    assert.equal(app.run('state.position'), 36);
    app.run("handleAction('toggle-play')");
    app.input('57', 'position');
    app.run("startPlayback('home'); handleAction('resume', 'night');");
    assert.equal(app.run('state.episode'), 4);
    assert.equal(app.run('state.position'), 57);
    assert.match(app.run('desktopHome()'), /00:57/);
    assert.match(app.run('historyPage()'), /width:56%/);
    assert.match(app.run("tvLibrary('history')"), /00:57/);
    app.click({ episode: '7' });
    app.input('41', 'position');
    app.run("handleAction('resume', 'night')");
    assert.equal(app.run('state.episode'), 4);
    assert.equal(app.run('state.position'), 57);
    app.run(
      "startPlayback('night', 9); handleAction('toggle-play'); handleAction('next-episode');",
    );
    assert.equal(app.run('state.episode'), 10);
    assert.equal(app.run('state.position'), 0);
    app.run("handleAction('toggle-play'); handleAction('next-episode');");
    app.input('41', 'position');
    app.run("handleAction('resume', 'night')");
    assert.equal(app.run('state.episode'), 10);
    assert.equal(app.run('state.position'), 0);
  });
}

test('TV browsing uses one back action; player controls still hide, seek, cancel and exit', () => {
  const app = prototype();
  app.run(`state.mode = 'tv'; state.route = 'feed'; state.tvControls = true;
    let returned = 0; let moved = [];
    back = () => returned++; moveSpatialFocus = key => moved.push(key);`);
  app.key('Escape');
  assert.equal(app.run('returned'), 1);
  assert.equal(app.run('state.tvControls'), true);
  app.key('ArrowRight');
  assert.deepEqual(app.json('moved'), ['ArrowRight']);
  assert.equal(app.run('state.tvSeek'), undefined);
  assert.equal(app.key('Enter').defaultPrevented, undefined);
  app.key('MediaPlayPause');
  assert.equal(app.run('state.playing'), false);
  app.run("state.route = 'player'");
  app.key('Escape');
  assert.equal(app.run('state.tvControls'), false);
  app.key('ArrowRight');
  assert.equal(app.run('state.tvSeekPosition'), 46);
  app.key('Escape');
  assert.equal(app.run('state.tvSeek'), false);
  assert.equal(app.run('state.position'), 36);
  app.key('Escape');
  app.key('ArrowRight');
  app.key('Enter');
  assert.equal(app.run('state.position'), 46);
  assert.equal(app.run('current().position'), 36);
  app.key('Escape');
  app.key('Escape');
  assert.equal(app.run('returned'), 2);
});

test('TV text inputs leave vertically, preserve caret keys and defer to active IME composition', () => {
  const app = prototype();
  app.run("state.mode = 'tv'; let moved = []; moveSpatialFocus = key => moved.push(key);");
  const input = { tagName: 'INPUT', matches: (selector) => selector === 'input, textarea, select' };
  app.key('ArrowDown', input);
  app.key('ArrowUp', input);
  assert.deepEqual(app.json('moved'), ['ArrowDown', 'ArrowUp']);
  assert.equal(app.key('ArrowLeft', input).defaultPrevented, undefined);
  assert.equal(app.key('ArrowRight', input).defaultPrevented, undefined);
  assert.equal(app.key('Enter', input).defaultPrevented, undefined);
  assert.equal(app.key('ArrowDown', input, { isComposing: true }).defaultPrevented, undefined);
  assert.deepEqual(app.json('moved'), ['ArrowDown', 'ArrowUp']);
  const textarea = {
    ...input,
    tagName: 'TEXTAREA',
    value: '一段文字',
    selectionStart: 2,
    selectionEnd: 2,
  };
  assert.equal(app.key('ArrowDown', textarea).defaultPrevented, undefined);
  app.key('ArrowDown', { ...textarea, selectionStart: 4, selectionEnd: 4 });
  app.key('ArrowUp', { ...textarea, selectionStart: 0, selectionEnd: 0 });
  assert.deepEqual(app.json('moved'), ['ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp']);
  app.run(
    "let loginBody = ''; showDialog = (_title, body) => { loginBody = body; }; state.loginTab = '手机号登录'; loginDialog();",
  );
  assert.match(app.run('loginBody'), /type="tel"[^>]*readonly[^>]*tabindex="-1"/);
});

test('focus restoration finds the field in the active dialog', () => {
  const app = prototype();
  app.run(`
    let focused = false;
    const field = {
      id: 'code',
      getClientRects: () => [{}],
      focus: () => { focused = true; },
    };
    overlay.open = true;
    overlay.contains = (node) => node === field;
    overlay.querySelectorAll = () => [field];
    document.getElementById = () => { throw new Error('Must not select a field behind the dialog'); };
  `);
  assert.equal(app.run("restoreFocus({ id: 'code' })"), true);
  assert.equal(app.run('focused'), true);
});

test('update demo state is isolated by platform and ignores replaced async callbacks', () => {
  const app = prototype();
  app.run(`
    const pendingUpdates = [];
    setTimeout = (callback) => { pendingUpdates.push(callback); return 1; };
    clearTimeout = () => {};
    setUpdateStage('checking');
    setUpdateStage('verifyError', { run: false });
    pendingUpdates[0]();
  `);
  assert.equal(app.run('updateDemos.desktop.stage'), 'verifyError');
  app.run(`state.mode = 'tv'; setUpdateStage('downloading', { run: false });`);
  assert.equal(app.run('updateDemos.tv.stage'), 'downloading');
  assert.equal(app.run('updateDemos.desktop.stage'), 'verifyError');
  assert.equal(app.run('updateDemos.desktop.version'), '0.1.0');
});

test('opening the installer never reports update success before version confirmation', () => {
  const app = prototype();
  app.run(`
    const pendingUpdates = [];
    setTimeout = (callback) => { pendingUpdates.push(callback); return 1; };
    clearTimeout = () => {};
    overlay.close = () => {};
    overlay.dataset = {};
    showDialog = () => {};
    state.mode = 'tv';
    updateModel().permission = true;
    handleUpdateAction('update-install');
  `);
  assert.equal(app.run('updateModel().stage'), 'installing');
  app.run(`handleUpdateAction('update-confirmed');`);
  assert.equal(app.run('updateModel().stage'), 'installing');
  assert.equal(app.run('updateModel().version'), '0.1.0');
  app.run(`handleUpdateAction('update-reopen');`);
  assert.equal(app.run('updateModel().stage'), 'confirming');
  app.run('pendingUpdates[0]();');
  assert.equal(app.run('updateModel().stage'), 'success');
  assert.equal(app.run('updateModel().version'), '0.2.0');
});

test('quiet viewing exposes no social or offline task controls on either design', () => {
  const app = prototype();
  for (const mode of ['desktop', 'tv']) {
    app.run(`state.mode = '${mode}'; state.route = 'player'`);
    for (const surface of [
      'desktopDetail()',
      'desktopPlayer()',
      'desktopHome()',
      'favoritesPage()',
      'settingsSections().播放',
      'tvDetail()',
      'tvPlayer()',
      "tvLibrary('favorites')",
    ]) {
      const html = app.run(surface);
      assert.doesNotMatch(
        html,
        /data-action="(?:comments|like|comment-like|download|tv-danmaku|tv-send-danmaku)"|danmaku-form|comment-form/,
      );
    }
  }
  assert.doesNotMatch(app.run('mapPage()'), /评论|弹幕|点赞|下载任务/);
});

test('series design keeps independent identities and never plays an upcoming season', () => {
  const app = prototype();
  app.run("state.id = 'home'");
  assert.equal(app.run('seasonPicker()'), '');
  app.run("state.id = 'spring'; state.season = 2");
  assert.equal(app.run('selectedSeason().id'), 'spring-second');
  assert.match(app.run('episodePicker()'), /播放第 12 集/);
  assert.doesNotMatch(app.run('episodePicker()'), /播放第 13 集/);
  app.run("navigate = (route) => { state.route = route; }; startPlayback('spring-second', 3)");
  assert.equal(app.run('state.season'), 2);
  assert.equal(app.run('current().id'), 'spring-second');
  app.run('state.season = 3');
  assert.equal(app.run('isUpcomingSeason()'), true);
  assert.doesNotMatch(app.run('episodePicker()'), /data-episode=/);
});

test('reading notifications and clearing history do not discard independent records', () => {
  const app = prototype();
  app.run(
    "state.loggedIn = true; state.followingTab = '更新提醒'; handleAction('read-notifications')",
  );
  assert.match(app.run('followingPage()'), /已读.*新更新 8 集/);
  app.run(
    "confirmDialog = (_title, _copy, _label, apply) => apply(); handleAction('clear-history')",
  );
  assert.equal(app.run('state.history.length'), 0);
  assert.equal(app.run('state.statisticsReset'), undefined);
  app.run("handleAction('reset-statistics')");
  assert.equal(app.run('state.statisticsReset'), true);
  assert.equal(app.run('state.favorites.size'), 1);
});

test('reservation entry points stay pending and reject repeated requests', () => {
  const app = prototype();
  app.run(
    "state.loggedIn = true; state.id = 'spring'; state.season = 3; let reservationRenders = 0; render = () => { reservationRenders++; }; handleAction('reserve', 'spring-third'); handleAction('reserve', 'spring-third')",
  );
  assert.equal(app.run('state.reservationPending.size'), 1);
  assert.equal(app.run('state.reservations.size'), 0);
  assert.equal(app.run('reservationRenders'), 1);
  for (const surface of [
    'desktopHome()',
    'desktopDetail()',
    'episodePicker()',
    'tvFeature(current(), true)',
  ]) {
    const controls = [
      ...app.run(surface).matchAll(/<button[^>]*data-action="reserve"[^>]*>[\s\S]*?<\/button>/g),
    ];
    assert.ok(controls.length, surface);
    for (const [control] of controls) {
      assert.match(control, /data-value="spring-third"/);
      assert.match(control, /\bdisabled\b/);
      assert.match(control, /已提交 · 待确认/);
    }
  }
});

test('detail extras use explicit sample relationships and hide missing sections', () => {
  const app = prototype();
  assert.equal(app.run("detailExtras({ id: 'no-details' })"), '');
  assert.deepEqual(
    [...app.run("detailExtras(dramaById('return'))").matchAll(/data-detail="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ['night'],
  );
  assert.doesNotMatch(
    app.run("detailExtras(dramaById('home'))"),
    /<h2>相关作品<\/h2>|暂无演员信息/,
  );
});

test('TV settings fall back when a removed category remains selected', () => {
  const app = prototype();
  app.run("state.mode = 'tv'; state.settingTab = '弹幕'");
  const html = app.run('tvSettings()');
  assert.match(html, /data-value="通用" aria-current="page"/);
  assert.match(html, /<h2>通用<\/h2>/);
  assert.doesNotMatch(html, /undefined|<h2>弹幕<\/h2>/);
});
