/**
 * Runs one of the player host suites.
 *
 * `player-host.mjs` and `player-controls-host.mjs` were nineteen lines each and identical apart
 * from three values: which register function from `@hongguo/app/testing` to call, which entry to
 * render, and which artifacts directory to write. They stay as thin wrappers because commands of
 * that exact shape appear in the frozen history records, and a record whose command no longer runs
 * is not evidence.
 *
 * `player-media-host.mjs` is not routed through here: it generates its own media files and runs
 * two fixtures per platform, which is a different job rather than another row in this table.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

/** The two suites that differ only in their register call. */
const SUITES = {
  player: {
    module: 'player-host',
    register: 'registerPlayerHost',
    // On Android the native host renders the HTTP fixture; the harness and desktop render the App.
    entry: (target) => (target === 'android' ? '../HttpFixture.tsx' : '../App.tsx'),
    artifacts: (target) => `artifacts/playback/player-${target}`,
    file: (target) => `PlayerHost-${target}`,
  },
  controls: {
    // Not `controls-host`: the testing module keeps the player prefix the original named.
    module: 'player-controls-host',
    register: 'registerPlayerControlsHost',
    entry: () => '../PlayerPreview.tsx',
    artifacts: (target) => `artifacts/playback/controls-${target}`,
    file: (target) => `PlayerControlsHost-${target}`,
  },
};

/**
 * Writes the generated test entry and runs it.
 *
 * @param {'player'|'controls'} suite
 */
export async function playerHost(suite, target) {
  const spec = SUITES[suite];
  if (!spec) throw new Error(`Unknown player suite: ${suite}`);
  if (!['web', 'macos', 'android'].includes(target)) throw new Error('Expected web|macos|android');

  const app = resolve(root, target === 'android' ? 'apps/tv' : 'apps/harness');
  const artifacts = resolve(root, spec.artifacts(target));
  await mkdir(artifacts, { recursive: true });
  const file = resolve(app, `.nsh/${spec.file(target)}.test.tsx`);
  // Single quotes around the entry, matching what the two hand-written copies emitted. JSON
  // stringify would use double quotes: valid TypeScript, but a different file for no reason.
  await writeFile(
    file,
    `import { ${spec.register} } from '@hongguo/app/testing/${spec.module}';\n${spec.register}('${spec.entry(target)}', ${JSON.stringify(artifacts)}, '${target}');\n`,
  );
  await run(executable('nsh'), ['test', file, '--target', target], {
    cwd: app,
    env: rustEnvironment(target === 'android' ? tvHostEnvironment() : process.env),
  });
}
