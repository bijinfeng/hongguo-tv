import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';

if (process.platform !== 'darwin')
  throw new Error('This acceptance requires the macOS native host.');
const artifacts = resolve(root, 'artifacts/client-updates/macos');
const entry = resolve(root, 'apps/desktop/.nsh/UpdatesHost.test.tsx');
await mkdir(artifacts, { recursive: true });
await mkdir(resolve(root, 'apps/desktop/.nsh'), { recursive: true });
await writeFile(
  entry,
  `import { open, test } from 'nsh/test';
const artifacts = ${JSON.stringify(artifacts)};
for (const colorScheme of ['light', 'dark'] as const) {
  test('native update presentation ' + colorScheme, async () => {
    const app = await open('../UpdatesStatePreview.tsx', {
      width: 1280, height: 800, colorScheme,
      host: { params: { presentation: true } },
    });
    await app.waitFor('发现新版本');
    await app.wait(250);
    await app.screenshot(artifacts + '/' + colorScheme + '-available.png');
    await app.hover('id:navigation-primary-update');
    await app.screenshot(artifacts + '/' + colorScheme + '-hover.png');
    await app.keyboard.press('enter');
    await app.waitFor('正在下载更新');
    await app.screenshot(artifacts + '/' + colorScheme + '-download.png');
    await app.waitFor('更新已准备好');
    await app.screenshot(artifacts + '/' + colorScheme + '-ready.png');
    await app.keyboard.press('enter');
    await app.waitFor('观看进度未能保存');
    await app.screenshot(artifacts + '/' + colorScheme + '-save-error.png');
  });
}
`,
);
await run(executable('nsh'), ['test', entry, '--target', 'macos', '--foreground'], {
  cwd: resolve(root, 'apps/desktop'),
  env: rustEnvironment(),
});
