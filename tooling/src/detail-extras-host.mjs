import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { runHostSuite } from './host-suite.mjs';
import { detailExtrasFixture, verifyDetailExtrasRequests } from './detail-extras-fixture.mjs';

const { host, foreground, filter } = hostArgs({
  hosts: ['web', 'macos'],
  message: 'Expected --foreground and/or --filter text',
});
const artifacts = resolve(
  root,
  `artifacts/detail-extras-ui/${host}/${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
console.log(`Detail extras host artifacts: ${artifacts}`);
const fixture = await detailExtrasFixture();
let completed = false;
try {
  await runHostSuite({
    name: `DetailExtrasHost-${host}`,
    register: 'registerDetailExtrasHostTests',
    module: 'detail-extras-host',
    host,
    origin: fixture.origin,
    artifacts,
    foreground,
    filter,
  });
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
