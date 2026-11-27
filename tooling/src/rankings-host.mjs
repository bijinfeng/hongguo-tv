import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { runHostSuite } from './host-suite.mjs';
import { rankingsFixture } from './rankings-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['headless', 'web', 'macos'],
  message: 'Expected only --foreground and/or --filter text',
});
const artifacts = resolve(root, `artifacts/rankings-ui/${host}/desktop`);
const fixture = await rankingsFixture();
try {
  await runHostSuite({
    name: `RankingsHost-${host}`,
    register: 'registerRankingsHostTests',
    module: 'rankings-host',
    host,
    origin: fixture.origin,
    artifacts,
    foreground,
    filter,
    headless: host === 'headless',
  });
} finally {
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
  fixture.assertReadOnly();
}
