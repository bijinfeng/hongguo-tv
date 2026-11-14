import { expect, open, test } from 'nsh/test';

/** Explicit graphical-host workflow, using the local browsing HTTP fixture. */
export function registerSuggestionsHostTests(
  entry: string,
  artifacts: string,
  host?: 'macos' | 'web',
) {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`typed search host ${width} ${colorScheme}: anchored suggestions and actor return`, async () => {
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
        await app.waitFor('重生之后 · 第 59 集 · 00:15');
        await app.press('id:nav-search');
        await app.type('id:search-input', '林');
        await app.waitFor('id:suggestion-actor:9007199254740993');
        await app.wait(180);
        await app.screenshot(`${artifacts}/suggestions-${width}-${colorScheme}.png`);
        await app.keyboard.press('down');
        await app.screenshot(`${artifacts}/suggestion-focus-${width}-${colorScheme}.png`);
        await app.keyboard.press('enter');
        await app.waitFor('id:actor-works');
        await app.waitFor('id:drama-123');
        await app.wait(250);
        await app.screenshot(`${artifacts}/actor-${width}-${colorScheme}.png`);
        await app.scroll('id:actor-results', 1000);
        await app.wait(180);
        const later = Array.from({ length: 82 }, (_, i) => 204 - i).find((id) =>
          app.shows(`id:drama-${id}`),
        );
        expect(later !== undefined && later > 126).toBe(true);
        await app.press(`id:drama-${later}`);
        await app.waitFor('id:episode-range-trigger');
        expect(app.shows(`重生之后 ${later! - 122}`)).toBe(true);
        await app.screenshot(`${artifacts}/actor-detail-${width}-${colorScheme}.png`);
        await app.back();
        await app.waitFor(`id:drama-${later}`);
        await app.wait(150);
        await app.screenshot(`${artifacts}/actor-return-${width}-${colorScheme}.png`);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        expect(app.shows(`重生之后 ${later! - 122}`)).toBe(true);
        await app.back();
        await app.waitFor('id:actor-works');
        await app.back();
        await app.waitFor('id:suggestion-actor:9007199254740993');
        await app.wait(150);
        await app.keyboard.press('down');
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        await app.back();
        await app.waitFor('id:search-suggestions');
        await app.keyboard.press('escape');
        expect(app.shows('id:search-suggestions')).toBe(false);
        await app.clear('id:search-input');
        await app.type('id:search-input', '建议失败');
        await app.waitFor('建议未能加载');
        await app.screenshot(`${artifacts}/suggestion-error-${width}-${colorScheme}.png`);
        await app.keyboard.press('down');
        await app.keyboard.press('enter');
        await app.waitFor('建议未能加载');
        await app.clear('id:search-input');
        await app.type('id:search-input', '无建议');
        await app.waitFor('暂无建议，可直接搜索');
        await app.screenshot(`${artifacts}/suggestion-empty-${width}-${colorScheme}.png`);
        await app.clear('id:search-input');
        await app.type('id:search-input', '长词');
        await app.waitFor('id:suggestion-query:' + '词'.repeat(81));
        await app.press('id:suggestion-query:' + '词'.repeat(81));
        expect(app.value('id:search-input')).toBe('词'.repeat(81));
        await app.waitFor('id:search-validation');
        expect(app.value('id:search-input')).toBe('词'.repeat(81));
        await app.wait(350);
        expect(app.shows('id:search-suggestions')).toBe(false);
        await app.screenshot(`${artifacts}/suggestion-validation-${width}-${colorScheme}.png`);
        await app.clear('id:search-input');
        await app.type('id:search-input', '已缩短');
        await app.submit('id:search-input');
        await app.waitFor('id:drama-123');
      }, 120000);
    }
  }
}
