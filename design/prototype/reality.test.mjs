import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function prototype() {
  const nodes = new Map();
  const querySelector = (selector) => {
    if (!nodes.has(selector))
      nodes.set(selector, {
        id: selector.startsWith('#') ? selector.slice(1) : '',
        value: '',
        hidden: true,
        attributes: {},
        addEventListener() {},
        classList: { contains: () => false },
        focus() {},
        scrollIntoView() {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        removeAttribute(name) {
          delete this.attributes[name];
        },
      });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    window: { scrollY: 0, scrollTo() {} },
    document: { querySelector, addEventListener() {} },
    setTimeout,
    clearTimeout,
  });
  const shared = readFileSync(new URL('./shared/controls.js', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const presentations = ['desktop.js', 'tv.js', 'updates.js']
    .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
    .join('\n');
  vm.runInContext(
    shared + presentations + source.slice(0, source.lastIndexOf("$('#search-icon')")),
    context,
  );
  vm.runInContext(
    `render = () => {}; let message = ''; toast = value => message = value;
    let dialogTitle = ''; let dialogBody = ''; showDialog = (title, body) => { dialogTitle = title; dialogBody = body; };
    let logins = 0; loginDialog = () => logins++;`,
    context,
  );
  return (code) => vm.runInContext(code, context);
}

test('rank category changes clear dependent selectors and actors open works without playing', () => {
  const run = prototype();
  run("state.rankPanel = '男频'; handleAction('rank-category', '演员')");
  assert.equal(run('state.rankSub'), '星光榜');
  assert.equal(run('state.rankPanel'), '全部');
  assert.match(run('rankingPage()'), /data-action="actor"/);
  assert.doesNotMatch(run('rankingPage()'), /data-action="play"/);
  assert.match(run('tvRanking()'), /data-action="actor"/);
  const previous = run('state.id');
  run("handleAction('actor', 'demo-actor-1')");
  assert.match(run('dialogBody'), /data-detail="return"/);
  assert.match(run('dialogBody'), /data-detail="night"/);
  assert.equal(run('state.id'), previous);
  run("handleAction('rank-category', '真人剧')");
  assert.equal(run('state.rankSub'), '热播榜');
});

test('radar renders zero, negative and unknown metrics distinctly and keeps independent branches', () => {
  const run = prototype();
  run("state.rankView = '榜单雷达'; state.radarView = '飙升榜'");
  const markup = run('rankingPage()');
  assert.match(markup, />0<\/td>/);
  assert.match(markup, /-1,200/);
  assert.match(markup, /-3%/);
  assert.match(markup, />—<\/td>/);
  assert.doesNotMatch(markup, /radar-value|完播|讨论/);
  assert.deepEqual(
    [...markup.matchAll(/data-action="detail" data-value="([^"]+)"/g)].map((match) => match[1]),
    ['return', 'spring', 'night', 'home'],
  );
  run("handleAction('radar-scenario', '增长失败')");
  assert.match(run('radarPage()'), /暂无增长数据/);
  run("handleAction('radar-view', '官方快照')");
  assert.match(run('radarPage()'), /重返1998/);
  assert.doesNotMatch(run('radarPage()'), /128,000/);
  run("handleAction('radar-scenario', '快照失败'); handleAction('radar-view', '飙升榜')");
  assert.match(run('radarPage()'), /重返1998/);
  run("handleAction('radar-scenario', '使用缓存')");
  assert.match(run('radarPage()'), /最近成功数据/);
});

test('calendar has no invented content filters and recommendation audiences are isolated', () => {
  const run = prototype();
  run("state.kind = '漫剧'");
  assert.doesNotMatch(run('newPage()'), /data-action="kind"|data-action="new-gender"/);
  assert.match(run('newPage()'), /固定日期演示/);
  assert.match(run('newPage()'), /待上线/);
  run("handleAction('new-mode', '新剧推荐'); handleAction('new-gender', '男频')");
  assert.match(run('newPage()'), /data-action="new-gender"/);
  assert.match(run('newPage()'), /重返1998/);
  assert.doesNotMatch(run('newPage()'), /春山不负/);
  run("handleAction('new-mode', '上新日历'); handleAction('new-date', '2')");
  assert.match(run('tvNew()'), /这天暂未安排上新/);
  assert.equal(run('state.newGender'), '男频');
});

test('reservation acceptance remains pending, respects login and ignores repeat submission', () => {
  const run = prototype();
  run("handleAction('reserve', 'spring-third')");
  assert.equal(run('logins'), 1);
  assert.equal(run('state.reservationPending.size'), 0);
  run(
    "state.loggedIn = true; handleAction('reserve', 'spring-third'); handleAction('reserve', 'spring-third')",
  );
  assert.equal(run('state.reservationPending.size'), 1);
  assert.equal(run("state.reservations.has('spring-third')"), false);
  assert.match(run('message'), /等待列表确认/);
  assert.match(run('newPage()'), /已提交 · 待确认/);
  assert.doesNotMatch(run('message'), /已预约第二季上线提醒/);
});

test('catalog continuation failures preserve results and retry appends within the current selection', () => {
  const run = prototype();
  const visible = () =>
    [...run('discoverPage()').matchAll(/data-detail="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(visible(), ['return', 'spring']);
  assert.match(run('discoverPage()'), /已加载 2 部/);
  run("handleAction('discover-page-state', '续页失败')");
  assert.deepEqual(visible(), ['return', 'spring']);
  assert.match(run('discoverPage()'), /重试加载/);
  run("handleAction('discover-more')");
  assert.deepEqual(visible(), ['return', 'spring', 'night', 'home']);
  assert.match(run('discoverPage()'), /没有更多内容/);
  run("state.query = '长夜'");
  assert.deepEqual(visible(), ['night']);
  run("state.query = ''");
  assert.equal(visible().length, 4);
});

test('typed desktop suggestions dispatch actor, drama and keyword identities and retain keyboard control', () => {
  const run = prototype();
  run(
    "navigate = (route, id) => { state.route = route; if (id) state.id = id; }; $('#search').value = '春'; updateSearchSuggestions()",
  );
  assert.match(run("$('#search-suggestions').innerHTML"), /短剧|角色|专辑/);
  assert.equal(run("$('#search').attributes['aria-expanded']"), 'true');
  run(
    "let prevented = 0; const key = (key, isComposing = false) => handleSearchSuggestionKey({key, isComposing, target: $('#search'), preventDefault: () => prevented++}); key('ArrowDown')",
  );
  assert.equal(run('state.searchSuggestionIndex'), 0);
  assert.equal(run("$('#search').attributes['aria-activedescendant']"), 'search-suggestion-0');
  run("key('ArrowDown', true)");
  assert.equal(run('state.searchSuggestionIndex'), 0);
  run("key('Enter')");
  assert.equal(run('state.route'), 'detail');
  assert.equal(run('state.id'), 'spring');
  assert.equal(run("$('#search-suggestion-panel').hidden"), true);
  run("$('#search').value = '林'; updateSearchSuggestions(); chooseSearchSuggestion(0)");
  assert.match(run('dialogTitle'), /林川/);
  assert.equal(run('state.id'), 'spring');
  run("$('#search').value = '重生'; updateSearchSuggestions(); chooseSearchSuggestion(0)");
  assert.equal(run('state.query'), '重生');
  assert.equal(run('state.route'), 'discover');
  run("handleAction('search-suggestion-state', '建议失败')");
  assert.match(run("$('#search-suggestion-status').innerHTML"), /直接搜索/);
  run("handleAction('search-suggestions-retry')");
  assert.match(run("$('#search-suggestions').innerHTML"), /关键词/);
  run("key('Escape')");
  assert.equal(run("$('#search').attributes['aria-expanded']"), 'false');
});

test('search history keeps ten unique recent queries and save failure never blocks results', () => {
  const run = prototype();
  run(
    "navigate = route => state.route = route; state.searches = []; for (let i = 0; i < 12; i++) searchFor('查询' + i); searchFor('查询10')",
  );
  assert.equal(run('state.searches.length'), 10);
  assert.equal(run('state.searches[0]'), '查询10');
  assert.equal(run("state.searches.includes('查询0')"), false);
  run("handleAction('search-history-state', '保存失败'); searchFor('长夜')");
  assert.equal(run('state.query'), '长夜');
  assert.equal(run('state.searches[0]'), '长夜');
  assert.match(run('discoverPage()'), /data-detail="night"/);
  assert.match(run('discoverPage()'), /搜索记录未保存/);
  run("handleAction('search-history-retry')");
  assert.equal(run('state.searchHistoryError'), false);
  assert.equal(run('state.query'), '长夜');
});

test('actor works show busy, failure, empty and retry without changing the playing identity', () => {
  const run = prototype();
  run("handleAction('actor', 'demo-actor-2'); handleAction('actor-state', '读取中')");
  assert.match(run('dialogBody'), /aria-busy="true"/);
  run("handleAction('actor-state', '读取失败')");
  assert.match(run('dialogBody'), /data-action="actor-retry"/);
  assert.doesNotMatch(run('dialogBody'), /data-detail=/);
  run("handleAction('actor-retry')");
  assert.match(run('dialogBody'), /data-detail="spring"/);
  assert.doesNotMatch(run('dialogBody'), /data-detail="return"/);
  assert.equal(run('state.id'), 'return');
  run("handleAction('actor-state', '暂无作品')");
  assert.doesNotMatch(run('dialogBody'), /data-detail=/);
});

test('new recommendations and both calendar branches preserve independent continuation and unknown times', () => {
  const run = prototype();
  const visible = () =>
    [...run('newPage()').matchAll(/data-detail="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(visible(), ['home', 'night']);
  run("handleAction('new-page-state', '续页失败')");
  assert.deepEqual(visible(), ['home', 'night']);
  assert.match(run('newPage()'), /重试加载/);
  run("handleAction('new-more', 'released')");
  assert.deepEqual(visible(), ['home', 'night', 'return', 'spring']);
  assert.equal(run("state.newPages[newPageKey('upcoming')].limit"), 1);
  run("handleAction('new-more', 'upcoming')");
  assert.match(run('tvNew()'), /上线时间待定/);
  assert.doesNotMatch(
    run('newPage()').split('山海来信（演示）</h2>')[1].split('</article>')[0],
    /data-action=/,
  );
  run("handleAction('new-date', '1')");
  assert.doesNotMatch(run('newPage()'), /上线时间待定/);
  run("handleAction('new-mode', '新剧推荐')");
  assert.equal(visible().length, 2);
  run("handleAction('new-more', 'recommend'); handleAction('new-gender', '女频')");
  assert.deepEqual(visible(), ['spring', 'home']);
  run("handleAction('new-gender', '全部')");
  assert.equal(visible().length, 4);
});
