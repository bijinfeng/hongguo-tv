import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { runHostSuite } from './host-suite.mjs';
import { radarFixture } from './radar-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['web', 'macos'],
  message: 'Expected --foreground and/or --filter text',
});
const artifacts = resolve(root, `artifacts/radar-ui/${host}/desktop`);
const fixture = await radarFixture();
try {
  await runHostSuite({
    name: `RadarHost-${host}`,
    register: 'registerRadarHostTests',
    module: 'radar-host',
    host,
    origin: fixture.origin,
    artifacts,
    foreground,
    filter,
  });
} finally {
  await writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2));
  await fixture.close();
  fixture.assertReadOnly();
}
