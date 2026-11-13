import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
// Keep the legacy Go-backed commands runnable without retaining the old root demo.
export const legacyUiDir = resolve(root, 'apps/web');
export const coreVersion = 'nsh-poc-de9712bf358d';
export const nshVersion = readFileSync(resolve(root, '.nsh-version'), 'utf8').trim();
export function nshPath() {
  const name = process.platform === 'win32' ? 'nsh.exe' : 'nsh';
  const candidates = [
    resolve(homedir(), '.local/bin', name),
    resolve(homedir(), '.nsh/bin', name),
    '/opt/homebrew/bin/nsh',
  ];
  const executable = process.env.NSH_BIN || candidates.find(existsSync) || name;
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(
      `Cannot run ${executable}; install NSH ${nshVersion} or set NSH_BIN. See README.md.`,
    );
  if (result.stdout.trim().split(/\s+/)[1] !== nshVersion)
    throw new Error(`Expected NSH ${nshVersion}, received ${result.stdout.trim()}`);
  return executable;
}
export async function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited: ${code ?? signal}`)),
    );
  });
}
export async function runtimeConfig(coreOrigin) {
  await mkdir(legacyUiDir, { recursive: true });
  const target = resolve(legacyUiDir, 'runtime.generated.json');
  if (!coreOrigin && existsSync(target)) return;
  await writeFile(
    target,
    JSON.stringify({ coreOrigin: coreOrigin ?? 'http://127.0.0.1:18997' }, null, 2) + '\n',
  );
}
export async function buildCore() {
  const target = resolve(
    root,
    '.local',
    process.platform === 'win32' ? 'hongguo-core.exe' : 'hongguo-core',
  );
  await mkdir(resolve(root, '.local'), { recursive: true });
  await run(
    'go',
    [
      'build',
      '-trimpath',
      '-ldflags',
      `-X main.version=${coreVersion}`,
      '-o',
      target,
      './core/cmd/hongguotv',
    ],
    {
      cwd: resolve(root, 'upstream/hongguo'),
    },
  );
  return target;
}
export async function upstreamLock() {
  return JSON.parse(await readFile(resolve(root, 'upstream.lock.json'), 'utf8'));
}
