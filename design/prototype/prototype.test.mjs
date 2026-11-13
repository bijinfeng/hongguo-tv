import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const desktop = readFileSync(new URL('./desktop.js', import.meta.url), 'utf8');
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
    setTimeout,
    clearTimeout,
  });
  // Skip browser bootstrap; exercise the actual model, rendering and event handlers.
  vm.runInContext(desktop + tv + source.slice(0, source.lastIndexOf("$('#search-icon')")), context);
  vm.runInContext('render = () => {}; commentsPanel = () => {}; toast = () => {};', context);
  return {
    run: (code) => vm.runInContext(code, context),
    json: (code) => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    input(value, id = 'comment-draft') {
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
  const order = () =>
    [...app.run('discoverPage()').matchAll(/data-detail="([^"]+)"/g)].map((m) => m[1]);
  const tvOrder = () =>
    [...app.run('tvDiscover()').matchAll(/data-detail="([^"]+)"/g)].map((m) => m[1]);
  const baseline = order();
  app.run("handleAction('sort', '最新')");
  assert.deepEqual(order(), baseline.toReversed());
  assert.deepEqual(tvOrder(), order());
  app.run("handleAction('sort', '最新')");
  assert.deepEqual(order(), baseline.toReversed());
  assert.deepEqual(tvOrder(), order());
  app.run("handleAction('sort', '热度')");
  assert.deepEqual(order(), ['return', 'spring', 'home', 'night']);
  assert.deepEqual(tvOrder(), order());
  app.run("handleAction('sort', '综合')");
  assert.deepEqual(order(), baseline);
  assert.deepEqual(tvOrder(), order());
  assert.equal(app.run('desktopHome()'), initial);
  assert.equal(app.run('rankingPage()'), ranking);
});

test('TV filter controls share search, genre and sorting behavior with desktop', () => {
  const app = prototype();
  app.change('热度', { discoverFilter: 'sort' });
  assert.equal(app.run('state.sort'), '热度');
  app.change('都市', { discoverFilter: 'genre' });
  app.run("state.query = '  长夜  '");
  assert.deepEqual(app.json('discoverItems(state).map(d => d.id)'), ['night']);
  assert.match(app.run('tvDiscover()'), /长夜有声/);
  assert.match(app.run('discoverPage()'), /长夜有声/);
  app.change('漫剧', { discoverFilter: 'kind' });
  assert.match(app.run('tvDiscover()'), /没有找到相关短剧/);
  assert.match(app.run('discoverPage()'), /没有找到相关短剧/);
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
    value: '一段评论',
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

test('TV comment updates preserve reading position and focus; changing context resets scroll', () => {
  const app = prototype();
  app.run(`state.mode = 'tv'; overlay.open = true; overlay.dataset = { context: 'return:评论' };
    const dialogBody = { scrollTop: 480 };
    const buttonNode = { focus() {} };
    overlay.querySelector = selector => selector === '.dialog-body' ? dialogBody : buttonNode;
    bindTabPanels = () => {};
    let restored;
    focusKey = () => ({ key: 'action', value: 'comment-like', secondary: '1' });
    restoreFocus = key => { restored = key; return !!key; };
    showDialog('评论', commentsBody());`);
  assert.equal(app.run('dialogBody.scrollTop'), 480);
  assert.equal(app.run('restored.value'), 'comment-like');
  app.run("state.id = 'night'; showDialog('评论', commentsBody());");
  assert.equal(app.run('dialogBody.scrollTop'), 0);
  app.run("dialogBody.scrollTop = 480; showDialog('选集', 'episodes');");
  assert.equal(app.run('dialogBody.scrollTop'), 0);
});

test('drafts, replies and comment actions belong to their drama', () => {
  const app = prototype();
  app.run("state.id = 'night'");
  app.input('长夜有声的草稿');
  app.run("handleAction('reply', '1')");
  app.run("handleAction('comment-like', '1')");
  app.run("state.id = 'return'");
  assert.equal(app.run('commentThread().draft'), '');
  assert.equal(app.run('commentThread().replyTo'), '');
  assert.equal(app.run('commentThread().comments[0].likes'), 12);
  assert.match(app.run('commentsBody()'), /修车铺/);
  assert.doesNotMatch(app.run('commentForm()'), /长夜有声的草稿/);
  app.input('重返1998的草稿');
  app.run("state.id = 'night'");
  assert.equal(app.run('commentThread().draft'), '长夜有声的草稿');
  assert.equal(app.run('commentThread().replyTo'), '小满');
  assert.equal(app.run('commentThread().comments[0].likes'), 13);
  assert.doesNotMatch(app.run('commentsBody()'), /修车铺/);
  app.run("state.id = 'return'");
  assert.equal(app.run('commentThread().draft'), '重返1998的草稿');
});

test('failed submissions preserve the draft; publish and delete affect only the current drama', () => {
  const app = prototype();
  app.run("state.id = 'night'; state.loggedIn = true; state.scenario = 'error'");
  app.submit('只属于长夜有声的评论');
  assert.equal(app.run('commentThread().draft'), '只属于长夜有声的评论');
  assert.equal(app.run('commentThread().comments.length'), 2);
  app.run("state.scenario = 'normal'");
  app.submit('只属于长夜有声的评论');
  assert.equal(app.run('commentThread().comments.length'), 3);
  assert.equal(app.run('commentThread().draft'), '');
  app.run("state.id = 'return'");
  assert.equal(app.run('commentThread().comments.length'), 2);
  assert.doesNotMatch(app.run('commentsBody()'), /只属于长夜有声/);
  app.run("state.id = 'night'; confirmDialog = (_title, _body, _action, callback) => callback();");
  const id = app.run('commentThread().comments[0].id');
  app.run(`handleAction('delete-comment', '${id}')`);
  assert.equal(app.run('commentThread().comments.length'), 2);
  assert.equal(app.json('commentThread().comments.map(c => c.id)').includes(id), false);
});

test('focus restoration finds the field in the active dialog', () => {
  const app = prototype();
  app.run(`
    let focused = false;
    const field = {
      id: 'comment-draft',
      getClientRects: () => [{}],
      focus: () => { focused = true; },
    };
    overlay.open = true;
    overlay.contains = (node) => node === field;
    overlay.querySelectorAll = () => [field];
    document.getElementById = () => { throw new Error('Must not select a field behind the dialog'); };
  `);
  assert.equal(app.run("restoreFocus({ id: 'comment-draft' })"), true);
  assert.equal(app.run('focused'), true);
});
