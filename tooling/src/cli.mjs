import { readFile, access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  baseDoctor,
  cargo,
  executable,
  nativeTarget,
  nsh,
  output,
  parseArgs,
  pnpm,
  root,
  run,
  runtimeConfig,
  targets,
} from './process.mjs';
import { boundaries } from './boundaries.mjs';
import { codegen } from './codegen.mjs';
import { dev } from './dev.mjs';

const { command, target } = parseArgs(process.argv.slice(2));
const selected = target ? [target] : targets;
async function doctor() {
  const results = baseDoctor();
  if (target === 'tv') {
    for (const [name, check] of [
      ['java', () => output('java', ['-version'])],
      ['adb', () => output('adb', ['version'])],
      [
        'android-build-tools',
        async () => {
          const sdk =
            process.env.ANDROID_HOME ||
            process.env.ANDROID_SDK_ROOT ||
            resolve(
              homedir(),
              process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk',
            );
          await access(
            resolve(
              sdk,
              'build-tools/35.0.1',
              process.platform === 'win32' ? 'aapt2.exe' : 'aapt2',
            ),
          );
          return sdk;
        },
      ],
    ]) {
      try {
        results.push({ name, ok: true, version: await check() });
      } catch (error) {
        results.push({ name, ok: false, error: error.message });
      }
    }
  }
  console.log(JSON.stringify({ target: target || 'portable', checks: results }, null, 2));
  if (results.some((result) => !result.ok))
    throw new Error('Toolchain prerequisites failed. See README.md.');
}
const fmt = async (check) => {
  await pnpm([
    'exec',
    'oxfmt',
    check ? '--check' : '--write',
    '--ignore-path',
    '.oxfmtignore',
    'apps',
    'packages',
    'app',
    'tooling',
    'scripts',
    'contracts',
    '.github/workflows',
    '.github/pull_request_template.md',
    '.vscode',
    'README.md',
    'AGENTS.md',
    'ARCHITECTURE.md',
    'ENGINEERING.md',
    'DESIGN.md',
    'VALIDATION.md',
    'package.json',
    'pnpm-workspace.yaml',
    'commitlint.config.mjs',
    'lefthook.yml',
    'renovate.json',
    'tsconfig.json',
    '.oxfmtrc.json',
    '.oxlintrc.json',
    '!**/.nsh/**',
    '!**/node_modules/**',
    '!**/runtime.generated.json',
    '!packages/contracts/src/generated.ts',
    '!contracts/openapi.json',
  ]);
  await cargo(['fmt', '--all', ...(check ? ['--', '--check'] : [])]);
};
const lint = async () => {
  await pnpm([
    'exec',
    'oxlint',
    '--deny-warnings',
    'apps',
    'packages',
    'app',
    'tooling',
    'scripts',
    'commitlint.config.mjs',
  ]);
  await boundaries();
};
const check = async () => {
  await cargo(['check', '--locked', '--workspace', '--all-targets']);
  await cargo(['clippy', '--locked', '--workspace', '--all-targets', '--', '-D', 'warnings']);
  for (const app of selected) await nsh('check', app);
};
const build = async () => {
  await cargo(['build', '--locked', '--workspace']);
  for (const app of selected) await nsh('build', app);
};
const test = async () => {
  await run(process.execPath, ['--test', 'tooling/test/*.test.mjs']);
  await cargo(['nextest', 'run', '--locked', '--workspace']);
  await cargo(['test', '--locked', '--workspace', '--doc']);
  for (const app of selected) await nsh('test', app);
};
try {
  switch (command) {
    case 'doctor':
      await doctor();
      break;
    case 'setup':
      await doctor();
      for (const app of selected) {
        await runtimeConfig(app);
        await nsh('check', app);
      }
      await cargo(['check', '--locked', '--workspace', '--all-targets']);
      console.log(
        'Workspace ready. pnpm setup:tools installs pinned Rust quality tools; pnpm hooks:install enables Git hooks.',
      );
      break;
    case 'setup:tools': {
      const tools = JSON.parse(await readFile(resolve(root, 'tooling/tools.json'), 'utf8'));
      for (const [name, version] of Object.entries(tools))
        await cargo(['install', '--locked', name, '--version', version]);
      await run(executable('rustup'), [
        'component',
        'add',
        'llvm-tools-preview',
        '--toolchain',
        '1.97.0',
      ]);
      break;
    }
    case 'dev':
      if (!target) throw new Error('dev requires --target');
      await doctor();
      await dev(target);
      break;
    case 'api':
      await cargo(['run', '--locked', '-p', 'hongguo-web-api']);
      break;
    case 'fmt':
      await fmt(false);
      break;
    case 'fmt:check':
      await fmt(true);
      break;
    case 'lint':
      await lint();
      break;
    case 'check':
      await check();
      break;
    case 'build':
      await build();
      break;
    case 'test:rust':
      await cargo(['nextest', 'run', '--locked', '--workspace']);
      await cargo(['test', '--locked', '--workspace', '--doc']);
      break;
    case 'test':
      await test();
      break;
    case 'verify':
      await doctor();
      await fmt(true);
      await lint();
      await codegen(true);
      await check();
      await build();
      await test();
      break;
    case 'coverage':
      await mkdir(resolve(root, 'coverage'), { recursive: true });
      await cargo([
        'llvm-cov',
        '--locked',
        '--workspace',
        '--all-targets',
        '--fail-under-lines',
        '75',
        '--lcov',
        '--output-path',
        'coverage/lcov.info',
      ]);
      break;
    case 'security':
      await cargo(['deny', '--locked', 'check']);
      await pnpm(['audit', '--audit-level', 'moderate']);
      break;
    case 'package':
      if (!target) throw new Error('package requires --target');
      if (!process.env.HONGGUO_CORE_ORIGIN)
        throw new Error(
          'Set HONGGUO_CORE_ORIGIN to an explicit backend origin; these are preview packages, native core embedding is pending.',
        );
      await doctor();
      await runtimeConfig(target, process.env.HONGGUO_CORE_ORIGIN);
      await nsh('check', target);
      await nsh('build', target);
      console.log('Packaging a UI preview requiring the configured external Rust API.');
      await nsh('package', target, ['--target', nativeTarget(target)]);
      break;
    default:
      throw new Error(`Unknown command: ${command || '(missing)'}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
