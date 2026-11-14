import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { executable, root, run, runtimeConfig, rustEnvironment } from './process.mjs';

const target = process.argv[2];
const suite = process.argv[3] || 'browsing';
if (!['browsing', 'suggestions', 'category', 'feed'].includes(suite))
  throw new Error('Expected browsing|suggestions|category|feed');
if (!['macos', 'web'].includes(target))
  throw new Error(
    'Expected macos|web graphical host; desktop font scaling needs a supported host control.',
  );
const fixture = await browsingFixture({ feed: suite === 'feed' });
const runtime = resolve(root, 'apps/web/runtime.generated.json');
const previous = await readFile(runtime);
const artifacts = resolve(
  root,
  `artifacts/${suite === 'feed' ? 'feed-ui' : suite === 'category' ? 'category-ui' : suite === 'suggestions' ? 'typed-search-ui' : 'browsing'}/${target}`,
);
try {
  await mkdir(artifacts, { recursive: true });
  await runtimeConfig('web', fixture.origin);
  const file = resolve(
    root,
    `apps/web/.nsh/${suite === 'feed' ? 'Feed' : suite === 'category' ? 'Category' : suite === 'suggestions' ? 'Suggestions' : 'Browsing'}Host.test.tsx`,
  );
  const register =
    suite === 'feed'
      ? 'registerFeedHostTests'
      : suite === 'category'
        ? 'registerCategoryHostTests'
        : suite === 'suggestions'
          ? 'registerSuggestionsHostTests'
          : 'registerBrowsingHostTests';
  const module =
    suite === 'feed'
      ? 'feed-host'
      : suite === 'category'
        ? 'category-host'
        : suite === 'suggestions'
          ? 'suggestions-host'
          : 'host';
  await writeFile(
    file,
    `import { ${register} } from '@hongguo/app/testing/${module}';\n${register}('../App.tsx', ${JSON.stringify(artifacts)}, ${JSON.stringify(target)});\n`,
  );
  await run(
    executable('nsh'),
    ['test', file, '--target', target, ...(target === 'macos' ? ['--foreground'] : [])],
    {
      cwd: resolve(root, 'apps/web'),
      env: rustEnvironment(),
    },
  );
  if (suite === 'feed') {
    const writes = fixture.requests.filter(
      (request) => request.method === 'POST' && request.url === '/api/v1/library',
    );
    for (const video of ['1058', '1001'])
      if (
        !writes.some(
          ({ body }) =>
            body?.drama?.series_id === '123' && body.video_id === video && body.position > 0,
        )
      )
        throw new Error(`Missing actual playback history for episode ${video}`);
    for (const { body } of writes) {
      if (body?.action !== 'progress' || body.drama?.episodes || body.drama?.comments)
        throw new Error('Feed history must contain only actual playback summaries');
      if (
        !fixture.requests.some(({ url }) => {
          const request = new URL(url, fixture.origin);
          return (
            request.pathname === '/api/v1/play/info' &&
            request.searchParams.get('series_id') === body.drama.series_id &&
            request.searchParams.get('vid') === body.video_id
          );
        })
      )
        throw new Error('Feed history identity has no matching media preparation');
    }
  }
  if (
    suite !== 'feed' &&
    fixture.requests.some(
      (request) => request.method === 'POST' && request.url !== '/api/v1/search/history',
    )
  )
    throw new Error('Browsing wrote progress');
} finally {
  await writeFile(runtime, previous);
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
}
