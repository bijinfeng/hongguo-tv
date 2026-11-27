import { readFile, access, mkdir, rm, appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  baseDoctor,
  cargo,
  executable,
  nativeTarget,
  nsh,
  output,
  parallel,
  parseArgs,
  pnpm,
  prepareNsh,
  nshSpec,
  products,
  root,
  run,
  runtimeConfig,
  runtimeMode,
  targets,
} from './process.mjs';
import { boundaries } from './boundaries.mjs';
import { entryMatrix, selectJobs } from './ci-paths.mjs';
import { codegen } from './codegen.mjs';
import { designTokens } from './design-tokens.mjs';
import { dev } from './dev.mjs';
import { fixtureDev } from './fixture-dev.mjs';
import { packageTvHost, tvHostEnvironment } from './tv-host.mjs';

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

const { command, target, entry } = parseArgs(process.argv.slice(2));
const selected = target ? [target] : targets;
/**
 * `dev` and `package` run and ship a product; the harness only exists to be tested, so asking
 * for it here is a mistake worth naming rather than a build nobody asked for.
 */
function requireProduct(command) {
  if (!target) throw new Error(`${command} requires --target desktop|tv`);
  if (!products.includes(target))
    throw new Error(`${command} needs a product target (${products.join('|')}), not ${target}`);
}
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
        'tv-host',
        async () => {
          tvHostEnvironment();
          const wrapper = await readFile(
            resolve(root, 'apps/tv/android/gradle/wrapper/gradle-wrapper.properties'),
            'utf8',
          );
          if (!/^distributionSha256Sum=[a-f0-9]{64}$/m.test(wrapper))
            throw new Error('TV Gradle distribution checksum is missing');
          output('curl', ['--version']);
          output('unzip', ['-v']);
          return 'JDK 17, curl, unzip, pinned Gradle wrapper';
        },
      ],
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
    'DESIGN.md',
    'THIRD_PARTY_NOTICES.md',
    // The four contracts live here now; without this the format gate stops covering them.
    // History is frozen evidence and keeps whatever formatting it was written with.
    'docs/**/*.md',
    '!docs/history/**',
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
  // Clippy drives the same type-check pass, so a separate `cargo check` only compiles twice.
  await cargo(['clippy', '--locked', '--workspace', '--all-targets', '--', '-D', 'warnings']);
  for (const app of selected) await prepareNsh(app);
  await parallel(selected.map((app) => nshSpec('check', app)));
};
const build = async () => {
  await cargo(['build', '--locked', '--workspace']);
  for (const app of selected) await prepareNsh(app);
  await parallel(selected.map((app) => nshSpec('build', app)));
};
const test = async () => {
  await run(process.execPath, ['--test', 'tooling/test/*.test.mjs']);
  await cargo(['nextest', 'run', '--locked', '--workspace']);
  await cargo(['test', '--locked', '--workspace', '--doc']);
  // Each app's suite owns its fixtures, ports and temp storage, so the apps run at once: the
  // three suites took four minutes in series and two when run together, with no shared state.
  for (const app of selected) await prepareNsh(app);
  await parallel(selected.map((app) => nshSpec('test', app)));
};
try {
  switch (command) {
    case 'doctor':
      await doctor();
      break;
    case 'setup':
      // Prepare a target for development: toolchain, runtime config, and the NSH checks that
      // read it. The workspace `cargo check` this used to run belongs to `pnpm check`, which
      // already runs clippy over the same targets — a cold 400s in CI for nothing.
      await doctor();
      for (const app of selected) {
        await runtimeConfig(app);
        await nsh('check', app);
      }
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
    case 'prepare':
      // Writes the gitignored runtime config the app entry imports. CI runs `nsh test` directly
      // (ci.yml, "Behavior in <target>"), which skips `nsh check`/`build` — the commands that
      // would otherwise write this file — so the job calls `pnpm setup:runtime` first.
      for (const app of selected) await runtimeConfig(app);
      break;
    case 'dev':
      // `dev` runs the code, not a release: the harness is the development surface now, so it is
      // allowed here while `package` still refuses it (the harness never ships).
      if (!target) throw new Error('dev requires --target harness|desktop|tv');
      await doctor();
      await dev(target, runtimeMode(target), entry);
      break;
    case 'dev:fixture':
      requireProduct('dev:fixture');
      await doctor();
      await fixtureDev(target);
      break;
    case 'api':
      await cargo([
        'run',
        '--locked',
        '-p',
        'hongguo-core-api',
        '--',
        '--data-dir',
        resolve(root, '.local/data/rust'),
      ]);
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
      await designTokens(true);
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
    case 'ci:jobs': {
      // Writes `rust`, `desktop` and `tv` as GitHub Actions step outputs. Skipped jobs
      // can only come from paths whose reach is provably limited; anything else is the full
      // matrix, so a wrong guess fails safe towards running more.
      const selection = await selectJobs({
        base: process.env.CI_BASE_SHA,
        head: process.env.CI_HEAD_SHA || 'HEAD',
        cwd: root,
      });
      const outputs = Object.entries(selection).map(([name, needed]) => `${name}=${needed}`);
      // `entry` cannot branch on `matrix` in a job-level `if`, so its matrix is decided here.
      const matrix = entryMatrix(selection, { event: process.env.GITHUB_EVENT_NAME });
      outputs.push(`entry=${JSON.stringify({ include: matrix })}`);
      if (process.env.GITHUB_OUTPUT)
        await appendFile(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
      console.log(JSON.stringify({ ...selection, entry: matrix }));
      break;
    }
    case 'package':
      requireProduct('package');
      {
        const mode = runtimeMode(target);
        if (mode === 'http-preview' && !process.env.HONGGUO_CORE_ORIGIN)
          throw new Error('HTTP preview packages require explicit HONGGUO_CORE_ORIGIN');
        await doctor({ requireDevice: false });
        await runtimeConfig(target, process.env.HONGGUO_CORE_ORIGIN, root, mode);
        const entry = mode === 't0' ? ['T0Probe.tsx'] : [];
        await nsh('check', target);
        await rm(resolve(root, 'apps', target, '.nsh/out'), { recursive: true, force: true });
        await nsh('build', target, entry);
        console.log(`Packaging ${target}: ${mode}`);
        await nsh('package', target, [
          ...entry,
          '--target',
          nativeTarget(target),
          ...(target === 'tv' ? ['--abi', 'arm64-v8a'] : []),
        ]);
      }
      if (target === 'tv') await packageTvHost();
      break;
    default:
      throw new Error(`Unknown command: ${command || '(missing)'}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
