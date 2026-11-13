import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { root } from './process.mjs';

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.nsh'].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}
export async function boundaries(base = root) {
  const rules = { contracts: [], 'core-client': ['contracts'], ui: [], app: ['ui', 'core-client'] };
  for (const [name, dependencies] of Object.entries(rules)) {
    for (const file of await files(resolve(base, 'packages', name))) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        const dependency = specifier.startsWith('@hongguo/') ? specifier.split('/')[1] : null;
        const escaped =
          specifier.startsWith('.') &&
          !relative(resolve(base, 'packages', name), resolve(file, '..', specifier))
            .split(sep)
            .every((part) => part !== '..');
        if (
          escaped ||
          (dependency && !dependencies.includes(dependency)) ||
          /^(node:|react(?:\/|$)|react-dom(?:\/|$))/.test(specifier)
        ) {
          throw new Error(`${relative(base, file)}: forbidden dependency ${specifier}`);
        }
      }
    }
  }
  console.log('Package boundaries passed');
}
