import { expect, open, test } from 'nsh/test';

/** Production routes with deliberate preparation failure: layout proof, never decoding proof. */
export function registerPlayerHost(
  entry: string,
  artifacts: string,
  target: 'web' | 'macos' | 'android',
) {
  for (const reducedMotion of [false, true]) {
    test(`player layout, segments and recovery (reduced motion: ${reducedMotion})`, async () => {
      const episodes = Array.from({ length: 75 }, (_, i) => ({
        index: i + 1,
        video_id: String(1000 + i),
        locked: i === 59,
      }));
      const drama = {
        series_id: '123',
        title: '长夜之后',
        intro: '从头开始的故事。',
        episode_count: 75,
        cover: '',
        episodes,
      };
      const app = await open(entry, {
        ...(target === 'android'
          ? {}
          : { width: reducedMotion ? 1180 : 1440, height: reducedMotion ? 780 : 1000 }),
        reducedMotion,
        colorScheme: 'light',
        network: {
          '*': (request) => {
            const url = new URL(request.url);
            const ok = (data: unknown) => ({ body: { ok: true, data } });
            if (url.pathname.endsWith('/library')) return ok({ owner_id: '', entries: [] });
            if (url.pathname.endsWith('/account'))
              return ok({ logged_in: false, qr_login_available: false });
            if (url.pathname.endsWith('/search')) return ok({ items: [drama], has_more: false });
            if (url.pathname.endsWith('/series/detail')) return ok(drama);
            if (url.pathname.endsWith('/play/info'))
              return { status: 503, body: { ok: false, error: '测试媒体未提供，请重试' } };
            return { status: 404, body: { ok: false, error: 'Unknown fixture' } };
          },
        },
      });
      if (target === 'android') await app.press('id:nav-search');
      await app.type('id:search-input', '长夜');
      await app.press('搜索');
      await app.waitFor('id:drama-123');
      await app.press('id:drama-123');
      await app.waitFor('开始观看');
      await app.waitUntil(() => app.enabled('开始观看'));
      await app.press('开始观看');
      await app.waitFor('播放遇到问题');
      const suffix = reducedMotion ? '-reduced-motion' : '';
      await app.screenshot(`${artifacts}/player-light${suffix}.png`);
      await app.setColorScheme('dark');
      await app.screenshot(`${artifacts}/player-dark${suffix}.png`);
      expect(app.enabled('播放进度')).toBe(false);
      await app.press('重试');
      await app.waitFor('播放遇到问题');
      expect(app.requests().filter((request) => request.url.includes('/play/info')).length).toBe(2);
      if (target === 'android') await app.press('选集');
      await app.waitFor('id:player-episode-1000');
      await app.press('id:episode-range-trigger');
      await app.press(target === 'android' ? '49–60 集' : '49–72 集');
      await app.waitFor('id:player-episode-1058');
      expect(app.enabled('第 60 集 · 未开放')).toBe(false);
      await app.screenshot(`${artifacts}/episodes-dark${suffix}.png`);
      await app.press('id:player-episode-1058');
      await app.waitFor('长夜之后 · 第 59 集');
      await app.waitFor('播放遇到问题');
      expect(app.enabled('下一集')).toBe(false);
      // Back consumes TV controls first, then leaves the player without losing detail context.
      await app.keyboard.press('escape');
      if (target === 'android') await app.keyboard.press('escape');
      await app.waitFor('开始观看');
      await app.keyboard.press('escape');
      await app.waitFor('id:drama-123');
      expect(app.value('id:search-input')).toBe('长夜');
      expect(
        app
          .requests()
          .some((request) => request.method === 'POST' && request.url.endsWith('/library')),
      ).toBe(false);
    });
  }
}
