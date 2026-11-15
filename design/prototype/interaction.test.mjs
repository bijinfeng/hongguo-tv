import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function harness() {
  const listeners = new Map();
  const nodes = new Map();
  const on = (scope) => (name, callback) => {
    const key = `${scope}:${name}`;
    listeners.set(key, [...(listeners.get(key) || []), callback]);
  };
  const node = (selector) => {
    if (!nodes.has(selector))
      nodes.set(selector, {
        id: selector.startsWith('#') ? selector.slice(1) : '',
        dataset: {},
        value: '',
        textContent: '',
        attributes: {},
        isConnected: true,
        classList: { contains: () => false, remove() {} },
        addEventListener: on(selector),
        querySelector: node,
        querySelectorAll: () => [],
        closest: () => null,
        focus() {
          document.activeElement = this;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes[name];
        },
        removeAttribute(name) {
          delete this.attributes[name];
        },
      });
    return nodes.get(selector);
  };
  const document = {
    documentElement: { dataset: {} },
    activeElement: null,
    querySelector: node,
    querySelectorAll: () => [],
    addEventListener: on('document'),
  };
  const context = vm.createContext({
    document,
    window: { addEventListener: on('window'), scrollY: 0, scrollTo() {} },
    location: { search: '' },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  const emit = (name, target, scope = 'document', extra = {}) => {
    const event = { target, key: name, preventDefault() {}, ...extra };
    for (const callback of listeners.get(`${scope}:${name}`) || []) callback(event);
  };
  vm.runInContext(read('./shared/controls.js'), context);
  return { context, node, document, emit, run: (code) => vm.runInContext(code, context) };
}

function app() {
  const h = harness();
  const source = read('./app.js');
  h.run(
    ['desktop.js', 'tv.js', 'updates.js'].map((p) => read(`./${p}`)).join('\n') +
      source.slice(0, source.lastIndexOf("$('#search-icon')")),
  );
  h.run(`render = () => {}; toast = () => {};
    let dialogBody = ''; let restored = [];
    showDialog = (title, body) => { $('#dialog-title').textContent = title; dialogBody = body; overlay.open = true; };
    restoreFocus = (key) => { restored.push(key); return !!key; };
    state.loginTab = '手机号登录'; loginDialog();`);
  return h;
}

test('login rerenders preserve typed code and keep its name separate from the send action', () => {
  const h = app();
  const input = h.node('#code');
  input.value = '123456';
  input.attributes['aria-invalid'] = 'true';
  h.node('#code-error').textContent = '旧错误';
  h.emit('input', input);
  h.run(
    "handleAction('account-code-send'); handleAction('login-tab', '扫码登录'); handleAction('login-tab', '手机号登录')",
  );
  assert.equal(h.run('state.accountDemo.digits.code'), '123456');
  assert.match(h.run('dialogBody'), /id="code"[^>]*value="123456"/);
  assert.match(h.run('dialogBody'), /<label for="code">验证码<\/label>/);
  assert.equal(input.attributes['aria-invalid'], undefined);
  assert.equal(h.node('#code-error').textContent, '');
});

test('TV Back cancels only the login input substep, rolls back digits and restores its source', () => {
  const h = app();
  h.run(`state.mode = 'tv';
    const source = { dataset: { action: 'phone-keypad', value: 'code' }, isConnected: true, closest: () => null };
    handleAction('phone-keypad', 'code', source);
    handleAction('account-keypad-digit', '1'); back();`);
  assert.equal(h.run('state.accountDemo.view'), 'login');
  assert.equal(h.run('state.accountDemo.digits.code'), '');
  assert.equal(h.run('overlay.open'), true);
  assert.equal(h.run('restored.at(-1).value'), 'phone-keypad');
  assert.equal(h.run('restored.at(-1).secondary'), 'code');
  h.run("handleAction('account-country'); back()");
  assert.equal(h.run('state.accountDemo.view'), 'login');
  assert.equal(h.run('overlay.open'), true);
});

test('collection toggle semantics and stable-size class are shared by desktop and TV', () => {
  const h = app();
  for (const platform of ['desktop', 'tv']) {
    h.run(`state.mode = '${platform}'`);
    assert.match(h.run("button('已收藏', 'favorite', {value:'spring'})"), /collection-toggle/);
    assert.match(h.run("button('已收藏', 'favorite', {value:'spring'})"), /aria-pressed="true"/);
  }
});

test('advanced desktop selectors share filter state without replacing the primary chips', () => {
  const h = app();
  const markup = h.run('discoverFilters()');
  assert.equal([...markup.matchAll(/data-discover-filter=/g)].length, 5);
  assert.match(markup, /advanced-filter-grid/);
  assert.match(markup, /data-action="kind"/);
  assert.match(markup, /<label><span>受众<\/span><select id="desktop-discover-audience"/);
  h.emit('change', {
    id: 'desktop-discover-audience',
    dataset: { discoverFilter: 'discover-audience' },
    value: '女频',
  });
  assert.equal(h.run('state.discoverAudience'), '女频');
  assert.match(h.run('discoverFilters()'), /<option selected>女频<\/option>/);
  assert.match(h.run('discoverFilters(true)'), /advanced-filter-grid tv-filter/);
});

test('TV volume requires confirmation, cancels interruptions and keeps arrows for navigation at rest', () => {
  const h = app();
  h.run(
    "state.mode = 'tv'; let volumeDirection = ''; moveSpatialFocus = key => volumeDirection = key;",
  );
  const range = h.node('#volume');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = '60';
  range.style = { setProperty() {} };
  range.matches = (selector) => selector === 'input, textarea, select';
  const key = (value) => h.emit('keydown', range, 'document', { key: value });
  key('ArrowRight');
  assert.equal(h.run('volumeDirection'), 'ArrowRight');
  assert.equal(range.dataset.editing, undefined);
  for (const interruption of ['Escape', 'focusout', 'blur', 'visibilitychange', 'pointercancel']) {
    key('Enter');
    range.value = '70';
    h.emit('input', range);
    assert.equal(h.run('state.volume'), 60, interruption);
    if (interruption === 'Escape') key('Escape');
    else {
      h.document.hidden = true;
      h.emit(interruption, range, interruption === 'blur' ? 'window' : 'document');
    }
    assert.equal(range.value, '60', interruption);
    assert.equal(range.dataset.editing, undefined, interruption);
  }
  key('Enter');
  range.value = '70';
  h.emit('input', range);
  key('Enter');
  assert.equal(h.run('state.volume'), 70);
  assert.equal(range.dataset.editing, undefined);
  assert.match(h.node('#tv-volume-status').textContent, /音量 70%/);
});

test('removing a collection row focuses the next survivor or the empty-state action', () => {
  const h = app();
  h.run(`const removed = { dataset: {action:'favorite', value:'spring'}, isConnected:true, closest: () => null };
    const neighbor = { dataset: {action:'favorite', value:'night'}, isConnected:true, closest: () => null };
    const rows = [removed, neighbor].map(button => ({ querySelector: () => button }));
    removed.closest = selector => selector === '.media-row' ? rows[0] : null;
    document.activeElement = removed;
    content.querySelectorAll = selector => selector === '.media-row' ? rows : [];
    let surviving = true;
    let neighborRecovered = false;
    restoreFocus = key => { const found = key?.secondary === 'night' && surviving; neighborRecovered ||= found; return found; };
    refreshPreservingFocus();
    surviving = false;
    const emptyAction = {focus: () => { document.activeElement = emptyAction; }};
    content.querySelector = () => emptyAction;
    refreshPreservingFocus();
    globalThis.recoveredEmptyFocus = document.activeElement === emptyAction;`);
  assert.equal(h.run('recoveredEmptyFocus'), true);
  assert.equal(h.run('neighborRecovered'), true);
});

test('closing a deletion confirmation skips a disabled source and focuses the remaining collection', () => {
  const h = app();
  h.run(`state.route = 'history'; closeUpdateSystemStep = () => {};
    lastFocus = {isConnected:true, disabled:true, focus: () => { throw new Error('disabled source'); }};
    restoreFocus = () => false;
    const remaining = {focus: () => { document.activeElement = remaining; }};
    content.querySelector = () => remaining;`);
  h.emit('close', h.node('#overlay'), '#overlay');
  assert.equal(h.run('document.activeElement === remaining'), true);
});

test('TV range previews roll back on focus loss, window blur, page hiding and pointer cancellation', () => {
  const h = harness();
  let source = read('./components/components.js');
  source = source
    .replace(/import\s+\{([\s\S]*?)\}\s+from\s+'[^']+';/g, (_, names) => {
      for (const name of names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean))
        h.context[name] = () => false;
      return '';
    })
    .replace('\nrender();\n', '\n');
  h.run(source);
  h.run("state.platform = 'tv'");
  h.node('#query-status').textContent = '请输入剧名或演员后再搜索';
  h.node('#query').value = '春山';
  h.emit('input', h.node('#query'));
  assert.equal(h.node('#query-status').textContent, '');
  const range = h.node('#seek');
  range.type = 'range';
  range.matches = (selector) => selector === 'input[type=range]';
  range.closest = () => null;
  range.style = { setProperty() {} };
  range.min = '0';
  range.max = '120';
  range.dispatchEvent = (event) => h.emit(event.type, range);
  h.document.querySelectorAll = () => [range];
  for (const [name, scope] of [
    ['focusout', 'document'],
    ['blur', 'window'],
    ['visibilitychange', 'document'],
    ['pointercancel', 'document'],
  ]) {
    range.value = '37';
    range.dataset = { committed: '36', editing: 'true' };
    h.document.hidden = true;
    h.emit(name, range, scope);
    assert.equal(range.value, '36', name);
    assert.equal(range.dataset.editing, undefined, name);
    assert.match(h.node('#seek-status').textContent, /已取消调整.*00:36/, name);
  }
});
