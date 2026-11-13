import { readFile, access, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
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

const tvToolchain = JSON.parse(readFileSync(resolve(root, 'tooling/tv-toolchain.json'), 'utf8'));

function androidSdk() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    resolve(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')
  );
}

function readRevision(file) {
  const text = readFileSync(file, 'utf8');
  return text.match(/^Pkg\.Revision\s*=\s*(.+)$/m)?.[1]?.trim() || 'unknown';
}

async function requireFile(file) {
  await access(file);
  return file;
}

const { command, target } = parseArgs(process.argv.slice(2));
const selected = target ? [target] : targets;
async function doctor({ requireDevice = true } = {}) {
  const results = baseDoctor();
  if (target === 'tv') {
    const sdk = androidSdk();
    const buildTools = resolve(sdk, 'build-tools', tvToolchain.android.buildTools);
    const ndk = resolve(sdk, 'ndk', tvToolchain.android.ndk);
    const runtime = resolve(homedir(), '.nsh', 'runtime', tvToolchain.nsh.runtime);
    const checks = [
      [
        'jdk',
        () => {
          const version = output('java', ['-version']);
          const javac = output('javac', ['-version']);
          if (!version.includes(`"${tvToolchain.jdk.version}"`))
            throw new Error(`Expected JDK ${tvToolchain.jdk.version}`);
          return `${version}; ${javac}`;
        },
      ],
      ['adb', () => output('adb', ['version'])],
      [
        'android-platform',
        async () => {
          const platform = resolve(sdk, 'platforms', tvToolchain.android.platform);
          await requireFile(resolve(platform, 'android.jar'));
          return `${platform} (${readRevision(resolve(platform, 'source.properties'))})`;
        },
      ],
      [
        'android-build-tools',
        async () => {
          for (const file of ['aapt2', 'zipalign', 'apksigner'])
            await requireFile(
              resolve(buildTools, process.platform === 'win32' ? `${file}.exe` : file),
            );
          return `${buildTools} (${readRevision(resolve(buildTools, 'source.properties'))})`;
        },
      ],
      [
        'android-ndk',
        async () => {
          await requireFile(resolve(ndk, 'source.properties'));
          return `${ndk} (${readRevision(resolve(ndk, 'source.properties'))})`;
        },
      ],
      [
        'rust-android-targets',
        () => {
          const installed = output(executable('rustup'), ['target', 'list', '--installed']).split(
            /\s+/,
          );
          const missing = tvToolchain.rustTargets.filter((name) => !installed.includes(name));
          if (missing.length) throw new Error(`Missing Rust targets: ${missing.join(', ')}`);
          return tvToolchain.rustTargets.join(', ');
        },
      ],
      [
        'nsh-android-runtime',
        async () => {
          const metadata = JSON.parse(
            await readFile(resolve(homedir(), '.nsh', 'components', 'android.json'), 'utf8'),
          );
          if (
            `${metadata.version}` !== tvToolchain.nsh.version ||
            metadata.commit !== tvToolchain.nsh.commit
          )
            throw new Error(
              `Expected NSH Android runtime ${tvToolchain.nsh.version} (${tvToolchain.nsh.commit})`,
            );
          for (const file of [
            'classes.dex',
            'lib/arm64-v8a/libnsh.so',
            'lib/armeabi-v7a/libnsh.so',
            'lib/x86_64/libnsh.so',
          ])
            await requireFile(resolve(runtime, file));
          return `${runtime} (${metadata.version}, ${metadata.commit})`;
        },
      ],
    ];
    if (requireDevice)
      checks.push([
        'android-device',
        () => {
          const devices = output('adb', ['devices', '-l'])
            .split('\n')
            .filter((line) => /^\S+\s+device\b/.test(line));
          if (devices.length !== 1)
            throw new Error(`Expected exactly one ready device, found ${devices.length}`);
          return devices[0];
        },
      ]);
    for (const [name, check] of checks) {
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
      if (
        !process.env.HONGGUO_CORE_ORIGIN &&
        !(target === 'tv' && existsSync(resolve(root, 'apps/tv/native/Cargo.toml')))
      )
        throw new Error(
          'Set HONGGUO_CORE_ORIGIN to an explicit backend origin; these are preview packages, native core embedding is pending.',
        );
      await doctor({ requireDevice: false });
      await runtimeConfig(target, process.env.HONGGUO_CORE_ORIGIN);
      await nsh('check', target);
      await nsh('build', target);
      if (target === 'tv' && !process.env.HONGGUO_CORE_ORIGIN)
        console.log(
          'Packaging the Android TV T0 technical APK; content API migration is not included.',
        );
      else console.log('Packaging a UI preview requiring the configured external Rust API.');
      await nsh('package', target, [
        '--target',
        nativeTarget(target),
        ...(target === 'tv' ? ['--abi', 'arm64-v8a'] : []),
      ]);
      break;
    default:
      throw new Error(`Unknown command: ${command || '(missing)'}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
