import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './process.mjs';

// The apps draw every icon through `nsh-icon-lucide`, which ships the same official release. This
// check proves the vendored sources still match the hashes recorded beside them, so a hand-edited
// path or a half-finished upgrade fails here instead of only showing up on a device.
const source = resolve(root, 'packages/ui/assets/lucide');
const manifest = JSON.parse(await readFile(resolve(source, 'provenance.json'), 'utf8'));
const names = Object.keys(manifest.svgSha256).sort();
for (const name of names) {
  const svg = await readFile(resolve(source, `${name}.svg`), 'utf8');
  const digest = createHash('sha256').update(svg).digest('hex');
  if (digest !== manifest.svgSha256[name]) throw new Error(`Lucide source drift: ${name}`);
}
const files = (await readdir(source)).filter((name) => name.endsWith('.svg'));
if (files.length !== names.length) throw new Error('Unregistered Lucide source');
console.log(`Lucide ${manifest.version}: ${names.length} verified sources match their hashes`);
