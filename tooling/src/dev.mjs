import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import {
  cargo,
  child,
  executable,
  nativeTarget,
  root,
  run,
  runtimeConfig,
  rustEnvironment,
} from './process.mjs';

async function freePort() {
  const server = createServer();
  await new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  const port = server.address().port;
  await new Promise((res, rej) => server.close((error) => (error ? rej(error) : res())));
  return port;
}
export async function ready(subprocess, timeoutMs = 15000) {
  const lines = createInterface({ input: subprocess.stdout });
  try {
    return await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Rust API startup timed out')), timeoutMs);
      const finish = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      subprocess.done.then(
        finish(() => rej(new Error('Rust API exited before readiness'))),
        finish(rej),
      );
      lines.on('line', (line) => {
        try {
          const event = JSON.parse(line);
          if (event.event !== 'ready') return;
          const url = new URL(event.origin);
          if (
            url.protocol !== 'http:' ||
            url.hostname !== '127.0.0.1' ||
            !url.port ||
            url.origin !== event.origin
          )
            throw new Error('Invalid API readiness origin');
          finish(res)(url.origin);
        } catch (error) {
          finish(rej)(error);
        }
      });
    });
  } finally {
    lines.close();
  }
}
export async function stop(subprocess) {
  if (!subprocess || subprocess.exitCode !== null || subprocess.signalCode) return;
  subprocess.kill('SIGTERM');
  let timer;
  try {
    await Promise.race([
      subprocess.done.catch(() => {}),
      new Promise((res) => {
        timer = setTimeout(() => {
          subprocess.kill('SIGKILL');
          res();
        }, 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function nativeDev(target, mode, base = root) {
  await runtimeConfig(target, undefined, base, mode);
  const host = child(
    executable('nsh'),
    ['run', ...(mode === 't0' ? ['T0Probe.tsx'] : []), '--target', nativeTarget(target)],
    { cwd: resolve(base, 'apps', target), env: rustEnvironment() },
  );
  let closing = false;
  const close = () => {
    closing = true;
    void stop(host);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    console.log(`Native ${target}: ${mode}; no computer API or adb reverse.`);
    await host.done;
  } catch (error) {
    if (!closing) throw error;
  } finally {
    await stop(host);
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
  }
}
export async function dev(target, mode) {
  if (mode !== 'http-preview') return nativeDev(target, mode);
  await cargo(['build', '--locked', '-p', 'hongguo-web-api']);
  const port = await freePort();
  const binary = resolve(
    root,
    'target/debug',
    process.platform === 'win32' ? 'hongguo-web-api.exe' : 'hongguo-web-api',
  );
  const api = child(
    binary,
    ['--allow-origin', `http://127.0.0.1:${port}`, '--data-dir', resolve(root, '.local/data/rust')],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  let host, reversePort;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await stop(host);
    await stop(api);
    if (reversePort) await run('adb', ['reverse', '--remove', `tcp:${reversePort}`]);
  };
  const onSignal = () => {
    void close().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const origin = await ready(api);
    await runtimeConfig(target, origin);
    if (target === 'tv') {
      reversePort = new URL(origin).port;
      await run('adb', ['reverse', `tcp:${reversePort}`, `tcp:${reversePort}`]);
    }
    if (closing) return;
    console.log(
      `Rust API ${origin}; UI http://127.0.0.1:${port}. Anonymous catalog, guest history and playback services ready; account migration pending.`,
    );
    host = child(
      executable('nsh'),
      ['run', '--target', nativeTarget(target), '--port', String(port)],
      { cwd: resolve(root, 'apps', target), env: rustEnvironment() },
    );
    await Promise.race([
      host.done,
      api.done.then(() => {
        throw new Error('Rust API stopped unexpectedly');
      }),
    ]);
  } catch (error) {
    if (!closing) throw error;
  } finally {
    await close();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
