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
    return ok({ path: '/minireel-proxy/media/test.mp4', vid: url.searchParams.get('vid') });
  return { status: 404, body: { ok: false, error: 'Unknown fixture' } };
}

export function registerApplicationTests() {
  test('search → details → playback → next episode → original search; no empty-query request', async () => {
    const app = await open('./App.tsx', {
      platform: 'macos',
      width: 1180,
      height: 780,
      network: { '*': fixture },
    });
    expect(app.enabled('搜索')).toBe(false);
    expect(app.requests().some((r) => r.url.includes('/search?'))).toBe(false);
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
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('搜索失败：Error: 暂时不可用');
    await app.press('重试');
    await app.waitFor('重生之后');
    await app.clear('id:search-input');
    await app.type('id:search-input', 'slow');
    await app.press('搜索');
    await app.clear('id:search-input');
    await app.type('id:search-input', '重生');
    await app.press('搜索');
    await app.waitFor('重生之后');
    await app.wait(500);
    expect(app.shows('过时结果')).toBe(false);
  });

  test('saved history resumes its episode and account restoration reads the core', async () => {
    const app = await open('./App.tsx', {
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
    await app.press('继续观看');
    await app.waitFor('重生之后 · 第 2 集 · 15 秒');
    await app.press('重生之后 · 第 2 集 · 15 秒');
    await app.waitFor('继续第 2 集');
    await app.press('继续第 2 集');
    await app.waitFor('重生之后 · 第 2 集');
  });
}
