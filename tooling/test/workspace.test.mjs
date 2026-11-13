import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boundaries } from '../src/boundaries.mjs';
import {
  nativeTarget,
  parseArgs,
  runtimeConfig,
  runtimeMode,
  root,
  child,
  rustEnvironment,
  rustVersion,
} from '../src/process.mjs';
import { ready, stop, nativeDev } from '../src/dev.mjs';
import { hookArgs } from '../src/lefthook.mjs';
import { tvBuildType } from '../src/tv-host.mjs';

async function temp(fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'hongguo-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('target selection rejects unsupported targets and malformed options', () => {
  assert.deepEqual(parseArgs(['check', '--target', 'web']), { command: 'check', target: 'web' });
  for (const args of [
    ['dev', '--target'],
    ['dev', '--target', '../app'],
    ['check', '--fix'],
  ])
    assert.throws(() => parseArgs(args));
  assert.equal(nativeTarget('desktop', 'darwin'), 'macos');
  assert.equal(nativeTarget('desktop', 'win32'), 'windows');
  assert.equal(nativeTarget('tv'), 'android');
  assert.throws(() => nativeTarget('desktop', 'freebsd'));
});

test('TV host build type is explicit and fail-closed', () => {
  assert.equal(tvBuildType({}), 'debug');
  assert.equal(tvBuildType({ HONGGUO_TV_BUILD_TYPE: 'release' }), 'release');
  assert.throws(
    () => tvBuildType({ HONGGUO_TV_BUILD_TYPE: 'profile' }),
    /must be debug or release/,
  );
});

test('NSH child environment finds Cargo without changing the caller PATH', () =>
  temp(async (dir) => {
    const key = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
    const env = { ...process.env, [key]: dir, RUSTUP_TOOLCHAIN: rustVersion };
    const snapshot = { ...env };
    const resolved = rustEnvironment(env);
    assert.deepEqual(env, snapshot);
    assert.equal(resolved[key].endsWith(dir), true);
    assert.deepEqual(rustEnvironment(resolved), resolved);
    const result = spawnSync('cargo', ['--version'], { env: resolved, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, new RegExp(`^cargo ${rustVersion.replaceAll('.', '\\.')}`));
  }));

test('runtime setup preserves existing configuration and never touches data', () =>
  temp(async (dir) => {
    await mkdir(resolve(dir, '.local/data'), { recursive: true });
    await writeFile(resolve(dir, '.local/data/sentinel'), 'preserve');
    await runtimeConfig('web', 'http://127.0.0.1:18000', dir);
    await runtimeConfig('web', undefined, dir);
    assert.equal(
      JSON.parse(await readFile(resolve(dir, 'apps/web/runtime.generated.json'))).coreOrigin,
      'http://127.0.0.1:18000',
    );
    await assert.rejects(runtimeConfig('web', 'file:///private/data', dir));
    await assert.rejects(runtimeConfig('web', 'http://localhost:123/path', dir));
    await assert.rejects(runtimeConfig('../other', undefined, dir));
    assert.equal(await readFile(resolve(dir, '.local/data/sentinel'), 'utf8'), 'preserve');
  }));

test('native modes exclude computer addresses and previews require an explicit selection', () =>
  temp(async (dir) => {
    assert.equal(runtimeMode('desktop', {}), 'native');
    assert.equal(runtimeMode('tv', {}), 'native');
    assert.equal(runtimeMode('web', {}), 'http-preview');
    assert.equal(runtimeMode('tv', { HONGGUO_RUNTIME_MODE: 't0' }), 't0');
    assert.equal(
      runtimeMode('tv', { HONGGUO_CORE_ORIGIN: 'http://127.0.0.1:18000' }),
      'http-preview',
    );
    for (const [target, env] of [
      ['tv', { HONGGUO_RUNTIME_MODE: 'unknown' }],
      ['web', { HONGGUO_RUNTIME_MODE: 'native' }],
      ['desktop', { HONGGUO_RUNTIME_MODE: 't0' }],
      ['tv', { HONGGUO_RUNTIME_MODE: 'native', HONGGUO_CORE_ORIGIN: 'http://127.0.0.1:18000' }],
    ])
      assert.throws(() => runtimeMode(target, env));
    const file = resolve(dir, 'apps/tv/runtime.generated.json');
    await runtimeConfig('tv', 'http://127.0.0.1:18000', dir);
    await runtimeConfig('tv', undefined, dir, 'native');
    assert.deepEqual(JSON.parse(await readFile(file)), { mode: 'native' });
    await runtimeConfig('tv', undefined, dir);
    assert.deepEqual(JSON.parse(await readFile(file)), { mode: 'native' });
    await assert.rejects(runtimeConfig('tv', undefined, dir, 'http-preview'));
    await assert.rejects(runtimeConfig('tv', 'http://127.0.0.1:18000', dir, 'native'));
    for (const value of [
      {},
      { mode: 'unknown' },
      { mode: 'native', secret: 'extra' },
      { mode: false },
      { mode: 0 },
      { mode: '' },
      { mode: 'native', coreOrigin: false },
    ]) {
      await writeFile(file, JSON.stringify(value));
      await assert.rejects(runtimeConfig('tv', undefined, dir));
    }
  }));

test('package boundaries prevent reverse imports and cross-package relative escapes', () =>
  temp(async (dir) => {
    for (const name of ['app', 'ui', 'core-client', 'contracts'])
      await mkdir(resolve(dir, 'packages', name, 'src'), { recursive: true });
    const file = resolve(dir, 'packages/ui/src/index.ts');
    await writeFile(file, 'export const value = 1;\n');
    await boundaries(dir);
    for (const specifier of ['@hongguo/app', '../../app/src/index', 'node:fs', 'react']) {
      await writeFile(file, `import x from '${specifier}';\n`);
      await assert.rejects(boundaries(dir), /forbidden dependency/);
    }
    await boundaries();
  }));

test('API process readiness validates its address, fails early, and cleans up', async () => {
  const api = child(
    process.execPath,
    [
      '-e',
      'console.log(JSON.stringify({event:"ready",origin:"http://127.0.0.1:12345"}));setInterval(()=>{},1000)',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    assert.equal(await ready(api), 'http://127.0.0.1:12345');
  } finally {
    await stop(api);
  }
  assert.ok(api.signalCode || api.exitCode !== null);
  const early = child(process.execPath, ['-e', 'process.exit(2)'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await assert.rejects(ready(early), /exited/);
  const invalid = child(
    process.execPath,
    ['-e', 'console.log(JSON.stringify({event:"ready",origin:"https://evil.test"}))'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await assert.rejects(ready(invalid), /Invalid API/);
  await stop(invalid);
});

test('native dev propagates host failure and cleans up its only child on shutdown', () =>
  temp(async (dir) => {
    const previous = process.env.NSH_BIN;
    process.env.NSH_BIN = process.execPath;
    const cwd = resolve(dir, 'apps/desktop');
    const marker = resolve(dir, 'host.json');
    await mkdir(cwd, { recursive: true });
    const entry = resolve(cwd, 'run');
    const counts = ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name));
    const record =
      "require('node:fs').writeFileSync('../../host.json',JSON.stringify({pid:process.pid,args:process.argv.slice(2)}));";
    let running;
    try {
      await writeFile(entry, record + 'process.exit(7);');
      await assert.rejects(nativeDev('desktop', 'native', dir), /exited: 7/);
      assert.deepEqual(JSON.parse(await readFile(marker)).args, [
        '--target',
        nativeTarget('desktop'),
      ]);
      assert.deepEqual(JSON.parse(await readFile(resolve(cwd, 'runtime.generated.json'))), {
        mode: 'native',
      });
      await rm(marker);
      await writeFile(entry, record + 'setInterval(()=>{},1000);');
      running = nativeDev('desktop', 'native', dir);
      // The child reports actual readiness; never infer it from an arbitrary delay.
      let state;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          state = JSON.parse(await readFile(marker));
          break;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await new Promise((done) => setTimeout(done, 20));
      }
      assert.ok(state, 'native host did not start');
      process.emit('SIGTERM');
      await running;
      running = undefined;
      assert.throws(() => process.kill(state.pid, 0), { code: 'ESRCH' });
      assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)),
        counts,
      );
    } finally {
      if (running) {
        process.emit('SIGTERM');
        await running;
      }
      if (previous === undefined) delete process.env.NSH_BIN;
      else process.env.NSH_BIN = previous;
    }
  }));

test('commit rules accept conventional commits and hooks never change partial staging', () =>
  temp(async (dir) => {
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    git(['init', '--quiet']);
    await writeFile(resolve(dir, 'sample.txt'), 'staged\n');
    git(['add', 'sample.txt']);
    await writeFile(resolve(dir, 'sample.txt'), 'staged\nunstaged\n');
    const staged = git(['diff', '--cached', '--binary']);
    const unstaged = git(['diff', '--binary']);
    const hook = resolve(root, 'node_modules/.bin/commitlint');
    for (const [message, valid] of [
      ['feat(core): add status', true],
      ['bad message', false],
    ]) {
      const result = spawnSync(hook, ['--config', resolve(root, 'commitlint.config.mjs')], {
        cwd: dir,
        encoding: 'utf8',
        input: message + '\n',
        shell: process.platform === 'win32',
      });
      assert.equal(result.status === 0, valid, result.stderr || result.stdout);
    }
    assert.equal(git(['diff', '--cached', '--binary']), staged);
    assert.equal(git(['diff', '--binary']), unstaged);
    const config = await readFile(resolve(root, 'lefthook.yml'), 'utf8');
    assert.doesNotMatch(config, /git\s+(?:add|stash|reset)|stage_fixed|--fix/);
  }));

test('installed hook wrapper never hides unstaged content or creates a stash', () =>
  temp(async (dir) => {
    const exec = (command, args, valid = true) => {
      const result = spawnSync(command, args, { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status === 0, valid, result.stdout + result.stderr);
      return result.stdout;
    };
    exec('git', ['init', '--quiet']);
    await writeFile(resolve(dir, 'sample.txt'), 'staged\n');
    exec('git', ['add', 'sample.txt']);
    await writeFile(resolve(dir, 'sample.txt'), 'staged\nunstaged\n');
    const staged = exec('git', ['diff', '--cached', '--binary']);
    const unstaged = exec('git', ['diff', '--binary']);
    await mkdir(resolve(dir, 'tooling/src'), { recursive: true });
    await writeFile(
      resolve(dir, 'tooling/src/lefthook.mjs'),
      await readFile(resolve(root, 'tooling/src/lefthook.mjs')),
    );
    await symlink(
      resolve(root, 'node_modules'),
      resolve(dir, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await writeFile(resolve(dir, 'package.json'), '{"private":true}');
    await writeFile(
      resolve(dir, 'commitlint.config.mjs'),
      await readFile(resolve(root, 'commitlint.config.mjs')),
    );
    const config = (await readFile(resolve(root, 'lefthook.yml'), 'utf8')).replace(
      'pnpm hooks:check',
      'node visible.cjs',
    );
    await writeFile(resolve(dir, 'lefthook.yml'), config);
    await writeFile(
      resolve(dir, 'visible.cjs'),
      "require('node:assert/strict').equal(require('node:fs').readFileSync('sample.txt','utf8'),'staged\\nunstaged\\n');\n",
    );
    const wrapper = resolve(dir, 'tooling/src/lefthook.mjs');
    exec(process.execPath, [wrapper, 'install']);
    assert.match(
      await readFile(resolve(dir, '.git/hooks/pre-commit'), 'utf8'),
      /node tooling\/src\/lefthook\.mjs/,
    );
    exec(process.execPath, [wrapper, 'run', 'pre-commit']);
    await writeFile(resolve(dir, 'visible.cjs'), 'process.exitCode = 1;\n');
    exec(process.execPath, [wrapper, 'run', 'pre-commit'], false);
    const message = resolve(dir, 'message.txt');
    for (const [text, valid] of [
      ['feat(core): test hook', true],
      ['bad message', false],
    ]) {
      await writeFile(message, text + '\n');
      exec(process.execPath, [wrapper, 'run', 'commit-msg', message], valid);
    }
    assert.equal(exec('git', ['diff', '--cached', '--binary']), staged);
    assert.equal(exec('git', ['diff', '--binary']), unstaged);
    assert.equal(exec('git', ['stash', 'list']), '');
    assert.ok(hookArgs(['run', 'pre-commit']).includes('--no-stage-fixed'));
  }));
