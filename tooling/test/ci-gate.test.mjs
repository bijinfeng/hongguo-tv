import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../src/process.mjs';

// The `required` job decides whether a run may merge. Its script is embedded in the workflow,
// so it is extracted here and exercised against real result/selection combinations; a change
// that lets a needed-but-skipped gate through, or accepts a matrix run nobody needed, fails.

async function script() {
  const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  const match = /run: \|\n(\s+)python3 - <<'PY'\n([\s\S]*?)\n\s+PY/.exec(workflow);
  assert.ok(match, 'the required job runs an inline python gate');
  const indent = match[1].length;
  return match[2]
    .split('\n')
    .map((line) => (line.startsWith(' '.repeat(indent)) ? line.slice(indent) : line.trim()))
    .join('\n');
}

function run(scriptText, { results, selection }) {
  // Each gate arrives as its own environment variable, matching how the workflow passes them.
  const env = { ...process.env, SELECTION: JSON.stringify(selection) };
  for (const [name, result] of Object.entries(results))
    env[`${name.toUpperCase()}_RESULT`] = result;
  for (const name of ['scope', 'rust', 'workspace', 'entry', 'security'])
    env[`${name.toUpperCase()}_RESULT`] ??= 'skipped';
  return spawnSync('python3', ['-c', scriptText], { env, encoding: 'utf8' });
}

const passed = {
  scope: 'success',
  rust: 'success',
  workspace: 'success',
  entry: 'success',
  security: 'success',
};
const full = {
  rust: 'true',
  web: 'true',
  desktop: 'true',
  tv: 'true',
  entry: JSON.stringify({ include: [{ target: 'web', os: 'macos-15' }] }),
};
const docs = {
  rust: 'false',
  web: 'false',
  desktop: 'false',
  tv: 'false',
  entry: JSON.stringify({ include: [] }),
};

test('a full matrix that passed is accepted', async () => {
  const gate = await script();
  assert.equal(run(gate, { results: passed, selection: full }).status, 0);
});

test('a documentation-only run that skipped every build is accepted', async () => {
  const gate = await script();
  const results = { ...passed, rust: 'skipped', entry: 'skipped' };
  assert.equal(run(gate, { results, selection: docs }).status, 0);
});

test('a gate that was needed but did not run fails the run', async () => {
  const gate = await script();
  for (const skipped of [
    { ...passed, rust: 'skipped' },
    { ...passed, entry: 'skipped' },
    { ...passed, rust: 'skipped', entry: 'skipped' },
  ]) {
    assert.notEqual(
      run(gate, { results: skipped, selection: full }).status,
      0,
      JSON.stringify(skipped),
    );
  }
});

test('a failed gate fails the run', async () => {
  const gate = await script();
  for (const failed of [
    { ...passed, rust: 'failure' },
    { ...passed, entry: 'failure' },
    { ...passed, workspace: 'failure' },
    { ...passed, security: 'failure' },
  ]) {
    assert.notEqual(
      run(gate, { results: failed, selection: full }).status,
      0,
      JSON.stringify(failed),
    );
  }
});

test('an undecided scope fails the run', async () => {
  const gate = await script();
  assert.notEqual(
    run(gate, { results: { ...passed, scope: 'failure' }, selection: docs }).status,
    0,
  );
});

test('a run that did work the scope did not ask for fails the run', async () => {
  const gate = await script();
  // Both directions matter: skipping unneeded work is the optimisation, silently accepting a
  // mismatch in either direction would hide a broken selection.
  assert.notEqual(run(gate, { results: passed, selection: docs }).status, 0);
  const tvOnly = {
    rust: 'false',
    web: 'false',
    desktop: 'false',
    tv: 'true',
    entry: JSON.stringify({ include: [{ target: 'tv', os: 'macos-15' }] }),
  };
  assert.notEqual(run(gate, { results: passed, selection: tvOnly }).status, 0);
});

test('an entry matrix is built only from the selected targets', async () => {
  const { entryMatrix } = await import('../src/ci-paths.mjs');
  assert.deepEqual(entryMatrix({ web: false, desktop: false, tv: false }), []);
  assert.deepEqual(entryMatrix({ web: true, desktop: false, tv: false }), [
    { target: 'web', os: 'macos-15' },
  ]);
  assert.deepEqual(
    entryMatrix({ web: false, desktop: true, tv: false }).map((row) => row.os),
    ['macos-15', 'windows-2025', 'ubuntu-24.04'],
  );
  assert.deepEqual(entryMatrix({ web: true, desktop: false, tv: true }), [
    { target: 'web', os: 'macos-15' },
    { target: 'tv', os: 'macos-15' },
  ]);
});
