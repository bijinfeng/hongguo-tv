import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { calendarFixture } from './calendar-fixture.mjs';
import { radarFixture } from './radar-fixture.mjs';
import { executable, output, root, run, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

/**
 * One visual pass for the whole product, in one command and one app.
 *
 * Both surfaces — the TV shell and the flat component gallery — mount behind one switch, so a run
 * costs a single window and one fixture set. `web` (default) renders in headless Chrome: no window
 * at all. `android` renders on the pinned TV emulator, proving Android's own drawing. Both draw the
 * TV token set, because the generated project carries `theme.tv.json`. A desktop host is not
 * offered: its windows cannot be avoided, which is the cost this entry exists to remove;
 * `pnpm ui:host` stays for looking at AppKit.
 */
const args = process.argv.slice(2);
const host = ['web', 'android'].find((value) => args.includes(`--${value}`)) ?? 'web';
if (args.some((arg) => !['--web', '--android'].includes(arg)))
  throw new Error('Expected --web or --android; a desktop host always opens windows');
if (host === 'android') {
  const adb = resolve(tvHostEnvironment().ANDROID_HOME, 'platform-tools/adb');
  const devices = output(adb, ['devices'])
    .split('\n')
    .slice(1)
    .filter((line) => line.trim());
  if (devices.length !== 1 || !/^emulator-\d+\s+device$/.test(devices[0]))
    throw new Error(
      'Start the pinned Android TV API34 emulator (adb devices must list exactly one) before --android.',
    );
}

/** What the sweep proves on each host, kept beside the images it describes. */
const claims = {
  web: {
    proves: [
      'TV token density and page composition at 960x540dp, light and dark, in one run',
      'every listed screen reaches its ready marker and the gallery renders in full, in one app',
    ],
    doesNotProve: [
      'macOS AppKit or Android drawing: the web host renders HTML/CSS',
      'physical TV, real remote, DPAD traversal order, long-press or system IME behaviour',
      'real account, real catalog data, real playback or decoding',
      'per-frame motion, screen-reader output or system font scaling',
    ],
  },
  android: {
    proves: [
      'Android TV drawing, TV token density and page composition at 960x540dp, light and dark',
      'every listed screen reaches its ready marker and the gallery renders in full, in one app',
    ],
    doesNotProve: [
      'physical TV, real remote, DPAD traversal order, long-press or system IME behaviour',
      'real account, real catalog data, real playback or decoding',
      'physical-device decoding, long-play behaviour or system font scaling',
    ],
  },
};

const artifacts = resolve(root, `artifacts/tv-visual/${host}`);
const project = resolve(root, `apps/tv/.nsh/tv-visual-${host}`);
await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });
await mkdir(project, { recursive: true });

const browsing = await browsingFixture({ feed: false });
const calendar = await calendarFixture();
const radar = await radarFixture();

/** One origin for the app: each fixture keeps ownership of its own routes. */
const routes = [
  { matches: /^\/api\/v1\/lists\/(?:calendar|new)(?:\?|$)/, origin: calendar.origin },
  { matches: /^\/api\/v1\/(?:lists\/rank|radar)(?:\?|$)/, origin: radar.origin },
];
const proxy = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const upstreamOrigin =
    routes.find((route) => route.matches.test(request.url))?.origin ?? browsing.origin;
  const upstream = httpRequest(
    upstreamOrigin + request.url,
    {
      method: request.method,
      headers: { ...request.headers, host: new URL(upstreamOrigin).host },
    },
    (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(502);
    response.end();
  });
  upstream.end(body);
});
await new Promise((done) => proxy.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${proxy.address().port}`;

await writeFile(
  resolve(project, 'nsh.json'),
  JSON.stringify(
    {
      name: 'TV Visual Sweep',
      id: 'dev.hongguo.tvvisual',
      version: '0.0.0',
      build: 1,
      theme: '../../../../packages/ui/theme.tv.json',
      appearance: 'system',
      capabilities: { network: { hosts: ['*'] }, statusBar: true },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(project, 'hongguo-logo.png'),
  await readFile(resolve(root, 'apps/tv/assets/hongguo-logo.png')),
);
await writeFile(
  resolve(project, 'App.tsx'),
  `import { host, mount, signal } from 'nsh';
import { App } from '@hongguo/app';
import { ComponentGallery } from '@hongguo/ui/preview';
import { configureClient } from '@hongguo/core-client';
import logoMark from './hongguo-logo.png';
configureClient(${JSON.stringify(origin)});
/** One app, two surfaces: the test flips the view so the whole pass costs one window. */
const view = signal<'app' | 'gallery'>('app');
host.on('view', (next) => view.set(next as 'app' | 'gallery'));
mount(() => (
  <If when={view() === 'app'} else={<ComponentGallery target="tv" flat />}>
    <App target="tv" logoMark={logoMark} />
  </If>
));
`,
);
await writeFile(
  resolve(project, 'visual.test.tsx'),
  `import { registerVisualSweep } from '@hongguo/app/testing/visual-sweep';
registerVisualSweep('./App.tsx', ${JSON.stringify(artifacts)});
`,
);

const started = Date.now();
try {
  await run(executable('nsh'), ['test', 'visual.test.tsx', '--target', host], {
    cwd: project,
    env: rustEnvironment(host === 'android' ? tvHostEnvironment() : undefined),
  });
} finally {
  await writeFile(
    resolve(artifacts, 'requests.json'),
    JSON.stringify(
      { browsing: browsing.requests, calendar: calendar.requests, radar: radar.requests },
      null,
      2,
    ) + '\n',
  );
  await Promise.allSettled([browsing.close(), calendar.close(), radar.close()]);
  proxy.closeAllConnections();
  proxy.close();
}

const files = [];
for (const file of (await readdir(artifacts)).filter((name) => name.endsWith('.png')).sort()) {
  const bytes = await readFile(resolve(artifacts, file));
  files.push({
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
}
if (!files.length) throw new Error('The sweep produced no screenshots');
const elapsedMs = Date.now() - started;
await writeFile(
  resolve(artifacts, 'manifest.json'),
  JSON.stringify(
    {
      source: output('git', ['rev-parse', 'HEAD']),
      dirty: !!output('git', ['status', '--porcelain']),
      command: `pnpm visual:tv --${host}`,
      host,
      viewport: { width: 960, height: 540, unit: 'dp' },
      themeTokens: 'packages/ui/theme.tv.json',
      fixture: 'synthetic local HTTP (browsing + calendar + ranking/radar), read-only',
      elapsedMs,
      ...claims[host],
      screenshots: files,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Visual sweep passed on ${host}: ${files.length} screenshots in ${elapsedMs}ms`);
