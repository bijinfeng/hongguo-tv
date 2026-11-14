import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('product and component specimens resolve the same controls, tokens and icons', () => {
  for (const entry of ['index.html', 'components/index.html']) {
    const html = read(entry);
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(
      (match) => new URL(match[1], new URL(entry, import.meta.url)).href,
    );
    for (const file of ['shared/icons.js', 'shared/controls.js'])
      assert.ok(scripts.includes(new URL(file, import.meta.url).href), `${entry} consumes ${file}`);
    const styles = [...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map(
      (match) => new URL(match[1], new URL(entry, import.meta.url)).href,
    );
    for (const file of [
      'components/assets/theme.css',
      'shared/controls.css',
      'shared/content.css',
      'shared/feedback.css',
      'shared/discovery-extras.css',
      'shared/frequent-extras.css',
      'shared/foundations.css',
      'shared/form-extras.css',
      'shared/account-extras.css',
      'shared/collection-extras.css',
    ])
      assert.ok(styles.includes(new URL(file, import.meta.url).href), `${entry} consumes ${file}`);
    assert.ok(
      scripts.indexOf(new URL('shared/controls.js', import.meta.url).href) < scripts.length - 1,
    );
  }
  assert.match(read('app.js'), /HongguoComponents\.button\(/);
  assert.match(read('components/components.js'), /globalThis\.HongguoComponents/);
});

test('shared button adapter preserves action values, disabled state and accessible icon labels', () => {
  const context = vm.createContext({});
  vm.runInContext(read('shared/icons.js') + read('shared/controls.js'), context);
  const html = vm.runInContext(
    `HongguoComponents.button('删除 <记录>', {variant:'danger selected', glyph:'trash', action:'delete-history', value:'a"b', disabled:true, iconOnly:true})`,
    context,
  );
  assert.match(html, /class="ui-button destructive selected icon-only/);
  assert.match(html, /data-action="delete-history"/);
  assert.match(html, /data-value="a&quot;b"/);
  assert.match(html, / disabled /);
  assert.match(html, /aria-label="删除 &lt;记录&gt;"/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, />删除 <记录><\/button>/);
});

test('every product icon maps to an available official generated asset', () => {
  const context = vm.createContext({});
  vm.runInContext(read('shared/icons.js') + read('shared/controls.js'), context);
  const names = new Set();
  for (const file of ['app.js', 'desktop.js', 'tv.js', 'updates.js']) {
    const source = read(file);
    for (const match of source.matchAll(/(?:icon\(|image:\s*)'([^']+)'/g)) names.add(match[1]);
  }
  for (const name of names) {
    const html = vm.runInContext(`HongguoComponents.icon(${JSON.stringify(name)})`, context);
    assert.match(html, /<svg/, name);
    if (name !== 'info') {
      const info = vm.runInContext("HongguoComponents.icon('info')", context);
      assert.notEqual(html, info, `${name} must resolve its own icon instead of a fallback`);
    }
  }
});

test('shared range fill handles nonzero minima and clamps replaced values', () => {
  const context = vm.createContext({});
  vm.runInContext(read('shared/controls.js'), context);
  const observed = [];
  context.range = {
    type: 'range',
    min: '10',
    max: '110',
    value: '60',
    style: { setProperty: (name, value) => observed.push([name, value]) },
  };
  vm.runInContext('HongguoComponents.syncRange(range)', context);
  context.range.value = '200';
  vm.runInContext('HongguoComponents.syncRange(range)', context);
  context.range.value = '-20';
  vm.runInContext('HongguoComponents.syncRange(range)', context);
  assert.deepEqual(observed, [
    ['--fill', '50%'],
    ['--fill', '100%'],
    ['--fill', '0%'],
  ]);
});
