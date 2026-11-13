import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';

/** Real decoder, synthetic footage, stubbed persistence. Never a live content acceptance test. */
export function registerPlayerMediaHost(
  entry: string,
  artifacts: string,
  target: 'web' | 'macos' | 'android',
) {
  test('actual media: pause, seek, options, completion and resource ownership', async () => {
    const drama = {
      series_id: '123',
      title: '自制媒体验收',
      episode_count: 3,
      cover: '',
      episodes: [
        { index: 1, video_id: '456', locked: false },
        { index: 2, video_id: '457', locked: false },
        { index: 3, video_id: '458', locked: true },
      ],
    };
    const writes: { position: number; completed: boolean; video_id: string }[] = [];
    const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
    const fixture = (request: StubRequest): StubResponse => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/library')) {
        if (request.method === 'POST') writes.push(JSON.parse(request.body!));
        return ok({ owner_id: '', entries: [] });
      }
      if (url.pathname.endsWith('/account'))
        return ok({ logged_in: false, qr_login_available: false });
      if (url.pathname.endsWith('/search')) return ok({ items: [drama], has_more: false });
      if (url.pathname.endsWith('/series/detail')) return ok(drama);
      if (url.pathname.endsWith('/play/info'))
        return ok({
          path: '/minireel-proxy/media/' + (url.searchParams.get('quality') ? 'b' : 'a').repeat(64),
          vid: url.searchParams.get('vid'),
          video_codec: 'h264',
          quality: '720P',
          qualities: ['720P', '480P'],
        });
      if (url.pathname.endsWith('/play/release')) return ok({ released: true });
      return { status: 404, body: { ok: false, error: 'Unknown media fixture route' } };
    };
    const app = await open(entry, {
      ...(target === 'android' ? {} : { width: 1440, height: 1000 }),
      colorScheme: 'light',
      network: { '*': fixture, 'POST *': fixture },
    });
    const displayedTime = () => app.texts().find((text) => /^\d{2}:\d{2} \/ /.test(text)) ?? '';
    if (target === 'android') await app.press('id:nav-search');
    await app.type('id:search-input', '自制');
    await app.press('搜索');
    await app.press('id:drama-123');
    await app.waitFor('开始观看');
    await app.waitUntil(() => app.enabled('开始观看'));
    await app.press('开始观看');
    await app.waitUntil(() => app.enabled('播放进度'), { timeout: 15000 });
    await app.waitUntil(() => /^00:0[1-9] \/ 00:12/.test(displayedTime()), { timeout: 15000 });
    // Keep the TV controls visible during subsequent keyboard actions.
    if (target === 'android' && !app.shows('暂停')) await app.keyboard.press('enter');
    await app.press('暂停');
    const pausedAt = displayedTime();
    await app.wait(1200);
    expect(displayedTime()).toBe(pausedAt);
    await app.screenshot(`${artifacts}/paused-light.png`);
    await app.setColorScheme('dark');
    await app.screenshot(`${artifacts}/paused-dark.png`);
    if (target === 'android') await app.press('更多');
    await app.press('播放速度');
    try {
      await app.press('1.5×');
    } catch (error) {
      if (!String(error).includes('has no native view') || !app.texts().includes('1.5×'))
        throw error;
    }
    expect(app.texts().includes('1.5×')).toBe(true);
    expect(app.requests().filter((request) => request.url.includes('/play/info')).length).toBe(1);
    if (target === 'android') {
      await app.screenshot(`${artifacts}/settings-dark.png`);
      await app.setColorScheme('light');
      await app.screenshot(`${artifacts}/settings-light.png`);
      await app.setColorScheme('dark');
      await app.press('关闭播放设置');
    } else {
      await app.press('静音');
      await app.waitFor('取消静音');
      await app.press('取消静音');
    }
    if (target === 'android') {
      await app.press('选集');
      await app.waitFor('关闭选集');
      await app.keyboard.press('escape');
      await app.waitFor('播放');
      await app.press('更多');
      await app.waitFor('播放设置');
      await app.keyboard.press('escape');
      await app.waitFor('播放');
      await app.press('前进 10 秒');
    } else {
      await app.keyboard.press('tab');
      // Seek through the semantic slider. Global shortcuts must not steal its arrows.
      // Initial click focuses the slider without relying on page-wide Tab order.
      await app.press('播放进度');
      await app.keyboard.press('home');
      await app.keyboard.press('right');
    }
    await app.wait(400);
    expect(app.count('id:player-video')).toBe(1);
    await app.press('下一集');
    await app.waitFor('自制媒体验收 · 第 2 集');
    await app.waitUntil(() => app.enabled('播放进度'), { timeout: 15000 });
    expect(app.enabled('下一集')).toBe(false);
    await app.waitUntil(() => writes.some((write) => write.video_id === '457' && write.completed), {
      timeout: 20000,
    });
    await app.waitFor('本集已播完');
    const completed = writes.at(-1)!;
    expect(completed.completed).toBe(true);
    await app.wait(1200);
    expect(writes.at(-1)).toEqual(completed);
    await app.press('重新播放');
    await app.waitUntil(() => displayedTime().startsWith('00:01'), { timeout: 5000 });
    if (target === 'android' && !app.shows('暂停')) await app.keyboard.press('enter');
    await app.press('暂停');
    expect(writes.at(-1)?.completed).toBe(false);
    if (target === 'android') {
      await app.back();
      await app.wait(250);
      await app.back();
    } else await app.keyboard.press('escape');
    await app.waitFor('开始观看');
    await app.waitUntil(
      () => app.requests().filter((request) => request.url.endsWith('/play/release')).length === 2,
    );
    expect(writes.every((write) => ['456', '457'].includes(write.video_id))).toBe(true);
    console.log(
      'SYNTHETIC_MEDIA_VERIFIED',
      target,
      writes.length,
      'writes; completion, replay and two releases',
    );
  }, 60000);
}
