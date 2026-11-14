import { expect, open, test } from 'nsh/test';

/** Graphical decoder + loopback fixtures, independent of live recommendations and native core. */
export function registerFeedHostTests(entry: string, artifacts: string, host: 'web' | 'macos') {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`feed host ${width} ${colorScheme}: real media checkpoints, keyboard next and channel recovery`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        if (host === 'macos')
          await app.waitUntil(() => app.window('main').state()?.focused === true, {
            timeout: 60000,
          });
        const capture = async (name: string) => {
          await app.wait(250);
          await app.screenshot(`${artifacts}/${name}-${width}-${colorScheme}.png`);
        };
        const time = () => app.texts().find((text) => /^\d{2}:\d{2} \/ /.test(text)) ?? '';
        const seconds = () => {
          const match = /^(\d+):(\d+)/.exec(time());
          return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
        };
        await app.press('id:nav-feed');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'), { timeout: 20000 });
        await app.waitUntil(() => seconds() >= 1, { timeout: 15000 });
        await app.press('暂停');
        const paused = seconds();
        await app.wait(300);
        await capture('feed');
        await app.press('id:feed-detail');
        await app.waitFor('id:episode-range-trigger');
        await app.back();
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        expect(seconds()).toBe(paused);
        expect(app.shows('播放')).toBe(true);
        await app.wait(300);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        await app.back();
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        await app.press('id:episode-range-trigger');
        await app.press('1–24 集');
        await app.press('id:player-episode-1001');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        await app.waitUntil(() => seconds() >= 1, { timeout: 15000 });
        await app.press('暂停');
        const second = seconds();
        await app.press('id:feed-channel-36');
        await app.waitFor('重生之后 101');
        await app.press('id:feed-channel-16');
        await app.waitFor('第 2 集');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        expect(seconds()).toBe(second);
        expect(app.shows('播放')).toBe(true);
        if (host === 'macos') {
          await app.press('全屏');
          expect(app.window('main').state()?.placement.mode).toBe('fullScreen');
          // AppKit must finish entering its native space before another mode change.
          await app.wait(1000);
          await app.keyboard.press('escape');
          await app.waitUntil(() => app.window('main').state()?.placement.mode === 'normal');
          await app.wait(1000);
        } else expect(app.enabled('全屏')).toBe(false);
        expect(app.shows('id:feed-channel-16')).toBe(true);
        await app.press('id:feed-next');
        await app.waitFor('重生之后 2');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        await app.wait(250);
        await app.keyboard.press('enter');
        await app.waitFor('重试下一部');
        await capture('next-error');
        await app.keyboard.press('enter');
        await app.waitFor('下一部');
        expect(app.shows('重生之后 2')).toBe(true);
        await app.wait(150);
        await app.keyboard.press('enter');
        await app.waitFor('重生之后 3');
        expect(app.enabled('id:feed-next')).toBe(false);
        await app.press('id:feed-channel-39');
        await app.waitFor('加载失败：服务暂时不可用，请稍后重试');
        await capture('channel-error');
        await app.press('重试');
        await app.waitFor('本页暂无内容，可以继续浏览');
        await capture('empty');
        await app.press('继续浏览');
        await app.waitFor('重生之后 301');
        await app.press('id:feed-channel-45');
        await app.waitFor('登录后查看关注');
        await capture('login');
        await app.press('id:feed-channel-16');
        await app.waitFor('重生之后 3');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        await app.press('id:nav-home');
        expect(app.count('id:player-video')).toBe(0);
        await app.press('id:nav-feed');
        await app.waitFor('播放进度');
        await app.waitUntil(() => app.enabled('播放进度'));
        expect(app.shows('播放')).toBe(true);
        await capture('restored');
      });
    }
  }
}
