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
  ring: '#c85e00'
  ring-dark: '#ff9233'
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
  const base = compile(design()).themes;
  const drifted = design().replace("background: '#ffffff'", "background: '#fffffe'");
  assert.throws(() => compile(drifted, base, { check: true }), /colors.background is/);
  assert.equal(compile(drifted).themes.desktop.cssVars.light.background, '#fffffe');
});

test('rejects a component reference to a missing token', () => {
  const drifted = design({
    components: "  card:\n    rounded: '{rounded.xxl}'\n",
  });
  assert.throws(() => compile(drifted, theme), /rounded\.xxl/);
});

test('accepts TV-only overrides and rejects unknown override roles', () => {
  const tvOverride = [
    block('colors-tv', "  ring: '#ff9233'\n  ring-dark: '#ff9233'\n"),
    block('rounded-tv', '  xl: 10px\n'),
  ].join('');
  const tv = compile(tvOverride + design(), { desktop: theme, tv: theme });
  assert.equal(tv.themes.tv.cssVars.theme['radius-xl'], '10px');
  assert.equal(tv.themes.tv.cssVars.light.ring, '#ff9233');
  assert.deepEqual(tv.themes.desktop, compile(design()).themes.desktop);
  assert.equal(tv.themes.tv.cssVars.dark.card, '#131414');
  assert.throws(
    () =>
      compile(block('colors-tv', "  missing: '#ff9233'\n") + design(), {
        desktop: theme,
        tv: theme,
      }),
    /colors-tv\.missing/,
  );
});

test('rejects invalid and unknown TV overrides without weakening base validation', () => {
  for (const [group, body, error] of [
    ['colors-tv', "  ring: 'red'\n", /colors.ring is not a color/],
    ['rounded-tv', '  missing: 4px\n', /rounded-tv.missing/],
    ['rounded-tv', '  xl: -1px\n', /non-negative integer/],
    ['rounded-tv', '  xl: 1.5px\n', /non-negative integer/],
    ['rounded-tv', '  xl: auto\n', /pixel value/],
  ])
    assert.throws(() => compile(design() + block(group, body)), error);
  for (const group of ['colors', 'rounded', 'spacing']) {
    const without = design().replace(new RegExp('```yaml\\n' + group + ':\\n[\\s\\S]*?```\\n'), '');
    assert.throws(() => compile(without), new RegExp('missing the ' + group + ' block'));
  }
});

test('generated themes are deterministic and checked independently', () => {
  const source = design() + block('colors-tv', "  ring-dark: '#123456'\n");
  const first = compile(source);
  assert.deepEqual(compile(source, first.themes, { check: true }), first);
  const stale = structuredClone(first.themes);
  stale.tv.cssVars.dark.ring = '#000000';
  assert.throws(() => compile(source, stale, { check: true }), /theme.tv.json.dark/);
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
