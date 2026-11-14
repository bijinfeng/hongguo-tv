import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calendarFixture } from './calendar-fixture.mjs';
import { acceptanceCommand } from './acceptance-command.mjs';
import { executable, nshVersion, output, root, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

// One isolated package, production Java adapter sources, no Cargo or production APK replacement.
const mode = process.argv[2] || 'prepare';
if (!['prepare', 'run'].includes(mode))
  throw new Error('Expected calendar-tv-remote.mjs prepare|run');
const appId = 'dev.hongguo.calendaracceptance';
const productId = 'dev.hongguo.tv';
const project = resolve(root, 'apps/tv/.nsh/calendar-remote-host');
const app = resolve(project, 'app');
const tsx = resolve(project, 'tsx');
const artifacts = resolve(
  root,
  'artifacts/calendar-ui/android-real-adapter',
  new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
);
const productionHost = resolve(root, 'apps/tv/android');
const embedded = resolve(root, 'apps/tv/.nsh/android-host');
const toolchain = JSON.parse(await readFile(resolve(root, 'tooling/tv-toolchain.json'), 'utf8'));
if (toolchain.nsh.version !== nshVersion) throw new Error('TV embedding toolchain version differs');
const release = JSON.parse(await readFile(resolve(root, 'tooling/release-policy.json'), 'utf8'));
const quote = (path) => `'${path.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const path of [app, tsx, resolve(project, 'res/values'), resolve(project, 'res/values-night')])
  await mkdir(path, { recursive: true });
await writeFile(
  resolve(project, 'settings.gradle'),
  `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = 'calendar-remote-acceptance'
include ':app'
`,
);
await writeFile(
  resolve(project, 'build.gradle'),
  "plugins { id 'com.android.application' version '8.13.2' apply false }\n",
);
await cp(resolve(productionHost, 'gradle.properties'), resolve(project, 'gradle.properties'));
await writeFile(
  resolve(app, 'build.gradle'),
  `plugins { id 'com.android.application' }
android {
 namespace 'dev.hongguo.tv'
 compileSdk ${Number(toolchain.android.platform.slice(8))}
 buildToolsVersion ${quote(toolchain.android.buildTools)}
 buildFeatures { buildConfig true }
 defaultConfig {
  applicationId ${quote(appId)}
  minSdk ${toolchain.android.minSdk}
  targetSdk ${toolchain.android.targetSdk}
  versionCode 1
  versionName '0.0.0-acceptance'
  testInstrumentationRunner 'dev.hongguo.tv.CalendarAcceptance'
  buildConfigField 'String', 'UPDATE_CERTIFICATE_SHA256', ${quote(JSON.stringify(release.tv.signingCertificateSha256))}
  ndk { abiFilters 'arm64-v8a' }
 }
 sourceSets.main {
  manifest.srcFile ${quote(resolve(app, 'AndroidManifest.xml'))}
  java.srcDirs = [${quote(resolve(productionHost, 'app/src/main/java'))}]
  res.srcDirs = [${quote(resolve(productionHost, 'app/src/main/res'))}, ${quote(resolve(project, 'res'))}]
  assets.srcDirs = [${quote(resolve(project, 'assets'))}]
  jniLibs.srcDirs = [${quote(resolve(embedded, 'jni'))}]
 }
 sourceSets.androidTest.java.srcDirs = [${quote(resolve(root, 'tooling/fixtures/calendar-tv'))}]
 compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
 packaging { jniLibs { useLegacyPackaging = false } }
}
dependencies { implementation files(${quote(resolve(embedded, 'nsh-classes.jar'))}) }
`,
);
const manifest = await readFile(
  resolve(productionHost, 'app/src/main/AndroidManifest.xml'),
  'utf8',
);
await writeFile(
  resolve(app, 'AndroidManifest.xml'),
  manifest.replace('android:label="红果"', 'android:label="Calendar TV Acceptance"'),
);
const theme = JSON.parse(await readFile(resolve(root, 'packages/ui/theme.json'), 'utf8'));
for (const [appearance, directory] of [
  ['light', 'values'],
  ['dark', 'values-night'],
]) {
  const colors = ['background', 'primary', 'primary-foreground', 'ring']
    .map(
      (token) =>
        `<color name="tv_${token.replaceAll('-', '_')}">${theme.cssVars[appearance][token]}</color>`,
    )
    .join('\n');
  await writeFile(
    resolve(project, 'res', directory, 'colors.xml'),
    `<resources>\n${colors}\n<dimen name="tv_radius">${theme.cssVars.theme.radius.replace('px', 'dp')}</dimen>\n</resources>\n`,
  );
}
if (mode === 'prepare') {
  console.log(
    `Prepared isolated Java-only host configuration: ${project}; no bundle/build/install performed`,
  );
} else {
  const env = rustEnvironment(tvHostEnvironment());
  const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
  const devices = output(adb, ['devices'], { env })
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (devices.length !== 1 || !/^emulator-\d+\s+device$/.test(devices[0]))
    throw new Error('Requires one ready Android TV emulator');
  const serial = devices[0].split(/\s+/)[0];
  const device = (args) => output(adb, ['-s', serial, ...args], { env });
  if (
    device(['shell', 'getprop', 'ro.build.version.sdk']) !== '34' ||
    !device(['shell', 'pm', 'list', 'features']).includes('android.software.leanback_only')
  )
    throw new Error('Requires pinned Android TV API34 emulator');
  const installedPackages = device(['shell', 'pm', 'list', 'packages']).split('\n');
  if (
    installedPackages.includes(`package:${appId}`) ||
    installedPackages.includes(`package:${appId}.test`)
  )
    throw new Error('Isolated acceptance package already exists; preserve its state');
  const production = () =>
    device(['shell', 'pm', 'path', productId])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const path = line.slice(8);
        if (!/^\/[A-Za-z0-9/_+~=.-]+\.apk$/.test(path))
          throw new Error('Unexpected production APK path');
        return { path, sha256: device(['shell', 'sha256sum', path]).split(/\s+/)[0] };
      });
  const foreground = () =>
    device(['shell', 'dumpsys', 'activity', 'activities']).match(
      /(?:topResumedActivity|mResumedActivity)=.*?\bu0\s+([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/,
    )?.[1];
  const initial = {
    font: device(['shell', 'settings', 'get', 'system', 'font_scale']),
    night: device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1],
    reverse: device(['reverse', '--list']),
    foreground: foreground(),
    production: production(),
  };
  if (!initial.foreground || !['yes', 'no', 'auto', 'custom'].includes(initial.night))
    throw new Error('Cannot capture restorable device state');
  const controller = new AbortController();
  const onSignal = () => controller.abort(new Error('Calendar adapter acceptance interrupted'));
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const command = (exe, args, options = {}) =>
    acceptanceCommand(
      exe,
      args,
      { cwd: root, env, onOutput: (chunk) => process.stdout.write(chunk), ...options },
      controller.signal,
    );
  const cleanup = [];
  const errors = [];
  const runs = [];
  let inputs;
  let fixture;
  let port;
  let reversed = false;
  let testInstalled = false;
  let hostInstalled = false;
  let restored;
  await mkdir(artifacts, { recursive: true });
  console.log(`Calendar real TV adapter artifacts: ${artifacts}`);
  try {
    fixture = await calendarFixture();
    port = new URL(fixture.origin).port;
    if (initial.reverse.split('\n').some((line) => line.split(/\s+/).includes(`tcp:${port}`)))
      throw new Error('Fixture reverse mapping already owned');
    await writeFile(
      resolve(tsx, 'nsh.json'),
      JSON.stringify(
        {
          name: 'Calendar TV Acceptance',
          id: appId,
          version: '0.0.0',
          build: 1,
          theme: '../../../../../packages/ui/theme.json',
          appearance: 'system',
          capabilities: { network: { hosts: ['127.0.0.1'] }, statusBar: true },
        },
        null,
        2,
      ) + '\n',
    );
    await cp(resolve(root, 'apps/tv/assets/hongguo-logo.png'), resolve(tsx, 'hongguo-logo.png'));
    await writeFile(
      resolve(tsx, 'tsconfig.json'),
      JSON.stringify(
        {
          extends: './.nsh/tsconfig.json',
          include: [
            '**/*.ts',
            '**/*.tsx',
            '../../../../../packages/*/src/**/*.ts',
            '../../../../../packages/*/src/**/*.tsx',
          ],
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      resolve(tsx, 'App.tsx'),
      `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import {subscribeFocus} from '../../../focus';
import logoMark from './hongguo-logo.png';
configureClient('${fixture.origin}');
mount(() => <App target="tv" logoMark={logoMark} subscribeFocus={subscribeFocus} />);
`,
    );
    inputs = Object.fromEntries(
      await Promise.all(
        [
          'packages/app/src/pages/Calendar.tsx',
          'apps/tv/focus.ts',
          'apps/tv/android/app/src/main/java/dev/hongguo/tv/MainActivity.java',
          'apps/tv/android/app/src/main/java/dev/hongguo/tv/TvRemote.java',
          'apps/tv/.nsh/android-host/jni/arm64-v8a/libnsh.so',
          'apps/tv/.nsh/android-host/nsh-classes.jar',
        ].map(async (path) => [path, hash(await readFile(resolve(root, path)))]),
      ),
    );
    const sourceSha256 = inputs['packages/app/src/pages/Calendar.tsx'];
    const requireBuildSpace = async () => {
      const disk = await statfs(project);
      if (disk.bavail * disk.bsize < 1024 ** 3)
        throw new Error('Java-only packaging requires at least 1GiB free');
    };
    await requireBuildSpace();
    await command(executable('nsh'), ['check'], { cwd: tsx });
    await requireBuildSpace();
    await command(executable('nsh'), ['build'], { cwd: tsx });
    const assets = resolve(project, 'assets/nsh');
    await rm(assets, { recursive: true, force: true });
    await mkdir(assets, { recursive: true });
    for (const name of ['bundle.nshc', 'app.json', 'capabilities.json'])
      await cp(resolve(tsx, '.nsh/out', name), resolve(assets, name));
    await cp(resolve(tsx, '.nsh/out/assets'), resolve(assets, 'assets'), { recursive: true });
    await requireBuildSpace();
    const gradle = resolve(productionHost, 'gradlew');
    await command(gradle, [
      '--no-daemon',
      '--project-dir',
      project,
      'assembleDebug',
      'assembleDebugAndroidTest',
    ]);
    hostInstalled = true;
    await command(adb, [
      '-s',
      serial,
      'install',
      resolve(app, 'build/outputs/apk/debug/app-debug.apk'),
    ]);
    testInstalled = true;
    await command(adb, [
      '-s',
      serial,
      'install',
      resolve(app, 'build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'),
    ]);
    device(['reverse', `tcp:${port}`, `tcp:${port}`]);
    reversed = true;
    const profiles = [
      { name: 'light', night: 'no', font: '1.0' },
      { name: 'dark', night: 'yes', font: '1.0' },
      { name: 'large-text', night: 'yes', font: '1.3' },
    ];
    for (const profile of profiles)
      for (const long of [false, true]) {
        controller.signal.throwIfAborted();
        if (fixture) await fixture.close();
        fixture = await calendarFixture({ port: Number(port), longAnnouncement: long });
        device(['shell', 'cmd', 'uimode', 'night', profile.night]);
        device(['shell', 'settings', 'put', 'system', 'font_scale', profile.font]);
        if (
          Number(device(['shell', 'settings', 'get', 'system', 'font_scale'])) !==
          Number(profile.font)
        )
          throw new Error('Font setting did not apply');
        device(['shell', 'am', 'force-stop', appId]);
        const name = `${profile.name}-${long ? 'long' : 'standard'}`;
        const directory = resolve(artifacts, name);
        await mkdir(directory, { recursive: true });
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
            'appearance',
            name,
            '-e',
            'long',
            String(long),
            `${appId}.test/dev.hongguo.tv.CalendarAcceptance`,
          ],
          { timeoutMs: 180000 },
        );
        await writeFile(resolve(directory, 'instrumentation.log'), report);
        await writeFile(
          resolve(directory, 'requests.json'),
          JSON.stringify(fixture.requests, null, 2) + '\n',
        );
        const external = `/sdcard/Android/data/${appId}/files`;
        for (const file of device(['shell', 'ls', external])
          .split(/\s+/)
          .filter((file) => file.endsWith(`-${name}.png`) || file.endsWith(`-${name}.json`)))
          await command(adb, [
            '-s',
            serial,
            'pull',
            `${external}/${file}`,
            resolve(directory, file),
          ]);
        const record = {
          ...profile,
          long,
          sourceSha256,
          passed: report.includes('Calendar real TV adapter:') && !report.includes('FAIL '),
          requests: fixture.requests.length,
        };
        runs.push(record);
        if (
          fixture.writes.length ||
          fixture.unknown.length ||
          fixture.reads.some((path) =>
            /\/play\/|\/series\/seasons|\/lists\/rank|series_id=30[12]|series_id=311/.test(path),
          )
        )
          throw new Error('Calendar request boundary violated');
        if (!record.passed) throw new Error(`Calendar real TV adapter ${name} failed`);
      }
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
    await restore('failure-logcat', () =>
      errors.length
        ? writeFile(resolve(artifacts, 'failure-logcat.txt'), device(['logcat', '-d', '-t', '500']))
        : undefined,
    );
    if (hostInstalled)
      await restore('stop-acceptance-host', () => device(['shell', 'am', 'force-stop', appId]));
    if (testInstalled)
      await restore('uninstall-acceptance-tests', () => device(['uninstall', `${appId}.test`]));
    if (hostInstalled)
      await restore('uninstall-acceptance-host', () => device(['uninstall', appId]));
    await restore('font', () =>
      device([
        'shell',
        'settings',
        initial.font === 'null' ? 'delete' : 'put',
        'system',
        'font_scale',
        ...(initial.font === 'null' ? [] : [initial.font]),
      ]),
    );
    await restore('night', () => device(['shell', 'cmd', 'uimode', 'night', initial.night]));
    if (reversed) await restore('reverse', () => device(['reverse', '--remove', `tcp:${port}`]));
    await restore('foreground', () =>
      device(['shell', 'am', 'start', '-W', '-n', initial.foreground]),
    );
    if (fixture) await restore('close-fixture', () => fixture.close());
    await restore('readback', () => {
      restored = {
        font: device(['shell', 'settings', 'get', 'system', 'font_scale']),
        night: device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1],
        reverse: device(['reverse', '--list']),
        foreground: foreground(),
        production: production(),
        packages: device(['shell', 'pm', 'list', 'packages'])
          .split('\n')
          .filter((line) => line === `package:${appId}` || line === `package:${appId}.test`),
      };
      if (
        restored.font !== initial.font ||
        restored.night !== initial.night ||
        restored.reverse !== initial.reverse ||
        restored.foreground !== initial.foreground ||
        JSON.stringify(restored.production) !== JSON.stringify(initial.production) ||
        restored.packages.length
      )
        throw new Error('Production APK, settings or isolated package cleanup differs');
    });
    await writeFile(
      resolve(artifacts, 'restoration.json'),
      JSON.stringify(
        {
          scope:
            'Isolated API34 emulator APK reusing production MainActivity/TvRemote Java and shared TSX; GET fixture; API26–29 opt-in selection uses synthetic accessibility nodes only, no older-API runtime, native core, independent business or physical TV claim',
          serial,
          inputs,
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
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  if (errors.length)
    throw new AggregateError(errors, 'Calendar real-adapter acceptance or restoration failed');
}
