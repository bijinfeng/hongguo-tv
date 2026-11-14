import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';

export function registerFeedUiTests(target: 'desktop' | 'tv', entry: string) {
  test(`feed ${target}: approved entry, episode ownership, details return, channels, recovery and login gate`, async () => {
    let failed = false;
    const summary = (id: string) => ({
      series_id: id,
      title: `推荐作品${id}`,
      episode_count: 3,
      content_type: '1',
    });
    const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
    const fixture = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/library')) return ok({ owner_id: '', entries: [] });
      if (url.pathname.endsWith('/account')) return ok({ logged_in: false });
      if (url.pathname.endsWith('/lists/recommend')) {
        const channel = url.searchParams.get('channel');
        const more = url.searchParams.has('offset');
        if (more && !failed) {
          failed = true;
          return { status: 503, body: { ok: false, error: '推荐暂时离线' } };
        }
        return ok({
          channel,
          items: (more ? ['102', '103'] : channel === '16' ? ['101', '102'] : ['201', '202']).map(
            summary,
          ),
          has_more: !more,
          next_offset: more ? 12 : channel === '16' ? 6 : 0,
          feed_cell: '123',
          feed_plan: '456',
          session_id: 'session',
        });
      }
      if (url.pathname.endsWith('/series/detail'))
        return ok({
          ...summary(url.searchParams.get('series_id')!),
          episodes: [
            { index: 1, video_id: `${url.searchParams.get('series_id')}1`, locked: false },
            { index: 2, video_id: `${url.searchParams.get('series_id')}2`, locked: false },
            { index: 3, video_id: `${url.searchParams.get('series_id')}3`, locked: true },
          ],
        });
      if (url.pathname.endsWith('/play/info'))
        return ok({
          path: '/minireel-proxy/media/' + 'a'.repeat(64),
          vid: url.searchParams.get('vid'),
          quality: '720P',
          qualities: ['720P'],
        });
      if (url.pathname.endsWith('/play/release')) return ok({ released: true });
      if (url.pathname.endsWith('/search/history')) return ok({ items: [] });
      if (url.pathname.endsWith('/search/suggestions')) return ok({ items: [] });
      return { status: 404, body: { ok: false, error: 'Unknown fixture route' } };
    };
    const app = await open(entry, {
      platform: 'macos',
      width: 1440,
      height: 1000,
      network: { '*': fixture, 'POST *': fixture },
    });
    expect(app.requests().some((r) => r.url.includes('/lists/recommend'))).toBe(false);
    await app.press(target === 'tv' ? 'id:home-feed' : 'id:nav-feed');
    await app.waitFor('推荐作品101');
    if (target === 'desktop') {
      await app.waitFor('id:player-video');
      expect(app.count('id:player-video')).toBe(1);
      await app.press('id:player-episode-1012');
      await app.waitFor('第 2 集');
      expect(app.shows('id:feed-page')).toBe(true);
      await app.press('id:feed-detail');
      await app.waitFor('开始观看');
      await app.waitUntil(() => app.requests().some((r) => r.url.includes('/play/release')));
      await app.back();
      await app.waitFor('第 2 集');
      await app.waitFor('id:player-video');
      await app.press('全屏');
      expect(app.window('main').state()?.placement.mode).toBe('fullScreen');
      await app.keyboard.press('escape');
      expect(app.window('main').state()?.placement.mode).toBe('normal');
      expect(app.shows('id:feed-page')).toBe(true);
    } else {
      expect(app.requests().some((r) => r.url.includes('/play/info'))).toBe(false);
      await app.waitUntil(() => app.enabled('id:feed-play'));
      await app.press('id:feed-play');
      await app.waitFor('id:player-video');
      await app.press('下一集');
      await app.waitFor('推荐作品101 · 第 2 集');
      await app.back();
      await app.back();
      await app.waitFor('id:feed-play');
      expect(app.count('id:player-video')).toBe(0);
    }
    await app.press('id:feed-next');
    await app.waitFor('推荐作品102');
    await app.press('id:feed-next');
    await app.waitFor('重试下一部');
    expect(app.shows('推荐作品102')).toBe(true);
    await app.press('重试下一部');
    await app.waitFor('推荐作品103');
    const pages = app
      .requests()
      .filter((r) => r.url.includes('/lists/recommend') && r.url.includes('offset='));
    expect(pages[0].url).toBe(pages[1].url);
    expect(app.enabled('id:feed-next')).toBe(false);
    await app.press('id:feed-channel-36');
    await app.waitFor('推荐作品201');
    await app.press('id:feed-next');
    await app.waitFor('推荐作品202');
    await app.press('id:feed-channel-16');
    await app.waitFor('推荐作品103');
    await app.press('id:feed-channel-45');
    await app.waitFor('登录后查看关注');
    expect(app.count('id:player-video')).toBe(0);
    expect(app.requests().some((r) => r.url.includes('channel=45'))).toBe(false);
    expect(app.requests().some((r) => r.method === 'POST' && r.url.endsWith('/library'))).toBe(
      false,
    );
    await app.back();
    expect(app.shows('id:feed-page')).toBe(false);
  });
}
