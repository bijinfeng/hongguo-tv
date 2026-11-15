import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';

// These are launcher boundary tests, not product or live-content acceptance.
for (const matched of [true, false]) {
  test(
    `live browser wrapper ${matched ? 'preserves exec identity' : 'rejects a mismatched acknowledgement'}`,
    { skip: process.platform !== 'darwin', timeout: 10000 },
    async (t) => {
      const dir = await mkdtemp(join(tmpdir(), 'hongguo-live-handshake-'));
      t.after(() => rm(dir, { recursive: true, force: true }));
      const server = createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      t.after(() => server.close());
      const file = join(dir, 'handshake');
      const deadline = Date.now() + 5000;
      const child = spawn(
        process.execPath,
        [
          new URL('../src/live-browser-wrapper.mjs', import.meta.url).pathname,
          '-e',
          'process.stdout.write(JSON.stringify({pid:process.pid,args:process.argv.slice(1)}))',
          'retained-argument',
        ],
        {
          env: {
            ...process.env,
            HONGGUO_LIVE_HANDSHAKE: file,
            HONGGUO_LIVE_NONCE: 'test-nonce',
            HONGGUO_LIVE_BROWSER: process.execPath,
            HONGGUO_LIVE_DEADLINE: String(deadline),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      t.after(() => child.kill('SIGKILL'));
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      const done = once(child, 'exit');
      let request;
      while (!request) {
        assert.ok(Date.now() < deadline, 'request was not published before the deadline');
        assert.equal(child.exitCode, null, stderr);
        try {
          request = JSON.parse(await readFile(file + '.request.json', 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await pause(10);
        }
      }
      assert.deepEqual(request, {
        nonce: 'test-nonce',
        origin: `http://127.0.0.1:${server.address().port}`,
        nshPid: process.pid,
      });
      await writeFile(
        file + '.ack.tmp',
        JSON.stringify({ nonce: matched ? request.nonce : 'wrong', origin: request.origin }),
      );
      await rename(file + '.ack.tmp', file + '.ack.json');
      const [code] = await done;
      if (matched) {
        assert.equal(code, 0, stderr);
        assert.deepEqual(JSON.parse(stdout), { pid: child.pid, args: ['retained-argument'] });
      } else {
        assert.notEqual(code, 0);
        assert.equal(stdout, '');
        assert.match(stderr, /Origin ACK differs/);
      }
    },
  );
}
