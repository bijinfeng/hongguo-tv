import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { executable, root, run, runtimeConfig, rustEnvironment } from './process.mjs';

const target = process.argv[2];
if (!['web', 'macos', 'android'].includes(target))
  throw new Error('Expected web|macos|android; the settings screen needs a graphical host.');
const fixture = await browsingFixture();
const runtime = resolve(root, 'apps/harness/runtime.generated.json');
const previous = await readFile(runtime);
const artifacts = resolve(root, 'artifacts/design/settings', target);
const appDir =
  target === 'macos' ? 'apps/desktop' : target === 'android' ? 'apps/tv' : 'apps/harness';
const file = resolve(root, appDir, '.nsh/SettingsHost.test.tsx');
/** The device owns its own size on Android; the desktop hosts take an explicit window. */
const size = target === 'android' ? '' : `width: 1440, height: 1000, `;
try {
  await mkdir(artifacts, { recursive: true });
  if (target === 'web') await runtimeConfig('harness', fixture.origin);
  await writeFile(
    file,
    `import { open, test } from 'nsh/test';
const artifacts = ${JSON.stringify(artifacts)};
for (const scheme of ['light', 'dark']) {
  test('settings ' + scheme, async () => {
    const app = await open('../App.tsx', {
      ${size}colorScheme: scheme,
      reducedMotion: false, network: 'live',
    });
    await app.waitFor('id:nav-settings');
    await app.press('id:nav-settings');
    await app.waitFor('id:settings-page');
    await app.wait(400);
    await app.screenshot(artifacts + '/settings-' + scheme + '.png');
  });
}
`,
  );
  await run(
    executable('nsh'),
    ['test', file, '--target', target, ...(target === 'macos' ? ['--foreground'] : [])],
    { cwd: resolve(root, appDir), env: rustEnvironment() },
  );
} finally {
  await writeFile(runtime, previous);
  await fixture.close();
}
