import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hostArgs,
  previewArgs,
  previewPorts,
  uiComponentsOptions,
} from '../src/ui-components-options.mjs';

test('UI component commands default to every product without an explicit target', () => {
  assert.deepEqual(uiComponentsOptions(['check']), {
    command: 'check',
    target: 'desktop',
    explicit: false,
  });
  assert.deepEqual(uiComponentsOptions(['host', '--target', 'tv']), {
    command: 'host',
    target: 'tv',
    explicit: true,
  });
});

test('preview passes display, window size and port to the dev host', () => {
  assert.deepEqual(
    uiComponentsOptions(['preview', '--display', '2', '--window-size', '1440x960']),
    {
      command: 'preview',
      target: 'desktop',
      explicit: false,
      display: 2,
      windowSize: '1440x960',
    },
  );
  assert.equal(uiComponentsOptions(['preview', '--port', '8810']).port, 8810);
  assert.equal(uiComponentsOptions(['preview']).port, undefined);
});

test('every product previews on its own fixed port', () => {
  const ports = Object.values(previewPorts);
  assert.equal(new Set(ports).size, 3);
  assert.ok(ports.every((port) => Number.isInteger(port) && port > 1024 && port < 65535));
});

test('host windows accept a display but never an interactive-only option', () => {
  assert.equal(uiComponentsOptions(['host', '--display', '2']).display, 2);
  assert.throws(
    () => uiComponentsOptions(['host', '--window-size', '1280x800']),
    /Unknown option --window-size for host/,
  );
  assert.throws(() => uiComponentsOptions(['test', '--display', '2']), /Unknown option --display/);
});

test('UI component options fail closed', () => {
  assert.throws(
    () => uiComponentsOptions(['preview', '--target']),
    /Expected a value after --target/,
  );
  assert.throws(
    () => uiComponentsOptions(['preview', '--target', 'android']),
    /Expected --target desktop\|web\|tv/,
  );
  assert.throws(() => uiComponentsOptions(['preview', '--display', '0']), /Expected --display/);
  assert.throws(
    () => uiComponentsOptions(['preview', '--window-size', '1280']),
    /Expected --window-size WIDTHxHEIGHT/,
  );
  assert.throws(
    () => uiComponentsOptions(['preview', '--port', '70000']),
    /Expected --port 1-65535/,
  );
  assert.throws(() => uiComponentsOptions(['build']), /Expected check\|test\|host\|preview/);
});

test('preview reuses one fixed port per product and forwards only explicit overrides', () => {
  assert.deepEqual(previewArgs('BaseComponentsPreview.tsx', 'desktop', 'macos'), [
    'BaseComponentsPreview.tsx',
    '--target',
    'macos',
    '--port',
    String(previewPorts.desktop),
  ]);
  assert.deepEqual(previewArgs('BaseComponentsPreview.tsx', 'tv', 'android', { display: 2 }), [
    'BaseComponentsPreview.tsx',
    '--target',
    'android',
    '--port',
    String(previewPorts.tv),
    '--display',
    '2',
  ]);
  assert.equal(previewArgs('a.tsx', 'web', 'web', { windowSize: '1280x800' }).at(-1), '1280x800');
});

test('host test runs stay in the background', () => {
  const args = hostArgs('/repo/apps/web/.nsh/BaseComponents.host.test.tsx', 'macos');
  assert.deepEqual(args, [
    'test',
    '/repo/apps/web/.nsh/BaseComponents.host.test.tsx',
    '--target',
    'macos',
  ]);
  assert.ok(!args.includes('--foreground'));
  assert.deepEqual(hostArgs('headless.test.tsx'), ['test', 'headless.test.tsx']);
  assert.equal(hostArgs('x.test.tsx', 'macos', 2).at(-1), '2');
});
