import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  legacyUiDir,
  buildCore,
  nshPath,
  nshVersion,
  root,
  run,
  runtimeConfig,
} from './toolchain.mjs';

try {
  if (process.argv.slice(2).some((arg) => arg !== '--check'))
    throw new Error('Usage: node scripts/setup.mjs [--check]');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22+ is required.');
  console.log(`Node ${process.versions.node}`);
  const nsh = nshPath();
  console.log(`NSH ${nshVersion}: ${nsh}`);
  const go = spawnSync('go', ['version'], { encoding: 'utf8' });
  const actual = go.stdout?.match(/go(\d+)\.(\d+)/);
  const goMod = await readFile(resolve(root, 'upstream/hongguo/go.mod'), 'utf8');
  const required = goMod.match(/^go (\d+)\.(\d+)/m);
  if (!required) throw new Error('Missing Go version in upstream/hongguo/go.mod.');
  if (
    go.status !== 0 ||
    !actual ||
    Number(actual[1]) < Number(required[1]) ||
    (actual[1] === required[1] && Number(actual[2]) < Number(required[2]))
  ) {
    throw new Error(
      `Go ${required[1]}.${required[2]}+ is required; install Go and add it to PATH.`,
    );
  }
  console.log(go.stdout.trim());
  if (!process.argv.includes('--check')) {
    await run(process.execPath, [resolve(root, 'scripts/sync-upstream.mjs')]);
    await runtimeConfig();
    await run(nsh, ['check'], { cwd: legacyUiDir });
    await buildCore();
    console.log('Setup complete. Run npm run dev:web or npm run dev.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
