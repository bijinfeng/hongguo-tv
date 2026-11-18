import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compile } from '../src/design-tokens.mjs';

const theme = {
  cssVars: {
    light: { background: '#ffffff', card: '#ffffff', 'card-foreground': '#202020' },
    dark: { background: '#000000', card: '#131414', 'card-foreground': '#f5f5f5' },
  },
};

const block = (name, body) => '```yaml\n' + name + ':\n' + body + '```\n';

const design = (overrides = {}) => {
  const colors =
    overrides.colors ??
    `  background: '#ffffff'
  background-dark: '#000000'
  card: '#ffffff'
  card-dark: '#131414'
  card-foreground: '#202020'
  card-foreground-dark: '#f5f5f5'
`;
  const typography =
    overrides.typography ??
    ['display', 'page', 'section', 'title', 'content-title', 'body', 'meta', 'numeric']
      .flatMap((role) =>
        ['desktop', 'tv'].map(
          (surface) =>
            `  ${role}-${surface}:\n    fontFamily: system-ui\n    fontSize: ${
              surface === 'tv' ? 40 : 20
            }px\n    fontWeight: 400\n    lineHeight: 1.5\n`,
        ),
      )
      .join('');
  const controls = ['sm', 'md', 'lg']
    .flatMap((size) =>
      ['desktop', 'tv'].map(
        (surface) =>
          `  ${size}-${surface}:\n    height: ${
            size === 'sm' ? 32 : size === 'md' ? 40 : 60
          }px\n    fontSize: 14px\n    paddingHorizontal: 12px\n    paddingVertical: 4px\n    gap: 6px\n    iconSize: 16px\n    rounded: '{rounded.sm}'\n`,
      ),
    )
    .join('');
  const spacing = overrides.spacing ?? '  none: 0px\n  xxs: 4px\n';
  const rounded = '  sm: 4px\n  xl: 12px\n';
  const components =
    overrides.components ??
    `  card:\n    rounded: '{rounded.xl}'\n    backgroundColor: '{colors.card}'\n    textColor: '{colors.card-foreground}'\n`;
  return [
    block('colors', colors),
    block('typography', typography),
    block('spacing', spacing),
    block('rounded', rounded),
    block('controls', controls),
    block('components', components),
  ].join('\n');
};

test('compiles scales, radii and both type surfaces', () => {
  const tokens = compile(design(), theme);
  const desktop = tokens.themes.desktop.cssVars.theme;
  const tv = tokens.themes.tv.cssVars.theme;
  assert.equal(desktop['space-xxs'], '4px');
  assert.equal(desktop['radius-xl'], '12px');
  assert.equal(desktop['text-body'], '20px');
  assert.equal(tv['text-body'], '40px');
  assert.equal(desktop['control-md-height'], '40px');
  assert.equal(desktop['control-md-radius'], '4px');
  assert.equal(tokens.ratios.body.lineHeight, 1.5);
});

test('rejects a value theme.json does not match', () => {
  const drifted = design({ colors: "  background: '#fffffe'\n" });
  assert.throws(() => compile(drifted, theme), /background/);
});

test('rejects a component reference to a missing token', () => {
  const drifted = design({
    components: "  card:\n    rounded: '{rounded.xxl}'\n",
  });
  assert.throws(() => compile(drifted, theme), /rounded\.xxl/);
});

test('rejects a missing type surface', () => {
  const drifted = design({
    typography:
      '  body-desktop:\n    fontFamily: system-ui\n    fontSize: 16px\n    fontWeight: 400\n    lineHeight: 1.5\n',
  });
  assert.throws(() => compile(drifted, theme), /typography\.display-desktop/);
});

test('the checked-in generated file matches DESIGN.md', async () => {
  const source = await readFile(resolve(import.meta.dirname, '../../DESIGN.md'), 'utf8');
  const actualTheme = JSON.parse(
    await readFile(resolve(import.meta.dirname, '../../packages/ui/theme.json'), 'utf8'),
  );
  const tokens = compile(source, actualTheme);
  assert.equal(Object.keys(tokens.ratios).length, 8);
  assert.equal(tokens.themes.desktop.cssVars.theme['radius-xl'], '12px');
  assert.equal(tokens.themes.desktop.cssVars.theme['space-2xl'], '40px');
});
