/**
 * The scaffolding shared by the harness host suites.
 *
 * Six suites under `apps/harness` build the same three pieces before calling `nsh test`: a `.nsh`
 * entry that mounts `@hongguo/app` against a fixture origin, a sibling `.test.tsx` that hands the
 * artifacts directory to a register function exported from `@hongguo/app/testing`, and the run
 * itself with `--foreground` / `--filter` passed through. The bodies were identical apart from the
 * register name and the target flag, so they live here once.
 *
 * What stays with each suite is its fixture and whatever it asserts afterwards — that part really
 * does differ, and centralising it would mean inventing a vocabulary for evidence no two suites
 * share.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, root, run, rustEnvironment } from './process.mjs';

/** Where the host entries are written. One directory shared by every suite. */
const APPLICATION = resolve(root, 'apps/harness');

/**
 * Builds the mount entry for a suite. Every fixture-backed host renders the same desktop App; the
 * suite differs only in what its test file asserts.
 *
 * Exported so it can be tested as a string rather than through a filesystem and a real `nsh test`.
 */
export function mountEntry(origin) {
  return `import {mount} from 'nsh';
import {App} from '@hongguo/app';
import {configureClient} from '@hongguo/core-client';
import logoMark from '../assets/hongguo-logo.png';
configureClient(${JSON.stringify(origin)});
mount(() => <App target="desktop" logoMark={logoMark} />);
`;
}

/** The test file that registers a suite's assertions against the entry above. */
export function testEntry({ register, module, name, artifacts, host }) {
  return `import {${register}} from '@hongguo/app/testing/${module}';
${register}('./${name}.tsx', ${JSON.stringify(artifacts)}, '${host}');
`;
}

/** The `nsh test` arguments for one suite. `headless` has no value for `--target`. */
export function hostSuiteArgs({ name, host, headless, foreground, filter }) {
  return [
    'test',
    `.nsh/${name}.test.tsx`,
    ...(headless ? [] : ['--target', host]),
    ...(foreground ? ['--foreground'] : []),
    ...(filter ? ['--filter', filter] : []),
  ];
}

/**
 * Writes the entry and test files, then runs them.
 *
 * @param {object} config
 * @param {string} config.name       Prefix for the generated files, e.g. `RadarHost-web`.
 * @param {string} config.register   Exported register function, e.g. `registerRadarHostTests`.
 * @param {string} config.module     Testing module that exports it, e.g. `radar-host`.
 * @param {string} config.host       `headless` | `web` | `macos` | `android`.
 * @param {string} config.origin     Fixture origin the client is configured against.
 * @param {string} config.artifacts  Absolute artifacts directory, already created by the caller.
 * @param {boolean} [config.foreground]
 * @param {string} [config.filter]
 * @param {boolean} [config.headless] Runs without `--target`, which headless has no value for.
 */
export async function runHostSuite({
  name,
  register,
  module,
  host,
  origin,
  artifacts,
  foreground,
  filter,
  headless = false,
}) {
  await mkdir(resolve(APPLICATION, '.nsh'), { recursive: true });
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(APPLICATION, `.nsh/${name}.tsx`), mountEntry(origin));
  await writeFile(
    resolve(APPLICATION, `.nsh/${name}.test.tsx`),
    testEntry({ register, module, name, artifacts, host }),
  );
  await run(executable('nsh'), hostSuiteArgs({ name, host, headless, foreground, filter }), {
    cwd: APPLICATION,
    env: rustEnvironment(),
  });
}
