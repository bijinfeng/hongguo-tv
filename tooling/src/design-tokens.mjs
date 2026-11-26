import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';

const designFile = resolve(root, 'DESIGN.md');
const themes = {
  desktop: resolve(root, 'packages/ui/theme.json'),
  tv: resolve(root, 'packages/ui/theme.tv.json'),
};
const outputFile = resolve(root, 'packages/ui/src/tokens.generated.ts');

const typeRoles = [
  'display',
  'page',
  'section',
  'title',
  'content-title',
  'body',
  'meta',
  'numeric',
];
const sizes = ['sm', 'md', 'lg'];
const surfaces = ['desktop', 'tv'];
const controlProps = [
  'height',
  'fontSize',
  'paddingHorizontal',
  'paddingVertical',
  'gap',
  'iconSize',
  'rounded',
];
const controlKey = {
  fontSize: 'font',
  paddingHorizontal: 'padding-x',
  paddingVertical: 'padding-y',
  iconSize: 'icon',
  rounded: 'radius',
};

const drift = (m) => new Error(`Design drift: ${m}; run pnpm design:codegen`);

const readBlocks = (source) => {
  const blocks = {};
  for (const match of source.matchAll(/^```yaml\n([\s\S]*?)^```$/gm)) {
    const lines = match[1].split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    if (!lines.length) continue;
    const group = lines[0].match(/^([a-z-]+):\s*$/)?.[1];
    if (!group) throw drift('every YAML block must open with a top-level group');
    blocks[group] = parseYaml(lines);
  }
  return blocks;
};

const parseYaml = (lines) => {
  const value = (raw) => {
    const text = raw.trim();
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1);
    if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
    if (/^-?\d+$/.test(text)) return Number(text);
    if (/^-?\d*\.\d+$/.test(text)) return Number(text);
    return text;
  };
  const object = {};
  let nested = object;
  for (const line of lines.slice(1)) {
    const indent = line.match(/^ */)[0].length;
    const sep = line.indexOf(':');
    if (sep < 0) throw drift(`unsupported YAML line: ${line.trim()}`);
    const key = line.slice(indent, sep).trim();
    const rest = line.slice(sep + 1);
    if (indent === 0) {
      if (rest.trim()) object[key] = value(rest);
      else object[key] = nested = {};
    } else if (indent === 2 && nested) {
      if (rest.trim()) nested[key] = value(rest);
      else nested[key] = {};
    } else if (indent === 4 && nested && typeof nested[Object.keys(nested).at(-1)] === 'object') {
      nested[Object.keys(nested).at(-1)][key] = value(rest);
    } else {
      throw drift(`unsupported YAML indentation in "${line.trim()}"`);
    }
  }
  return object;
};

const px = (name, value) => {
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)px$/);
  if (!match) throw drift(`${name} must be a pixel value, received ${value}`);
  return Number(match[1]);
};

const scale = (group, blocks, surface = 'desktop') => {
  if (!blocks[group]) throw drift(`DESIGN.md is missing the ${group} block`);
  const entries = {
    ...(blocks[group] ?? {}),
    ...(surface === 'tv' ? (blocks[`${group}-tv`] ?? {}) : {}),
  };
  const out = {};
  for (const [name, value] of Object.entries(entries)) out[name] = px(`${group}.${name}`, value);
  for (const [name, value] of Object.entries(out))
    if (!Number.isInteger(value) || value < 0)
      throw drift(`${group}.${name} must be a non-negative integer`);
  return out;
};

const typography = (blocks) => {
  const entries = blocks.typography;
  if (!entries) throw drift('DESIGN.md is missing the typography block');
  const type = {};
  const ratios = {};
  for (const role of typeRoles) {
    type[role] = {};
    for (const surface of surfaces) {
      const name = `${role}-${surface}`;
      const token = entries[name];
      if (!token) throw drift(`typography.${name} is missing`);
      const fontSize = px(`typography.${name}.fontSize`, token.fontSize);
      const lineHeight = Number(token.lineHeight);
      const fontWeight = Number(token.fontWeight);
      const letterSpacingEm = token.letterSpacing
        ? Number.parseFloat(token.letterSpacing)
        : undefined;
      if (!Number.isFinite(lineHeight)) throw drift(`typography.${name}.lineHeight is required`);
      if (!Number.isFinite(fontWeight)) throw drift(`typography.${name}.fontWeight is required`);
      type[role][surface] = fontSize;
      const ratio = {
        fontWeight,
        lineHeight,
        ...(letterSpacingEm === undefined ? {} : { letterSpacingEm }),
        ...(token.fontFeature === undefined ? {} : { fontFeature: String(token.fontFeature) }),
      };
      if (!ratios[role]) ratios[role] = ratio;
      else if (JSON.stringify(ratios[role]) !== JSON.stringify(ratio))
        throw drift(`typography.${role} must share one weight/line height across surfaces`);
    }
  }
  const known = new Set(typeRoles.flatMap((r) => surfaces.map((s) => `${r}-${s}`)));
  const extra = Object.keys(entries).filter((n) => !known.has(n));
  if (extra.length) throw drift(`unknown typography tokens: ${extra.join(', ')}`);
  return { type, ratios };
};

const controls = (blocks) => {
  const entries = blocks.controls;
  if (!entries) throw drift('DESIGN.md is missing the controls block');
  const out = {};
  for (const size of sizes) {
    out[size] = {};
    for (const surface of surfaces) {
      const name = `${size}-${surface}`;
      const token = entries[name];
      if (!token) throw drift(`controls.${name} is missing`);
      const values = {};
      for (const prop of controlProps) {
        if (token[prop] === undefined) throw drift(`controls.${name}.${prop} is missing`);
        values[prop] = String(token[prop]).startsWith('{')
          ? String(token[prop])
          : px(`controls.${name}.${prop}`, token[prop]);
      }
      out[size][surface] = values;
    }
  }
  return out;
};

const colorsOf = (blocks, surface = 'desktop') => {
  if (!blocks.colors) throw drift('DESIGN.md is missing the colors block');
  const entries = {
    ...(blocks.colors ?? {}),
    ...(surface === 'tv' ? (blocks['colors-tv'] ?? {}) : {}),
  };
  const light = {};
  const dark = {};
  for (const [name, value] of Object.entries(entries)) {
    const hex = String(value).toLowerCase();
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) throw drift(`colors.${name} is not a color`);
    if (name.endsWith('-dark')) dark[name.slice(0, -5)] = hex;
    else light[name] = hex;
  }
  return { light, dark };
};

const references = (blocks, radius) => {
  const groups = { colors: blocks.colors, rounded: blocks.rounded, spacing: blocks.spacing };
  const check = (owner, value) => {
    const match = String(value).match(/^\{([a-z]+)\.([a-z0-9-]+)\}$/);
    if (!match) return;
    const [, group, name] = match;
    if (!groups[group]) throw drift(`${owner} references unknown group ${group}`);
    const known = group === 'colors' ? Object.keys(groups.colors) : Object.keys(groups[group]);
    if (!known.includes(name) && !known.includes(`${name}-dark`))
      throw drift(`${owner} references unknown token ${group}.${name}`);
  };
  for (const [component, recipe] of Object.entries(blocks.components ?? {}))
    for (const [prop, value] of Object.entries(recipe)) check(`${component}.${prop}`, value);
  for (const [size, bySurface] of Object.entries(controls(blocks)))
    for (const [surface, values] of Object.entries(bySurface))
      for (const [prop, value] of Object.entries(values))
        if (prop === 'rounded') check(`controls.${size}-${surface}.${prop}`, value);
  for (const [name, value] of Object.entries(radius))
    if (!Number.isInteger(value)) throw drift(`rounded.${name} must be an integer`);
  for (const group of ['colors-tv', 'rounded-tv']) {
    const base = group.replace(/-tv$/, '');
    for (const name of Object.keys(blocks[group] ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(blocks[base] ?? {}, name))
        throw drift(`${group}.${name} does not override a known ${base} token`);
    }
  }
};

const spacingFor = (blocks, surface) => {
  const all = scale('spacing', blocks);
  const out = {};
  for (const [name, value] of Object.entries(all)) {
    if (name.endsWith('-tv')) continue;
    out[name] = surface === 'tv' && all[`${name}-tv`] !== undefined ? all[`${name}-tv`] : value;
  }
  return out;
};

const themeOf = (blocks, surface) => {
  const space = spacingFor(blocks, surface);
  const radius = scale('rounded', blocks, surface);
  const { type, ratios } = typography(blocks);
  const control = controls(blocks);
  const { light, dark } = colorsOf(blocks, surface);
  const geometry = { radius: `${radius.xl}px` };
  const weights = [...new Set(Object.values(ratios).map((ratio) => ratio.fontWeight))];
  for (const [name, value] of Object.entries(radius)) geometry[`radius-${name}`] = `${value}px`;
  for (const [name, value] of Object.entries(space)) geometry[`space-${name}`] = `${value}px`;
  for (const role of typeRoles) geometry[`text-${role}`] = `${type[role][surface]}px`;
  if (weights.includes(400)) geometry['font-regular'] = 400;
  if (weights.includes(600)) geometry['font-strong'] = 600;
  for (const size of sizes)
    for (const [prop, value] of Object.entries(control[size][surface]))
      geometry[`control-${size}-${controlKey[prop] ?? prop}`] =
        typeof value === 'number' ? `${value}px` : value;
  for (const [name, value] of Object.entries(geometry)) {
    const match = String(value).match(/^\{rounded\.([a-z0-9-]+)\}$/);
    if (match) geometry[name] = `${radius[match[1]]}px`;
  }
  return { cssVars: { theme: geometry, light, dark } };
};

const checkColors = (design, theme, name) => {
  for (const surface of ['light', 'dark']) {
    const expected = design[surface];
    const actual = theme.cssVars[surface] ?? {};
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (expected[key] === undefined) throw drift(`${name}.${surface}.${key} is not in DESIGN.md`);
      if (actual[key] === undefined) throw drift(`colors.${key} is not in ${name}.${surface}`);
      if (expected[key] !== String(actual[key]).toLowerCase())
        throw drift(
          `colors.${key} is ${expected[key]} in DESIGN.md but ${String(actual[key]).toLowerCase()} in ${name}.${surface}`,
        );
    }
  }
};

const renderTheme = (theme) => JSON.stringify(theme, null, 2) + '\n';

const renderType = (ratios) => {
  const lines = [
    '// Generated from DESIGN.md by tooling/src/design-tokens.mjs. Do not edit; run pnpm design:codegen.',
    '// Sizes live in theme.json / theme.tv.json; this file holds ratios shared by both surfaces.',
    '',
    'export const typeTokens = {',
  ];
  for (const role of typeRoles) {
    const r = ratios[role];
    lines.push(`  ${/^[A-Za-z_$][\w$]*$/.test(role) ? role : `'${role}'`}: {`);
    lines.push(`    fontWeight: ${r.fontWeight},`);
    lines.push(`    lineHeight: ${r.lineHeight},`);
    if (r.letterSpacingEm !== undefined) lines.push(`    letterSpacingEm: ${r.letterSpacingEm},`);
    if (r.fontFeature !== undefined) lines.push(`    fontFeature: '${r.fontFeature}',`);
    lines.push('  },');
  }
  lines.push('} as const;', '', 'export type TextRole = keyof typeof typeTokens;', '');
  return lines.join('\n');
};

export const compile = (source, themes, { check = false } = {}) => {
  const blocks = readBlocks(source);
  for (const group of ['colors', 'spacing', 'rounded'])
    if (!blocks[group]) throw drift(`DESIGN.md is missing the ${group} block`);
  const radius = scale('rounded', blocks);
  references(blocks, radius);
  const { ratios } = typography(blocks);
  if (check) {
    checkColors(colorsOf(blocks, 'desktop'), themes.desktop, 'theme.json');
    checkColors(colorsOf(blocks, 'tv'), themes.tv, 'theme.tv.json');
  }
  return { themes: { desktop: themeOf(blocks, 'desktop'), tv: themeOf(blocks, 'tv') }, ratios };
};

export const designTokens = async (check = false) => {
  const source = await readFile(designFile, 'utf8');
  const current = {
    desktop: JSON.parse(await readFile(themes.desktop, 'utf8')),
    tv: JSON.parse(await readFile(themes.tv, 'utf8')),
  };
  const { themes: nextThemes, ratios } = compile(source, current, { check });
  const writes = [
    [themes.desktop, renderTheme(nextThemes.desktop)],
    [themes.tv, renderTheme(nextThemes.tv)],
    [outputFile, renderType(ratios)],
  ];
  const changed = [];
  for (const [file, content] of writes) {
    const existing = await readFile(file, 'utf8').catch(() => '');
    if (existing !== content) changed.push(file);
  }
  if (check) {
    if (changed.length)
      throw drift(`${changed.map((f) => f.replace(root + '/', '')).join(', ')} out of date`);
    return 'design tokens are up to date';
  }
  for (const [file, content] of writes) await writeFile(file, content);
  return `${writes.map(([f]) => f.replace(root + '/', '')).join(', ')} written`;
};

if (import.meta.main) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--check'))
      throw new Error('Expected --check or no arguments');
    console.log(await designTokens(process.argv.includes('--check')));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
