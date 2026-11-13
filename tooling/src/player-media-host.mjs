import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { child, executable, root, run, rustEnvironment } from './process.mjs';
import { tvHostEnvironment } from './tv-host.mjs';

const target = process.argv[2];
if (!['web', 'macos', 'android'].includes(target)) throw new Error('Expected web|macos|android');
const directory = resolve(root, target === 'android' ? 'apps/tv' : 'apps/web');
const artifacts = resolve(root, `artifacts/playback/media-${target}`);
await mkdir(artifacts, { recursive: true });
const samples = await Promise.all(
  ['a', 'b'].map((name) => readFile(resolve(root, `apps/tv/fixtures/t0-${name}.mp4`))),
);
// Acceptance-only original test patterns. API/history are explicit NSH stubs, never Rust evidence.
const server = createServer((request, response) => {
  const token = request.url?.split('/').at(-1);
  const sample =
    token === 'a'.repeat(64) ? samples[0] : token === 'b'.repeat(64) ? samples[1] : undefined;
  if (!sample || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'video/mp4');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'no-store');
  let start = 0,
    end = sample.length - 1;
  if (request.headers.range) {
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
    if (
      !range ||
      Number(range[1]) >= sample.length ||
      (range[2] && Number(range[2]) < Number(range[1]))
    ) {
      response.writeHead(416, { 'Content-Range': `bytes */${sample.length}` }).end();
      return;
    }
    start = Number(range[1]);
    end = range[2] ? Math.min(Number(range[2]), end) : end;
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${sample.length}`);
  }
  response.setHeader('Content-Length', end - start + 1);
  response.end(request.method === 'HEAD' ? undefined : sample.subarray(start, end + 1));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const entry = `.nsh/PlayerMedia-${target}.tsx`;
await writeFile(
  resolve(directory, entry),
  `import { mount } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient('${origin}');
mount(() => <App target="${target === 'android' ? 'tv' : 'desktop'}" logoMark={logoMark} />);
`,
);
const file = `.nsh/PlayerMedia-${target}.test.tsx`;
await writeFile(
  resolve(directory, file),
  `import { registerPlayerMediaHost } from '@hongguo/app/testing/player-media-host';
registerPlayerMediaHost('./PlayerMedia-${target}.tsx', ${JSON.stringify(artifacts)}, '${target}');
`,
);
try {
  if (target === 'android')
    await run('adb', ['reverse', `tcp:${server.address().port}`, `tcp:${server.address().port}`], {
      env: tvHostEnvironment(),
    });
  let trace = '';
  const host = child(executable('nsh'), ['test', file, '--target', target, '--trace'], {
    cwd: directory,
    env: rustEnvironment(target === 'android' ? tvHostEnvironment() : process.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const [stream, destination] of [
    [host.stdout, process.stdout],
    [host.stderr, process.stderr],
  ]) {
    stream.on('data', (data) => {
      trace += data;
      destination.write(data);
    });
  }
  await host.done;
  const videos = new Set(
    [...trace.matchAll(/Create \{ id: (\d+), kind: Video \}/g)].map((match) => match[1]),
  );
  assert.equal(
    videos.size,
    2,
    'Only episode changes may recreate Video; controls, options, panels and replay retain it',
  );
  assert.match(trace, /Video\(VideoProps \{[^\n]*rate: 1\.5,/);
  if (target === 'web') assert.match(trace, /Video\(VideoProps \{[^\n]*volume: 0\.0,/);
  console.log('Verified two stable video hosts and applied media options');
} finally {
  try {
    if (target === 'android')
      await run('adb', ['reverse', '--remove', `tcp:${server.address().port}`], {
        env: tvHostEnvironment(),
      });
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
