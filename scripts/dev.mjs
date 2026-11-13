import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildCore, coreVersion, nshPath, root, appDir, run, runtimeConfig } from './toolchain.mjs';
import { startGateway } from './gateway.mjs';

const targetIndex = process.argv.indexOf('--target');
const target =
  targetIndex < 0
    ? { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform]
    : process.argv[targetIndex + 1];
if (!['web', 'macos', 'android', 'linux', 'windows'].includes(target))
  throw new Error(`Unsupported target: ${target}`);
const freePort = async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};
let core, host, gateway, reversePort;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  host?.kill('SIGTERM');
  core?.kill('SIGTERM');
  await gateway?.close();
  if (reversePort) await run('adb', ['reverse', '--remove', `tcp:${reversePort}`]).catch(() => {});
}
process.on('SIGINT', () => {
  void close();
});
process.on('SIGTERM', () => {
  void close();
});
try {
  const binary = await buildCore();
  const instance = randomUUID();
  core = spawn(
    binary,
    [
      '--port',
      '0',
      '--instance-id',
      instance,
      '--parent-pid',
      String(process.pid),
      '--data-dir',
      resolve(root, '.local/data'),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const corePort = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      core.kill();
      reject(new Error('Core startup timed out'));
    }, 15000);
    core.once('error', reject);
    core.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Core exited: ${code}`));
    });
    core.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/HONGGUO_TV_READY (\d+) (\S+)/);
      if (match && match[2] === instance) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
  });
  const coreOrigin = `http://127.0.0.1:${corePort}`;
  const status = await fetch(`${coreOrigin}/api/v1/status`).then((r) => r.json());
  if (status.instance_id !== instance || status.version !== coreVersion)
    throw new Error('Unexpected core identity/version');
  core.once('exit', (code) => {
    if (!closing) {
      console.error(`Core stopped unexpectedly: ${code}`);
      process.exitCode = 1;
      void close();
    }
  });
  const devPort = await freePort();
  gateway = await startGateway({
    coreOrigin,
    allowedOrigins: [`http://127.0.0.1:${devPort}`, `http://localhost:${devPort}`],
  });
  await runtimeConfig(gateway.origin);
  if (target === 'android') {
    await run('adb', [
      'reverse',
      `tcp:${new URL(gateway.origin).port}`,
      `tcp:${new URL(gateway.origin).port}`,
    ]);
    reversePort = new URL(gateway.origin).port;
  }
  console.log(`Core ${coreVersion}; gateway ${gateway.origin}; UI http://127.0.0.1:${devPort}`);
  host = spawn(
    nshPath(),
    [
      'run',
      '--target',
      target,
      '--port',
      String(devPort),
      ...(target === 'macos' ? ['--window-size', '1180x780'] : []),
    ],
    { cwd: appDir, stdio: 'inherit' },
  );
  await new Promise((resolve, reject) => {
    host.once('error', reject);
    host.once('exit', (code) =>
      code === 0 || closing ? resolve() : reject(new Error(`NSH exited: ${code}`)),
    );
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await close();
}
