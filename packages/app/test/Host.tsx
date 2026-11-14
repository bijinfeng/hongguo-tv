import { expect, open, test } from 'nsh/test';
import { registerFocusedRemovalTests, registerSearchFocusTests } from './focused-removal';

/** Uses the explicit failure-then-empty local HTTP fixture. */
export function registerDiscoveryUnavailableHostTests(entry: string, artifacts: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`discovery unavailable ${colorScheme}: loading, retry, empty and manual search`, async () => {
      const app = await open(entry, {
        width: 1180,
        height: 780,
        colorScheme,
        reducedMotion: true,
        network: 'live',
      });
      await app.waitFor('重生之后 · 第 59 集 · 00:15');
      await app.press('id:nav-search');
      await app.waitFor('正在加载…');
      await app.screenshot(`${artifacts}/discovery-loading-${colorScheme}.png`);
      await app.waitFor('热门内容未能加载');
      await app.screenshot(`${artifacts}/discovery-error-${colorScheme}.png`);
      await app.press('重试');
      await app.waitFor('暂时没有推荐内容');
      expect(app.shows('id:drama-163')).toBe(false);
      await app.screenshot(`${artifacts}/discovery-empty-${colorScheme}.png`);
      await app.type('id:search-input', '手动查询');
      await app.submit('id:search-input');
      await app.waitFor('id:drama-123');
    });
  }
}

/** Only invoked by the explicit graphical-host acceptance script. HTTP data is a local fixture. */
export function registerBrowsingHostTests(entry: string, artifacts: string, host: 'macos' | 'web') {
  registerFocusedRemovalTests('../FocusedRemovalStatePreview.tsx', artifacts);
  if (host === 'macos') registerSearchFocusTests('../SearchFocusStatePreview.tsx');
  test('graphical browsing: desktop, dark, history, segments and keyboard return', async () => {
    const app = await open(entry, {
      width: 1440,
      height: 1000,
      colorScheme: 'light',
      reducedMotion: false,
      network: 'live',
    });
    await app.waitFor('重生之后 · 第 59 集 · 00:15');
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
    await app.waitFor('重生之后 · 第 59 集 · 00:15');
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
    await app.waitFor('重生之后 · 第 59 集 · 00:15');
    await app.screenshot(`${artifacts}/home-1180-reduced-motion.png`);
  });
  test('shared controls in both appearances', async () => {
    const app = await open('../UiPreview.tsx', {
      width: 1180,
      height: 780,
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
  for (const moved of [false, true]) {
    test(`terminal continuation with no prior selection, moved card focus=${moved}`, async () => {
      const app = await open(entry, {
        width: 1440,
        height: 1000,
        colorScheme: moved ? 'light' : 'dark',
        reducedMotion: true,
        network: 'live',
      });
      const term = `未选中末页-${moved}`;
      await app.waitFor('重生之后 · 第 59 集 · 00:15');
      await app.type('id:search-input', term);
      await app.submit('id:search-input');
      await app.waitFor('id:search-more');
      await app.press('id:search-more');
      await app.waitFor('加载失败：服务暂时不可用，请稍后重试');
      await app.keyboard.press('enter');
      await app.waitFor('正在加载…');
      await app.waitFor('加载更多');
      await app.scroll('id:results', 6000);
      await app.waitFor('id:drama-186');
      await app.press('id:search-more');
      await app.waitFor('正在加载…');
      if (moved) {
        await app.keyboard.press('shift+tab');
        await app.keyboard.press('left');
        await app.screenshot(`${artifacts}/pagination-card-pending.png`);
      }
      await app.waitUntil(() => !app.shows('id:search-more'));
      const visibleTitles = app.texts().filter((text) => text.startsWith('重生之后'));
      if (!moved) {
        if (host === 'macos') {
          await app.keyboard.press('x');
          expect(app.value('id:search-input')).toBe(`${term}x`);
          for (let i = 0; i < 6; i++) await app.keyboard.press('tab');
        } else await app.keyboard.press('shift+tab');
      }
      await app.screenshot(`${artifacts}/pagination-unselected-${moved}-focus.png`);
      await app.keyboard.press('enter');
      await app.waitFor('id:episode-range-trigger');
      const opened = app.texts().find((text) => text.startsWith('重生之后'));
      expect(visibleTitles).toContain(opened);
      await app.screenshot(`${artifacts}/pagination-unselected-${moved}-detail.png`);
      app.dispose();
    });
  }
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`approved discovery ${width} ${colorScheme}: public cards, source return and keyword search`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        await app.waitFor('重生之后 · 第 59 集 · 00:15');
        await app.press('id:nav-search');
        await app.waitFor('id:drama-163');
        const card = width === 1440 ? 'id:drama-174' : 'id:drama-163';
        if (width === 1440) await app.scroll('id:results', 1600);
        await app.waitFor(card);
        await app.wait(300);
        await app.hover(card);
        await app.screenshot(`${artifacts}/discovery-${width}-${colorScheme}.png`);
        const term = app
          .texts()
          .find((text) => text.startsWith('推荐词') && app.shows(`id:discovery-query-${text}`));
        expect(typeof term).toBe('string');
        await app.press(card);
        await app.waitFor('id:episode-range-trigger');
        await app.keyboard.press('escape');
        await app.waitFor(card);
        await app.wait(350);
        await app.screenshot(`${artifacts}/discovery-return-${width}-${colorScheme}.png`);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        expect(app.shows(width === 1440 ? '重生之后 52' : '重生之后 41')).toBe(true);
        await app.keyboard.press('escape');
        await app.waitFor(card);
        const latestTerm = app
          .texts()
          .find((text) => text.startsWith('推荐词') && app.shows(`id:discovery-query-${text}`))!;
        await app.press(`id:discovery-query-${latestTerm}`);
        await app.waitFor('id:drama-123');
        expect(app.value('id:search-input')).toBe(latestTerm);
        await app.press('id:clear-query');
        await app.waitFor(`id:recent-search-${latestTerm}`);
        expect(app.shows(`id:discovery-query-${latestTerm}`)).toBe(false);
        await app.screenshot(`${artifacts}/discovery-keyword-${width}-${colorScheme}.png`);
      });
      test(`recent searches ${width} ${colorScheme}: reuse, clear retry and input focus`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        const term = `春风越过山海归来的故事-${width}-${colorScheme}`;
        await app.waitFor('重生之后 · 第 59 集 · 00:15');
        await app.type('id:search-input', term);
        await app.submit('id:search-input');
        await app.waitFor('id:drama-123');
        await app.press('id:clear-query');
        await app.waitFor(`id:recent-search-${term}`);
        await app.hover(`id:recent-search-${term}`);
        await app.wait(240);
        await app.screenshot(`${artifacts}/recent-populated-${width}-${colorScheme}.png`);
        for (let i = 0; i < 5; i++) await app.keyboard.press('tab');
        await app.screenshot(`${artifacts}/recent-keyboard-${width}-${colorScheme}.png`);
        await app.keyboard.press('enter');
        await app.waitFor('id:drama-123');
        expect(app.value('id:search-input')).toBe(term);
        await app.press('id:clear-query');
        await app.waitFor('id:clear-recent-searches');
        await app.press('id:clear-recent-searches');
        await app.waitFor('搜索记录未清空：服务暂时不可用，请稍后重试');
        expect(app.shows(`id:recent-search-${term}`)).toBe(true);
        await app.wait(240);
        await app.screenshot(`${artifacts}/recent-error-${width}-${colorScheme}.png`);
        await app.press('重试清空');
        await app.type('id:search-input', '');
        await app.waitFor('暂无搜索记录');
        await app.keyboard.press('x');
        expect(app.value('id:search-input')).toBe('x');
        expect(app.shows('id:clear-recent-searches')).toBe(false);
        await app.screenshot(`${artifacts}/recent-empty-${width}-${colorScheme}.png`);
      });
      test(`search continuation ${width} ${colorScheme}: retry, appended return and user focus`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        await app.waitFor('重生之后 · 第 59 集 · 00:15');
        await app.type('id:search-input', `续页-${width}-${colorScheme}`);
        await app.submit('id:search-input');
        await app.waitFor('id:search-more');
        await app.press('id:search-more');
        await app.waitFor('正在加载…');
        await app.screenshot(`${artifacts}/pagination-pending-${width}-${colorScheme}.png`);
        await app.waitFor('加载失败：服务暂时不可用，请稍后重试');
        await app.screenshot(`${artifacts}/pagination-error-${width}-${colorScheme}.png`);
        await app.keyboard.press('enter');
        await app.waitFor('正在加载…');
        await app.waitFor('加载更多');
        expect(app.shows('加载失败：服务暂时不可用，请稍后重试')).toBe(false);
        await app.scroll('id:results', 6000);
        await app.waitFor('id:drama-186');
        await app.screenshot(`${artifacts}/pagination-append-${width}-${colorScheme}.png`);
        await app.press('id:drama-186');
        await app.waitFor('开始观看');
        expect(app.shows('重生之后 64')).toBe(true);
        await app.keyboard.press('escape');
        await app.waitFor('id:drama-186');
        await app.screenshot(`${artifacts}/pagination-return-${width}-${colorScheme}.png`);
        if (host === 'macos' && width === 1440 && colorScheme === 'dark') {
          await app.keyboard.press('left');
          await app.screenshot(`${artifacts}/pagination-roving-${width}-${colorScheme}.png`);
        }
        await app.press('id:search-more');
        await app.waitFor('正在加载…');
        if (width === 1440 && colorScheme === 'dark') {
          await app.waitUntil(() => !app.shows('id:search-more'));
          const visibleTitles = app.texts().filter((text) => text.startsWith('重生之后'));
          if (host === 'macos') {
            // The exhausted action hands focus to the existing input, outside the retained List.
            await app.keyboard.press('x');
            expect(app.value('id:search-input')).toBe(`续页-${width}-${colorScheme}x`);
            await app.screenshot(
              `${artifacts}/pagination-terminal-input-${width}-${colorScheme}.png`,
            );
            for (let i = 0; i < 6; i++) await app.keyboard.press('tab');
          } else await app.keyboard.press('shift+tab');
          await app.screenshot(
            `${artifacts}/pagination-terminal-focus-${width}-${colorScheme}.png`,
          );
          await app.keyboard.press('enter');
          await app.waitFor('开始观看');
          const opened = app.texts().find((text) => text.startsWith('重生之后'));
          console.log('terminal keyboard identity', opened, 'among', visibleTitles.join('|'));
          expect(visibleTitles).toContain(opened);
          await app.keyboard.press('escape');
        } else {
          await app.type('id:search-input', '');
          await app.waitUntil(() => !app.shows('id:search-more'));
          await app.keyboard.press('x');
          expect(app.value('id:search-input')).toContain('x');
        }
        await app.screenshot(`${artifacts}/pagination-terminal-${width}-${colorScheme}.png`);
      });
    }
  }
}
