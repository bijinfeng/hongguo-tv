import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { rankingsFixture } from './rankings-fixture.mjs';

const [host, ...raw] = process.argv.slice(2);
if (!['headless', 'web', 'macos'].includes(host)) throw new Error('Expected headless|web|macos');
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
const artifacts = resolve(root, `artifacts/rankings-ui/${host}/desktop`);
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
const name = `RankingsHost-${host}`;
const fixture = await rankingsFixture();
try {
  await writeFile(
    resolve(application, `.nsh/${name}.tsx`),
    `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient(${JSON.stringify(fixture.origin)});
mount(() => <App target="desktop" logoMark={logoMark} />);
`,
  );
  await writeFile(
    resolve(application, `.nsh/${name}.test.tsx`),
    `import {registerRankingsHostTests} from '@hongguo/app/testing/rankings-host';
registerRankingsHostTests('./${name}.tsx', ${JSON.stringify(artifacts)}, '${host}');
`,
  );
  await run(
    executable('nsh'),
    [
      'test',
      `.nsh/${name}.test.tsx`,
      ...(host === 'headless' ? [] : ['--target', host]),
      ...(foreground ? ['--foreground'] : []),
      ...(filter ? ['--filter', filter] : []),
    ],
    { cwd: application, env: rustEnvironment() },
  );
} finally {
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
  fixture.assertReadOnly();
}
