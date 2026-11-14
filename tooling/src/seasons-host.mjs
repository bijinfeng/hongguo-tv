import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { seasonsFixture } from './seasons-fixture.mjs';

const [host, ...raw] = process.argv.slice(2);
if (!['web', 'macos'].includes(host)) throw new Error('Expected web|macos');
const foreground = raw.includes('--foreground');
if (foreground && host !== 'macos') throw new Error('--foreground is available only on macos');
const filterIndex = raw.indexOf('--filter');
const filter = filterIndex < 0 ? undefined : raw[filterIndex + 1];
if (filterIndex >= 0 && (!filter || filter.startsWith('--')))
  throw new Error('Expected --filter text');
if (
  raw.some(
    (value, index) =>
      value !== '--foreground' &&
      (filterIndex < 0 || (index !== filterIndex && index !== filterIndex + 1)),
  )
)
  throw new Error('Expected only --foreground and/or --filter text');

const application = resolve(root, 'apps/web');
const artifacts = resolve(
  root,
  `artifacts/seasons-ui/${host}/desktop/${new Date().toISOString().replaceAll(':', '-')}`,
);
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
const name = `SeasonsHost-${host}`;
const cases = [],
  fixtures = [],
  failures = [];
try {
  for (const suite of [
    'details',
    'mismatch',
    'late-detail',
    'player-browse',
    'auto-next',
    'next-retry',
    'late-next',
    'pause-next',
    'same-selection-next',
  ])
    for (const [width, height] of [
      [1180, 780],
      [1440, 1000],
    ])
      for (const colorScheme of ['light', 'dark']) {
        const fixture = await seasonsFixture();
        const suffix = `${suite}-${width}-${colorScheme}`;
        fixtures.push({ fixture, suite, suffix });
        if (suite === 'details') fixture.queue('detail', '201', { status: 503 });
        if (suite === 'mismatch')
          fixture.queue('detail', '201', { data: { ...fixture.dramas['201'], series_id: '999' } });
        if (suite === 'late-detail') fixture.queue('detail', '201', { delayMs: 2000 });
        if (suite === 'next-retry' || suite === 'late-next') {
          // Detail and Player each read the selector; only the current season number is missing.
          const items = Object.entries(fixture.dramas).map(([id, value], index) => {
            const { episodes: _episodes, ...drama } = value;
            return {
              drama,
              ...(id === '101' ? {} : { season_index: index + 1 }),
              label: `第${index + 1}季`,
              playable: id === '101' || id === '201',
              upcoming: id === '301',
              ...(id === '101'
                ? { first_video_id: '1001' }
                : id === '201'
                  ? { first_video_id: '2001' }
                  : {}),
              ...(id === '301' ? { reservation_id: id } : {}),
            };
          });
          fixture.queue('seasons', '101', { data: { items } });
          fixture.queue('seasons', '101', { data: { items } });
        }
        if (suite === 'next-retry') fixture.queue('next', '101', { status: 503 });
        if (suite === 'late-next') fixture.queue('next', '101', { delayMs: 2000 });
        if (suite === 'pause-next' || suite === 'same-selection-next')
          fixture.queue('detail', '201', { delayMs: 2000 });
        const entry = `${name}-${suffix}.tsx`;
        await writeFile(
          resolve(application, `.nsh/${entry}`),
          `import {mount${suite === 'pause-next' ? ',keymap' : ''}} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient(${JSON.stringify(fixture.origin)});
${
  suite === 'pause-next'
    ? `let receive: ((command: unknown) => void) | undefined;
mount(() => {
  keymap.bind('mod+shift+p', () => receive?.('pause'), {when: 'always'});
  return <App target="desktop" logoMark={logoMark} subscribePlayerCommands={(handler) => {
    receive = handler;
    return () => { receive = undefined; };
  }} />;
});`
    : 'mount(() => <App target="desktop" logoMark={logoMark} />);'
}
`,
        );
        cases.push({ entry: `./${entry}`, suite, width, height, colorScheme });
      }
  await writeFile(
    resolve(application, `.nsh/${name}.test.tsx`),
    `import {registerSeasonsHostTests} from '@hongguo/app/testing/seasons-host';
registerSeasonsHostTests(${JSON.stringify(cases)}, ${JSON.stringify(artifacts)}, '${host}');
`,
  );
  await run(
    executable('nsh'),
    [
      'test',
      `.nsh/${name}.test.tsx`,
      '--target',
      host,
      ...(foreground ? ['--foreground'] : []),
      ...(filter ? ['--filter', filter] : []),
    ],
    { cwd: application, env: rustEnvironment() },
  );
} catch (error) {
  failures.push(error);
} finally {
  for (const { fixture, suite, suffix } of fixtures) {
    await fixture.close();
    await writeFile(
      resolve(artifacts, `${suffix}-requests.json`),
      JSON.stringify(
        {
          origin: fixture.origin,
          requests: fixture.requests,
          writes: fixture.writes,
          unknown: fixture.unknown,
        },
        null,
        2,
      ),
    );
    try {
      assert.deepEqual(fixture.unknown, [], `${suffix}: unexpected HTTP traffic`);
      const searched = fixture.writes.filter(
        (write) => new URL(write.url, fixture.origin).pathname === '/api/v1/search/history',
      );
      if (['details', 'mismatch', 'late-detail'].includes(suite))
        fixture.assertReadOnly({ since: searched.length ? searched.at(-1).index + 1 : 0 });
      if (suite === 'same-selection-next' && searched.length) {
        const requests = fixture.requests.map((request) => ({
          ...request,
          address: new URL(request.url, fixture.origin),
        }));
        const media = requests.filter(
          (request) => request.address.pathname === '/api/v1/play/info',
        );
        assert.equal(
          media.length,
          1,
          `${suffix}: current-season confirmation must cancel successor media`,
        );
        assert.equal(media[0].address.searchParams.get('series_id'), '101');
        assert.equal(media[0].address.searchParams.get('vid'), '1002');
        assert.equal(
          requests.filter(
            (request) =>
              request.address.pathname === '/api/v1/series/detail' &&
              request.address.searchParams.get('series_id') === '201',
          ).length,
          1,
          `${suffix}: the automatic successor detail must actually be pending before cancellation`,
        );
        const progress = fixture.writes.filter(
          (write) => new URL(write.url, fixture.origin).pathname === '/api/v1/library',
        );
        assert(progress.some((write) => write.body.video_id === '1002' && write.body.completed));
        assert(
          progress.every(
            (write) => write.body.drama.series_id === '101' && write.body.video_id === '1002',
          ),
          `${suffix}: cancelled successor must never enter history`,
        );
      }
      for (const write of fixture.writes) {
        const path = new URL(write.url, fixture.origin).pathname;
        assert(
          ['/api/v1/library', '/api/v1/play/release', '/api/v1/search/history'].includes(path),
          `${suffix}: unexpected write`,
        );
        if (path === '/api/v1/search/history')
          assert.deepEqual(write.body, { action: 'add', query: '春山' });
        if (path === '/api/v1/library') {
          assert.equal(write.body.action, 'progress');
          assert(['101', '201'].includes(write.body.drama.series_id));
          assert(['1001', '1002', '2001', '2002'].includes(write.body.video_id));
          assert.equal(write.body.owner_id ?? '', '');
          assert(!write.body.drama.episodes);
        }
      }
    } catch (error) {
      failures.push(error);
    }
  }
}
if (failures.length)
  throw new AggregateError(failures, 'Seasons host or fixture traffic assertions failed');
