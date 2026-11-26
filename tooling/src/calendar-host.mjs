import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { calendarFixture } from './calendar-fixture.mjs';

const [host, ...raw] = process.argv.slice(2);
const foreground = raw.includes('--foreground');
const filterIndex = raw.indexOf('--filter');
const filter = filterIndex < 0 ? undefined : raw[filterIndex + 1];
if (filterIndex >= 0 && (!filter || filter.startsWith('--')))
  throw new Error('Expected --filter text');
const rest = raw.filter(
  (value, index) =>
    value !== '--foreground' &&
    (filterIndex < 0 || (index !== filterIndex && index !== filterIndex + 1)),
);
if (foreground && host !== 'macos') throw new Error('--foreground is available only on macos');
if (!['headless', 'web', 'macos'].includes(host))
  throw new Error(
    'Expected headless|web|macos; Android production acceptance uses its isolated TV harness.',
  );
if (
  rest.length &&
  (rest.length !== 2 || rest[0] !== '--product' || !['desktop', 'tv'].includes(rest[1]))
)
  throw new Error('Expected --product desktop|tv');
const product = rest[1] ?? 'desktop';
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
