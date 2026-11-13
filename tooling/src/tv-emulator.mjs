import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nsh, output, root, run } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

const env = tvHostEnvironment();
const adb = resolve(
  env.ANDROID_HOME,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const devices = output(adb, ['devices'])
  .split('\n')
  .slice(1)
  .filter((line) => line.trim());
if (devices.length !== 1 || !/^emulator-\d+\s+device$/.test(devices[0]))
  throw new Error('Start exactly one Android TV emulator; disconnect other adb targets.');
const serial = devices[0].split(/\s+/)[0];
const device = (args) => output(adb, ['-s', serial, ...args]);
if (
  !device(['shell', 'pm', 'list', 'features']).includes('android.software.leanback_only') ||
  device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34' ||
  device(['shell', 'getprop', 'ro.product.cpu.abi']) !== 'arm64-v8a'
)
  throw new Error('This gate requires the pinned Android TV API 34 arm64 emulator.');

const artifacts = resolve(root, 'artifacts/tv-emulator');
await mkdir(artifacts, { recursive: true });
await nsh('test', 'tv', [
  '--filter',
  'TV T0',
  '--junit',
  resolve(artifacts, 'bridge-headless.xml'),
]);
if (device(['reverse', '--list']))
  throw new Error('Remove development adb reverse rules before independent APK acceptance.');
const host = resolve(root, 'apps/tv/android');
await run(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['--no-daemon', 'assembleDebugAndroidTest', 'lintDebug'],
  { cwd: host, env },
);
const metadata = JSON.parse(await readFile(resolve(root, 'apps/tv/nsh.json'), 'utf8'));
const apk = resolve(root, `apps/tv/.nsh/out/${metadata.name}.apk`);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = hash(await readFile(apk));
if (digest !== hash(await readFile(resolve(host, 'app/build/outputs/apk/debug/app-debug.apk'))))
  throw new Error('The final APK differs from this host build. Run pnpm package:tv first.');
await run(adb, ['-s', serial, 'install', '-r', apk]);
await run(adb, [
  '-s',
  serial,
  'install',
  '-r',
  resolve(host, 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'),
]);
const launcher = device([
  'shell',
  'cmd',
  'package',
  'query-activities',
  '--brief',
  '-a',
  'android.intent.action.MAIN',
  '-c',
  'android.intent.category.LEANBACK_LAUNCHER',
  metadata.id,
]);
if (!launcher.includes(`${metadata.id}/.MainActivity`))
  throw new Error('Missing TV launcher activity');
const originalMode = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1];
if (!originalMode) throw new Error('Cannot determine emulator night mode');
try {
  for (const [appearance, mode] of [
    ['light', 'no'],
    ['dark', 'yes'],
  ]) {
    device(['shell', 'cmd', 'uimode', 'night', mode]);
    device(['shell', 'am', 'force-stop', metadata.id]);
    const report = device([
      'shell',
      'am',
      'instrument',
      '-w',
      '-e',
      'appearance',
      appearance,
      `${metadata.id}.test/dev.hongguo.tv.T0Acceptance`,
    ]);
    await writeFile(resolve(artifacts, `${appearance}-acceptance.txt`), report + '\n');
    console.log(report);
    if (!report.includes('TV T0 emulator acceptance: 13 checks passed') || report.includes('FAIL '))
      throw new Error(`${appearance} APK acceptance failed`);
    await run(adb, [
      '-s',
      serial,
      'pull',
      `/sdcard/Android/data/${metadata.id}/files/t0-${appearance}.png`,
      resolve(artifacts, `t0-${appearance}.png`),
    ]);
  }
} finally {
  device(['shell', 'cmd', 'uimode', 'night', originalMode]);
}
await writeFile(
  resolve(artifacts, 'apk.json'),
  JSON.stringify(
    {
      source: output('git', ['rev-parse', 'HEAD']),
      dirty: !!output('git', ['status', '--porcelain']),
      apk,
      sha256: digest,
      serial,
      api: 34,
      abi: 'arm64-v8a',
      reverseRules: device(['reverse', '--list']),
      result: 'light 13/13; dark 13/13; bridge headless 1/1',
    },
    null,
    2,
  ) + '\n',
);
console.log(`TV emulator acceptance passed. APK SHA256 ${digest}`);
