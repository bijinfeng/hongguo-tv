import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nsh, output, root, run } from './process.mjs';
import { packageTvHost, tvEmulator, tvHostEnvironment } from './tv-host.mjs';
import { acceptanceCommand } from './acceptance-command.mjs';

const env = tvHostEnvironment();
const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
const { device } = tvEmulator({
  adb,
  message: 'Requires the pinned hongguo-tv-api34-arm64 test AVD.',
  avd: 'hongguo-tv-api34-arm64',
});
if (device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34')
  throw new Error('Requires API 34.');
const artifacts = resolve(root, 'artifacts/ui-components/native-tv');
await mkdir(artifacts, { recursive: true });
const runtimePath = resolve(root, 'apps/tv/runtime.generated.json');
const previousRuntime = await readFile(runtimePath);
const original = JSON.parse(previousRuntime);
const night = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1];
const scale = device(['shell', 'settings', 'get', 'system', 'font_scale']);
const animationKeys = [
  'animator_duration_scale',
  'transition_animation_scale',
  'window_animation_scale',
];
const animation = animationKeys.map((key) => device(['shell', 'settings', 'get', 'global', key]));
if (!['yes', 'no', 'auto'].includes(night)) throw new Error('Cannot read original appearance.');
const controller = new AbortController();
const onSignal = () => controller.abort(new Error('Native component acceptance interrupted'));
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
const command = (executable, args, options = {}) =>
  acceptanceCommand(
    executable,
    args,
    { cwd: root, env, onOutput: (chunk) => process.stdout.write(chunk), ...options },
    controller.signal,
  );
const results = [];
const cleanupErrors = [];
async function restore(action) {
  try {
    await action();
  } catch (error) {
    cleanupErrors.push(error.message);
    failure ??= error;
  }
}
let failure;
let touched = false;
try {
  await nsh('check', 'tv');
  touched = true;
  await nsh('build', 'tv', ['BaseComponentsPreview.tsx']);
  await nsh('package', 'tv', [
    'BaseComponentsPreview.tsx',
    '--target',
    'android',
    '--abi',
    'arm64-v8a',
  ]);
  await packageTvHost();
  const apk = resolve(root, 'apps/tv/.nsh/out/红果.apk');
  await writeFile(
    resolve(artifacts, 'gallery-package.json'),
    JSON.stringify(
      {
        sourceHead: output('git', ['rev-parse', 'HEAD']),
        dirty: !!output('git', ['status', '--porcelain']),
        entry: 'apps/tv/BaseComponentsPreview.tsx',
        host: 'apps/tv/android',
        apkSha256: createHash('sha256')
          .update(await readFile(apk))
          .digest('hex'),
        scope:
          'production shared controls and TV host; synthetic component state; no real business acceptance',
      },
      null,
      2,
    ) + '\n',
  );
  await command('./gradlew', ['--no-daemon', 'assembleDebugAndroidTest', 'lintDebug'], {
    cwd: resolve(root, 'apps/tv/android'),
  });
  touched = true;
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
  for (const profile of [
    { name: 'light', night: 'no', scale: '1.0' },
    { name: 'dark', night: 'yes', scale: '1.0' },
    { name: 'light-large', night: 'no', scale: '1.3' },
    { name: 'dark-large', night: 'yes', scale: '1.3' },
    { name: 'light-extra-large', night: 'no', scale: '2.0' },
    { name: 'dark-extra-large-reduced', night: 'yes', scale: '2.0', reduced: true },
  ]) {
    controller.signal.throwIfAborted();
    device(['shell', 'cmd', 'uimode', 'night', profile.night]);
    device(['shell', 'settings', 'put', 'system', 'font_scale', profile.scale]);
    for (const key of animationKeys)
      device(['shell', 'settings', 'put', 'global', key, profile.reduced ? '0' : '1']);
    device(['shell', 'am', 'force-stop', 'dev.hongguo.tv']);
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
        'components',
        '-e',
        'appearance',
        profile.name,
        '-e',
        'reduced',
        String(!!profile.reduced),
        'dev.hongguo.tv.test/dev.hongguo.tv.T0Acceptance',
      ],
      { timeoutMs: 120000 },
    );
    await writeFile(resolve(artifacts, `${profile.name}.log`), report + '\n');
    const passed =
      new RegExp(`TV component acceptance: ${profile.reduced ? 24 : 23} checks passed`).test(
        report,
      ) && !report.includes('FAIL ');
    results.push({ ...profile, passed });
    const external = '/sdcard/Android/data/dev.hongguo.tv/files';
    for (const file of device(['shell', 'ls', external])
      .split(/\s+/)
      .filter(
        (name) => name.startsWith(`components-${profile.name}-`) && /\.(png|txt)$/.test(name),
      ))
      await command(adb, ['-s', serial, 'pull', `${external}/${file}`, resolve(artifacts, file)]);
    if (!passed) throw new Error(`${profile.name} native component acceptance failed`);
  }
} catch (error) {
  failure = error;
} finally {
  await restore(() => device(['shell', 'cmd', 'uimode', 'night', night]));
  await restore(() => device(['shell', 'settings', 'put', 'system', 'font_scale', scale]));
  for (const [index, key] of animationKeys.entries())
    await restore(() =>
      device([
        'shell',
        'settings',
        animation[index] === 'null' ? 'delete' : 'put',
        'global',
        key,
        ...(animation[index] === 'null' ? [] : [animation[index]]),
      ]),
    );
  await restore(() => writeFile(runtimePath, previousRuntime));
  if (touched) {
    await restore(async () => {
      await run('pnpm', ['package:tv'], {
        env: {
          ...process.env,
          HONGGUO_RUNTIME_MODE: original.mode,
          HONGGUO_CORE_ORIGIN: original.coreOrigin ?? '',
        },
      });
      await run(adb, ['-s', serial, 'install', '-r', resolve(root, 'apps/tv/.nsh/out/红果.apk')]);
    });
    await restore(() => writeFile(runtimePath, previousRuntime));
  }
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  await writeFile(
    resolve(artifacts, 'summary.json'),
    JSON.stringify(
      {
        passed: !failure,
        results,
        failure: failure?.message,
        cleanupErrors,
        fixture: 'shared production component gallery; synthetic state only',
      },
      null,
      2,
    ) + '\n',
  );
}
if (failure) throw failure;
