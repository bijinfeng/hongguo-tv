import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { calendarFixture } from './calendar-fixture.mjs';

const { host, foreground, filter, flags } = hostArgs({
  hosts: ['headless', 'web', 'macos'],
  options: { product: { type: 'string' } },
  message: 'Expected --product desktop|tv',
});
const product = flags.get('--product') ?? 'desktop';
if (!['desktop', 'tv'].includes(product)) throw new Error('Expected --product desktop|tv');
const application = resolve(root, 'apps/harness');
const artifacts = resolve(root, `artifacts/calendar-ui/${host}/${product}`);
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
const name = `CalendarHost-${host}-${product}`;
const fixture = host === 'headless' ? undefined : await calendarFixture();
try {
  await writeFile(
    resolve(application, `.nsh/${name}.tsx`),
    `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient('${fixture?.origin ?? 'http://127.0.0.1:18997'}');
mount(() => <App target="${product}" logoMark={logoMark} />);
`,
  );
  await writeFile(
    resolve(application, `.nsh/${name}.test.tsx`),
    `import {registerCalendarHostTests,registerCalendarVisualTests} from '@hongguo/app/testing/calendar-host';
registerCalendarHostTests('./${name}.tsx', ${JSON.stringify(artifacts)}, '${host}', '${product}');
${host === 'headless' ? '' : `registerCalendarVisualTests('./${name}.tsx', ${JSON.stringify(artifacts)}, '${product}');`}
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
    {
      cwd: application,
      env: rustEnvironment(),
    },
  );
} finally {
  if (fixture) {
    await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
    await fixture.close();
  }
}
