import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { output, root } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';
import { acceptanceCommand } from './acceptance-command.mjs';

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
if (
  !device(['shell', 'pm', 'list', 'features']).includes('android.software.leanback_only') ||
  device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34'
)
  throw new Error('Requires the pinned TV API 34 emulator.');
const artifacts = resolve(root, 'artifacts/playback/native-business-tv');
await mkdir(artifacts, { recursive: true });
const runtime = resolve(root, 'apps/tv/runtime.generated.json');
const previous = await readFile(runtime);
const mode = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1];
const scale = device(['shell', 'settings', 'get', 'system', 'font_scale']);
if (!mode) throw new Error('Cannot read TV appearance');
const appId = 'dev.hongguo.tv';
const external = `/sdcard/Android/data/${appId}/files`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const errors = [];
const controller = new AbortController();
let appTouched = false;
let appearanceTouched = false;
let runtimeTouched = false;
const onSignal = () => controller.abort(new Error('Native acceptance interrupted'));
const command = (exe, args, options = {}) =>
  acceptanceCommand(
    exe,
    args,
    { cwd: root, env: process.env, onOutput: (chunk) => process.stdout.write(chunk), ...options },
    controller.signal,
  );
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

async function independent() {
  if (device(['reverse', '--list']))
    throw new Error(
      'Native acceptance requires an empty adb reverse list; preserve existing rules.',
    );
  await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: 18997 });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error('Stop the computer API on port 18997.'));
    });
    socket.once('error', (error) => (error.code === 'ECONNREFUSED' ? resolve() : reject(error)));
    socket.setTimeout(1500, () => {
      socket.destroy();
      reject(new Error('Cannot verify that computer API is stopped.'));
    });
  });
}
async function instrument(phase, appearance) {
  await independent();
  const screens =
    phase === 'watch'
      ? [
          'search',
          'detail',
          'paused',
          'next',
          'return',
          'history',
          'failure',
          'playback-error-1',
          'playback-error-2',
        ]
      : ['home', 'detail', 'paused', 'failure', 'playback-error-1', 'playback-error-2'];
  const expected = screens.flatMap((screen) =>
    ['png', 'json'].map((ext) => `native-${phase}-${screen}-${appearance}.${ext}`),
  );
  const old = device(['shell', 'ls', external])
    .split(/\s+/)
    .filter((file) => expected.includes(file));
  for (const file of old) device(['shell', 'rm', `${external}/${file}`]);
  const report = await command(
    adb,
    [
      '-s',
      serial,
      'shell',
      'am',
      'instrument',
      '-w',
      '-e',
      'suite',
      'native-business',
      '-e',
      'phase',
      phase,
      '-e',
      'appearance',
      appearance,
      `${appId}.test/${appId}.T0Acceptance`,
    ],
    { timeoutMs: 180000 },
  );
  await writeFile(resolve(artifacts, `${phase}-${appearance}.log`), report + '\n');
  const files = device(['shell', 'ls', external])
    .split(/\s+/)
    .filter((file) => expected.includes(file));
  for (const file of files)
    await command(adb, ['-s', serial, 'pull', `${external}/${file}`, resolve(artifacts, file)]);
  const count = phase === 'watch' ? 18 : 7;
  if (
    !report.includes(`TV native business ${phase}: ${count} checks passed`) ||
    report.includes('FAIL ')
  )
    throw new Error(`${appearance} native ${phase} acceptance failed`);
}
async function durable(appearance, phase) {
  // The target process is stopped before copying every SQLite/WAL/SHM file as one snapshot.
  if (device(['shell', 'ps', '-A', '-o', 'NAME']).split(/\s+/).includes(appId))
    throw new Error('Native process still running before snapshot');
  const state = JSON.parse(device(['shell', 'cat', `${external}/native-state-${appearance}.json`]));
  if (state.episode !== 2 || !Number.isInteger(state.position) || state.position < 20)
    throw new Error('Native viewing state is invalid');
  const directory = await mkdtemp(resolve(artifacts, `sqlite-${appearance}-${phase}-`));
  const privateDir = `files/nsh/${appId}`;
  const files = device(['shell', 'run-as', appId, 'ls', privateDir]).split(/\s+/);
  if (!files.includes('guest.sqlite3')) throw new Error('Native database is missing');
  for (const name of ['guest.sqlite3', 'guest.sqlite3-wal', 'guest.sqlite3-shm']) {
    if (!files.includes(name)) continue;
    const result = spawnSync(
      adb,
      ['-s', serial, 'exec-out', 'run-as', appId, 'cat', `${privateDir}/${name}`],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    if (result.error || result.status !== 0) throw new Error(`Cannot copy native ${name}`);
    await writeFile(resolve(directory, name), result.stdout);
  }
  const db = new DatabaseSync(resolve(directory, 'guest.sqlite3'), { readOnly: true });
  let entries;
  try {
    entries = db
      .prepare('SELECT entry_json FROM history ORDER BY last_played_at DESC')
      .all()
      .map((row) => JSON.parse(row.entry_json));
  } finally {
    db.close();
  }
  const saved = entries.find((entry) => entry.drama.title === state.title && entry.episode === 2);
  if (
    !saved ||
    saved.completed ||
    saved.position < state.position ||
    (phase === 'watch' && saved.position >= state.position + 2)
  )
    throw new Error('SQLite does not retain the observed second-episode checkpoint');
  await writeFile(
    resolve(artifacts, `checkpoint-${appearance}-${phase}.json`),
    JSON.stringify({ observed: state, stored: saved }, null, 2) + '\n',
  );
  console.log(
    `PASS native SQLite ${appearance}/${phase}: episode ${saved.episode}, position ${saved.position}`,
  );
}

try {
  await independent();
  runtimeTouched = true;
  await command('pnpm', ['package:tv'], {
    env: { ...process.env, HONGGUO_RUNTIME_MODE: 'native', HONGGUO_CORE_ORIGIN: '' },
  });
  if (JSON.parse(await readFile(runtime, 'utf8')).mode !== 'native')
    throw new Error('Expected native runtime');
  await command('./gradlew', ['--no-daemon', 'assembleDebugAndroidTest', 'lintDebug'], {
    cwd: resolve(root, 'apps/tv/android'),
    env,
  });
  const apk = resolve(root, 'apps/tv/.nsh/out/红果.apk');
  appTouched = true;
  await command(adb, ['-s', serial, 'install', '-r', apk]);
  await command(adb, [
    '-s',
    serial,
    'install',
    '-r',
    resolve(
      root,
      'apps/tv/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
    ),
  ]);
  const installed = device(['shell', 'pm', 'path', appId]).replace(/^package:/, '');
  const digest = hash(await readFile(apk));
  if (device(['shell', 'sha256sum', installed]).split(/\s+/)[0] !== digest)
    throw new Error('Installed APK does not match current native package');
  const bundle = resolve(root, 'apps/tv/.nsh/out/bundle.nshc');
  const packed = spawnSync('unzip', ['-p', apk, 'assets/nsh/bundle.nshc'], {
    maxBuffer: 16 * 1024 * 1024,
  });
  if (packed.error || packed.status !== 0 || hash(packed.stdout) !== hash(await readFile(bundle)))
    throw new Error('Native APK bytecode is stale');
  await writeFile(
    resolve(artifacts, 'installed-native.json'),
    JSON.stringify(
      {
        serial,
        api: 34,
        apkSha256: digest,
        bundleSha256: hash(packed.stdout),
        runtime: 'native',
        computerApi: 'stopped',
        reverse: device(['reverse', '--list']),
      },
      null,
      2,
    ) + '\n',
  );
  for (const [appearance, night, fontScale] of [
    ['light', 'no', '1.0'],
    ['dark', 'yes', '1.0'],
    ['large-text', 'yes', '1.3'],
  ]) {
    controller.signal.throwIfAborted();
    appearanceTouched = true;
    device(['shell', 'cmd', 'uimode', 'night', night]);
    device(['shell', 'settings', 'put', 'system', 'font_scale', fontScale]);
    device(['shell', 'am', 'force-stop', appId]);
    await instrument('watch', appearance);
    device(['shell', 'am', 'force-stop', appId]);
    await durable(appearance, 'watch');
    await instrument('resume', appearance);
    device(['shell', 'am', 'force-stop', appId]);
    await durable(appearance, 'resume');
  }
  await independent();
} catch (error) {
  errors.push(error);
} finally {
  for (const restore of [
    () => (appTouched ? device(['shell', 'am', 'force-stop', appId]) : undefined),
    () => (appearanceTouched ? device(['shell', 'cmd', 'uimode', 'night', mode]) : undefined),
    () =>
      appearanceTouched
        ? device(
            scale === 'null'
              ? ['shell', 'settings', 'delete', 'system', 'font_scale']
              : ['shell', 'settings', 'put', 'system', 'font_scale', scale],
          )
        : undefined,
    () => (runtimeTouched ? writeFile(runtime, previous) : undefined),
  ]) {
    try {
      await restore();
    } catch (error) {
      errors.push(error);
    }
  }
}
process.off('SIGINT', onSignal);
process.off('SIGTERM', onSignal);
if (controller.signal.aborted && !errors.length) errors.push(controller.signal.reason);
if (errors.length === 1) throw errors[0];
if (errors.length) throw new AggregateError(errors, 'Native acceptance and cleanup failed');
