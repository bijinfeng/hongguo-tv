import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calendarFixture } from './calendar-fixture.mjs';
import { executable, output, root, run, rustEnvironment } from './process.mjs';
import { tvEmulator, tvHostEnvironment } from './tv-host.mjs';

// Pure TSX on the installed NSH development host. No production APK replacement or Rust build.
const suite = process.argv[2] || 'all';
if (!['all', 'live', 'focus'].includes(suite))
  throw new Error('Expected calendar-tv-host.mjs [all|live|focus]');
const env = rustEnvironment(tvHostEnvironment());
const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
const { serial } = tvEmulator({
  adb,
  env,
  message: 'Requires exactly one ready Android TV emulator.',
});
env.ANDROID_SERIAL = serial;
const device = (args) => output(adb, ['-s', serial, ...args], { env });
const deviceRun = (args) => run(adb, ['-s', serial, ...args], { env });
const hostPackage = 'com.longbridge.nsh.host';
const productPackage = 'dev.hongguo.tv';
if (
  device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34' ||
  !device(['shell', 'pm', 'list', 'features']).includes('android.software.leanback_only')
)
  throw new Error('Requires the pinned Android TV API34 emulator.');
if (!device(['shell', 'pm', 'path', hostPackage]).startsWith('package:'))
  throw new Error(
    'Install the pinned NSH development host before this suite; this runner does not cold-build Android runtimes.',
  );
const apkDigests = (pkg) =>
  device(['shell', 'pm', 'path', pkg])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const path = line.slice('package:'.length);
      if (!/^\/[A-Za-z0-9/_+~=.-]+\.apk$/.test(path)) throw new Error('Unexpected APK path');
      const sha256 = device(['shell', 'sha256sum', path]).split(/\s+/)[0];
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Cannot read installed APK digest');
      return { path, sha256 };
    });
const resumed = () =>
  device(['shell', 'dumpsys', 'activity', 'activities']).match(
    /(?:topResumedActivity|mResumedActivity)=.*?\bu0\s+([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/,
  )?.[1];
const initial = {
  font: device(['shell', 'settings', 'get', 'system', 'font_scale']),
  night: device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1],
  reverse: device(['reverse', '--list']),
  foreground: resumed(),
  hostStopped: /User 0:.*\bstopped=true\b/.test(
    device(['shell', 'dumpsys', 'package', hostPackage]),
  ),
  production: apkDigests(productPackage),
  host: apkDigests(hostPackage),
};
if (!['yes', 'no', 'auto', 'custom'].includes(initial.night) || !initial.foreground)
  throw new Error('Cannot capture restorable device appearance/foreground');
const viewport = {
  physical: device(['shell', 'wm', 'size']),
  density: device(['shell', 'wm', 'density']),
  abi: device(['shell', 'getprop', 'ro.product.cpu.abi']),
  api: '34',
};
const artifacts = resolve(
  root,
  `artifacts/calendar-ui/android-dev-host${suite === 'all' ? '' : `-${suite}`}`,
);
const project = resolve(root, 'apps/tv/.nsh/calendar-tv-host');
await mkdir(project, { recursive: true });
await mkdir(artifacts, { recursive: true });
await writeFile(
  resolve(project, 'nsh.json'),
  JSON.stringify(
    {
      name: 'Calendar TSX Host Acceptance',
      id: 'dev.hongguo.calendarhost',
      version: '0.0.0',
      build: 1,
      theme: '../../../../packages/ui/theme.json',
      appearance: 'system',
      capabilities: { network: { hosts: ['127.0.0.1'] } },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(project, 'hongguo-logo.png'),
  await readFile(resolve(root, 'apps/tv/assets/hongguo-logo.png')),
);
const fixture = await calendarFixture();
const port = new URL(fixture.origin).port;
const errors = [];
const cleanup = [];
const runs = [];
let reversed = false;
let restored;
try {
  if (initial.reverse.split('\n').some((line) => line.split(/\s+/).includes(`tcp:${port}`)))
    throw new Error('Fixture reverse port already belongs to another mapping');
  await deviceRun(['reverse', `tcp:${port}`, `tcp:${port}`]);
  reversed = true;
  await writeFile(
    resolve(project, 'App.tsx'),
    `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from './hongguo-logo.png';
configureClient('${fixture.origin}');
mount(() => <App target="tv" logoMark={logoMark} />);
`,
  );
  const profiles = [
    { name: 'light', theme: 'light', night: 'no', font: '1.0' },
    { name: 'dark', theme: 'dark', night: 'yes', font: '1.0' },
    { name: 'large-text', theme: 'dark', night: 'yes', font: '1.3' },
  ];
  for (const profile of suite === 'focus' ? profiles.slice(0, 1) : profiles) {
    await deviceRun(['shell', 'cmd', 'uimode', 'night', profile.night]);
    await deviceRun(['shell', 'settings', 'put', 'system', 'font_scale', profile.font]);
    const actualFont = device(['shell', 'settings', 'get', 'system', 'font_scale']);
    if (Number(actualFont) !== Number(profile.font))
      throw new Error('Android font scale did not apply');
    const directory = resolve(artifacts, profile.name);
    await mkdir(directory, { recursive: true });
    const testFile = `${profile.name}.test.tsx`;
    await writeFile(
      resolve(project, testFile),
      `import {registerCalendarHostTests} from '@hongguo/app/testing/calendar-host';
import {test,open,expect} from 'nsh/test';
registerCalendarHostTests('./App.tsx', ${JSON.stringify(directory)}, 'android', 'tv');
test('calendar live ${profile.name}: loopback covers and read-only announcements', async()=>{
 const app=await open('./App.tsx',{network:'live',colorScheme:'${profile.theme}'});
 await app.press('id:home-calendar'); await app.waitFor('id:calendar-upcoming-301'); await app.wait(400);
 await app.screenshot(${JSON.stringify(resolve(directory, 'images-calendar.png'))});
 await app.press('id:calendar-date-20261114'); await app.keyboard.press('right'); await app.wait(200);
 await app.screenshot(${JSON.stringify(resolve(directory, 'images-date-focus.png'))});
 await app.press('id:calendar-upcoming-301'); await app.waitFor('预约提醒暂未开放'); await app.wait(400);
 await app.screenshot(${JSON.stringify(resolve(directory, 'images-announcement.png'))});
 await app.press('id:calendar-announcement-close'); await app.press('id:calendar-mode-new'); await app.waitFor('id:calendar-released-201'); await app.wait(400);
 await app.screenshot(${JSON.stringify(resolve(directory, 'images-new-series.png'))});
 expect(app.requests().every(request=>request.method==='GET')).toBe(true); app.dispose();
});
test('calendar focus ${profile.name}: source keyboard activation evidence', async()=>{
 const app=await open('./App.tsx',{network:'live',colorScheme:'${profile.theme}'});
 await app.press('id:home-calendar'); await app.waitFor('id:calendar-upcoming-301');
 await app.press('id:calendar-upcoming-301'); await app.waitFor('预约提醒暂未开放');
 await app.press('id:calendar-announcement-close'); await app.wait(250);
 await app.screenshot(${JSON.stringify(resolve(directory, 'focus-after-close.png'))});
 console.log('calendar-focus-after-close', JSON.stringify(app.texts()));
 await app.keyboard.press('enter'); await app.wait(500);
 await app.screenshot(${JSON.stringify(resolve(directory, 'focus-after-enter.png'))});
 console.log('calendar-focus-after-enter', JSON.stringify(app.texts()));
 expect(app.shows('id:calendar-announcement-close')).toBe(true); app.dispose();
});
`,
    );
    const names = [
      `calendar android tv-device-${profile.theme}: announcements, cached dates, independent modes and exact source return`,
      `calendar android tv-device-${profile.theme}: exact retry, empty advancement and terminal owned focus handoff`,
      `calendar android tv-device-${profile.theme}: exact retry, empty advancement and terminal newer date intent`,
      `calendar live ${profile.name}: loopback covers and read-only announcements`,
    ];
    const selectedNames =
      suite === 'live'
        ? names.slice(-1)
        : suite === 'focus'
          ? [`calendar focus ${profile.name}: source keyboard activation evidence`]
          : names;
    for (const name of selectedNames) {
      const record = {
        profile: profile.name,
        name,
        requestedFont: profile.font,
        actualFont,
        beforeNight: device(['shell', 'cmd', 'uimode', 'night']),
      };
      runs.push(record);
      console.log(`Calendar Android development host: ${profile.name}: ${name}`);
      await run(executable('nsh'), ['test', testFile, '--target', 'android', '--filter', name], {
        cwd: project,
        env,
      });
      record.passed = true;
      record.afterNight = device(['shell', 'cmd', 'uimode', 'night']);
    }
  }
  if (fixture.writes.length || fixture.unknown.length)
    throw new Error('Live fixture received mutations or an unrelated route');
  if (
    fixture.reads.some((path) =>
      /\/play\/|\/series\/seasons|\/lists\/rank|series_id=30[12]|series_id=311/.test(path),
    )
  )
    throw new Error('Calendar announced IDs crossed a playable or unrelated boundary');
} catch (error) {
  errors.push(error?.stack || String(error));
} finally {
  const restore = async (name, action) => {
    try {
      await action();
      cleanup.push({ name, ok: true });
    } catch (error) {
      cleanup.push({ name, ok: false, error: String(error) });
      errors.push(`${name}: ${error}`);
    }
  };
  await restore('capture-failure', async () => {
    if (!errors.length) return;
    await deviceRun(['shell', 'screencap', '-p', '/sdcard/calendar-host-failure.png']);
    await deviceRun([
      'pull',
      '/sdcard/calendar-host-failure.png',
      resolve(artifacts, 'failure.png'),
    ]);
    await deviceRun(['shell', 'rm', '/sdcard/calendar-host-failure.png']);
    await writeFile(
      resolve(artifacts, 'failure-logcat.txt'),
      device(['logcat', '-d', '-t', '250']),
    );
  });
  await restore('font', () =>
    deviceRun([
      'shell',
      'settings',
      initial.font === 'null' ? 'delete' : 'put',
      'system',
      'font_scale',
      ...(initial.font === 'null' ? [] : [initial.font]),
    ]),
  );
  await restore('appearance', () => deviceRun(['shell', 'cmd', 'uimode', 'night', initial.night]));
  if (reversed) await restore('reverse', () => deviceRun(['reverse', '--remove', `tcp:${port}`]));
  if (initial.hostStopped)
    await restore('stop-development-host', () =>
      deviceRun(['shell', 'am', 'force-stop', hostPackage]),
    );
  await restore('foreground', () =>
    deviceRun(['shell', 'am', 'start', '-W', '-n', initial.foreground]),
  );
  await restore('readback', async () => {
    restored = {
      font: device(['shell', 'settings', 'get', 'system', 'font_scale']),
      night: device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1],
      reverse: device(['reverse', '--list']),
      foreground: resumed(),
      production: apkDigests(productPackage),
      host: apkDigests(hostPackage),
      hostStopped: /User 0:.*\bstopped=true\b/.test(
        device(['shell', 'dumpsys', 'package', hostPackage]),
      ),
    };
    if (
      restored.font !== initial.font ||
      restored.night !== initial.night ||
      restored.reverse !== initial.reverse ||
      restored.foreground !== initial.foreground ||
      JSON.stringify(restored.production) !== JSON.stringify(initial.production) ||
      restored.hostStopped !== initial.hostStopped
    )
      throw new Error('Android device state or production APK restoration differed');
  });
  await restore('request-evidence', () =>
    writeFile(
      resolve(artifacts, 'requests.json'),
      JSON.stringify(fixture.requests, null, 2) + '\n',
    ),
  );
  await restore('fixture-close', () => fixture.close());
  const sourceSha256 = createHash('sha256')
    .update(await readFile(resolve(root, 'packages/app/src/pages/Calendar.tsx')))
    .digest('hex');
  await writeFile(
    resolve(artifacts, 'restoration.json'),
    JSON.stringify(
      {
        scope:
          'NSH Android development host on TV emulator, shared production TSX only; no production MainActivity/TvRemote, physical remote, native core or standalone install claim',
        serial,
        viewport,
        sourceSha256,
        initial,
        restored,
        runs,
        cleanup,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
}
if (errors.length)
  throw new AggregateError(errors, 'Calendar Android host acceptance or restoration failed');
