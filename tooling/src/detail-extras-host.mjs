import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { detailExtrasFixture, verifyDetailExtrasRequests } from './detail-extras-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['web', 'macos'],
  message: 'Expected --foreground and/or --filter text',
});
const application = resolve(root, 'apps/harness');
const artifacts = resolve(
  root,
  `artifacts/detail-extras-ui/${host}/${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
console.log(`Detail extras host artifacts: ${artifacts}`);
const name = `DetailExtrasHost-${host}`;
const fixture = await detailExtrasFixture();
let completed = false;
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
    `import {registerDetailExtrasHostTests} from '@hongguo/app/testing/detail-extras-host';
registerDetailExtrasHostTests('./${name}.tsx', ${JSON.stringify(artifacts)}, '${host}');
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
  completed = true;
} finally {
  await writeFile(
    resolve(artifacts, 'requests.json'),
    JSON.stringify(
      {
        requests: fixture.requests,
        writes: fixture.writes,
        media: fixture.media,
        unknown: fixture.unknown,
      },
      null,
      2,
    ) + '\n',
  );
  await fixture.close();
  const evidence = verifyDetailExtrasRequests(fixture, { completed });
  await writeFile(
    resolve(artifacts, 'request-assertions.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
