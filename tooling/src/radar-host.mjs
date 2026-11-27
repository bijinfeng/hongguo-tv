import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { radarFixture } from './radar-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['web', 'macos'],
  message: 'Expected --foreground and/or --filter text',
});
const application = resolve(root, 'apps/harness');
const artifacts = resolve(root, `artifacts/radar-ui/${host}/desktop`);
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
const name = `RadarHost-${host}`;
const fixture = await radarFixture();
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
    `import {registerRadarHostTests} from '@hongguo/app/testing/radar-host';
registerRadarHostTests('./${name}.tsx', ${JSON.stringify(artifacts)}, '${host}');
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
} finally {
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
  fixture.assertReadOnly();
}
