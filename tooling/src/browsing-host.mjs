import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { executable, root, run, runtimeConfig, rustEnvironment } from './process.mjs';

const target = process.argv[2];
if (!['macos', 'web'].includes(target))
  throw new Error(
    'Expected macos|web graphical host; desktop font scaling needs a supported host control.',
  );
const fixture = await browsingFixture();
const runtime = resolve(root, 'apps/web/runtime.generated.json');
const previous = await readFile(runtime);
const artifacts = resolve(root, `artifacts/browsing/${target}`);
try {
  await mkdir(artifacts, { recursive: true });
  await runtimeConfig('web', fixture.origin);
  const file = resolve(root, 'apps/web/.nsh/BrowsingHost.test.tsx');
  await writeFile(
    file,
    `import { registerBrowsingHostTests } from '@hongguo/app/testing/host';\nregisterBrowsingHostTests('../App.tsx', ${JSON.stringify(artifacts)});\n`,
  );
  await run(executable('nsh'), ['test', file, '--target', target], {
    cwd: resolve(root, 'apps/web'),
    env: rustEnvironment(),
  });
  if (fixture.requests.some((request) => request.method === 'POST'))
    throw new Error('Browsing wrote progress');
} finally {
  await writeFile(runtime, previous);
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
}
