import { createServer, request as httpRequest } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { executable, root, run, runtimeConfig, rustEnvironment } from './process.mjs';

/**
 * Account-page visual pass: the real App against a local fixture that reports a guest or a
 * restored account, so both identity states and the shared library band are captured in the
 * two themes. Synthetic data exercises the layout only; it is not functional acceptance.
 */
const host = process.argv[2] ?? 'web';
if (!['web', 'macos', 'tv'].includes(host))
  throw new Error('Expected web|macos|tv; the account page needs a graphical host.');
const fixture = await browsingFixture();
const accountId = '9007199254740993';
const signedInAccount = {
  logged_in: true,
  sync: { state: 'idle', pending: 0, last_sync: 1763500000 },
  owner_id: accountId,
  owner_epoch: 'b'.repeat(32),
  profile: { uid: accountId, name: '集成账号' },
  qr_login_available: true,
  phone_login_available: true,
  guest_history: { total: 2, available: 1 },
};
const guestAccount = {
  logged_in: false,
  sync: { state: 'local', pending: 0 },
  owner_id: '',
  owner_epoch: 'a'.repeat(32),
  qr_login_available: true,
  phone_login_available: true,
};
const library = {
  favorites: [],
  entries: [
    {
      drama: {
        series_id: '202',
        title: '账号记录',
        cover: '',
        intro: '合成账号隔离回归',
        episode_count: 1,
      },
      episode: 1,
      video_id: '402',
      position: 12,
      duration: 100,
      last_played_at: 1,
    },
  ],
};
/** The test flips this before opening, so one proxy serves both identity states. */
const accountStates = { current: guestAccount };
const reply = (response, data) => {
  response.writeHead(200, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify({ ok: true, data }));
};
const proxy = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/api/v1/account') return reply(response, accountStates.current);
  if (path === '/api/v1/library')
    return reply(response, {
      ...library,
      owner_id: accountStates.current.logged_in ? accountId : '',
    });
  const upstream = httpRequest(
    fixture.origin + request.url,
    { method: request.method, headers: { ...request.headers, host: new URL(fixture.origin).host } },
    (replyUpstream) => {
      response.writeHead(replyUpstream.statusCode, replyUpstream.headers);
      replyUpstream.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(502);
    response.end();
  });
  upstream.end(chunks.length ? Buffer.concat(chunks) : undefined);
});
await new Promise((done) => proxy.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${proxy.address().port}`;

const runtime = resolve(root, 'apps/web/runtime.generated.json');
const previous = await readFile(runtime);
const artifacts = resolve(root, 'artifacts/account-redesign', host);
const appDir = host === 'macos' ? 'apps/desktop' : 'apps/web';
/** TV renders the same app at 960×540dp with the TV token set behind its own mount. */
const project =
  host === 'tv' ? resolve(root, 'apps/tv/.nsh/account-visual-tv') : resolve(root, appDir, '.nsh');
const file =
  host === 'tv'
    ? resolve(project, 'AccountHost.test.tsx')
    : resolve(appDir, '.nsh/AccountHost.test.tsx');
try {
  await mkdir(artifacts, { recursive: true });
  await runtimeConfig('web', origin);
  if (host === 'tv') {
    await mkdir(project, { recursive: true });
    await writeFile(
      resolve(project, 'nsh.json'),
      JSON.stringify(
        {
          name: 'Account Visual',
          id: 'dev.hongguo.accountvisual',
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
      `import { mount } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import logoMark from './hongguo-logo.png';
configureClient(${JSON.stringify(origin)});
mount(() => <App target="tv" logoMark={logoMark} />);
`,
    );
  }
  for (const [state, account] of [
    ['guest', guestAccount],
    ['signed-in', signedInAccount],
  ]) {
    accountStates.current = account;
    await writeFile(
      file,
      `import { open, test } from 'nsh/test';
for (const scheme of ['light', 'dark']) {
  test('account ${state} ' + scheme, async () => {
    const app = await open(${JSON.stringify(host === 'tv' ? './App.tsx' : '../App.tsx')}, {
      width: ${host === 'tv' ? 960 : 1440}, height: ${host === 'tv' ? 540 : 1000}, colorScheme: scheme, reducedMotion: true, network: 'live',
    });
    await app.waitFor(${JSON.stringify(host === 'tv' ? 'id:nav-settings' : 'id:nav-settings')});
    ${
      host === 'tv'
        ? `await app.press(${JSON.stringify('role:button[' + (state === 'signed-in' ? '集成账号' : '账号') + ']')});`
        : `await app.press('role:button[我的账号]');`
    }
    await app.waitFor('id:account-summary');
    await app.wait(400);
    await app.screenshot(${JSON.stringify(artifacts)} + '/account-${state}-' + scheme + '.png');
    ${
      state === 'guest'
        ? `await app.press('id:account-login-open');
    await app.waitFor('id:account-login-dialog');
    await app.wait(400);
    await app.screenshot(${JSON.stringify(artifacts)} + '/account-login-' + scheme + '.png');`
        : ''
    }
    app.dispose();
  });
}
`,
    );
    await run(
      executable('nsh'),
      [
        'test',
        host === 'tv' ? 'AccountHost.test.tsx' : file,
        // The TV visual pass draws the TV token set in the web host; Android drawing is separate.
        '--target',
        host === 'tv' ? 'web' : host,
        ...(host === 'macos' ? ['--foreground'] : []),
      ],
      {
        cwd: project,
        env: rustEnvironment(),
      },
    );
  }
} finally {
  await writeFile(runtime, previous);
  proxy.closeAllConnections();
  proxy.close();
  await fixture.close();
}
