import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  all,
  classify,
  combine,
  none,
  select,
  changedPaths,
  selectJobs,
} from '../src/ci-paths.mjs';

const isolatedGitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, env: isolatedGitEnv, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function repository() {
  const dir = await mkdtemp(resolve(tmpdir(), 'hongguo-ci-paths-'));
  git(dir, 'init', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  return dir;
}

test('documentation is the only class that skips every build job', () => {
  for (const path of [
    'docs/playback-v5.md',
    'docs/history/2026-11-20/gate-and-release.md',
    'design/prototype/visual-redesign-real/shared/icons.js',
    'openspec/specs/playback/spec.md',
    'upstream/hongguo/core/cmd/hongguotv/minireel.go',
    'README.md',
    'PRODUCT.md',
    'THIRD_PARTY_NOTICES.md',
    'LICENSE',
  ]) {
    assert.deepEqual(classify(path), none, path);
  }
});

test('an app reaches its own target and never another', () => {
  assert.deepEqual(classify('apps/web/App.tsx'), {
    rust: false,
    web: true,
    desktop: false,
    tv: false,
  });
  assert.deepEqual(classify('apps/desktop/App.test.tsx'), {
    rust: false,
    web: false,
    desktop: true,
    tv: false,
  });
  assert.deepEqual(classify('apps/tv/fixtures/t0-a.mp4'), {
    rust: false,
    web: false,
    desktop: false,
    tv: true,
  });
});

test('a native crate still needs the Rust matrix', () => {
  for (const path of ['apps/desktop/native/src/lib.rs', 'apps/tv/native/src/lib.rs']) {
    assert.deepEqual(classify(path), { rust: true, web: false, desktop: false, tv: false }, path);
  }
});

test('shared inputs stay on the full matrix', () => {
  for (const path of [
    'packages/app/src/playback.ts',
    'packages/ui/src/player.tsx',
    'packages/contracts/src/generated.ts',
    'crates/core/src/playback/sign_v5.rs',
    'crates/http-api/src/playback.rs',
    'services/web-api/src/main.rs',
    'tooling/src/cli.mjs',
    'contracts/openapi.json',
    'Cargo.lock',
    'pnpm-lock.yaml',
    '.nsh-version',
    'rust-toolchain.toml',
    '.github/workflows/ci.yml',
    'package.json',
    'AGENTS.md',
    '',
  ]) {
    assert.equal(classify(path), null, path);
  }
});

test('a mix of paths merges, and one undecidable path restores the full matrix', () => {
  assert.deepEqual(combine([classify('apps/web/App.tsx'), classify('docs/README.md')]), {
    rust: false,
    web: true,
    desktop: false,
    tv: false,
  });
  assert.equal(combine([classify('apps/web/App.tsx'), classify('crates/core/src/lib.rs')]), all);
});

test('an empty selection never silently skips the matrix', () => {
  assert.equal(select([]), all);
  assert.equal(select(undefined), all);
  assert.deepEqual(select(['apps/tv/App.tsx']), {
    rust: false,
    web: false,
    desktop: false,
    tv: true,
  });
});

test('a commit range reports the paths it touched', async () => {
  const dir = await repository();
  try {
    await writeFile(resolve(dir, 'a.txt'), 'a');
    git(dir, 'add', 'a.txt');
    git(dir, 'commit', '-m', 'first');
    const base = git(dir, 'rev-parse', 'HEAD').trim();
    await writeFile(resolve(dir, 'b.txt'), 'b');
    git(dir, 'add', 'b.txt');
    git(dir, 'commit', '-m', 'second');
    assert.deepEqual(await changedPaths({ base, cwd: dir }), ['b.txt']);
    assert.deepEqual(await selectJobs({ base, cwd: dir }), all);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a first push without a base describes its own commits', async () => {
  const dir = await repository();
  try {
    git(dir, 'checkout', '-b', 'docs-only');
    await writeFile(resolve(dir, 'README.md'), 'docs');
    git(dir, 'add', 'README.md');
    git(dir, 'commit', '-m', 'docs only');
    assert.deepEqual(await changedPaths({ base: '0'.repeat(40), cwd: dir }), ['README.md']);
    assert.deepEqual(await selectJobs({ base: '0'.repeat(40), cwd: dir }), none);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unavailable Git range keeps the full matrix', async () => {
  assert.equal(await selectJobs({ base: 'not-a-sha', cwd: resolve(tmpdir(), 'missing') }), all);
});
