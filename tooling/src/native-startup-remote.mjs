import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nsh, output, root, run } from './process.mjs';
import { packageTvHost, tvHostEnvironment } from './tv-host.mjs';

// The real TV adapter with a synthetic failed open; never independent-business evidence.
const env = tvHostEnvironment();
const adb = resolve(env.ANDROID_HOME, 'platform-tools/adb');
const devices = output(adb, ['devices'])
  .split('\n')
  .slice(1)
  .filter((line) => line.trim());
assert(devices.length === 1 && /^emulator-\d+\s+device$/.test(devices[0]), 'Start one TV emulator');
const serial = devices[0].split(/\s+/)[0];
const device = (args) => output(adb, ['-s', serial, ...args]);
assert.equal(device(['shell', 'getprop', 'ro.build.version.sdk']), '34');
assert.equal(device(['reverse', '--list']), '', 'Remove computer reverse rules before this test');
const previousNight = device(['shell', 'cmd', 'uimode', 'night']).match(/Night mode: (\S+)/)?.[1];
assert(previousNight);
const previousScale = device(['shell', 'settings', 'get', 'system', 'font_scale']);
const artifacts = resolve(root, 'artifacts/playback/native-startup-remote');
await mkdir(artifacts, { recursive: true });
const entry = 'NativeStartupRemote.generated.tsx';
await writeFile(
  resolve(root, 'apps/tv', entry),
  `
import { mount } from 'nsh';
import { NativeApp } from '@hongguo/app';
import logoMark from './assets/hongguo-logo.png';
let attempts = 0;
mount(() => <NativeApp target="tv" logoMark={logoMark} runtime={{ mode: 'native' }} openCore={async () => {
  if (++attempts === 1) throw new Error(JSON.stringify({ body: { code: 'LIBRARY_STORAGE_UNAVAILABLE', error: '观看记录暂时无法读取，请重试' } }));
  return {
    origin: () => 'http://127.0.0.1:18765', close() {}, dispose() {},
    start(path: string) { return {
      result: async () => JSON.stringify({ status: path === '/api/v1/account' ? 501 : 200, body: path === '/api/v1/account' ? { ok: false, code: 'CORE_NOT_IMPLEMENTED', error: '此功能尚未开放' } : { ok: true, data: { entries: [], owner_id: '' } } }),
      accept() {}, cancel() {}, dispose() {},
    }; },
  };
}} />);
`,
  { flag: 'wx' },
);
const xmlPath = '/data/local/tmp/hongguo-native-startup.xml';
const pngPath = '/data/local/tmp/hongguo-native-startup.png';
const snapshot = () => {
  device(['shell', 'uiautomator', 'dump', xmlPath]);
  return device(['shell', 'cat', xmlPath]);
};
async function waitFor(text) {
  const deadline = Date.now() + 15000;
  let xml;
  do {
    xml = snapshot();
    if (xml.includes(text)) return xml;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw new Error(`Startup did not show ${text}`);
}
async function capture(name, xml) {
  await writeFile(resolve(artifacts, `${name}.xml`), xml);
  device(['shell', 'screencap', '-p', pngPath]);
  await run(adb, ['-s', serial, 'pull', pngPath, resolve(artifacts, `${name}.png`)]);
}
const errors = [];
try {
  await rm(resolve(root, 'apps/tv/.nsh/out'), { recursive: true, force: true });
  await nsh('build', 'tv', [entry]);
  await nsh('package', 'tv', [entry, '--target', 'android', '--abi', 'arm64-v8a']);
  await packageTvHost();
  await run(adb, ['-s', serial, 'install', '-r', resolve(root, 'apps/tv/.nsh/out/红果.apk')]);
  for (const [name, night, scale] of [
    ['light', 'no', '1.0'],
    ['dark', 'yes', '1.0'],
    ['large-text', 'yes', '1.3'],
  ]) {
    device(['shell', 'cmd', 'uimode', 'night', night]);
    device(['shell', 'settings', 'put', 'system', 'font_scale', scale]);
    device(['shell', 'am', 'force-stop', 'dev.hongguo.tv']);
    device(['shell', 'am', 'start', '-n', 'dev.hongguo.tv/.MainActivity']);
    await waitFor('观看记录暂时无法读取，请重试');
    device(['shell', 'input', 'keyevent', '20']);
    const failed = snapshot();
    assert(
      (failed.match(/<node\b[^>]*>/g) || []).some(
        (tag) => tag.includes('focused="true"') && /(?:text|content-desc)="重试"/.test(tag),
      ),
      `${name}: retry focus`,
    );
    await capture(`retry-${name}`, failed);
    device(['shell', 'input', 'keyevent', '23']);
    const ready = await waitFor('去找剧');
    await capture(`ready-${name}`, ready);
    console.log(`PASS ${name}: failed open, visible remote focus, DPAD retry into shared App`);
  }
  console.log('Native startup TV remote: 3 appearance/font cases passed (synthetic core)');
} catch (error) {
  errors.push(error);
} finally {
  for (const restore of [
    () => device(['shell', 'am', 'force-stop', 'dev.hongguo.tv']),
    () => device(['shell', 'cmd', 'uimode', 'night', previousNight]),
    () =>
      device([
        'shell',
        'settings',
        'put',
        'system',
        'font_scale',
        previousScale === 'null' ? '1.0' : previousScale,
      ]),
    () => device(['shell', 'rm', '-f', xmlPath, pngPath]),
    () => rm(resolve(root, 'apps/tv', entry)),
  ]) {
    try {
      await restore();
    } catch (error) {
      errors.push(error);
    }
  }
}
if (errors.length) throw new AggregateError(errors, 'TV startup remote acceptance failed');
