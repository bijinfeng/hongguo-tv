import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, output, root, run, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

const env = tvHostEnvironment();
const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
const devices = output(adb, ['devices'])
  .split('\n')
  .slice(1)
  .filter((line) => line.trim());
if (devices.length !== 1 || !/^emulator-\d+\s+device$/.test(devices[0]))
  throw new Error('Start exactly one Android TV emulator.');
const serial = devices[0].split(/\s+/)[0];
const device = (args) => output(adb, ['-s', serial, ...args]);
const previous = device(['shell', 'settings', 'get', 'system', 'font_scale']);
const app = resolve(root, 'apps/tv');
const artifacts = resolve(root, 'artifacts/playback/native-startup-android');
await mkdir(artifacts, { recursive: true });
const errors = [];
try {
  for (const scale of ['1.0', '1.3']) {
    device(['shell', 'settings', 'put', 'system', 'font_scale', scale]);
    const file = resolve(app, '.nsh/NativeStartupHost.test.tsx');
    await writeFile(
      file,
      `import { expect, open, test } from 'nsh/test';
test('native startup notice and retry on Android (font ${scale})', async () => {
  const loading = await open('../NativeStartupPreview.tsx', { host: { params: { scenario: 'late', target: 'tv', presentation: true } }, colorScheme: 'light', network: {} });
  await loading.waitFor('正在打开…');
  await loading.screenshot(${JSON.stringify(`${artifacts}/loading-light-${scale}.png`)});
  await loading.setColorScheme('dark');
  await loading.screenshot(${JSON.stringify(`${artifacts}/loading-dark-${scale}.png`)});
  loading.dispose();
  const app = await open('../NativeStartupPreview.tsx', { host: { params: { scenario: 'failure', target: 'tv', presentation: true } }, colorScheme: 'light', network: {} });
  await app.waitFor('观看记录暂时无法读取，请重试');
  await app.screenshot(${JSON.stringify(`${artifacts}/failure-light-${scale}.png`)});
  await app.setColorScheme('dark');
  await app.screenshot(${JSON.stringify(`${artifacts}/failure-dark-${scale}.png`)});
  await app.press('重试');
  await app.waitFor('id:app-tv');
  expect(app.requests().some((r) => r.url.includes('/api/v1'))).toBe(false);
  await app.screenshot(${JSON.stringify(`${artifacts}/ready-dark-${scale}.png`)});
  app.dispose();
});\n`,
    );
    await run(executable('nsh'), ['test', file, '--target', 'android'], {
      cwd: app,
      env: rustEnvironment({ ...env, CARGO_PROFILE_DEV_STRIP: 'debuginfo' }),
    });
  }
} catch (error) {
  errors.push(error);
}
try {
  device(['shell', 'settings', 'put', 'system', 'font_scale', previous]);
} catch (error) {
  errors.push(error);
}
if (errors.length) throw new AggregateError(errors, 'Native startup host acceptance failed');
