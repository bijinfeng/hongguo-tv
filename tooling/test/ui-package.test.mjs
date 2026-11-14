import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { root } from '../src/process.mjs';

test('UI implementation imports owners without cycling through its public entry', async () => {
  const src = resolve(root, 'packages/ui/src');
  for (const name of await readdir(src)) {
    if (!/\.tsx?$/.test(name) || name === 'index.tsx') continue;
    const text = await readFile(resolve(src, name), 'utf8');
    assert.doesNotMatch(text, /from\s+['"](?:\.\/index|@hongguo\/ui)['"]/, name);
    assert.doesNotMatch(
      text,
      /from\s+['"](?:@hongguo\/(?:app|core-client|contracts)|node:|react(?:\/|['"]))/,
      name,
    );
  }
});

test('NSH and browser glyphs derive from the same verified official SVG sources', async () => {
  const source = resolve(root, 'packages/ui/assets/lucide');
  const manifest = JSON.parse(await readFile(resolve(source, 'provenance.json'), 'utf8'));
  assert.equal(manifest.package, 'lucide-static');
  assert.equal(manifest.version, '0.468.0');
  const { icons } = await import('../../design/prototype/components/assets/icons.js');
  assert.deepEqual(Object.keys(icons).sort(), Object.keys(manifest.svgSha256).sort());
  for (const [name, hash] of Object.entries(manifest.svgSha256)) {
    const svg = await readFile(resolve(source, `${name}.svg`), 'utf8');
    assert.equal(createHash('sha256').update(svg).digest('hex'), hash, name);
    assert.equal(icons[name], svg, name);
  }
  assert.match(await readFile(resolve(source, 'LICENSE'), 'utf8'), /ISC License/);
});
