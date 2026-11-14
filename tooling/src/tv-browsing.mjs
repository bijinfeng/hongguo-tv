import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { playerFixture } from './player-fixture.mjs';
import { output, root, run } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

const env = tvHostEnvironment();
const suite = process.argv[2] || 'browsing';
if (!['browsing', 'player'].includes(suite)) throw new Error('Expected browsing|player');
const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
const devices = output(adb, ['devices'])
  .split('\n')
  .slice(1)
  .filter((line) => line.trim());
if (devices.length !== 1 || !/^emulator-\d+\s+device$/.test(devices[0]))
  throw new Error('Start exactly one Android TV emulator.');
const serial = devices[0].split(/\s+/)[0];
const device = (args) => output(adb, ['-s', serial, ...args]);
const instrument = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', serial, ...args]);
    let report = '';
    child.stdout.on('data', (chunk) => {
      report += chunk;
    });
    child.stderr.on('data', (chunk) => {
      report += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(report) : reject(new Error(report))));
  });
if (
  !device(['shell', 'pm', 'list', 'features']).includes('android.software.leanback_only') ||
  device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34'
)
  throw new Error('Requires the pinned TV API 34 emulator.');
const artifacts = resolve(
  root,
  suite === 'player' ? 'artifacts/playback/tv-apk' : 'artifacts/browsing/tv',
);
await mkdir(artifacts, { recursive: true });
const runtime = resolve(root, 'apps/tv/runtime.generated.json');
const previous = await readFile(runtime);
let reversed = false;
const mode = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1];
const scale = device(['shell', 'settings', 'get', 'system', 'font_scale']);
if (!mode) throw new Error('Cannot read TV appearance');
const fixture = await (suite === 'player' ? playerFixture() : browsingFixture());
const port = new URL(fixture.origin).port;
console.log(`TV ${suite} fixture: ${fixture.origin}`);
const errors = [];
try {
  // This is an external-core preview; adb reverse is deliberately not independent-install evidence.
  await run('pnpm', ['package:tv'], {
    env: {
      ...process.env,
      HONGGUO_RUNTIME_MODE: 'http-preview',
      HONGGUO_CORE_ORIGIN: fixture.origin,
    },
  });
  console.log(`Packaged runtime: ${await readFile(runtime, 'utf8')}`);
  await run('./gradlew', ['--no-daemon', 'assembleDebugAndroidTest', 'lintDebug'], {
    cwd: resolve(root, 'apps/tv/android'),
    env,
  });
  await run(adb, ['-s', serial, 'install', '-r', resolve(root, 'apps/tv/.nsh/out/红果.apk')]);
  await run(adb, [
    '-s',
    serial,
    'install',
    '-r',
    resolve(
      root,
      'apps/tv/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
    ),
  ]);
  device(['reverse', `tcp:${port}`, `tcp:${port}`]);
  reversed = true;
  console.log(`ADB reverse: ${device(['reverse', '--list'])}`);
  for (const [appearance, night, fontScale] of [
    ['light', 'no', '1.0'],
    ['dark', 'yes', '1.0'],
    ['large-text', 'yes', '1.3'],
  ]) {
    device(['shell', 'cmd', 'uimode', 'night', night]);
    device(['shell', 'settings', 'put', 'system', 'font_scale', fontScale]);
    device(['shell', 'am', 'force-stop', 'dev.hongguo.tv']);
    const report = await instrument([
      'shell',
      'am',
      'instrument',
      '-w',
      '-e',
      'suite',
      suite,
      '-e',
      'appearance',
      appearance,
      'dev.hongguo.tv.test/dev.hongguo.tv.T0Acceptance',
    ]);
    await writeFile(resolve(artifacts, `${appearance}.txt`), report + '\n');
    console.log(report);
    if (
      !report.includes(
        suite === 'player'
          ? 'TV player acceptance: 24 checks passed'
          : 'TV browsing acceptance: 29 checks passed',
      ) ||
      report.includes('FAIL ')
    ) {
      await run(adb, [
        '-s',
        serial,
        'pull',
        `/sdcard/Android/data/dev.hongguo.tv/files/failure-${appearance}.png`,
        resolve(artifacts, `failure-${appearance}.png`),
      ]);
      throw new Error(`${appearance} business acceptance failed`);
    }
    for (const screen of suite === 'player'
      ? ['paused', 'preview', 'settings']
      : [
          'home',
          'search',
          'detail',
          'pagination-error',
          'pagination-append',
          'pagination-return',
          'pagination-terminal',
          'history',
        ])
      await run(adb, [
        '-s',
        serial,
        'pull',
        `/sdcard/Android/data/dev.hongguo.tv/files/${screen}-${appearance}.png`,
        resolve(artifacts, `${screen}-${appearance}.png`),
      ]);
  }
  if (suite === 'browsing' && fixture.requests.some((request) => request.method === 'POST'))
    throw new Error('Browsing submitted progress');
  if (
    suite === 'player' &&
    (!fixture.writes.some((write) => write.position > 0) ||
      fixture.requests.filter((request) => request.url === '/api/v1/play/release').length < 2)
  )
    throw new Error('Player did not checkpoint actual viewing and release both episodes');
} catch (error) {
  errors.push(error);
} finally {
  for (const restore of [
    () => {
      if (reversed) device(['reverse', '--remove', `tcp:${port}`]);
    },
    () => device(['shell', 'cmd', 'uimode', 'night', mode]),
    () =>
      device([
        'shell',
        'settings',
        'put',
        'system',
        'font_scale',
        scale === 'null' ? '1.0' : scale,
      ]),
    () => writeFile(runtime, previous),
    () => writeFile(resolve(artifacts, 'requests.json'), JSON.stringify(fixture.requests, null, 2)),
    () =>
      suite === 'player'
        ? writeFile(resolve(artifacts, 'writes.json'), JSON.stringify(fixture.writes, null, 2))
        : undefined,
    () => fixture.close(),
  ]) {
    try {
      await restore();
    } catch (error) {
      errors.push(error);
    }
  }
}
if (errors.length === 1) throw errors[0];
if (errors.length) throw new AggregateError(errors, 'TV acceptance and cleanup failed');
