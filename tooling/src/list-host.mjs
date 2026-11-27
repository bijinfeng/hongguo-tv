/**
 * The list-style host suites: rankings and radar.
 *
 * Both start a read-only fixture, render the desktop App against it, run one register function,
 * then write the request log and assert the fixture saw no writes. After `runHostSuite` absorbed
 * the scaffolding they differed only in six values, so the values are the table and the rest is
 * shared.
 *
 * The two entry files stay as wrappers because their exact commands appear in frozen history
 * records, and a record whose command no longer runs is not evidence.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';
import { hostArgs } from './host-args.mjs';
import { runHostSuite } from './host-suite.mjs';
import { radarFixture } from './radar-fixture.mjs';
import { rankingsFixture } from './rankings-fixture.mjs';

const SUITES = {
  rankings: {
    hosts: ['headless', 'web', 'macos'],
    message: 'Expected only --foreground and/or --filter text',
    fixture: rankingsFixture,
    artifacts: (host) => `artifacts/rankings-ui/${host}/desktop`,
    file: (host) => `RankingsHost-${host}`,
    register: 'registerRankingsHostTests',
    module: 'rankings-host',
  },
  radar: {
    hosts: ['web', 'macos'],
    message: 'Expected --foreground and/or --filter text',
    fixture: radarFixture,
    artifacts: (host) => `artifacts/radar-ui/${host}/desktop`,
    file: (host) => `RadarHost-${host}`,
    register: 'registerRadarHostTests',
    module: 'radar-host',
  },
};

/**
 * Runs a list-style host suite end to end.
 *
 * @param {'rankings'|'radar'} suite
 */
export async function listHost(suite) {
  const spec = SUITES[suite];
  if (!spec) throw new Error(`Unknown list suite: ${suite}`);
  const { host, foreground, filter } = hostArgs({
    hosts: spec.hosts,
    message: spec.message,
  });
  const artifacts = resolve(root, spec.artifacts(host));
  const fixture = await spec.fixture();
  try {
    await runHostSuite({
      name: spec.file(host),
      register: spec.register,
      module: spec.module,
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
}
