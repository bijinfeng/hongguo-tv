import { expect, open, test, type App } from 'nsh/test';

export type SeasonsHostSuite =
  | 'details'
  | 'mismatch'
  | 'late-detail'
  | 'player-browse'
  | 'auto-next'
  | 'next-retry'
  | 'late-next'
  | 'pause-next'
  | 'same-selection-next';
export interface SeasonsHostCase {
  entry: string;
  suite: SeasonsHostSuite;
  width: number;
  height: number;
  colorScheme: 'light' | 'dark';
}
const reads = (app: App, endpoint: string, id?: string) =>
  app.requests().filter((request) => {
    const url = new URL(request.url);
    return (
      url.pathname === endpoint && (id === undefined || url.searchParams.get('series_id') === id)
    );
  });
const details = (app: App, id?: string) => reads(app, '/api/v1/series/detail', id);
const preparations = (app: App) => reads(app, '/api/v1/play/info');
const progress = (app: App) =>
  reads(app, '/api/v1/library/operation').filter((request) => request.method === 'POST');
const readonly = (app: App) => {
  expect(preparations(app).length).toBe(0);
  expect(progress(app).length).toBe(0);
  expect(
    app
      .requests()
      .every(
        (request) =>
          request.method === 'GET' ||
          (request.method === 'POST' &&
            new URL(request.url).pathname === '/api/v1/search/history' &&
            request.body === JSON.stringify({ action: 'add', query: '春山' })),
      ),
  ).toBe(true);
};
const noUnavailableDetails = (app: App) => {
  expect(details(app, '301').length).toBe(0);
  expect(details(app, '401').length).toBe(0);
};
const choose = async (app: App, id: string) => {
  await app.scroll('id:season-scroll', id === '301' || id === '401' ? 1000 : -1000);
  await app.press(`id:season-${id}`);
};
const playbackTime = (app: App) => app.texts().find((text) => /^\d{2}:\d{2} \/ /.test(text)) ?? '';

/** Real graphical hosts and HTTP responses; only the media and guest history are synthetic. */
export function registerSeasonsHostTests(
  cases: SeasonsHostCase[],
  artifacts: string,
  host: 'web' | 'macos',
) {
  for (const options of cases) {
    const { suite, width, height, colorScheme } = options;
    const suffix = `${suite}-${width}-${colorScheme}`;
    test(`seasons HTTP ${host} ${suffix}`, async () => {
      const app = await open(options.entry, {
        width,
        height,
        colorScheme,
        reducedMotion: width === 1180,
        network: 'live',
      });
      const capture = async (name: string) => {
        await app.wait(200);
        await app.screenshot(`${artifacts}/${suffix}-${name}.png`);
      };
      const pause = async () => {
        await app.waitUntil(() => app.enabled('播放进度'), { timeout: 15000 });
        await app.waitUntil(() => /^00:0[1-9] \/ 00:12/.test(playbackTime(app)), {
          timeout: 15000,
        });
        await app.press('暂停');
        await app.wait(200);
      };
      const playFinal = async () => {
        expect(reads(app, '/api/v1/series/next-season').length).toBe(0);
        await app.press('id:episode-1002');
        await app.waitFor('春山不负 · 第1季 · 第 2 集');
        await app.waitUntil(() => app.enabled('播放进度'), { timeout: 15000 });
        // Seek through the actual semantic slider, then let the decoder reach its real end.
        await app.press('播放进度');
        await app.keyboard.press('home');
        await app.keyboard.press('right');
        expect(reads(app, '/api/v1/series/next-season').length).toBe(0);
        await app.waitUntil(
          () =>
            suite === 'auto-next' || suite === 'pause-next' || suite === 'same-selection-next'
              ? details(app, '201').length === 1
              : reads(app, '/api/v1/series/next-season', '101').length === 1,
          { timeout: 20000 },
        );
        if (suite === 'auto-next' || suite === 'pause-next' || suite === 'same-selection-next')
          expect(reads(app, '/api/v1/series/next-season').length).toBe(0);
        await app.waitUntil(() =>
          progress(app).some((request) => {
            const change = JSON.parse(request.body ?? '{}');
            return change.video_id === '1002' && change.completed === true;
          }),
        );
      };
      try {
        if (host === 'macos')
          await app.waitUntil(() => app.window('main').state()?.focused === true, {
            timeout: 60000,
          });
        await app.press('id:nav-search');
        await app.type('id:search-input', '春山');
        await app.submit('id:search-input');
        await app.waitFor('id:drama-101');
        await app.press('id:drama-101');
        await app.waitFor('id:episode-1001');
        await app.waitFor('id:season-101');
        expect(
          details(app, '101').every(
            (request) => new URL(request.url).searchParams.get('content_type') === '',
          ),
        ).toBe(true);
        expect(reads(app, '/api/v1/series/next-season').length).toBe(0);

        if (suite === 'details') {
          await capture('original');
          const count = details(app).length;
          await choose(app, '301');
          await app.waitFor('该季尚未上线，没有可播放的选集。');
          expect(app.enabled('id:detail-start')).toBe(false);
          expect(app.shows('id:episode-1001')).toBe(false);
          await capture('upcoming');
          await choose(app, '401');
          await app.waitFor('这一季暂时无法观看。');
          expect(app.enabled('id:detail-start')).toBe(false);
          expect(details(app).length).toBe(count);
          await capture('unavailable');
          await choose(app, '201');
          await app.waitFor('id:detail-episodes-error');
          expect(app.enabled('id:detail-start')).toBe(false);
          const failed = details(app, '201').at(-1)!.url;
          await capture('detail-error');
          await app.press('重试');
          await app.waitFor('id:episode-2001');
          expect(details(app, '201').at(-1)!.url).toBe(failed);
          expect(details(app, '201').length).toBe(2);
          expect(app.enabled('id:detail-start')).toBe(true);
          expect(app.shows('id:episode-1001')).toBe(false);
          await capture('second-season');
          await app.back();
          await app.waitFor('id:drama-101');
          expect(app.value('id:search-input')).toBe('春山');
          readonly(app);
        } else if (suite === 'mismatch') {
          await choose(app, '201');
          await app.waitFor('id:detail-episodes-error');
          expect(app.enabled('id:detail-start')).toBe(false);
          expect(app.shows('id:episode-2001')).toBe(false);
          expect(app.shows('id:episode-1001')).toBe(false);
          await capture('rejected-identity');
          const failed = details(app, '201').at(-1)!.url;
          await app.press('重试');
          await app.waitFor('id:episode-2001');
          expect(details(app, '201').at(-1)!.url).toBe(failed);
          await capture('recovered-identity');
          readonly(app);
        } else if (suite === 'late-detail') {
          await choose(app, '201');
          await app.waitFor('id:detail-episodes-loading');
          await app.waitUntil(() => details(app, '201').length === 1);
          await choose(app, '101');
          await app.waitFor('id:episode-1001');
          await app.wait(2200);
          expect(app.shows('id:episode-2001')).toBe(false);
          expect(app.shows('id:detail-episodes-error')).toBe(false);
          expect(app.enabled('id:detail-start')).toBe(true);
          await capture('newer-season-wins');
          readonly(app);
        } else if (suite === 'player-browse') {
          await app.press('id:episode-1001');
          await pause();
          await app.scroll('id:player-media-scroll', 10000);
          expect(app.shows('id:player-episodes-title')).toBe(true);
          expect(app.shows('第1季，播放中')).toBe(true);
          await capture('independent-media-scroll');
          const mediaCount = preparations(app).length;
          const writeCount = progress(app).length;
          await choose(app, '201');
          await app.waitFor('id:player-episode-2001');
          expect(app.shows('春山不负 · 第1季 · 第 1 集')).toBe(true);
          expect(app.shows('第1季，播放中')).toBe(true);
          expect(app.shows('第2季，播放中')).toBe(false);
          await capture('browsing-another-season');
          await choose(app, '301');
          await app.waitFor('本季待上线');
          await choose(app, '401');
          await app.waitFor('本季暂不可观看');
          expect(preparations(app).length).toBe(mediaCount);
          expect(progress(app).length).toBe(writeCount);
          expect(app.count('id:player-video')).toBe(1);
          await choose(app, '201');
          await app.waitFor('id:player-episode-2001');
          await app.press('id:player-episode-2001');
          await app.waitFor('春山不负 · 第2季 · 第 1 集');
          await pause();
          expect(new URL(preparations(app).at(-1)!.url).searchParams.get('series_id')).toBe('201');
          expect(new URL(preparations(app).at(-1)!.url).searchParams.get('vid')).toBe('2001');
          expect(preparations(app).length).toBe(mediaCount + 1);
          expect(app.shows('第2季，播放中')).toBe(true);
          expect(app.shows('第1季，可续播')).toBe(true);
          expect(app.count('id:player-video')).toBe(1);
          await capture('playing-and-resume');
          await app.keyboard.press('escape');
          await app.waitFor('id:detail-start');
          await app.waitFor('id:episode-1001');
          expect(app.shows('id:episode-2001')).toBe(false);
          await capture('detail-source-return');
          await app.back();
          await app.waitFor('id:drama-101');
          expect(app.value('id:search-input')).toBe('春山');
          expect(reads(app, '/api/v1/series/next-season').length).toBe(0);
        } else {
          await playFinal();
          if (suite === 'next-retry') {
            await app.waitFor('id:player-next-season-retry');
            expect(preparations(app).length).toBe(1);
            const failed = reads(app, '/api/v1/series/next-season').at(-1)!.url;
            await capture('next-error');
            await app.press('id:player-next-season-retry');
            await app.waitFor('春山不负 · 第2季 · 第 1 集');
            expect(reads(app, '/api/v1/series/next-season').at(-1)!.url).toBe(failed);
            expect(reads(app, '/api/v1/series/next-season').length).toBe(2);
          } else if (suite === 'pause-next') {
            await app.waitFor('正在加载下一季…');
            // The test entry injects the same explicit pause command as the host transport.
            await app.keyboard.press('mod+shift+p');
            await app.wait(2200);
            expect(app.shows('春山不负 · 第1季 · 第 2 集')).toBe(true);
            expect(preparations(app).length).toBe(1);
            expect(details(app, '201').length).toBe(1);
            expect(
              progress(app).some(
                (request) => JSON.parse(request.body ?? '{}').drama?.series_id === '201',
              ),
            ).toBe(false);
            expect(app.shows('正在加载下一季…')).toBe(false);
            await capture('explicit-pause-cancelled-next');
          } else if (suite === 'same-selection-next') {
            await app.waitFor('正在加载下一季…');
            expect(preparations(app).length).toBe(1);
            expect(app.shows('第1季，播放中')).toBe(true);
            // Reconfirm the current season directly; no navigation or media command cancels it first.
            await app.press('id:season-101');
            await app.waitUntil(() => !app.shows('正在加载下一季…'));
            await app.wait(2200);
            expect(app.shows('春山不负 · 第1季 · 第 2 集')).toBe(true);
            expect(app.shows('本集已播完')).toBe(true);
            expect(app.shows('春山不负 · 第2季 · 第 1 集')).toBe(false);
            expect(app.shows('id:player-episode-2001')).toBe(false);
            expect(app.shows('id:player-next-season-retry')).toBe(false);
            expect(preparations(app).length).toBe(1);
            expect(details(app, '201').length).toBe(1);
            expect(
              progress(app).some(
                (request) => JSON.parse(request.body ?? '{}').drama?.series_id === '201',
              ),
            ).toBe(false);
            expect(app.count('id:player-video')).toBe(1);
            await capture('same-selection-cancelled-next');
          } else if (suite === 'late-next') {
            await app.waitFor('正在加载下一季…');
            await app.keyboard.press('escape');
            await app.waitFor('id:detail-start');
            await app.wait(2200);
            expect(app.shows('id:player')).toBe(false);
            expect(app.shows('id:episode-1001')).toBe(true);
            expect(preparations(app).length).toBe(1);
            expect(details(app, '201').length).toBe(0);
            await capture('cancelled-next-return');
          } else await app.waitFor('春山不负 · 第2季 · 第 1 集');
          if (suite !== 'late-next' && suite !== 'pause-next' && suite !== 'same-selection-next') {
            await pause();
            expect(new URL(preparations(app).at(-1)!.url).searchParams.get('vid')).toBe('2001');
            expect(app.count('id:player-video')).toBe(1);
            await capture('actual-next-season');
          }
        }
        noUnavailableDetails(app);
      } finally {
        app.dispose();
      }
    }, 90000);
  }
}
