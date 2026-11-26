import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calendarFixture } from './calendar-fixture.mjs';
import { executable, nshVersion, output, root, run, rustEnvironment } from './process.mjs';

if (process.argv.length > 2)
  throw new Error('Expected calendar-web-terminal.mjs without arguments');
const cli = executable('nsh');
assert.equal(output(cli, ['--version']).split(/\s+/)[1], nshVersion, 'Expected pinned NSH');
const application = resolve(root, 'apps/harness');
const artifacts = resolve(root, 'artifacts/calendar-ui/web/http-terminal');
await mkdir(resolve(application, '.nsh'), { recursive: true });
await mkdir(artifacts, { recursive: true });
const results = [];

function verifyRequests(fixture, newerIntent) {
  assert.deepEqual(fixture.writes, [], 'No business writes');
  assert.deepEqual(fixture.unknown, [], 'No unknown fixture routes');
  assert(
    fixture.requests.every(({ method }) => method === 'GET'),
    'HTTP must remain read-only',
  );
  assert.equal(fixture.terminalReads(), 1, 'Exactly one delayed terminal read');
  const retry = '/api/v1/lists/calendar?date=20261114&offset=45&session_id=calendar-14';
  assert.deepEqual(
    fixture.reads.filter((path) => path.startsWith('/api/v1/lists/calendar')),
    [
      '/api/v1/lists/calendar',
      retry,
      retry,
      '/api/v1/lists/calendar?date=20261114&subscribe_offset=23&offset=24&session_id=calendar-14',
      '/api/v1/lists/calendar?date=20261114&subscribe_offset=23&offset=60&session_id=calendar-14',
      ...(newerIntent ? ['/api/v1/lists/calendar?date=20261115'] : []),
    ],
    'Exact retry, independent cursors and no extra reads',
  );
  assert.deepEqual(
    fixture.requests
      .filter(({ url }) => url.startsWith('/api/v1/lists/calendar'))
      .map(({ status }) => status),
    [200, 503, 200, 200, 200, ...(newerIntent ? [200] : [])],
    'Each HTTP continuation completed with the expected status',
  );
  assert.deepEqual(
    fixture.reads.filter((path) => path.startsWith('/api/v1/lists/new')),
    newerIntent ? [] : ['/api/v1/lists/new?gender=2'],
    'Keyboard activation reaches only the intended destination',
  );
  assert(
    fixture.reads.every((path) => !/\/play\/|\/series\/|\/lists\/rank/.test(path)),
    'Announcements never request drama details, seasons or media',
  );
}

for (const size of [
  { width: 1180, height: 780 },
  { width: 1440, height: 1000 },
])
  for (const colorScheme of ['light', 'dark'])
    for (const newerIntent of [false, true]) {
      const id = `${size.width}-${colorScheme}-${newerIntent ? 'newer' : 'owned'}`;
      const name = `calendar HTTP web ${id}: delayed terminal focus`;
      const directory = resolve(artifacts, id);
      const entry = `CalendarWebTerminal-${id}`;
      await mkdir(directory, { recursive: true });
      const fixture = await calendarFixture({ terminalDelayMs: 1200 });
      const errors = [];
      try {
        await writeFile(
          resolve(application, `.nsh/${entry}.tsx`),
          `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient('${fixture.origin}');
mount(() => <App target="desktop" logoMark={logoMark} />);
`,
        );
        await writeFile(
          resolve(application, `.nsh/${entry}.test.tsx`),
          `import {registerCalendarWebTerminalTest} from '@hongguo/app/testing/calendar-web-terminal';
registerCalendarWebTerminalTest('./${entry}.tsx', ${JSON.stringify(directory)}, ${JSON.stringify({ name, ...size, colorScheme, newerIntent })});
`,
        );
        try {
          await run(cli, ['test', `.nsh/${entry}.test.tsx`, '--target', 'web', '--filter', name], {
            cwd: application,
            env: rustEnvironment(),
          });
        } catch (error) {
          errors.push(error);
        }
        try {
          verifyRequests(fixture, newerIntent);
        } catch (error) {
          errors.push(error);
        }
      } catch (error) {
        errors.push(error);
      } finally {
        await writeFile(
          resolve(directory, 'requests.json'),
          JSON.stringify(
            {
              requests: fixture.requests,
              reads: fixture.reads,
              writes: fixture.writes,
              unknown: fixture.unknown,
              terminalReads: fixture.terminalReads(),
            },
            null,
            2,
          ) + '\n',
        );
        await fixture.close();
        results.push({ id, name, passed: !errors.length, errors: errors.map(String) });
        await writeFile(
          resolve(artifacts, 'results.json'),
          JSON.stringify(results, null, 2) + '\n',
        );
      }
    }

const failed = results.filter(({ passed }) => !passed);
if (failed.length)
  throw new Error(
    `${failed.length}/${results.length} HTTP terminal cases failed; see ${artifacts}/results.json`,
  );
