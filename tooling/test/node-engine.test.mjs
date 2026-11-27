import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { satisfies } from '../src/process.mjs';

test('engine range accepts every version at or above the declared floor', () => {
  const range = '>=24.2.0 <27';
  for (const version of ['24.2.0', '24.18.0', '25.7.0', '26.12.1', '26.13.1']) {
    assert.equal(satisfies(version, range), true, `${version} should satisfy ${range}`);
  }
  for (const version of ['22.23.1', '23.11.0', '24.1.0', '27.0.0']) {
    assert.equal(satisfies(version, range), false, `${version} should not satisfy ${range}`);
  }
});

test('a bound naming fewer components still compares the rest as zero', () => {
  assert.equal(satisfies('24.2.0', '>=24.2'), true);
  assert.equal(satisfies('24.1.9', '>=24.2'), false);
});

test('the declared engine range matches what the project actually promises', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
  );
  // Node 24 is the floor that matters: `import.meta.main` arrived in 24.2 and `node:sqlite` left
  // experimental in 24, both of which the tooling uses.
  assert.equal(manifest.engines.node, '>=24.2.0 <27');
  assert.equal(satisfies(process.versions.node, manifest.engines.node), true);
});
