import { expect, open, test, type App } from 'nsh/test';

const reads = (app: App, path: string, id?: string) =>
  app.requests().filter((request) => {
    const url = new URL(request.url);
    return url.pathname === path && (id === undefined || url.searchParams.get('series_id') === id);
  });
const reveal = async (app: App, scroll: string, id: string) => {
  for (let step = 0; step < 60 && !app.shows(`id:${id}`); step++) {
    await app.scroll(`id:${scroll}`, 600);
    await app.wait(80);
  }
  await app.waitFor(`id:${id}`);
  // The semantic tree includes the List's overscan; move its final fixture row fully into view.
  await app.scroll(`id:${scroll}`, 600);
};

/** Production navigation and real HTTP; entering from history keeps the entire journey GET-only. */
export function registerDetailExtrasHostTests(
  entry: string,
  artifacts: string,
  host: 'web' | 'macos',
) {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ])
    for (const colorScheme of ['light', 'dark'] as const) {
      const suffix = `${width}-${colorScheme}`;
      test(`detail extras HTTP ${host} ${suffix}: actors, later works, related return and season scope`, async () => {
        const app = await open(entry, {
          width,
          height,
          colorScheme,
          reducedMotion: width === 1180,
          network: 'live',
        });
        const capture = async (name: string) => {
          await app.wait(180);
          await app.screenshot(`${artifacts}/${name}-${suffix}.png`);
        };
        try {
          if (host === 'macos')
            await app.waitUntil(() => app.window('main').state()?.focused === true, {
              timeout: 60000,
            });
          await app.waitFor('选集与详情');
          await app.press('选集与详情');
          await app.waitFor('id:episode-1231');
          await capture('detail-original');
          await app.scroll('id:detail-scroll', 500);
          await app.waitFor('id:detail-actor-9007199254740993');
          expect(app.shows('没有演员编号的特别出演与漫长中文姓名')).toBe(true);
          expect(app.count('id:detail-actor-name-1')).toBe(1);
          await capture('actors-and-related');
          await app.press('id:detail-actor-9007199254740993');
          await app.waitFor('id:actor-results');
          await reveal(app, 'actor-results', 'drama-204');
          await capture('later-actor-work');
          await app.press('id:drama-204');
          await app.waitFor('id:episode-2041');
          expect(app.count('id:detail-actors')).toBe(0);
          expect(app.count('id:detail-related')).toBe(0);
          await app.back();
          await app.waitFor('id:drama-204');
          await app.wait(180);
          await capture('actor-work-return');
          await app.keyboard.press('enter');
          await app.waitFor('id:episode-2041');
          await app.back();
          await app.waitFor('id:drama-204');
          await app.back();
          await app.waitFor('id:detail-actor-9007199254740993');
          await app.wait(180);
          await capture('actor-source-return');
          await app.keyboard.press('enter');
          await app.waitFor('id:actor-results');
          await app.back();
          await app.waitFor('id:detail-actor-9007199254740993');
          await reveal(app, 'detail-scroll', 'drama-343');
          await capture('later-related');
          await app.press('id:drama-343');
          await app.waitFor('id:episode-3431');
          expect(app.count('id:detail-actors')).toBe(0);
          expect(app.count('id:detail-related')).toBe(0);
          // Resize while the source is covered: returning must use the new two-column row index.
          await app.setViewport(780, height);
          await app.back();
          await app.waitFor('id:drama-343');
          await app.wait(180);
          await capture('related-narrow-source-return');
          await app.setViewport(width, height);
          await app.wait(180);
          await capture('related-source-return');
          await app.keyboard.press('enter');
          await app.waitFor('id:episode-3431');
          await app.back();
          await app.waitFor('id:drama-343');
          // This fixture has eleven related rows; bounded gestures avoid a minute-long drag.
          for (let step = 0; step < 12; step++) await app.scroll('id:detail-scroll', -600);
          await app.press('id:season-124');
          await app.waitFor('id:episode-1241');
          expect(app.count('id:detail-actors')).toBe(0);
          expect(app.count('id:detail-related')).toBe(0);
          await capture('empty-extras-season');
          await app.press('id:season-123');
          await app.waitFor('id:episode-1231');
          await app.scroll('id:detail-scroll', 500);
          await app.waitFor('id:detail-actor-9007199254740993');
          await capture('original-extras-restored');
          expect(app.requests().every((request) => request.method === 'GET')).toBe(true);
          expect(
            app
              .requests()
              .some((request) =>
                /\/play\/|\/media\/|\/minireel-proxy\//.test(new URL(request.url).pathname),
              ),
          ).toBe(false);
          for (const id of ['123', '124', '204', '343'])
            expect(reads(app, '/api/v1/series/detail', id).length > 0).toBe(true);
          expect(
            reads(app, '/api/v1/actors/works').every(
              (request) => new URL(request.url).search === '?actor_id=9007199254740993',
            ),
          ).toBe(true);
        } finally {
          app.dispose();
        }
      }, 120000);
    }
}
