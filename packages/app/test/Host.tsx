import { expect, open, test } from 'nsh/test';

/** Only invoked by the explicit graphical-host acceptance script. HTTP data is a local fixture. */
export function registerBrowsingHostTests(entry: string, artifacts: string) {
  test('graphical browsing: desktop, dark, history, segments and keyboard return', async () => {
    const app = await open(entry, {
      width: 1440,
      height: 1000,
      colorScheme: 'light',
      reducedMotion: false,
      network: 'live',
    });
    await app.waitFor('重生之后 · 第 59 集 · 15 秒');
    await app.wait(500);
    await app.screenshot(`${artifacts}/home-light.png`);
    await app.type('id:search-input', '重生');
    await app.submit('id:search-input');
    await app.wait(800);
    await app.screenshot(`${artifacts}/search-debug.png`);
    await app.waitFor('id:drama-123');
    await app.wait(900);
    await app.screenshot(`${artifacts}/search-light.png`);
    await app.hover('id:drama-123');
    await app.press('id:drama-123');
    await app.waitFor('继续第 59 集');
    expect(app.enabled('第 60 集 · 未开放')).toBe(false);
    await app.wait(300);
    await app.screenshot(`${artifacts}/detail-light.png`);
    await app.setColorScheme('dark');
    await app.wait(300);
    await app.screenshot(`${artifacts}/detail-dark.png`);
    await app.setColorScheme('light');
    await app.press('id:episode-range-trigger');
    await app.press('1–24 集');
    await app.keyboard.press('escape');
    await app.waitFor('id:drama-123');
    await app.wait(350);
    await app.screenshot(`${artifacts}/search-focus.png`);
    await app.keyboard.press('right');
    await app.keyboard.press('enter');
    await app.waitFor('开始观看');
    expect(app.shows('重生之后 2')).toBe(true);
    await app.keyboard.press('escape');
    await app.setColorScheme('dark');
    await app.wait(300);
    await app.screenshot(`${artifacts}/search-dark.png`);
    await app.press('id:nav-history');
    await app.waitFor('重生之后 · 第 59 集 · 15 秒');
    await app.screenshot(`${artifacts}/history-dark.png`);
    await app.press('id:nav-home');
    await app.screenshot(`${artifacts}/home-dark.png`);
  });
  test('supported compact desktop with reduced motion', async () => {
    const app = await open(entry, {
      width: 1180,
      height: 780,
      colorScheme: 'light',
      reducedMotion: true,
      network: 'live',
    });
    await app.waitFor('重生之后 · 第 59 集 · 15 秒');
    await app.screenshot(`${artifacts}/home-1180-reduced-motion.png`);
  });
  test('shared controls in both appearances', async () => {
    const app = await open('../UiPreview.tsx', {
      width: 1180,
      height: 1000,
      colorScheme: 'light',
      reducedMotion: true,
      network: {},
    });
    expect(app.enabled('搜索')).toBe(false);
    expect(app.enabled('未开放')).toBe(false);
    await app.type('id:search-input', '重生');
    await app.hover('搜索');
    await app.screenshot(`${artifacts}/controls-light.png`);
    await app.setColorScheme('dark');
    await app.screenshot(`${artifacts}/controls-dark.png`);
  });
}
