import { readFile, writeFile } from 'node:fs/promises';
const theme = JSON.parse(
  await readFile(new URL('../../../packages/ui/theme.json', import.meta.url), 'utf8'),
).cssVars;
let css =
  '/* Generated from packages/ui/theme.json; run node design/prototype/components/sync-theme.mjs. */\n';
for (const mode of ['light', 'dark']) {
  css += `:root[data-theme="${mode}"] {\n${Object.entries({ ...theme.theme, ...theme[mode] })
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n')}\n}\n`;
}
await writeFile(new URL('assets/theme.css', import.meta.url), css);
