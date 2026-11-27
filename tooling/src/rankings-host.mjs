import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { rankingsFixture } from './rankings-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['headless', 'web', 'macos'],
  message: 'Expected only --foreground and/or --filter text',
});

const application = resolve(root, 'apps/harness');
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
