import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rankingsFixture } from './rankings-fixture.mjs';
import { radarFixture } from './radar-fixture.mjs';
import { playerFixture } from './player-fixture.mjs';
import { detailExtrasFixture, verifyDetailExtrasRequests } from './detail-extras-fixture.mjs';
import { acceptanceCommand } from './acceptance-command.mjs';
import { executable, nshVersion, root, rustEnvironment } from './process.mjs';
import { tvEmulator, tvHostEnvironment } from './tv-host.mjs';

// Server-side evidence complements native keyboard assertions: selectors remain opaque IDs.
function verifyRequests(requests, suite) {
  if (suite === 'radar') {
    const urls = requests.map(({ url }) => new URL(url, 'http://fixture'));
    const snapshots = urls.filter((url) => url.pathname === '/api/v1/radar');
    assert(snapshots.length >= 3, 'Radar must exercise independent partial and stale refresh');
    assert(
      snapshots.every((url) => url.search === ''),
      'Radar refresh must not invent parameters',
    );
    for (const id of ['101', '540'])
      assert(
        urls.some(
          (url) =>
            url.pathname === '/api/v1/series/detail' && url.searchParams.get('series_id') === id,
        ),
        `Exact radar detail ${id} must be read`,
      );
    assert(!urls.some((url) => /\/play\//.test(url.pathname)));
    assert(requests.every((entry) => entry.method === 'GET'));
    return { suite, passed: true, snapshotReads: snapshots.length, exactDetail: true };
  }
  if (suite === 'player') {
    const urls = requests.map(({ url }) => new URL(url, 'http://fixture'));
    for (const vid of ['456', '457'])
      assert(
        urls.some(
          (url) => url.pathname === '/api/v1/play/info' && url.searchParams.get('vid') === vid,
        ),
      );
    assert(!urls.some((url) => url.pathname === '/api/v1/lists/rank'));
    return {
      suite,
      passed: true,
      method:
        'Existing synthetic player fixture and production PlayerAcceptance; no real content or account writes',
    };
  }
  const rankReads = requests.filter(
    ({ url }) => new URL(url, 'http://fixture').pathname === '/api/v1/lists/rank',
  );
  assert.equal(
    rankReads[0]?.url,
    '/api/v1/lists/rank',
    'First rankings request must omit selectors',
  );
  const query = (entry) => new URL(entry.url, 'http://fixture').searchParams;
  const matching = (predicate) => rankReads.filter((entry) => predicate(query(entry)));
  const details = (id) =>
    requests.filter(({ url }) => {
      const address = new URL(url, 'http://fixture');
      return (
        address.pathname === '/api/v1/series/detail' &&
        address.searchParams.get('series_id') === id &&
        address.searchParams.has('content_type') &&
        address.searchParams.get('content_type') === ''
      );
    });
  if (suite === 'identity') {
    const destinations = requests.filter(({ url }) => /\/actors\/works|\/series\/detail/.test(url));
    assert.equal(destinations[0]?.url, '/api/v1/actors/works?actor_id=101');
    assert(details('501').length);
    assert(details('101').length);
  }
  if (suite === 'selectors') {
    assert(
      matching((q) => q.get('rank_sub') === 'sub & 2' && q.get('rank') === 'weekly & raw').length,
    );
    assert(matching((q) => q.get('rank_sub') === 'deep/子榜 & 3').length);
    assert(
      matching(
        (q) => q.get('rank_panel') === 'panel/7 & raw' && q.get('rank_sub') === 'deep/子榜 & 3',
      ).length,
    );
    assert(matching((q) => q.has('rank_panel') && q.get('rank_panel') === '').length);
    assert(
      matching(
        (q) => q.has('rank') && q.get('rank') === '' && !q.has('rank_sub') && !q.has('rank_panel'),
      ).length,
    );
  }
  if (['pagination', 'newer-selector', 'newer-focus'].includes(suite)) {
    const failed = rankReads.find((entry) => entry.status === 503);
    assert(failed, 'Pagination must exercise HTTP 503');
    const retry = rankReads.filter((entry) => entry.url === failed.url);
    assert.equal(retry.length, 2, 'Retry must repeat the exact URL once');
    assert.equal(retry[1].status, 200);
    assert.equal(query(failed).get('offset'), '20');
    assert.equal(query(failed).get('shown'), '101,102');
    const terminal = matching((q) => q.get('offset') === '45');
    assert.equal(terminal.length, 1, 'Empty continuation advances to the source cursor');
    assert.equal(query(terminal[0]).get('session_id'), query(failed).get('session_id'));
    assert.equal(query(terminal[0]).get('shown'), '101,102');
    if (suite === 'newer-selector')
      assert(matching((q) => q.get('rank') === 'actor/榜 & 9' && !q.has('offset')).length);
  }
  if (suite === 'later') {
    assert(matching((q) => q.get('rank') === 'later/榜 & 48').length);
    assert(details('540').length >= 2);
  }
  if (suite === 'dense') {
    assert(
      matching((q) => q.get('rank') === 'dense/32 & raw' && q.get('rank_sub') === 'sub/8 & raw')
        .length,
    );
    assert(
      matching(
        (q) =>
          q.get('rank') === 'dense/32 & raw' &&
          q.get('rank_sub') === 'sub/8 & raw' &&
          q.get('rank_panel') === 'choice/31 & raw',
      ).length,
    );
  }
  return {
    suite,
    passed: true,
    rankingReads: rankReads.length,
    method: 'GET-only fixture rejects unknown routes, selectors and continuation contexts',
  };
}

// One isolated package, production Java adapter sources, no Cargo or production APK replacement.
const [mode = 'prepare', ...args] = process.argv.slice(2);
const suiteNames = [
  'identity',
  'selectors',
  'pagination',
  'newer-selector',
  'newer-focus',
  'later',
  'dense',
  'radar',
  'detail-extras',
];
const flags = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!['--suite', '--profile'].includes(args[index]) || !args[index + 1] || flags.has(args[index]))
    throw new Error(
      'Expected prepare|run [--suite all|identity|selectors|pagination|newer-selector|newer-focus|later|dense|radar|detail-extras|player] [--profile all|light|dark|large-text]',
    );
  flags.set(args[index], args[index + 1]);
}
const selectedSuite = flags.get('--suite') ?? 'all';
const selectedProfile = flags.get('--profile') ?? 'all';
if (
  !['all', 'player', ...suiteNames].includes(selectedSuite) ||
  !['all', 'light', 'dark', 'large-text'].includes(selectedProfile)
)
  throw new Error('Unknown rankings suite or profile');
if (!['prepare', 'run'].includes(mode))
  throw new Error('Expected rankings-tv-remote.mjs prepare|run');
const appId = 'dev.hongguo.rankingsacceptance';
const productId = 'dev.hongguo.tv';
const project = resolve(root, 'apps/tv/.nsh/rankings-remote-host');
const app = resolve(project, 'app');
const tsx = resolve(project, 'tsx');
const artifacts = resolve(
  root,
  'artifacts/rankings-ui/android-real-adapter',
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
rootProject.name = 'rankings-remote-acceptance'
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
  resValue 'string', 'app_name', 'Rankings TV Acceptance'
  testInstrumentationRunner 'dev.hongguo.tv.RankingsAcceptance'
  buildConfigField 'String', 'UPDATE_CERTIFICATE_SHA256', ${quote(JSON.stringify(release.tv.signingCertificateSha256))}
  ndk { abiFilters 'arm64-v8a' }
 }
 sourceSets.main {
  manifest.srcFile ${quote(resolve(app, 'AndroidManifest.xml'))}
  java.srcDirs = [${quote(resolve(productionHost, 'app/src/main/java'))}]
  res.srcDirs = [${quote(resolve(productionHost, 'app/src/main/res'))}, ${quote(resolve(embedded, 'res'))}]
  assets.srcDirs = [${quote(resolve(project, 'assets'))}]
  jniLibs.srcDirs = [${quote(resolve(embedded, 'jni'))}]
 }
 sourceSets.androidTest.java.srcDirs = [${quote(resolve(root, 'tooling/fixtures/rankings-tv'))}, ${quote(resolve(productionHost, 'app/src/androidTest/java'))}]
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
  manifest.replace('android:label="红果"', 'android:label="Rankings TV Acceptance"'),
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
  const { serial, device } = tvEmulator({
    adb,
    env,
    message: 'Requires one ready Android TV emulator',
  });
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
  const onSignal = () => controller.abort(new Error('Rankings adapter acceptance interrupted'));
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
  console.log(`Rankings real TV adapter artifacts: ${artifacts}`);
  try {
    fixture =
      selectedSuite === 'detail-extras'
        ? await detailExtrasFixture()
        : selectedSuite === 'radar'
          ? await radarFixture()
          : await rankingsFixture();
    port = new URL(fixture.origin).port;
    if (initial.reverse.split('\n').some((line) => line.split(/\s+/).includes(`tcp:${port}`)))
      throw new Error('Fixture reverse mapping already owned');
    await writeFile(
      resolve(tsx, 'nsh.json'),
      JSON.stringify(
        {
          name: 'Rankings TV Acceptance',
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
          'packages/app/src/pages/Rankings.tsx',
          'packages/app/src/index.tsx',
          'packages/app/src/store.ts',
          'packages/app/src/rankings.ts',
          'packages/app/src/pages/Detail.tsx',
          'packages/app/src/DetailExtras.tsx',
          'packages/app/src/season-detail.ts',
          'packages/app/src/seasons.ts',
          'packages/app/src/pages/Actor.tsx',
          'packages/app/src/PosterCollection.tsx',
          'packages/ui/src/content.tsx',
          'tooling/src/detail-extras-fixture.mjs',
          'tooling/src/browsing-fixture.mjs',
          'packages/ui/src/ranking-card.tsx',
          'packages/app/src/radar.ts',
          'packages/app/src/pages/Radar.tsx',
          'packages/ui/src/radar-table.tsx',
          'packages/ui/src/button.tsx',
          'packages/ui/src/foundation.ts',
          'packages/ui/src/typography.ts',
          'packages/ui/theme.json',
          'tooling/src/radar-fixture.mjs',
          'tooling/src/rankings-fixture.mjs',
          'tooling/fixtures/rankings-tv/RankingsAcceptance.java',
          'tooling/src/player-fixture.mjs',
          'apps/tv/android/app/src/androidTest/java/dev/hongguo/tv/PlayerAcceptance.java',
          'apps/tv/focus.ts',
          'apps/tv/android/app/src/main/java/dev/hongguo/tv/MainActivity.java',
          'apps/tv/android/app/src/main/java/dev/hongguo/tv/TvRemote.java',
          'apps/tv/.nsh/android-host/jni/arm64-v8a/libnsh.so',
          'apps/tv/.nsh/android-host/nsh-classes.jar',
        ].map(async (path) => [path, hash(await readFile(resolve(root, path)))]),
      ),
    );
    const sourceSha256 = inputs['packages/app/src/pages/Rankings.tsx'];
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
      for (const suite of (selectedSuite === 'player' ? ['player'] : suiteNames).filter(
        (entry) => selectedSuite === 'all' || entry === selectedSuite,
      )) {
        controller.signal.throwIfAborted();
        if (fixture) await fixture.close();
        fixture =
          suite === 'player'
            ? await playerFixture({ port: Number(port) })
            : suite === 'detail-extras'
              ? await detailExtrasFixture({ port: Number(port) })
              : suite === 'radar'
                ? await radarFixture({ port: Number(port) })
                : await rankingsFixture({ port: Number(port), terminalDelayMs: 2400 });
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
            `${appId}.test/dev.hongguo.tv.RankingsAcceptance`,
          ],
          { timeoutMs: 240000 },
        );
        await writeFile(resolve(directory, 'instrumentation.log'), report);
        await writeFile(
          resolve(directory, 'requests.json'),
          JSON.stringify(fixture.requests, null, 2) + '\n',
        );
        if (suite === 'detail-extras')
          await writeFile(
            resolve(directory, 'traffic.json'),
            JSON.stringify(
              { writes: fixture.writes, media: fixture.media, unknown: fixture.unknown },
              null,
              2,
            ) + '\n',
          );
        const external = `/sdcard/Android/data/${appId}/files`;
        for (const file of device(['shell', 'ls', external])
          .split(/\s+/)
          .filter(
            (file) =>
              file.endsWith(`-${name}.png`) ||
              file.endsWith(`-${name}.json`) ||
              file.endsWith(`-${name}-accessibility.json`),
          ))
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
            (suite === 'player'
              ? /TV player acceptance: 24 checks passed/.test(report)
              : /Rankings real TV adapter: \d+ checks passed/.test(report)) &&
            !report.includes('FAIL '),
          passed: false,
          requests: fixture.requests.length,
        };
        runs.push(record);
        if (!record.nativePassed) throw new Error(`Rankings real TV adapter ${name} failed`);
        if (suite !== 'player') fixture.assertReadOnly();
        const readEvidence =
          suite === 'detail-extras'
            ? verifyDetailExtrasRequests(fixture)
            : verifyRequests(fixture.requests, suite);
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
    if (fixture) {
      await restore('request-evidence', () =>
        writeFile(
          resolve(artifacts, 'last-requests.json'),
          JSON.stringify(fixture.requests, null, 2) + '\n',
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
            selectedSuite === 'player'
              ? 'Isolated API34 emulator APK reusing production MainActivity/TvRemote and PlayerAcceptance; synthetic footage and fixture playback/history only; no physical TV, native core or production business claim'
              : 'Isolated API34 emulator APK reusing production MainActivity/TvRemote Java and shared rankings TSX; synthetic GET-only HTTP source; no physical TV, older Android runtime, native core or production business claim',
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
    throw new AggregateError(errors, 'Rankings real-adapter acceptance or restoration failed');
}
