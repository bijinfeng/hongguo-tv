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

test('the vendored icon sources still match the hashes recorded beside them', async () => {
  const source = resolve(root, 'packages/ui/assets/lucide');
  const manifest = JSON.parse(await readFile(resolve(source, 'provenance.json'), 'utf8'));
  assert.equal(manifest.package, 'lucide-static');
  assert.equal(manifest.version, '1.43.0');
  // Every recorded name resolves to a source whose bytes still hash to the recorded value: a
  // hand-edited path, a half-finished upgrade, or a stray file all fail here.
  for (const [name, hash] of Object.entries(manifest.svgSha256)) {
    const svg = await readFile(resolve(source, `${name}.svg`), 'utf8');
    assert.equal(createHash('sha256').update(svg).digest('hex'), hash, name);
  }
  assert.match(await readFile(resolve(source, 'LICENSE'), 'utf8'), /ISC License/);
});

test('apps draw the same Lucide set through nsh-icon-lucide', async () => {
  for (const app of ['desktop', 'tv', 'harness']) {
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

test('every text style that sets a font size also sets its line height', async () => {
  // A label measured only by its font size takes the host's default line box: measured on the web
  // host that is about 1.14x, against the 1.5 the type roles declare, so a 14pt label stood 16px
  // tall in a control and 21px in a `UiText`. The rule is checked here because it had already
  // spread to nineteen sites in eleven files without anything going red.
  const src = resolve(root, 'packages/ui/src');
  const violations = [];
  for (const name of await readdir(src)) {
    if (!/\.tsx?$/.test(name)) continue;
    const lines = (await readFile(resolve(src, name), 'utf8')).split('\n');
    for (const [index, line] of lines.entries()) {
      if (!line.includes('fontSize:')) continue;
      // Token-name maps (`fontSize: 'control-md-font'`) and signatures (`fontSize: number`) are
      // not styles; a style always assigns an expression, not a bare quoted name or a type.
      if (/fontSize:\s*['"][a-z-]+['"],?\s*$/.test(line)) continue;
      if (/fontSize:\s*(number|string)\b/.test(line)) continue;
      // A style object is short: look ahead a few lines for the matching line height, and stop at
      // the closing brace so one object's line height cannot satisfy its neighbour.
      const window = lines.slice(index, index + 5).join('\n');
      const untilClose = window.split('}')[0];
      if (!untilClose.includes('lineHeight')) violations.push(`${name}:${index + 1}`);
    }
  }
  assert.deepEqual(violations, [], `styles missing lineHeight: ${violations.join(', ')}`);
});
