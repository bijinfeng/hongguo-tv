import { expect, open, test, type App } from 'nsh/test';

const reads = (app: App, endpoint: string) =>
  app.requests().filter((request) => new URL(request.url).pathname === endpoint);
const readonly = (app: App) => {
  expect(app.requests().every((request) => request.method === 'GET')).toBe(true);
  expect(app.requests().some((request) => /\/play\/|\/media\//.test(request.url))).toBe(false);
};

/** The production App, real host input and local HTTP, without an alternate radar layout. */
export function registerRadarHostTests(entry: string, artifacts: string, host: 'web' | 'macos') {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ])
    for (const colorScheme of ['light', 'dark'] as const) {
      const suffix = `${width}-${colorScheme}`;
      test(`radar HTTP ${host} ${suffix}: exact detail ownership, eight columns, cache branches and return source`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        try {
          if (host === 'macos')
            await app.waitUntil(() => app.window('main').state()?.focused === true, {
              timeout: 60000,
            });
          await app.press('id:nav-rank');
          await app.waitFor('id:ranking-drama:101');
          expect(reads(app, '/api/v1/radar').length).toBe(0);
          await app.press('id:ranking-view-radar');
          await app.waitFor('id:radar-entry-101');
          const capture = async (name: string) => {
            await app.wait(180);
            await app.screenshot(`${artifacts}/${name}-${suffix}.png`);
          };
          await capture('snapshot');
          await app.hover('id:radar-entry-101');
          await capture('hover-title');
          await app.press('id:radar-columns-next');
          await app.waitFor('id:radar-column-streak');
          await capture('last-columns');
          await app.press('id:radar-columns-prev');
          await app.waitFor('id:radar-column-title');
          await capture('first-columns');
          expect(
            app.texts().some((text) => text.includes('2026-11-13') && text.includes('2026-11-14')),
          ).toBe(true);
          await app.press('id:radar-entry-101');
          await app.waitFor('id:episode-1011');
          await app.back();
          await app.waitFor('id:radar-entry-101');
          await app.wait(180);
          await app.keyboard.press('enter');
          await app.waitFor('id:episode-1011');
          await app.back();
          await app.waitFor('id:radar-entry-101');
          await app.press('id:radar-entry-102');
          await app.waitFor('id:radar-detail-retry');
          expect(app.shows('id:detail-scroll')).toBe(false);
          await app.press('id:radar-detail-retry');
          await app.waitFor('详情读取失败：服务暂时不可用，请稍后重试');
          await app.press('id:radar-detail-retry');
          await app.waitFor('id:episode-1021');
          await app.back();
          await app.waitFor('id:radar-entry-102');

          await app.press('id:radar-entry-201');
          await app.press('id:radar-view-growth');
          await app.wait(1800);
          expect(app.shows('id:detail-scroll')).toBe(false);
          await app.press('id:radar-type-unknown');
          await capture('unknown-type');
          await app.press('id:radar-type-all');
          await app.press('id:radar-metric-d_fav');
          await app.press('id:radar-metric-r_hot');
          await capture('growth');
          expect(reads(app, '/api/v1/radar').length).toBe(1);
          await app.press('id:radar-view-snapshot');
          await app.press('id:radar-columns-prev');
          await app.waitFor('id:radar-column-title');
          const headers = app
            .texts()
            .filter((text) =>
              ['名次', '变化', '短剧', '类型', '热度', '热度增量', '收藏增量', '连续在榜'].includes(
                text,
              ),
            );
          expect(
            headers.indexOf('名次') >= 0 && headers.indexOf('名次') < headers.indexOf('变化'),
          ).toBe(true);
          expect(headers.indexOf('变化') < headers.indexOf('短剧')).toBe(true);
          await capture('snapshot-restored-columns');
          await app.press('id:radar-category-ai');
          await app.waitFor('id:radar-entry-102');
          expect(app.shows('id:radar-entry-101')).toBe(false);
          await app.press('id:radar-category-hot');
          await app.waitFor('id:radar-entry-101');

          await app.press('id:radar-refresh');
          await app.waitFor('id:radar-growth-status');
          await capture('partial');
          await app.press('id:radar-refresh');
          await app.waitFor('id:radar-stale');
          await app.waitFor('id:radar-cache-warning');
          await capture('stale');
          await app.press('id:radar-refresh');
          await app.waitFor('id:radar-retry');
          await capture('refresh-failed');
          await app.press('id:radar-retry');
          await app.waitUntil(() => !app.shows('id:radar-retry'));

          for (let step = 0; step < 20 && !app.shows('id:radar-entry-540'); step++) {
            await app.scroll('id:radar-rows', 500);
            await app.wait(100);
          }
          await app.waitFor('id:radar-entry-540');
          await app.press('id:radar-entry-540');
          await app.waitFor('id:episode-5401');
          await app.back();
          await app.waitFor('id:radar-entry-540');
          await capture('later-return');
          await app.keyboard.press('enter');
          await app.waitFor('id:episode-5401');
          await app.back();
          await app.waitFor('id:radar-entry-540');
          expect(
            reads(app, '/api/v1/series/detail').some(
              (request) => new URL(request.url).searchParams.get('series_id') === '540',
            ),
          ).toBe(true);
          await app.press('id:nav-home');
          await app.press('id:nav-rank');
          await app.waitFor('id:radar-table');
          await app.press('我的账号');
          await app.waitFor('id:account-login-open');
          await app.back();
          await app.waitFor('id:radar-table');
          await app.wait(180);
          const beforePrimary = reads(app, '/api/v1/radar').length;
          await app.keyboard.press('enter');
          await app.waitUntil(() => reads(app, '/api/v1/radar').length > beforePrimary);
          await app.waitUntil(() => !app.texts().includes('正在刷新…'));
          // Returning installs refresh's onFocus source before its Radar owner is destroyed.
          await app.press('我的账号');
          await app.waitFor('id:account-login-open');
          await app.back();
          await app.waitFor('id:radar-table');
          await app.wait(180);
          await app.press('id:ranking-view-official');
          await app.waitFor('id:ranking-drama:101');
          const radarReadsAfterSwitch = reads(app, '/api/v1/radar').length;
          await app.press('我的账号');
          await app.waitFor('id:account-login-open');
          await app.back();
          await app.waitFor('id:ranking-drama:101');
          await app.wait(180);
          await app.keyboard.press('right');
          await app.keyboard.press('enter');
          await app.waitFor('id:ranking-actor:202');
          expect(reads(app, '/api/v1/radar').length).toBe(radarReadsAfterSwitch);
          readonly(app);
        } finally {
          app.dispose();
        }
      }, 120000);
    }
}
