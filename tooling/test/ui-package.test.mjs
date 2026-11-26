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

test('prototype glyphs derive from the verified official SVG sources', async () => {
  const source = resolve(root, 'packages/ui/assets/lucide');
  const manifest = JSON.parse(await readFile(resolve(source, 'provenance.json'), 'utf8'));
  assert.equal(manifest.package, 'lucide-static');
  assert.equal(manifest.version, '1.43.0');
  const { icons } =
    await import('../../design/prototype/visual-redesign-real/components/assets/icons.js');
  assert.deepEqual(Object.keys(icons).sort(), Object.keys(manifest.svgSha256).sort());
  for (const [name, hash] of Object.entries(manifest.svgSha256)) {
    const svg = await readFile(resolve(source, `${name}.svg`), 'utf8');
    assert.equal(createHash('sha256').update(svg).digest('hex'), hash, name);
    assert.equal(icons[name], svg, name);
  }
  assert.match(await readFile(resolve(source, 'LICENSE'), 'utf8'), /ISC License/);
});

test('apps draw the same Lucide set through nsh-icon-lucide', async () => {
  for (const app of ['desktop', 'tv', 'web']) {
    const manifest = JSON.parse(await readFile(resolve(root, 'apps', app, 'nsh.json'), 'utf8'));
    assert.equal(manifest.dependencies['nsh-icon-lucide'], '^0.2.2', app);
    const lock = JSON.parse(await readFile(resolve(root, 'apps', app, 'nsh.lock'), 'utf8'));
    const set = lock.packages.find((entry) => entry.name === 'nsh-icon-lucide');
    assert.equal(set.version, '0.2.2', app);
  }
});

test('icons reach the UI only as imported constants, never as a name table', async () => {
  const ui = resolve(root, 'packages/ui/src');
  const icon = await readFile(resolve(ui, 'icon.tsx'), 'utf8');
  // A name→glyph table is a second source of truth for what ships: it can list icons no
  // page uses, and a computed lookup would defeat NSH's import-time pruning.
  assert.doesNotMatch(icon, /from ['"]nsh-icon-lucide['"]/, 'icon.tsx imports the icon set');
  assert.match(icon, /icon: string/, 'Icon takes an icon constant');
  // Passing a name to the icon component (rather than a constant) is what the rule forbids.
  const nameToIcon =
    /<(?:Icon|Glyph)\b[\s\S]{0,200}?\bname=(?:"[a-z0-9-]+"|'[a-z0-9-]+'|\{?['"][a-z0-9-]+['"])/;
  for (const name of await readdir(ui)) {
    if (!/\.tsx?$/.test(name)) continue;
    assert.doesNotMatch(
      await readFile(resolve(ui, name), 'utf8'),
      nameToIcon,
      `${name} passes an icon name instead of a constant`,
    );
  }
});
