import { expect, open, test } from 'nsh/test';

/** Visible host acceptance against the explicit read-only browsing fixture. */
export function registerCategoryHostTests(entry: string, artifacts: string, host: 'web' | 'macos') {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`category host ${width} ${colorScheme}: filters, cursor retry and exact return`, async () => {
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
        await app.waitFor('id:nav-discover');
        await app.press('全部记录');
        await app.waitFor('id:history-list');
        await app.wait(180);
        await app.screenshot(`${artifacts}/history-entry-${width}-${colorScheme}.png`);
        await app.press('id:nav-discover');
        await app.waitFor('id:drama-123');
        await app.screenshot(`${artifacts}/category-${width}-${colorScheme}.png`);
        await app.press('id:filter-category_dim_theme-cate_165');
        await app.waitFor('id:drama-173');
        await app.press('id:filter-sort-online_time');
        await app.waitFor('id:drama-173');
        await app.press('id:nav-search');
        await app.waitFor('最近搜索');
        await app.press('id:search-back');
        await app.waitFor('id:drama-173');
        await app.wait(180);
        await app.keyboard.press('right');
        await app.keyboard.press('enter');
        await app.waitUntil(() =>
          app
            .requests()
            .some(
              (request) =>
                request.url.includes('/category?') &&
                new URL(request.url, 'http://127.0.0.1').searchParams.get('sort') === 'hot_score',
            ),
        );
        await app.waitFor('id:drama-173');
        await app.press('id:filter-sort-online_time');
        await app.waitFor('id:drama-173');
        await app.hover('id:filter-sort-hot_score');
        await app.screenshot(`${artifacts}/selected-${width}-${colorScheme}.png`);
        await app.press('id:category-more');
        await app.waitFor('重试加载更多');
        await app.screenshot(`${artifacts}/more-error-${width}-${colorScheme}.png`);
        await app.press('重试加载更多');
        await app.waitFor('加载更多');
        await app.press('id:category-more');
        await app.waitUntil(() => !app.shows('id:category-more'));
        // The page scrolls as a whole now, so the heading and filters travel with the cards and a
        // fixed drag lands on a different row than when the list alone scrolled. Scroll until a
        // card from the appended page (139-150) is on screen: that is what this step proves.
        // A parent-viewport list mounts rows around the page's viewport, so `shows` says what is
        // rendered, not what is on screen. Scroll toward the appended page until one of its cards
        // is rendered, then press it: reaching and opening a card the first page never held is
        // what this step proves.
        // Reach a card the first page did not hold. The appended page is 191-200 here (this
        // theme's first page is 173-190); dragging past the first screen is enough to render
        // them, and opening the card is what proves the appendix is reachable, not just mounted.
        await app.scroll('id:category-results', 900);
        await app.wait(160);
        const later = Array.from({ length: 10 }, (_, i) => 191 + i).find((id) =>
          app.shows(`id:drama-${id}`),
        );
        expect(later).toBeDefined();
        await app.press(`id:drama-${later}`);
        await app.waitFor('id:episode-range-trigger');
        await app.back();
        await app.waitFor(`id:drama-${later}`);
        await app.wait(180);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        expect(app.shows(`重生之后 ${later! - 122}`)).toBe(true);
        await app.back();
        await app.waitFor(`id:drama-${later}`);
        await app.press('id:nav-search');
        await app.waitFor('最近搜索');
        await app.type('id:search-input', '完整草稿');
        await app.keyboard.press('escape');
        await app.waitUntil(() => !app.shows('id:search-suggestions'));
        await app.press('id:search-back');
        await app.screenshot(`${artifacts}/search-return-${width}-${colorScheme}.png`);
        await app.waitFor(`id:drama-${later}`);
        await app.wait(180);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-range-trigger');
        expect(app.shows(`重生之后 ${later! - 122}`)).toBe(true);
        await app.back();
        await app.waitFor(`id:drama-${later}`);
        await app.screenshot(`${artifacts}/return-${width}-${colorScheme}.png`);
        await app.press('id:filter-genre-comic_series');
        await app.waitFor('id:drama-223');
        expect(app.shows('id:drama-173')).toBe(false);
        await app.press('id:filter-category_dim_theme-cate_3');
        await app.waitFor('没有找到相关短剧，试试其他筛选。');
        await app.screenshot(`${artifacts}/empty-${width}-${colorScheme}.png`);
        await app.press('id:category-clear');
        await app.waitFor('id:drama-123');
        expect(app.shows('id:category-clear')).toBe(false);
        await app.press('id:nav-search');
        expect(app.value('id:search-input')).toBe('完整草稿');
        // The page scrolls as a whole, so the list sits at full length inside it and each drag
        // covers more content to lay out than the bounded list did: the same steps take about 32s
        // against a 30s default. The time buys the reading position this test exists to prove.
      }, 60000);
    }
  }
}
