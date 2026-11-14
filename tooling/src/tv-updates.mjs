import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { output, root, run } from './process.mjs';
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
const artifacts = resolve(root, 'artifacts/client-updates/tv');
await mkdir(artifacts, { recursive: true });
await run('pnpm', ['package:tv'], { env: { ...process.env, HONGGUO_RUNTIME_MODE: 'native' } });
await run('./gradlew', [':app:assembleDebugAndroidTest', ':app:lintDebug'], {
  cwd: resolve(root, 'apps/tv/android'),
  env,
});
device(['install', '-r', resolve(root, 'apps/tv/.nsh/out/红果.apk')]);
device([
  'install',
  '-r',
  resolve(
    root,
    'apps/tv/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
  ),
]);
const previous = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\w+)/)?.[1];
if (!previous) throw new Error('Cannot read emulator appearance.');
const previousFont = device(['shell', 'settings', 'get', 'system', 'font_scale']);
if (!/^(\d+(\.\d+)?|null)$/.test(previousFont)) throw new Error('Cannot read emulator font scale.');
try {
  for (const appearance of ['light', 'dark', 'large']) {
    device(['shell', 'cmd', 'uimode', 'night', appearance === 'light' ? 'no' : 'yes']);
    device([
      'shell',
      'settings',
      'put',
      'system',
      'font_scale',
      appearance === 'large' ? '1.3' : '1.0',
    ]);
    const report = await new Promise((resolveReport, reject) => {
      const child = spawn(adb, [
        '-s',
        serial,
        'shell',
        'am',
        'instrument',
        '-w',
        '-e',
        'suite',
        'updates',
        '-e',
        'appearance',
        appearance,
        'dev.hongguo.tv.test/dev.hongguo.tv.T0Acceptance',
      ]);
      let result = '';
      child.stdout.on('data', (chunk) => {
        result += chunk;
      });
      child.stderr.on('data', (chunk) => {
        result += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolveReport(result) : reject(new Error(result)),
      );
    });
    await writeFile(resolve(artifacts, `${appearance}.log`), report);
    if (!report.includes('PASS update acceptance') || /FAIL|INSTRUMENTATION_FAILED/.test(report))
      throw new Error(report);
    device([
      'pull',
      `/sdcard/Android/data/dev.hongguo.tv/files/updates/${appearance}.png`,
      resolve(artifacts, `${appearance}.png`),
    ]);
    console.log(report.trim());
  }
} finally {
  device(['shell', 'cmd', 'uimode', 'night', previous]);
  device(
    previousFont === 'null'
      ? ['shell', 'settings', 'delete', 'system', 'font_scale']
      : ['shell', 'settings', 'put', 'system', 'font_scale', previousFont],
  );
}
