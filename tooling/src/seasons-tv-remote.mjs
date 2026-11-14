import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seasonsFixture } from './seasons-fixture.mjs';
import { acceptanceCommand } from './acceptance-command.mjs';
import { executable, nshVersion, output, root, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

/** Server evidence is required in addition to the real adapter's native assertions. */
export function verifySeasonRequests(fixture, suite) {
  assert(['details', 'mismatch', 'player-browse'].includes(suite), 'Unknown series suite');
  assert.deepEqual(fixture.unknown, [], 'Unexpected fixture traffic');
  const reads = (path, id) =>
    fixture.requests.filter((entry) => {
      const url = new URL(entry.url, 'http://fixture');
      return (
        url.pathname === path && (id === undefined || url.searchParams.get('series_id') === id)
      );
    });
  const detail = (id) => reads('/api/v1/series/detail', id);
  assert(detail('101').length, 'Original detail must load');
  assert.equal(detail('301').length, 0, 'Upcoming selection must not read detail');
  assert.equal(detail('401').length, 0, 'Unavailable selection must not read detail');
  for (const read of reads('/api/v1/series/detail')) {
    const url = new URL(read.url, 'http://fixture');
    assert(url.searchParams.has('content_type'));
    assert.equal(url.searchParams.get('content_type'), '');
  }
  assert.equal(reads('/api/v1/series/next-season').length, 0, 'Browsing is not an ended event');
  const searchWrites = fixture.writes.filter(
    (row) => new URL(row.url, 'http://fixture').pathname === '/api/v1/search/history',
  );
  assert.equal(searchWrites.length, 1, 'Only the explicit search may change recent search');
  assert.deepEqual(searchWrites[0].body, { action: 'add', query: 'story' });
  const media = reads('/api/v1/play/info');
  if (suite === 'player-browse') {
    assert.deepEqual(
      media.map((entry) => {
        const url = new URL(entry.url, 'http://fixture');
        return [url.searchParams.get('series_id'), url.searchParams.get('vid')];
      }),
      [
        ['101', '1001'],
        ['201', '2001'],
      ],
      'Only two confirmed episodes may prepare media',
    );
    assert.equal(detail('201').length, 1, 'Browsing detail is cached within the player');
    assert(media[0].index < detail('201')[0].index);
    assert(detail('201')[0].index < media[1].index);
    assert(
      fixture.writes.some(
        (row) => new URL(row.url, 'http://fixture').pathname === '/api/v1/library',
      ),
      'Actual playback must checkpoint progress',
    );
  } else {
    fixture.assertReadOnly({ since: searchWrites[0].index + 1 });
    assert.equal(fixture.writes.length, 1, 'Browsing may only save the explicit search');
    assert(!fixture.requests.some((row) => /\/play\/|\/minireel-proxy\//.test(row.url)));
    assert.equal(media.length, 0, 'Browsing must not prepare media');
    assert.equal(detail('201').length, 2, 'Retry repeats one failed or rejected detail');
    assert.equal(
      detail('201')[0].url,
      detail('201')[1].url,
      'Retry must keep the exact detail URL',
    );
    assert.equal(detail('201')[0].status, suite === 'details' ? 503 : 200);
    assert.equal(detail('201')[1].status, 200);
  }
  for (const write of fixture.writes) {
    const path = new URL(write.url, 'http://fixture').pathname;
    assert(['/api/v1/library', '/api/v1/play/release', '/api/v1/search/history'].includes(path));
    if (path === '/api/v1/library') {
      assert.equal(suite, 'player-browse');
      assert.equal(write.body.action, 'progress');
      assert.equal(write.body.owner_id ?? '', '');
      assert.equal(write.body.completed ?? false, false, 'Paused first episodes must not finish');
      assert.deepEqual(
        [write.body.drama.series_id, write.body.video_id],
        write.body.drama.series_id === '101' ? ['101', '1001'] : ['201', '2001'],
      );
      assert(!write.body.drama.episodes, 'History must remain compact');
    }
  }
  return {
    suite,
    passed: true,
    requests: fixture.requests.length,
    preparations: media.length,
    method:
      'Strict synthetic fixture plus native DPAD, media identity and unchanged browsing-history snapshots',
  };
}

async function main() {
  // One isolated package, production Java adapter sources, no Cargo or production APK replacement.
  const [mode = 'prepare', ...args] = process.argv.slice(2);
  const suiteNames = ['details', 'mismatch', 'player-browse'];
  const flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--suite', '--profile'].includes(args[index]) ||
      !args[index + 1] ||
      flags.has(args[index])
    )
      throw new Error(
        'Expected prepare|run [--suite all|details|mismatch|player-browse] [--profile all|light|dark|large-text]',
      );
    flags.set(args[index], args[index + 1]);
  }
  const selectedSuite = flags.get('--suite') ?? 'all';
  const selectedProfile = flags.get('--profile') ?? 'all';
  if (
    !['all', ...suiteNames].includes(selectedSuite) ||
    !['all', 'light', 'dark', 'large-text'].includes(selectedProfile)
  )
    throw new Error('Unknown seasons suite or profile');
  if (!['prepare', 'run'].includes(mode))
    throw new Error('Expected seasons-tv-remote.mjs prepare|run');
  const appId = 'dev.hongguo.seasonsacceptance';
  const productId = 'dev.hongguo.tv';
  const project = resolve(root, 'apps/tv/.nsh/seasons-remote-host');
  const app = resolve(project, 'app');
  const tsx = resolve(project, 'tsx');
  const artifacts = resolve(
    root,
    'artifacts/seasons-ui/android-real-adapter',
    new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
  );
  const productionHost = resolve(root, 'apps/tv/android');
  const embedded = resolve(root, 'apps/tv/.nsh/android-host');
  const toolchain = JSON.parse(await readFile(resolve(root, 'tooling/tv-toolchain.json'), 'utf8'));
  if (toolchain.nsh.version !== nshVersion)
    throw new Error('TV embedding toolchain version differs');
  const release = JSON.parse(await readFile(resolve(root, 'tooling/release-policy.json'), 'utf8'));
  const quote = (path) => `'${path.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  for (const path of [
    app,
    tsx,
    resolve(project, 'res/values'),
    resolve(project, 'res/values-night'),
  ])
    await mkdir(path, { recursive: true });
  await writeFile(
    resolve(project, 'settings.gradle'),
    `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = 'seasons-remote-acceptance'
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
  testInstrumentationRunner 'dev.hongguo.tv.SeasonsAcceptance'
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
 sourceSets.androidTest.java.srcDirs = [${quote(resolve(root, 'tooling/fixtures/seasons-tv'))}]
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
    manifest.replace('android:label="红果"', 'android:label="Seasons TV Acceptance"'),
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
    const onSignal = () => controller.abort(new Error('Seasons adapter acceptance interrupted'));
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
    console.log(`Seasons real TV adapter artifacts: ${artifacts}`);
    try {
      fixture = await seasonsFixture();
      port = new URL(fixture.origin).port;
      if (initial.reverse.split('\n').some((line) => line.split(/\s+/).includes(`tcp:${port}`)))
        throw new Error('Fixture reverse mapping already owned');
      await writeFile(
        resolve(tsx, 'nsh.json'),
        JSON.stringify(
          {
            name: 'Seasons TV Acceptance',
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
        `import {host, mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import {subscribeFocus} from '../../../focus';
import logoMark from './hongguo-logo.png';
configureClient('${fixture.origin}');
mount(() => <App target="tv" logoMark={logoMark} subscribeFocus={subscribeFocus} subscribePlayerCommands={(receive) => host.on('player-command', receive)} />);
`,
      );
      inputs = Object.fromEntries(
        await Promise.all(
          [
            'packages/app/src/index.tsx',
            'packages/app/src/pages/Detail.tsx',
            'packages/app/src/pages/Player.tsx',
            'packages/app/src/seasons.ts',
            'packages/app/src/season-detail.ts',
            'packages/app/src/SeasonPicker.tsx',
            'packages/ui/src/season-choice.tsx',
            'packages/ui/src/card-controls.tsx',
            'packages/ui/src/foundation.ts',
            'packages/ui/theme.json',
            'tooling/src/seasons-fixture.mjs',
            'tooling/src/seasons-tv-remote.mjs',
            'tooling/fixtures/seasons-tv/SeasonsAcceptance.java',
            'apps/tv/focus.ts',
            'apps/tv/android/app/src/main/java/dev/hongguo/tv/MainActivity.java',
            'apps/tv/android/app/src/main/java/dev/hongguo/tv/TvRemote.java',
            'apps/tv/.nsh/android-host/jni/arm64-v8a/libnsh.so',
            'apps/tv/.nsh/android-host/nsh-classes.jar',
          ].map(async (path) => [path, hash(await readFile(resolve(root, path)))]),
        ),
      );
      const sourceSha256 = inputs['packages/app/src/pages/Detail.tsx'];
      const requireBuildSpace = async () => {
        const disk = await statfs(project);
        if (disk.bavail * disk.bsize < 1024 ** 3)
          throw new Error('Java-only packaging requires at least 1GiB free');
      };
      await requireBuildSpace();
      await command(executable('nsh'), ['check'], { cwd: tsx });
      await requireBuildSpace();
      await command(executable('nsh'), ['build'], { cwd: tsx });
      for (const [path, expected] of Object.entries(inputs))
        if (hash(await readFile(resolve(root, path))) !== expected)
          throw new Error(`Acceptance source changed during bundling: ${path}`);
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
      for (const profile of profiles.filter(
        (entry) => selectedProfile === 'all' || entry.name === selectedProfile,
      ))
        for (const suite of suiteNames.filter(
          (entry) => selectedSuite === 'all' || entry === selectedSuite,
        )) {
          controller.signal.throwIfAborted();
          if (fixture) await fixture.close();
          fixture = await seasonsFixture({ port: Number(port) });
          if (suite === 'details') fixture.queue('detail', '201', { status: 503 });
          if (suite === 'mismatch')
            fixture.queue('detail', '201', {
              data: { ...fixture.dramas['201'], series_id: '999' },
            });
          device(['shell', 'cmd', 'uimode', 'night', profile.night]);
          device(['shell', 'settings', 'put', 'system', 'font_scale', profile.font]);
          if (
            Number(device(['shell', 'settings', 'get', 'system', 'font_scale'])) !==
            Number(profile.font)
          )
            throw new Error('Font setting did not apply');
          device(['shell', 'am', 'force-stop', appId]);
          const name = `${profile.name}-${suite}`;
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
              'suite',
              suite,
              '-e',
              'fixtureOrigin',
              fixture.origin,
              `${appId}.test/dev.hongguo.tv.SeasonsAcceptance`,
            ],
            { timeoutMs: 240000 },
          );
          await writeFile(resolve(directory, 'instrumentation.log'), report);
          await writeFile(
            resolve(directory, 'requests.json'),
            JSON.stringify(fixture.requests, null, 2) + '\n',
          );
          await writeFile(
            resolve(directory, 'traffic.json'),
            JSON.stringify(
              { requests: fixture.requests, writes: fixture.writes, unknown: fixture.unknown },
              null,
              2,
            ) + '\n',
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
            suite,
            sourceSha256,
            nativePassed:
              /Seasons real TV adapter: \d+ checks passed/.test(report) &&
              !report.includes('FAIL '),
            passed: false,
            requests: fixture.requests.length,
          };
          runs.push(record);
          if (!record.nativePassed) throw new Error(`Seasons real TV adapter ${name} failed`);
          const readEvidence = verifySeasonRequests(fixture, suite);
          await writeFile(
            resolve(directory, 'request-assertions.json'),
            JSON.stringify(readEvidence, null, 2) + '\n',
          );
          record.passed = true;
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
          ? writeFile(
              resolve(artifacts, 'failure-logcat.txt'),
              device(['logcat', '-d', '-t', '500']),
            )
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
      if (fixture) {
        await restore('request-evidence', () =>
          writeFile(
            resolve(artifacts, 'last-traffic.json'),
            JSON.stringify(
              { requests: fixture.requests, writes: fixture.writes, unknown: fixture.unknown },
              null,
              2,
            ) + '\n',
          ),
        );
        await restore('close-fixture', () => fixture.close());
      }
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
              'Isolated API34 emulator APK reusing production MainActivity/TvRemote Java and shared App; synthetic series, local original media and process-only guest history; no physical TV, older Android runtime, native Rust core, production business or independent release claim',
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
      throw new AggregateError(errors, 'Seasons real-adapter acceptance or restoration failed');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
