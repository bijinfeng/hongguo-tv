import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';

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

export function registerBrowsingTests(target: 'desktop' | 'tv' = 'desktop') {
  test('recycled result identity and scroll position survive details and primary navigation', async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      ...drama,
      series_id: String(10000 + i),
      title: `回收列表短剧 ${i + 1}`,
      cover: 'http://127.0.0.1:1/missing',
    }));
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      clock: {},
      network: {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      clock: {},
      network: {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      network: {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      network: {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      network: {
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
    const first = await open('./App.tsx', {
      platform: 'android',
      width: 1180,
      height: 780,
      network: { '*': fixture },
    });
    expect(first.shows(`id:app-${target}`)).toBe(true);
    if (target === 'tv') await first.press('id:nav-search');
    await first.type('id:search-input', '重生');
    await first.press('搜索');
    await first.waitFor('id:drama-123');
    await first.press('id:drama-123');
    await first.waitFor('开始观看');
    const next = await open('./App.tsx', {
      platform: 'macos',
      width: 1180,
      height: 780,
      network: { '*': fixture },
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

export function registerApplicationTests(target: 'desktop' | 'tv' = 'desktop') {
  test('background releases playback; returning prepares one paused owner without history writes', async () => {
    const app = await open('./App.tsx', {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      platform: 'macos',
      network: { '*': fixture },
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      platform: 'web',
      network: {
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
    const app = await open('./App.tsx', {
      width: 1180,
      height: 780,
      platform: 'macos',
      colorScheme: 'dark',
      reducedMotion: true,
      network: {
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
