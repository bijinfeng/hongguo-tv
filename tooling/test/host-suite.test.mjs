import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostSuiteArgs, mountEntry, testEntry } from '../src/host-suite.mjs';

// Six host suites built the same two files and the same `nsh test` invocation before calling it.
// The generators are pure strings, so they are tested as strings — running a suite would need a
// real harness and would not say anything about whether the emitted text is right.

test('the mount entry configures the fixture origin and mounts the desktop App', () => {
  const entry = mountEntry('http://127.0.0.1:4010');
  assert.match(entry, /configureClient\("http:\/\/127\.0\.0\.1:4010"\)/);
  assert.match(entry, /mount\(\(\) => <App target="desktop" logoMark=\{logoMark\} \/>\)/);
  assert.match(entry, /import \{mount\} from 'nsh'/);
  assert.match(
    entry,
    /import logoMark from '\.\.\/assets\/hongguo-logo\.png'/,
    'the logo path resolves from .nsh/',
  );
});

test('the register call names the module, the sibling entry and the artifacts directory', () => {
  const file = testEntry({
    register: 'registerRadarHostTests',
    module: 'radar-host',
    name: 'RadarHost-web',
    artifacts: '/tmp/artifacts',
    host: 'web',
  });
  assert.match(file, /import \{registerRadarHostTests\} from '@hongguo\/app\/testing\/radar-host'/);
  assert.match(
    file,
    /registerRadarHostTests\('\.\/RadarHost-web\.tsx', "\/tmp\/artifacts", 'web'\)/,
  );
});

test('headless runs without --target', () => {
  // The one real difference between the suites: rankings accepts `headless`, and `nsh test
  // --target headless` does not exist.
  assert.deepEqual(hostSuiteArgs({ name: 'R', host: 'headless', headless: true }), [
    'test',
    '.nsh/R.test.tsx',
  ]);
});

test('a graphical host passes its target', () => {
  assert.deepEqual(hostSuiteArgs({ name: 'R', host: 'macos' }), [
    'test',
    '.nsh/R.test.tsx',
    '--target',
    'macos',
  ]);
});

test('foreground and filter are appended only when present', () => {
  assert.deepEqual(hostSuiteArgs({ name: 'R', host: 'macos', foreground: true }), [
    'test',
    '.nsh/R.test.tsx',
    '--target',
    'macos',
    '--foreground',
  ]);
  assert.deepEqual(hostSuiteArgs({ name: 'R', host: 'web', filter: 'focus ring' }), [
    'test',
    '.nsh/R.test.tsx',
    '--target',
    'web',
    '--filter',
    'focus ring',
  ]);
});
