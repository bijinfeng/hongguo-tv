import { expect, open, test, type App } from 'nsh/test';

const ids = {
  weekly: 'weekly & raw',
  actor: 'actor/榜 & 9',
  later: 'later/榜 & 48',
  dense: 'dense/32 & raw',
  sub: 'sub & 2',
  deep: 'deep/子榜 & 3',
  panel: 'panel/7 & raw',
};
const choice = (group: string, value: string) =>
  `id:ranking-choice-${encodeURIComponent(group)}-${encodeURIComponent(value)}`;
const reads = (app: App, endpoint = '/api/v1/lists/rank') =>
  app.requests().filter((request) => new URL(request.url).pathname === endpoint);
const params = (app: App) => new URL(reads(app).at(-1)!.url).searchParams;
const readonly = (app: App) => {
  expect(app.requests().every((request) => request.method === 'GET')).toBe(true);
  expect(app.requests().some((request) => /\/play\/|series_id=202(?:&|$)/.test(request.url))).toBe(
    false,
  );
};

/** Explicit graphical acceptance: every business response comes from the local HTTP fixture. */
export function registerRankingsHostTests(
  entry: string,
  artifacts: string,
  host: 'headless' | 'web' | 'macos',
) {
  for (const [width, height] of [
    [1180, 780],
    [1440, 1000],
  ])
    for (const colorScheme of ['light', 'dark'] as const) {
      const suffix = `${width}-${colorScheme}`;
      const newApp = async () => {
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
        await app.press('id:nav-rank');
        await app.waitFor('id:ranking-drama:101');
        return app;
      };
      const capture = async (app: App, name: string) => {
        if (host === 'headless') return;
        await app.wait(250);
        await app.screenshot(`${artifacts}/${name}-${suffix}.png`);
      };
      /** Headless has no host focus handoff: press the control its focus would press. */
      const pressFocusedOr = async (app: App, selector: string) => {
        if (host === 'headless') await app.press(selector);
        else await app.keyboard.press('enter');
      };
      /** Guards are no-ops at the start; a negative drag there is not an error worth failing. */
      const resetFilters = (app: App) => app.scroll('id:ranking-filters', -4000).catch(() => {});

      test(`rankings HTTP ${host} ${suffix}: dynamic selectors, identity destinations, exact retry and later source`, async () => {
        const app = await newApp();
        try {
          expect(new URL(reads(app)[0].url).search).toBe('');
          await capture(app, 'rankings');
          const detailCount = reads(app, '/api/v1/series/detail').length;
          await app.press('id:ranking-actor:101');
          await app.waitFor('id:drama-501');
          expect(reads(app, '/api/v1/actors/works').length).toBe(1);
          expect(reads(app, '/api/v1/series/detail').length).toBe(detailCount);
          await capture(app, 'actor-works');
          await app.press('id:drama-501');
          await app.waitFor('id:episode-5011');
          await app.back();
          await app.waitFor('id:actor-works');
          await app.back();
          await app.waitFor('id:ranking-actor:101');
          await app.wait(180);
          await pressFocusedOr(app, 'id:ranking-actor:101');
          await app.waitFor('id:actor-works');
          await app.back();
          await app.waitFor('id:ranking-actor:101');
          await capture(app, 'actor-return');
          await app.press('id:ranking-drama:101');
          await app.waitFor('id:episode-1011');
          await app.back();
          await app.waitFor('id:ranking-drama:101');
          await app.wait(180);
          await pressFocusedOr(app, 'id:ranking-drama:101');
          await app.waitFor('id:episode-1011');
          await app.back();
          await app.waitFor('id:ranking-drama:101');

          await app.press(choice(`sub:${JSON.stringify([ids.weekly])}`, ids.sub));
          await app.waitUntil(() => params(app).get('rank_sub') === ids.sub);
          await app.waitFor('id:ranking-drama:101');
          expect(params(app).get('rank')).toBe(ids.weekly);
          expect(params(app).has('rank_panel')).toBe(false);
          await app.scroll('id:ranking-filters', 240);
          await app.press(choice(`sub:${JSON.stringify([ids.weekly, ids.sub])}`, ids.deep));
          await app.waitUntil(() => params(app).get('rank_sub') === ids.deep);
          await app.waitFor('id:ranking-drama:101');
          const period = `panel:${JSON.stringify([ids.weekly])}:period & raw:0`;
          await resetFilters(app);
          await app.press(choice(period, ids.panel));
          await app.waitUntil(() => params(app).get('rank_panel') === ids.panel);
          await app.waitFor('id:ranking-drama:101');
          expect(params(app).get('rank')).toBe(ids.weekly);
          expect(params(app).get('rank_sub')).toBe(ids.deep);
          await capture(app, 'selectors');
          await app.press(choice(period, ''));
          await app.waitUntil(
            () => params(app).has('rank_panel') && params(app).get('rank_panel') === '',
          );
          await app.waitFor('id:ranking-drama:101');
          await resetFilters(app);
          await app.press(choice('rank', ''));
          await app.waitFor('这个榜单暂时没有内容');
          expect(params(app).has('rank')).toBe(true);
          expect(params(app).get('rank')).toBe('');
          expect(params(app).has('rank_sub')).toBe(false);
          expect(params(app).has('rank_panel')).toBe(false);
          await capture(app, 'empty');

          await resetFilters(app);
          await app.press(choice('rank', ids.weekly));
          await app.waitFor('id:ranking-drama:101');
          await app.press('id:ranking-more');
          await app.waitFor('重试加载更多');
          const failedPath = reads(app).at(-1)!.url;
          expect(params(app).get('offset')).toBe('20');
          expect(params(app).get('shown')).toBe('101,102');
          await capture(app, 'continuation-error');
          await pressFocusedOr(app, 'id:ranking-more');
          await app.waitFor('加载更多');
          expect(reads(app).at(-1)!.url).toBe(failedPath);
          expect(reads(app).filter((request) => request.url === failedPath).length).toBe(2);
          await capture(app, 'empty-advancement');
          await app.press('id:ranking-more');
          await app.waitFor('正在加载…');
          expect(params(app).get('offset')).toBe('45');
          expect(app.enabled('id:ranking-more')).toBe(false);
          await capture(app, 'continuation-pending');
          await app.waitUntil(() => !app.shows('id:ranking-more'));
          await app.scroll('id:ranking-results', 900);
          await app.waitFor('id:ranking-drama:201');
          await capture(app, 'terminal');

          await resetFilters(app);
          await app.press(choice('rank', ids.later));
          await app.waitFor('id:ranking-drama:500');
          expect(app.shows('id:ranking-drama:540')).toBe(false);
          for (let step = 0; step < 12 && !app.shows('id:ranking-drama:540'); step++) {
            await app.scroll('id:ranking-results', 600);
            await app.wait(100);
          }
          const later = '540';
          await app.waitFor(`id:ranking-drama:${later}`);
          await capture(app, 'later');
          await app.press(`id:ranking-drama:${later}`);
          await app.waitFor(`id:episode-${later}1`);
          await app.back();
          await app.waitFor(`id:ranking-drama:${later}`);
          await capture(app, 'later-return');
          await pressFocusedOr(app, `id:ranking-drama:${later}`);
          await app.waitFor(`id:episode-${later}1`);
          await app.back();
          await app.waitFor(`id:ranking-drama:${later}`);
          readonly(app);
        } finally {
          app.dispose();
        }
      }, 120000);

      // Host keyboard focus handoff needs a real window; headless runs the flows above instead.
      if (host !== 'headless' && width === 1180 && colorScheme === 'light')
        for (const newerIntent of [false, true])
          test(`rankings HTTP ${host}: delayed terminal ${newerIntent ? 'newer selector intent' : 'owned primary focus'}`, async () => {
            const app = await newApp();
            try {
              await app.press('id:ranking-more');
              await app.waitFor('重试加载更多');
              await app.keyboard.press('enter');
              await app.waitFor('加载更多');
              await app.press('id:ranking-more');
              await app.waitFor('正在加载…');
              expect(app.enabled('id:ranking-more')).toBe(false);
              if (newerIntent) {
                await app.press(choice('rank', ids.actor));
                await app.waitFor('id:ranking-actor:202');
                await app.wait(1800);
                expect(app.shows('id:ranking-drama:201')).toBe(false);
                await capture(app, 'terminal-newer-selector');
                await app.keyboard.press('enter');
                await app.wait(180);
                expect(new URL(reads(app).at(-1)!.url).searchParams.get('rank')).toBe(ids.actor);
                expect(app.shows('id:actor-works')).toBe(false);
              } else {
                await app.waitUntil(() => !app.shows('id:ranking-more'));
                await capture(app, 'terminal-owned-focus');
                await app.keyboard.press('right');
                await app.keyboard.press('enter');
                await app.waitFor('id:ranking-actor:202');
                expect(params(app).get('rank')).toBe(ids.actor);
              }
              readonly(app);
            } finally {
              app.dispose();
            }
          }, 60000);

      if (
        host !== 'headless' &&
        ((width === 1180 && colorScheme === 'light') || (width === 1440 && colorScheme === 'dark'))
      )
        test(`rankings HTTP ${host} ${suffix}: 32 panels, eight subrankings and results remain reachable`, async () => {
          const app = await newApp();
          try {
            await app.press(choice('rank', ids.dense));
            await app.waitFor('id:ranking-drama:901');
            await app.scroll('id:ranking-filters', 4000);
            const ancestors = [
              ids.dense,
              ...Array.from({ length: 7 }, (_, index) => `sub/${index + 1} & raw`),
            ];
            await app.press(choice(`sub:${JSON.stringify(ancestors)}`, 'sub/8 & raw'));
            await app.waitUntil(() => params(app).get('rank_sub') === 'sub/8 & raw');
            await app.waitFor('id:ranking-drama:901');
            await capture(app, 'dense-subrankings');
            const group = `panel:${JSON.stringify([ids.dense])}:group/31:31`;
            await app.scroll('id:ranking-filters', -400);
            await app.press(choice(group, 'choice/31 & raw'));
            await app.waitUntil(() => params(app).get('rank_panel') === 'choice/31 & raw');
            await app.waitFor('id:ranking-drama:901');
            expect(params(app).get('rank')).toBe(ids.dense);
            expect(params(app).get('rank_sub')).toBe('sub/8 & raw');
            await capture(app, 'dense-last-panel');
            await app.press('id:ranking-drama:901');
            await app.waitFor('id:episode-9011');
            await app.back();
            await app.waitFor('id:ranking-drama:901');
            await capture(app, 'dense-return');
            await app.press('id:ranking-more');
            await app.waitFor('重试加载更多');
            await capture(app, 'dense-recovery');
            await pressFocusedOr(app, 'id:ranking-more');
            await app.waitFor('加载更多');
            readonly(app);
          } finally {
            app.dispose();
          }
        }, 60000);
    }
}
