import { registerFeedUiTests } from './feed-ui';
import { registerFeedTests } from './feed';
import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';
import { registerFocusedRemovalTests, registerSearchFocusTests } from './focused-removal';
import { registerCategoryTests } from './category';

const drama = {
  series_id: '123',
  title: '重生之后',
  cover: '',
  intro: '重新开始的故事。',
  episode_count: 3,
  episodes: [
    { index: 1, video_id: '456', locked: false },
    { index: 2, video_id: '457', locked: false },
    { index: 3, video_id: '458', locked: true },
  ],
};
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
function fixture(request: StubRequest): StubResponse {
  const url = new URL(request.url);
  if (url.pathname === '/api/v1/search/history') return ok({ items: [] });
  if (url.pathname === '/api/v1/search/suggestions') return ok({ items: [] });
  if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
  if (url.pathname === '/api/v1/library') return ok({ entries: [], owner_id: '' });
  if (url.pathname === '/api/v1/account') return ok({ logged_in: false, qr_login_available: true });
  if (url.pathname === '/api/v1/search') return ok({ items: [drama], has_more: false });
  if (url.pathname === '/api/v1/series/detail') return ok(drama);
  if (url.pathname === '/api/v1/play/info')
    return ok({
      path: '/minireel-proxy/media/' + 'a'.repeat(64),
      vid: url.searchParams.get('vid'),
      video_codec: 'h264',
      quality: '720P',
      qualities: ['720P'],
    });
  if (url.pathname === '/api/v1/play/release') return ok({ released: true });
  return { status: 404, body: { ok: false, error: 'Unknown fixture' } };
}

export function registerBrowsingTests(target: 'desktop' | 'tv' = 'desktop', entry = './App.tsx') {
  registerCategoryTests();
  registerFeedTests();
  registerFeedUiTests(target, entry);
  test('typed suggestions validate Unicode, debounce composition, cancel superseded/dismissed/inactive/disposed reads and retry', async () => {
    const app = await open('./SuggestionsStatePreview.tsx', { clock: {} });
    await app.press('验证输入');
    await app.waitFor('validation-passed');
    await app.press('开始组合');
    await app.press('聚焦建议');
    await app.wait(300);
    expect(app.texts().some((text) => text.includes('read-'))).toBe(false);
    await app.press('结束组合');
    await app.wait(160);
    expect(app.texts().some((text) => text.includes('read-'))).toBe(false);
    await app.wait(100);
    await app.waitUntil(() => app.texts().some((text) => text.includes('read-1-甲')));
    await app.press('输入乙');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-1')));
    await app.press('完成旧建议');
    expect(app.shows('text:items:建议1')).toBe(false);
    await app.wait(260);
    await app.press('失败建议');
    await app.waitFor('suggestion-error');
    await app.press('重试建议');
    await app.wait(260);
    await app.press('完成当前建议');
    await app.waitFor('text:items:建议3');
    await app.press('关闭建议');
    await app.waitFor('text:open:false');
    await app.press('聚焦建议');
    await app.waitFor('text:open:true');
    await app.press('重试建议');
    await app.wait(260);
    await app.press('离开建议');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-4')));
    await app.press('完成当前建议');
    await app.waitFor('text:open:false');
    expect(app.shows('text:items:建议4')).toBe(false);
    await app.press('返回建议');
    await app.press('聚焦建议');
    await app.wait(260);
    await app.press('移除建议');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-5')));
    await app.press('完成当前建议');
    expect(app.shows('id:suggestions-owner')).toBe(false);
  });
  test('typed suggestion actions preserve exact actor/drama identity, return sources and full invalid keyword editing', async () => {
    const writes: string[] = [];
    const searchQueries: string[] = [];
    const typed = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (request.method === 'POST') writes.push(request.body || '');
      if (url.pathname === '/api/v1/search') searchQueries.push(url.searchParams.get('q') || '');
      if (url.pathname === '/api/v1/search/suggestions')
        return ok({
          items: [
            {
              kind: 'short_play_actor',
              key: 'not-an-id',
              name: '演员甲',
              actor_id: '9007199254740993',
            },
            { kind: 'short_play_name', key: 'wrong-series', name: '指定作品', drama },
            { kind: 'common_query', key: 'opaque', name: '词'.repeat(81) },
            { kind: 'short_play_actor', key: '123', name: '普通词' },
            { kind: 'short_play_name', key: 'other', name: '普通词' },
            { kind: 'common_query', key: 'third', name: '普通词' },
          ],
        });
      if (url.pathname === '/api/v1/actors/works') {
        expect(url.searchParams.get('actor_id')).toBe('9007199254740993');
        return ok({
          actor: { id: '9007199254740993', name: '演员甲', description: '公开简介' },
          items: [drama, { ...drama, series_id: '124', title: '第二部作品' }],
        });
      }
      if (url.pathname === '/api/v1/series/detail' && url.searchParams.get('series_id') === '124')
        return ok({ ...drama, series_id: '124', title: '第二部作品' });
      return fixture(request);
    };
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      reducedMotion: true,
      clock: {},
      network: { '*': typed, 'POST *': typed },
    });
    await app.press('id:nav-search');
    await app.type('id:search-input', '演员');
    await app.waitFor('id:suggestion-actor:9007199254740993');
    await app.keyboard.press('down');
    await app.keyboard.press('enter');
    await app.waitFor('id:actor-works');
    await app.waitFor('id:drama-124');
    expect(app.shows('公开简介')).toBe(true);
    await app.press('id:drama-124');
    await app.waitFor('id:episode-range-trigger');
    expect(app.shows('第二部作品')).toBe(true);
    await app.back();
    await app.waitFor('id:drama-124');
    await app.wait(100);
    await app.keyboard.press('enter');
    await app.waitFor('id:episode-range-trigger');
    expect(app.shows('第二部作品')).toBe(true);
    await app.back();
    await app.waitFor('id:actor-works');
    await app.back();
    await app.waitFor('id:suggestion-actor:9007199254740993');
    await app.wait(100);
    await app.keyboard.press('down');
    await app.keyboard.press('enter');
    await app.waitFor('id:episode-range-trigger');
    expect(app.shows('id:actor-works')).toBe(false);
    await app.back();
    await app.waitFor('id:suggestion-query:' + '词'.repeat(81));
    await app.press('id:suggestion-query:' + '词'.repeat(81));
    await app.waitFor('id:search-validation');
    expect(app.value('id:search-input')).toBe('词'.repeat(81));
    expect(searchQueries.length).toBe(0);
    expect(writes.length).toBe(0);
    await app.clear('id:search-input');
    await app.type('id:search-input', '已缩短');
    await app.submit('id:search-input');
    await app.waitFor('id:drama-123');
    expect(searchQueries).toEqual(['已缩短']);
    await app.clear('id:search-input');
    await app.type('id:search-input', '普通');
    await app.waitFor('id:suggestion-query:普通词');
    expect(app.count('id:suggestion-query:普通词')).toBe(1);
    await app.press('id:suggestion-query:普通词');
    await app.waitUntil(() => searchQueries.includes('普通词'));
    expect(searchQueries).toEqual(['已缩短', '普通词']);
    expect(writes.every((body) => JSON.parse(body).action === 'add')).toBe(true);
  });
  test('suggestion Escape, Tab, outside and first-row Up keep navigation and editing usable', async () => {
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      clock: {},
      network: {
        '*': (request) =>
          new URL(request.url).pathname === '/api/v1/search/suggestions'
            ? ok({ items: [{ kind: 'common_query', key: 'opaque', name: '建议查询' }] })
            : fixture(request),
      },
    });
    await app.press('id:nav-search');
    await app.type('id:search-input', '查');
    await app.waitFor('id:search-suggestions');
    await app.keyboard.press('down');
    await app.keyboard.press('up');
    await app.keyboard.press('x');
    expect(app.value('id:search-input')).toBe('查x');
    await app.keyboard.press('escape');
    expect(app.shows('id:search-suggestions')).toBe(false);
    expect(app.shows('找剧') || target === 'tv').toBe(true);
    await app.type('id:search-input', '新查');
    await app.waitFor('id:search-suggestions');
    await app.keyboard.press('tab');
    expect(app.shows('id:search-suggestions')).toBe(false);
    await app.keyboard.press('enter');
    await app.waitFor('id:drama-123');
    await app.type('id:search-input', '再查');
    await app.waitFor('id:search-suggestions');
    await app.press('id:nav-history');
    expect(app.shows('id:search-suggestions')).toBe(false);
  });
  test('suggestion retry is reachable by Down/Enter, background cancels reads and actor states retry without writes', async () => {
    let suggestionReads = 0;
    let actorReads = 0;
    const writes: string[] = [];
    const network = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (request.method === 'POST') writes.push(url.pathname);
      if (url.pathname === '/api/v1/search/suggestions') {
        suggestionReads++;
        if (suggestionReads === 1) return { status: 503, body: { ok: false, error: '合成失败' } };
        return {
          ...ok({
            items: [{ kind: 'short_play_actor', key: 'opaque', name: '演员乙', actor_id: '42' }],
          }),
          delay: suggestionReads === 2 ? 500 : 100,
        };
      }
      if (url.pathname === '/api/v1/actors/works') {
        actorReads++;
        if (actorReads === 1)
          return { status: 503, body: { ok: false, error: '合成作品失败' }, delay: 200 };
        return {
          ...ok({ actor: { id: '42', name: '演员乙' }, items: [] }),
          delay: actorReads === 3 ? 500 : 50,
        };
      }
      return fixture(request);
    };
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': network, 'POST *': network },
    });
    await app.press('id:nav-search');
    await app.type('id:search-input', '演员');
    await app.waitFor('建议未能加载');
    await app.keyboard.press('down');
    await app.keyboard.press('enter');
    await app.waitFor('正在加载建议…');
    expect(suggestionReads).toBe(2);
    await app.setLifecycle('background');
    await app.wait(600);
    expect(app.shows('id:search-suggestions')).toBe(false);
    await app.setLifecycle('active');
    expect(app.shows('id:search-suggestions')).toBe(false);
    await app.type('id:search-input', '乙');
    await app.waitFor('id:suggestion-actor:42');
    await app.press('id:suggestion-actor:42');
    await app.waitFor('正在加载作品…');
    await app.waitFor('作品未能加载');
    await app.press('重试');
    await app.waitFor('暂时没有可展示的作品');
    expect(actorReads).toBe(2);
    await app.back();
    await app.waitFor('id:suggestion-actor:42');
    await app.press('id:suggestion-actor:42');
    await app.waitFor('正在加载作品…');
    await app.back();
    await app.wait(600);
    expect(app.shows('id:actor-works')).toBe(false);
    expect(app.shows('暂时没有可展示的作品')).toBe(false);
    expect(writes).toEqual([]);
  });
  test('newer pointer, keyboard or host focus intent cancels returns and subscriptions dispose', async () => {
    const app = await open('./ReturnFocusStatePreview.tsx', { clock: {} });
    await app.press('打开来源');
    await app.press('返回后用户移动');
    await app.wait(120);
    await app.waitFor('text:returns:0');
    await app.press('宿主输入焦点');
    await app.waitFor('text:host-focus:search-input');
    await app.press('打开来源');
    await app.press('返回后遥控移动');
    await app.wait(120);
    await app.waitFor('text:returns:0');
    await app.press('打开来源');
    await app.press('正常返回来源');
    await app.waitFor('text:returns:1');
    await app.press('移除焦点所有者');
    await app.waitFor('text:focus-subscriptions:0');
  });
  test('card controls preserve one Tab stop, arrow/home/end movement, exact ref focus and disposal', async () => {
    const app = await open('./CardControlsStatePreview.tsx', {
      platform: 'macos',
      width: 1180,
      height: 780,
      network: {},
    });
    await app.keyboard.press('tab');
    await app.keyboard.press('tab');
    await app.keyboard.press('right');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2');
    await app.keyboard.press('end');
    await app.keyboard.press('space');
    await app.waitFor('text:events:2,3');
    await app.keyboard.press('home');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2,3,1');
    await app.keyboard.press('left');
    await app.keyboard.press('tab');
    await app.keyboard.press('home');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2,3,1,after');
    await app.press('聚焦第二张');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2,3,1,after,2');
    await app.press('移除第二张');
    await app.press('聚焦第三张');
    await app.keyboard.press('right');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2,3,1,after,2,1');
    await app.press('移除卡片组');
    await app.keyboard.press('right');
    await app.keyboard.press('enter');
    await app.waitFor('text:events:2,3,1,after,2,1,after');
  });
  test('source controls skip disabled commands and restore reordered or shortened filter identities', async () => {
    const app = await open('./SourceControlsStatePreview.tsx', {
      platform: 'macos',
      width: 1180,
      height: 780,
      network: {},
    });
    await app.press('聚焦命令C');
    await app.keyboard.press('left');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:a');
    await app.press('聚焦命令C');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:c');
    await app.keyboard.press('ctrl+d');
    await app.waitFor('text:event:disabled');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:a');
    await app.press('id:source-topic-b');
    await app.press('重排题材');
    await app.press('恢复题材来源');
    await app.keyboard.press('left');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:a');
    await app.keyboard.press('home');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:c');
    await app.keyboard.press('end');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:b');
    await app.press('收缩题材');
    await app.press('恢复题材来源');
    await app.keyboard.press('right');
    await app.keyboard.press('enter');
    await app.waitFor('text:event:a');
  });
  registerFocusedRemovalTests('./FocusedRemovalStatePreview.tsx');
  registerSearchFocusTests('./SearchFocusStatePreview.tsx');
  test('discovery cancels inactive and disposed reads, ignores stale completion and retries honest empty/errors', async () => {
    const app = await open('./DiscoveryStatePreview.tsx');
    expect(app.texts().some((text) => text.includes('read-'))).toBe(false);
    await app.press('进入发现');
    await app.waitFor('read-1');
    await app.press('离开发现');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-1')));
    await app.press('完成旧发现');
    expect(app.shows('text:data:建议1')).toBe(false);
    await app.press('进入发现');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read-2')));
    await app.press('完成最新发现');
    await app.waitFor('text:data:建议2');
    await app.press('刷新发现');
    await app.waitFor('text:state:refreshing');
    expect(app.shows('text:data:建议2')).toBe(true);
    await app.press('失败发现');
    await app.waitFor('discovery-error');
    expect(app.shows('text:data:建议2')).toBe(true);
    await app.press('刷新发现');
    await app.press('空发现');
    await app.waitFor('text:state:ready');
    await app.waitFor('text:data:');
    await app.waitFor('no-discovery-error');
    await app.press('刷新发现');
    await app.press('提交关键词');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-5')));
    await app.press('完成最新发现');
    expect(app.shows('text:data:建议5')).toBe(false);
    await app.press('清除关键词');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read-6')));
    await app.press('移除发现');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort-6')));
    await app.press('完成最新发现');
    expect(app.shows('id:discovery-owner')).toBe(false);
  });

  test('public discovery retries failures, keeps keyword identities nonplayable and returns to exact cards', async () => {
    let attempt = 0;
    const keywords: string[] = [];
    const discoveryRequest = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (url.pathname === '/api/v1/search/discovery') {
        expect(url.search).toBe('');
        expect(request.method).toBe('GET');
        if (++attempt === 1)
          return { status: 503, body: { ok: false, error: '合成发现失败' }, delay: 80 };
        return {
          ...ok({
            guesses: [
              { series_id: '', title: '都市逆袭', query: '都市逆袭', cover: '', intro: '' },
              { ...drama, title: '都市逆袭' },
              { ...drama, series_id: '125', title: '都市逆袭' },
            ],
            boards: [
              { id: 'short', items: [drama] },
              {
                id: 'comic',
                items: [
                  { ...drama, content_type: '1004' },
                  { ...drama, series_id: '124', content_type: '1' },
                ],
              },
            ],
          }),
          delay: attempt >= 4 ? 200 : 0,
        };
      }
      if (url.pathname === '/api/v1/search/history') {
        if (request.method === 'POST') {
          const body = JSON.parse(request.body || '{}') as { action?: string; query?: string };
          if (body.query) keywords.unshift(body.query);
        }
        return ok({ items: keywords });
      }
      if (url.pathname === '/api/v1/search')
        return ok({ items: [{ ...drama, content_type: '1004' }], has_more: false });
      return fixture(request);
    };
    const app = await open(entry, {
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': discoveryRequest, 'POST *': discoveryRequest },
    });
    await app.press('id:nav-search');
    await app.waitFor('热门内容未能加载');
    await app.press('重试');
    await app.waitFor('id:drama-123');
    expect(app.count('id:drama-123')).toBe(1);
    expect(app.count('id:discovery-query-都市逆袭')).toBe(1);
    expect(app.shows('漫剧 · 3 集')).toBe(true);
    expect(app.shows('id:drama-')).toBe(false);
    await app.press('id:discovery-query-都市逆袭');
    await app.waitUntil(() => app.requests().some((r) => r.url.includes('/search?q=')));
    expect(app.value('id:search-input')).toBe('都市逆袭');
    await app.waitFor('id:clear-query');
    await app.waitFor('id:drama-123');
    expect(app.shows('漫剧 · 3 集')).toBe(false);
    await app.press('id:clear-query');
    await app.waitFor('id:recent-search-都市逆袭');
    await app.waitFor('id:drama-123');
    await app.keyboard.press('tab');
    await app.press('id:drama-123');
    await app.waitFor('id:episode-range-trigger');
    await app.back();
    await app.waitFor('id:drama-123');
    await app.clock!.runFor(70);
    await app.keyboard.press('enter');
    await app.waitFor('id:episode-range-trigger');
    expect(
      app.requests().filter((r) => r.method === 'POST' && !r.url.includes('/search/history'))
        .length,
    ).toBe(0);
  });
  test('empty public discovery retains manual search and recent-search controls', async () => {
    const app = await open(entry, { network: { '*': fixture } });
    await app.press('id:nav-search');
    await app.waitFor('暂时没有推荐内容');
    expect(app.shows('id:drama-123')).toBe(false);
    await app.type('id:search-input', '手动查询');
    await app.submit('id:search-input');
    await app.waitFor('id:drama-123');
    expect(app.shows('暂时没有推荐内容')).toBe(false);
  });

  test('recent keyword loads cannot overwrite a committed mutation and failed clear retries its exact intent', async () => {
    const app = await open('./RecentSearchStatePreview.tsx');
    await app.press('进入发现');
    await app.waitFor('read');
    await app.press('替换关键词宿主');
    await app.press('查询一');
    await app.waitUntil(() => app.texts().some((s) => s.includes('add-查询一')));
    await app.press('完成写入');
    await app.waitFor('text:items:查询一,原关键词');
    await app.press('完成读取');
    expect(app.shows('text:items:查询一,原关键词')).toBe(true);
    await app.press('清空关键词');
    await app.waitFor('text:pending:true');
    await app.press('失败写入');
    await app.waitUntil(() => app.texts().some((s) => s.includes('搜索记录未清空')));
    expect(app.shows('text:items:查询一,原关键词')).toBe(true);
    await app.press('重试关键词');
    await app.waitFor('text:pending:true');
    await app.press('完成写入');
    await app.waitFor('text:items:');
    await app.waitFor('text:pending:false');
    expect(app.texts().some((s) => s.includes('foreign'))).toBe(false);
  });

  test('a committed keyword remains visible when a later queued save fails', async () => {
    const app = await open('./RecentSearchStatePreview.tsx');
    await app.press('查询一');
    await app.waitUntil(() => app.texts().some((s) => s.includes('add-查询一')));
    await app.press('查询二');
    await app.press('完成写入');
    await app.waitFor('text:items:查询一,原关键词');
    await app.waitUntil(() => app.texts().some((s) => s.includes('add-查询二')));
    await app.press('失败写入');
    await app.waitFor('text:pending:false');
    expect(app.shows('text:items:查询一,原关键词')).toBe(true);
    await app.press('重试关键词');
    await app.press('完成写入');
    await app.waitFor('text:items:查询二,查询一,原关键词');
  });

  test('keyword writes preserve invocation order and shutdown drains committed work after removal', async () => {
    const app = await open('./RecentSearchStatePreview.tsx');
    await app.press('查询一');
    await app.waitUntil(() => app.texts().some((s) => s.includes('add-查询一')));
    await app.press('查询二');
    await app.press('清空关键词');
    expect(app.texts().some((s) => s.includes('add-查询二'))).toBe(false);
    await app.press('排空关键词');
    await app.press('移除关键词');
    await app.press('完成写入');
    await app.waitUntil(() => app.texts().some((s) => s.includes('add-查询二')));
    await app.press('完成写入');
    await app.waitUntil(() => app.texts().some((s) => s.endsWith('|clear')));
    await app.press('完成写入');
    await app.waitUntil(() => app.texts().some((s) => s.endsWith('|drained')));
    expect(app.shows('id:recent-owner')).toBe(false);
    expect(app.texts().some((s) => s.includes('foreign'))).toBe(false);
  });

  test('recent keywords execute search, clear-query retains them and failed clearing stays recoverable', async () => {
    let keywords = ['古装'];
    let clearAttempts = 0;
    const keywordRequest = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (url.pathname === '/api/v1/search/history') {
        if (request.method === 'POST') {
          const action = JSON.parse(request.body || '{}');
          if (action.action === 'clear') {
            if (++clearAttempts === 1)
              return { status: 503, body: { ok: false, error: '合成清空失败' } };
            keywords = [];
          } else
            keywords = [action.query, ...keywords.filter((s) => s !== action.query)].slice(0, 10);
        }
        return ok({ items: keywords });
      }
      return fixture(request);
    };
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        '*': keywordRequest,
        'POST *': keywordRequest,
      },
    });
    await app.press('id:nav-search');
    await app.waitFor('id:recent-search-古装');
    await app.press('id:recent-search-古装');
    await app.waitFor('id:drama-123');
    expect(app.value('id:search-input')).toBe('古装');
    await app.press('id:clear-query');
    await app.waitFor('id:recent-search-古装');
    expect(app.shows('id:drama-123')).toBe(false);
    await app.press('id:clear-recent-searches');
    await app.waitFor('搜索记录未清空：合成清空失败');
    expect(app.shows('id:recent-search-古装')).toBe(true);
    await app.press('重试清空');
    await app.waitFor('暂无搜索记录');
    expect(app.shows('id:clear-recent-searches')).toBe(false);
    app.dispose();
  });

  test('search continuation retains results on failure, retries the same cursor and deduplicates appended identities', async () => {
    let pages = 0;
    const second = { ...drama, series_id: '124', title: '第二批故事' };
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        'POST *': fixture,
        '*': (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/api/v1/search') {
            if (!url.searchParams.has('offset'))
              return ok({ items: [drama], has_more: true, next_offset: 1, source: 'web' });
            pages++;
            expect(url.searchParams.get('offset')).toBe('1');
            expect(url.searchParams.get('source')).toBe('web');
            expect(url.searchParams.get('q')).toBe('重生');
            if (pages === 1) return { status: 503, body: { ok: false, error: '合成分页失败' } };
            return ok({
              items: [drama, second, second],
              has_more: false,
              next_offset: 2,
              source: 'web',
            });
          }
          if (url.pathname === '/api/v1/series/detail')
            return ok(url.searchParams.get('series_id') === '124' ? second : drama);
          return fixture(request);
        },
      },
    });
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('id:drama-123');
    await app.press('id:search-more');
    await app.waitFor('加载失败：合成分页失败');
    expect(app.shows('id:drama-123')).toBe(true);
    await app.press('重试');
    await app.waitFor('id:drama-124');
    expect(pages).toBe(2);
    expect(app.count('id:drama-123')).toBe(1);
    expect(app.count('id:drama-124')).toBe(1);
    expect(app.shows('id:search-more')).toBe(false);
    await app.press('id:drama-124');
    await app.waitFor('开始观看');
    await app.back();
    await app.waitFor('id:drama-124');
    expect(app.count('id:drama-124')).toBe(1);
    expect(pages).toBe(2);
  });

  test('nonadvancing continuation fails visibly without consuming the current page', async () => {
    let pages = 0;
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.includes('/search?')) {
            const more = new URL(request.url).searchParams.has('offset');
            if (more) pages++;
            return ok({ items: [drama], has_more: true, next_offset: 1, source: 'web' });
          }
          return fixture(request);
        },
      },
    });
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('id:search-more');
    await app.press('id:search-more');
    await app.waitFor('加载失败：搜索分页数据无效，请重试。');
    expect(app.shows('id:drama-123')).toBe(true);
    expect(pages).toBe(1);
    await app.press('重试');
    await app.waitFor('加载失败：搜索分页数据无效，请重试。');
    expect(pages).toBe(2);
  });

  test('query, refresh and disposal cancel owned continuation even when its transport ignores abort', async () => {
    for (const action of ['搜索新查询', '刷新查询', '移除查询']) {
      const app = await open('./SearchStatePreview.tsx');
      await app.press('搜索旧查询');
      await app.waitFor('100');
      await app.press('替换宿主');
      await app.press('追加两次');
      await app.waitFor('request-旧查询-first|request-旧查询-1');
      await app.press(action);
      await app.waitUntil(() => app.texts().some((text) => text.includes('cancelled')));
      await app.press('完成旧页');
      if (action === '搜索新查询') await app.waitFor('200');
      if (action === '刷新查询') await app.waitFor('100');
      if (action === '移除查询') expect(app.shows('id:search-state')).toBe(false);
      expect(app.texts().includes('100,999')).toBe(false);
      expect(app.texts().some((text) => text.includes('foreign'))).toBe(false);
      app.dispose();
    }
  });

  test('recycled result identity and scroll position survive details and primary navigation', async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      ...drama,
      series_id: String(10000 + i),
      title: `回收列表短剧 ${i + 1}`,
      cover: 'http://127.0.0.1:1/missing',
    }));
    const app = await open(entry, {
      width: 1180,
      height: 780,
      clock: {},
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.includes('/search?')) return ok({ items, has_more: false });
          if (request.url.includes('/series/detail'))
            return ok(
              items.find(
                (item) => item.series_id === new URL(request.url).searchParams.get('series_id'),
              ),
            );
          return fixture(request);
        },
      },
    });
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '长列表');
    await app.press('搜索');
    await app.waitFor('id:drama-10000');
    await app.scroll('id:results', target === 'tv' ? 30000 : 10000);
    await app.waitFor('id:drama-10119');
    await app.press('id:drama-10119');
    await app.waitFor('回收列表短剧 120');
    await app.waitFor('开始观看');
    expect(app.shows('id:drama-10119')).toBe(false);
    await app.back();
    expect(app.shows('id:drama-10119')).toBe(true);
    await app.press('id:nav-home');
    await app.press('id:nav-search');
    expect(app.shows('id:drama-10119')).toBe(true);
    expect(app.count('id:drama-10119')).toBe(1);
    expect(app.requests().filter((r) => r.url.includes('/search?')).length).toBe(1);
  });

  test('history recycling restores its source and reading position without progress writes', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      drama: { ...drama, series_id: String(20000 + i), title: `历史短剧 ${i + 1}` },
      episode: 2,
      video_id: '457',
      position: 15,
      last_played_at: 1000 - i,
    }));
    const app = await open(entry, {
      width: 1180,
      height: 780,
      clock: {},
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.endsWith('/library')) return ok({ entries, owner_id: '' });
          if (request.url.includes('/series/detail'))
            return ok(
              entries.find(
                (entry) =>
                  entry.drama.series_id === new URL(request.url).searchParams.get('series_id'),
              )?.drama,
            );
          return fixture(request);
        },
      },
    });
    await app.press('id:nav-history');
    await app.waitFor('id:history-20000');
    await app.scroll('id:history-list', 18000);
    await app.waitFor('id:history-20059');
    await app.press('id:history-20059');
    await app.waitFor('继续第 2 集');
    await app.back();
    await app.waitFor('id:history-20059');
    await app.press('id:nav-home');
    await app.press('id:nav-history');
    await app.waitFor('id:history-20059');
    expect(app.count('id:history-20059')).toBe(1);
    expect(app.requests().filter((request) => request.method === 'POST').length).toBe(0);
  });

  test('home and history share recent ordering; completed and locked records stay explicit', async () => {
    const older = { ...drama, series_id: '124', title: '较早的故事' };
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.endsWith('/library'))
            return ok({
              owner_id: '',
              entries: [
                { drama: older, episode: 1, video_id: '456', position: 9, last_played_at: 100 },
                {
                  drama,
                  episode: 3,
                  video_id: '458',
                  position: 60,
                  completed: true,
                  last_played_at: 200,
                },
              ],
            });
          return fixture(request);
        },
      },
    });
    await app.waitFor(target === 'tv' ? '选集与详情' : '重生之后 · 第 3 集 · 60 秒');
    await app.press('id:nav-history');
    await app.waitFor('较早的故事 · 第 1 集 · 9 秒');
    const texts = app.texts();
    expect(texts.indexOf('重生之后') >= 0).toBe(true);
    expect(texts.indexOf('重生之后') < texts.indexOf('较早的故事')).toBe(true);
    expect(app.shows('第 3 集 · 看到 60 秒')).toBe(true);
    expect(app.shows('本集已看完')).toBe(true);
    await app.press('id:history-123');
    await app.waitFor('原观看集已不可用，可选择其他已开放集数从头观看。');
    await app.press('从第 1 集开始');
    await app.waitFor('重生之后 · 第 1 集');
    expect(
      app
        .requests()
        .filter((r) => r.url.includes('/play/info'))
        .every((r) => r.url.includes('vid=456')),
    ).toBe(true);
    expect(app.requests().some((r) => r.method === 'POST')).toBe(false);
  });

  test('refresh failure keeps usable snapshots; empty query stays local', async () => {
    let failSearch = false;
    let failLibrary = false;
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.includes('/search?') && failSearch)
            return { status: 502, body: { ok: false, error: '目录离线' } };
          if (request.url.endsWith('/library'))
            return failLibrary
              ? { status: 502, body: { ok: false, error: '记录离线' } }
              : ok({
                  owner_id: '',
                  entries: [
                    { drama, episode: 2, video_id: '457', position: 15, last_played_at: 123 },
                  ],
                });
          return fixture(request);
        },
      },
    });
    await app.waitFor(target === 'tv' ? '选集与详情' : '重生之后 · 第 2 集 · 15 秒');
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '   ');
    expect(app.enabled('搜索')).toBe(false);
    expect(app.requests().some((r) => r.url.includes('/search?'))).toBe(false);
    await app.clear('id:search-input');
    await app.type('id:search-input', ' 重生 ');
    await app.press('搜索');
    await app.waitFor('id:drama-123');
    expect(
      app
        .requests()
        .find((r) => r.url.includes('/search?'))
        ?.url.includes('q=%E9%87%8D%E7%94%9F'),
    ).toBe(true);
    failSearch = true;
    await app.press('搜索');
    await app.waitFor('搜索失败：Error: 目录离线');
    expect(app.shows('id:drama-123')).toBe(true);
    failLibrary = true;
    await app.press('id:nav-history');
    await app.waitFor('记录加载失败：Error: 记录离线');
    expect(app.shows('重生之后 · 第 2 集 · 15 秒')).toBe(true);
    expect(app.shows('看过的短剧会保存在这里。')).toBe(false);
    await app.press('id:nav-search');
    expect(app.value('id:search-input')).toBe(' 重生 ');
    expect(app.shows('id:drama-123')).toBe(true);
  });

  test('late episode selects its segment; missing episode offers explicit restart and playback errors retry', async () => {
    const episodes = Array.from({ length: 75 }, (_, i) => ({
      index: i + 1,
      video_id: String(1000 + i),
      locked: i === 59,
    }));
    const full = { ...drama, episodes, episode_count: 75 };
    let unavailable = false;
    const app = await open(entry, {
      width: 1180,
      height: 780,
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.endsWith('/library'))
            return ok({
              entries: [
                {
                  drama: full,
                  episode: 59,
                  video_id: unavailable ? '9999' : '1058',
                  position: 15,
                  last_played_at: 123,
                },
              ],
            });
          if (request.url.includes('/series/detail')) return ok(full);
          if (request.url.includes('/play/info'))
            return { status: 501, body: { ok: false, error: 'CORE_NOT_IMPLEMENTED' } };
          return fixture(request);
        },
      },
    });
    await app.press('id:nav-history');
    await app.waitFor('重生之后 · 第 59 集 · 15 秒');
    await app.press('id:history-123');
    await app.waitFor('继续第 59 集');
    expect(app.shows('id:episode-1058')).toBe(true);
    expect(app.enabled('第 60 集 · 未开放')).toBe(false);
    await app.press('id:episode-range-trigger');
    await app.press(target === 'tv' ? '1–12 集' : '1–24 集');
    expect(app.shows('id:episode-1000')).toBe(true);
    expect(app.shows('id:episode-1024')).toBe(false);
    await app.press('继续第 59 集');
    await app.waitFor('当前服务暂不支持播放，请稍后重试。');
    await app.press('重试');
    await app.waitFor('当前服务暂不支持播放，请稍后重试。');
    expect(app.requests().filter((r) => r.url.includes('/play/info')).length).toBe(2);
    await app.back();
    if (target === 'tv') await app.back();
    expect(app.shows('id:episode-1000')).toBe(true);
    await app.back();
    unavailable = true;
    await app.press('id:nav-history');
    await app.waitFor('重生之后 · 第 59 集 · 15 秒');
    await app.press('id:history-123');
    await app.waitFor('原观看集已不可用，可选择其他已开放集数从头观看。');
    expect(app.enabled('从第 1 集开始')).toBe(true);
    expect(app.requests().some((r) => r.method === 'POST')).toBe(false);
  });

  test('navigation is isolated across mounts, targets are explicit and query survives primary navigation', async () => {
    const first = await open(entry, {
      platform: 'android',
      width: 1180,
      height: 780,
      network: { '*': fixture, 'POST *': fixture },
    });
    expect(first.shows(`id:app-${target}`)).toBe(true);
    if (target === 'tv') await first.press('id:nav-search');
    await first.type('id:search-input', '重生');
    await first.press('搜索');
    await first.waitFor('id:drama-123');
    await first.press('id:drama-123');
    await first.waitFor('开始观看');
    const next = await open(entry, {
      platform: 'macos',
      width: 1180,
      height: 780,
      network: { '*': fixture, 'POST *': fixture },
    });
    expect(next.shows('开始观看')).toBe(false);
    expect(next.shows(`id:app-${target}`)).toBe(true);
    if (target === 'tv') await next.press('id:nav-search');
    expect(next.value('id:search-input')).toBe('');
    await next.type('id:search-input', '另一个查询');
    await next.press('搜索');
    await next.press('id:nav-home');
    await next.press('id:nav-search');
    expect(next.value('id:search-input')).toBe('另一个查询');
    expect(next.requests().filter((r) => r.url.includes('/search?')).length).toBe(1);
  });
}

export function registerApplicationTests(
  target: 'desktop' | 'tv' = 'desktop',
  entry = './App.tsx',
) {
  if (target === 'desktop')
    test('public window fullscreen preserves playback and Escape restores its source', async () => {
      const app = await open(entry, {
        platform: 'macos',
        width: 1180,
        height: 780,
        network: { '*': fixture, 'POST *': fixture },
      });
      await app.type('id:search-input', '重生');
      await app.press('搜索');
      await app.press('id:drama-123');
      await app.waitUntil(() => app.enabled('开始观看'));
      await app.press('开始观看');
      await app.waitFor('id:player-video');
      const window = app.window('main');
      const before = window.state()?.placement.mode;
      await app.press('全屏');
      expect(window.state()?.placement.mode).toBe('fullScreen');
      expect(app.count('id:player-video')).toBe(1);
      expect(app.requests().filter((request) => request.url.includes('/play/info')).length).toBe(1);
      await app.keyboard.press('escape');
      expect(window.state()?.placement.mode).toBe(before);
      expect(app.count('id:player-video')).toBe(1);
      await app.keyboard.press('escape');
      await app.waitFor('开始观看');
      expect(app.count('id:player-video')).toBe(0);
    });
  if (target === 'tv')
    test('host commands discard browse events and covered player input', async () => {
      const app = await open(entry, {
        host: {},
        network: { '*': fixture, 'POST *': fixture },
      });
      await app.host.send('player-command', 'next');
      await app.press('id:nav-search');
      await app.type('id:search-input', '重生');
      await app.press('搜索');
      await app.press('id:drama-123');
      await app.waitUntil(() => app.enabled('开始观看'));
      await app.press('开始观看');
      await app.waitFor('重生之后 · 第 1 集');
      await app.host.send('player-command', { command: 'next' });
      expect(app.shows('重生之后 · 第 1 集')).toBe(true);
      await app.press('选集');
      await app.host.send('player-command', 'next');
      expect(app.shows('重生之后 · 第 1 集')).toBe(true);
      await app.back();
      await app.host.send('player-command', 'next');
      await app.waitFor('重生之后 · 第 2 集');
      await app.back();
      await app.back();
      await app.waitFor('开始观看');
      await app.host.send('player-command', 'next');
      expect(app.shows('开始观看')).toBe(true);
    });
  test('background releases playback; returning prepares one paused owner without history writes', async () => {
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      network: { '*': fixture, 'POST *': fixture },
    });
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.press('id:drama-123');
    await app.waitFor('开始观看');
    await app.waitUntil(() => app.enabled('开始观看'));
    await app.press('开始观看');
    await app.waitFor('id:player-video');
    await app.setLifecycle('background');
    expect(app.count('id:player-video')).toBe(0);
    await app.waitUntil(
      () => app.requests().filter((request) => request.url.endsWith('/play/release')).length === 1,
    );
    await app.setLifecycle('active');
    await app.waitFor('id:player-video');
    expect(app.requests().filter((request) => request.url.includes('/play/info')).length).toBe(2);
    // Neither a resolved representation nor lifecycle recovery counts as watching.
    expect(
      app
        .requests()
        .some((request) => request.method === 'POST' && request.url.endsWith('/library')),
    ).toBe(false);
    await app.back();
    if (target === 'tv') await app.back();
    await app.waitFor('开始观看');
    await app.waitUntil(
      () => app.requests().filter((request) => request.url.endsWith('/play/release')).length === 2,
    );
  });

  test('search → details → playback → next episode → original search; no empty-query request', async () => {
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      network: { '*': fixture, 'POST *': fixture },
    });
    if (target === 'tv') await app.press('id:nav-search');
    expect(app.enabled('搜索')).toBe(false);
    expect(app.requests().some((r) => r.url.includes('/search?'))).toBe(false);
    if (target === 'tv' && !app.shows('id:search-input')) await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('重生之后');
    await app.press('重生之后');
    await app.waitFor('开始观看');
    expect(app.enabled('第 3 集 · 未开放')).toBe(false);
    await app.press('开始观看');
    await app.waitFor('重生之后 · 第 1 集');
    await app.press('下一集');
    await app.waitFor('重生之后 · 第 2 集');
    expect(app.enabled('下一集')).toBe(false);
    await app.back();
    if (target === 'tv') await app.back();
    await app.back();
    await app.waitFor('重生之后');
    expect(app.value('id:search-input')).toBe('重生');
    expect(app.requests().filter((r) => r.url.includes('/search?')).length).toBe(1);
    expect(app.requests().some((r) => r.method === 'POST' && r.url.endsWith('/library'))).toBe(
      false,
    );
  });

  test('failed search can retry and a superseded response cannot replace the newest search', async () => {
    let first = true;
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'web',
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.includes('/search?')) {
            if (first) {
              first = false;
              return { status: 502, body: { ok: false, error: '暂时不可用' } };
            }
            if (request.url.includes('q=slow'))
              return {
                ...ok({ items: [{ ...drama, title: '过时结果' }], has_more: false }),
                delay: 400,
              };
          }
          return fixture(request);
        },
      },
    });
    if (target === 'tv' && !app.shows('id:search-input')) await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('搜索失败：Error: 暂时不可用');
    await app.press('重试');
    await app.waitFor('重生之后');
    await app.clear('id:search-input');
    await app.type('id:search-input', 'slow');
    await app.press('搜索');
    await app.clear('id:search-input');
    if (target === 'tv' && !app.shows('id:search-input')) await app.press('id:nav-search');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('重生之后');
    await app.wait(500);
    expect(app.shows('过时结果')).toBe(false);
  });

  test('saved history resumes its episode and account restoration reads the core', async () => {
    const app = await open(entry, {
      width: 1180,
      height: 780,
      platform: 'macos',
      colorScheme: 'dark',
      reducedMotion: true,
      network: {
        'POST *': fixture,
        '*': (request) => {
          if (request.url.endsWith('/library'))
            return ok({
              entries: [{ drama, episode: 2, video_id: '457', position: 15, last_played_at: 123 }],
            });
          if (request.url.endsWith('/account'))
            return ok({ logged_in: true, profile: { name: '测试账号' } });
          return fixture(request);
        },
      },
    });
    await app.waitFor('测试账号');
    await app.press('id:nav-history');
    await app.waitFor('重生之后 · 第 2 集 · 15 秒');
    await app.press('id:history-123');
    await app.waitFor('继续第 2 集');
    await app.press('继续第 2 集');
    await app.waitFor('重生之后 · 第 2 集');
  });
}
