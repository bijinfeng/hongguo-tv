import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

const target = process.argv[2];
if (!['web', 'macos', 'android'].includes(target)) throw new Error('Expected web|macos|android');
const app = resolve(root, target === 'android' ? 'apps/tv' : 'apps/web');
const artifacts = resolve(root, `artifacts/playback/controls-${target}`);
await mkdir(artifacts, { recursive: true });
const file = resolve(app, `.nsh/PlayerControlsHost-${target}.test.tsx`);
await writeFile(
  file,
  `import { registerPlayerControlsHost } from '@hongguo/app/testing/player-controls-host';\nregisterPlayerControlsHost('../PlayerPreview.tsx', ${JSON.stringify(artifacts)}, '${target}');\n`,
);
await run(executable('nsh'), ['test', file, '--target', target], {
  cwd: app,
  env: rustEnvironment(target === 'android' ? tvHostEnvironment() : process.env),
});
