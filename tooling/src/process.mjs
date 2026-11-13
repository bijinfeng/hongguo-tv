import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const nshVersion = readFileSync(resolve(root, '.nsh-version'), 'utf8').trim();
export const rustVersion = readFileSync(resolve(root, 'rust-toolchain.toml'), 'utf8').match(
  /^channel = "([^"]+)"/m,
)[1];
const packageManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const pnpmVersion = packageManifest.packageManager.split('@')[1];
const nodeVersion = readFileSync(resolve(root, '.node-version'), 'utf8').trim();
export const targets = ['web', 'desktop', 'tv'];
export function parseArgs(args) {
  const [command, ...rest] = args;
  let target;
  if (rest.length) {
    if (rest.length !== 2 || rest[0] !== '--target' || !targets.includes(rest[1]))
      throw new Error('Expected --target web|desktop|tv');
    target = rest[1];
  }
  return { command, target };
}
export function nativeTarget(target, platform = process.platform) {
  if (!targets.includes(target)) throw new Error(`Unknown target: ${target}`);
  if (target === 'web') return 'web';
  if (target === 'tv') return 'android';
  const native = { darwin: 'macos', linux: 'linux', win32: 'windows' }[platform];
  if (!native) throw new Error(`Unsupported desktop: ${platform}`);
  return native;
}
export function executable(name, env = process.env) {
  const filename = process.platform === 'win32' ? `${name}.exe` : name;
  if (name === 'nsh' && env.NSH_BIN) return env.NSH_BIN;
  const candidates =
    name === 'nsh'
      ? ['.local/bin', '.nsh/bin'].map((dir) => resolve(homedir(), dir, filename))
      : [resolve(homedir(), '.cargo/bin', filename)];
  return candidates.find(existsSync) || filename;
}
/** Give NSH's Cargo subprocesses the same rustup tools the workspace resolves. */
export function rustEnvironment(env = process.env) {
  const cargo = executable('cargo', env);
  if (!isAbsolute(cargo)) return { ...env };
  const key =
    (process.platform === 'win32' &&
      Object.keys(env).find((key) => key.toUpperCase() === 'PATH')) ||
    'PATH';
  const bin = dirname(cargo);
  const paths = (env[key] || '').split(delimiter).filter(Boolean);
  return { ...env, [key]: [bin, ...paths.filter((path) => path !== bin)].join(delimiter) };
}
export function output(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')}: ${result.error?.message || result.stderr || `exit ${result.status}`}`,
    );
  return (result.stdout || result.stderr).trim();
}
export function child(command, args, options = {}) {
  const subprocess = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  subprocess.done = new Promise((res, rej) => {
    subprocess.once('error', rej);
    subprocess.once('exit', (code, signal) =>
      code === 0 ? res() : rej(new Error(`${command} exited: ${code ?? signal}`)),
    );
  });
  // Keep an early failure observed until its owner awaits it.
  subprocess.done.catch(() => {});
  return subprocess;
}
export async function run(command, args, options) {
  await child(command, args, options).done;
}
export const cargo = (args, options) => run(executable('cargo'), args, options);
export const pnpm = (args, options) =>
  run('pnpm', args, { shell: process.platform === 'win32', ...options });
export async function runtimeConfig(target, origin, base = root) {
  if (!targets.includes(target)) throw new Error(`Unknown target: ${target}`);
  const file = resolve(base, 'apps', target, 'runtime.generated.json');
  if (!origin) {
    try {
      const config = JSON.parse(await readFile(file, 'utf8'));
      const existing = new URL(config.coreOrigin);
      if (!['http:', 'https:'].includes(existing.protocol) || existing.origin !== config.coreOrigin)
        throw new Error(`Invalid runtime configuration: ${file}`);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    origin = 'http://127.0.0.1:18997';
  }
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('HONGGUO_CORE_ORIGIN must be an http(s) origin without a path');
  await mkdir(resolve(base, 'apps', target), { recursive: true });
  await writeFile(file, JSON.stringify({ coreOrigin: origin }, null, 2) + '\n');
}
export async function nsh(command, target, args = []) {
  const cli = executable('nsh');
  const version = output(cli, ['--version']);
  if (version.split(/\s+/)[1] !== nshVersion)
    throw new Error(`Expected NSH ${nshVersion}: ${version}`);
  await runtimeConfig(target);
  await run(cli, [command, ...args], {
    cwd: resolve(root, 'apps', target),
    env: rustEnvironment(),
  });
}
export function baseDoctor() {
  const results = [];
  for (const [name, check] of [
    [
      'node',
      () => {
        if (process.versions.node !== nodeVersion) throw new Error(`Expected Node ${nodeVersion}`);
        return process.version;
      },
    ],
    [
      'pnpm',
      () => {
        const v = output('pnpm', ['--version'], { shell: process.platform === 'win32' });
        if (v !== pnpmVersion) throw new Error(`Expected pnpm ${pnpmVersion}`);
        return v;
      },
    ],
    [
      'nsh',
      () => {
        const v = output(executable('nsh'), ['--version']);
        if (v.split(/\s+/)[1] !== nshVersion) throw new Error(`Expected NSH ${nshVersion}: ${v}`);
        return v;
      },
    ],
    [
      'rustc',
      () => {
        const v = output(executable('rustc'), ['--version']);
        if (v.split(' ')[1] !== rustVersion) throw new Error(`Expected Rust ${rustVersion}: ${v}`);
        return v;
      },
    ],
    ['cargo', () => output(executable('cargo'), ['--version'])],
  ]) {
    try {
      results.push({ name, ok: true, version: check() });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }
  return results;
}
