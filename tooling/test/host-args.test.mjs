import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostArgs } from '../src/host-args.mjs';

// Five host suites parsed their arguments with the same twenty lines and drifted in wording.
// The parser itself is now `node:util.parseArgs`, which is stricter than what the copies did — it
// rejects unknown flags and a flag without a value before this module sees them. These tests pin
// both halves: what the standard library guarantees, and the suite-specific rules that remain ours.

function withArgv(argv, run) {
  const original = process.argv;
  process.argv = ['node', 'suite.mjs', ...argv];
  try {
    return run();
  } finally {
    process.argv = original;
  }
}

test('returns the host and the parsed flags', () => {
  const result = withArgv(['macos', '--foreground', '--filter', 'focus ring'], () =>
    hostArgs({ hosts: ['web', 'macos'] }),
  );
  assert.equal(result.host, 'macos');
  assert.equal(result.foreground, true);
  assert.equal(result.filter, 'focus ring');
});

test('accepts headless only where the suite allows it', () => {
  assert.equal(
    withArgv(['headless'], () => hostArgs({ hosts: ['headless', 'web', 'macos'] })).host,
    'headless',
  );
  assert.throws(
    () => withArgv(['headless'], () => hostArgs({ hosts: ['web', 'macos'] })),
    /Expected web\|macos/,
  );
});

test('lists every accepted host in the error', () => {
  assert.throws(
    () => withArgv(['android'], () => hostArgs({ hosts: ['headless', 'web', 'macos'] })),
    /^Error: Expected headless\|web\|macos$/,
  );
});

test('restricts --foreground to macOS', () => {
  assert.throws(
    () => withArgv(['web', '--foreground'], () => hostArgs({ hosts: ['web', 'macos'] })),
    /--foreground is available only on macos/,
  );
});

test('an unknown flag is rejected by the parser, not by a guess of ours', () => {
  // This used to fall through to a suite's "expected --product" message, which told the reader
  // nothing about the flag they actually typed.
  assert.throws(
    () => withArgv(['web', '--bogus'], () => hostArgs({ hosts: ['web', 'macos'] })),
    (error) => error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
  );
});

test('a flag with no value is rejected by the parser', () => {
  assert.throws(
    () => withArgv(['web', '--filter'], () => hostArgs({ hosts: ['web', 'macos'] })),
    (error) => error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
  );
});

test('a value that looks like a flag is still a value problem', () => {
  assert.throws(
    () =>
      withArgv(['macos', '--filter', '--foreground'], () => hostArgs({ hosts: ['web', 'macos'] })),
    (error) => error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
  );
});

test('rejects a stray positional', () => {
  assert.throws(
    () => withArgv(['web', 'surprise'], () => hostArgs({ hosts: ['web', 'macos'] })),
    /Expected only the documented flags/,
  );
});

test('keeps a suite its own leftover message', () => {
  assert.throws(
    () =>
      withArgv(['web', 'surprise'], () =>
        hostArgs({
          hosts: ['web', 'macos'],
          message: 'Expected only --foreground and/or --filter text',
        }),
      ),
    /^Error: Expected only --foreground and\/or --filter text$/,
  );
});

test('a suite-specific value flag is parsed and exposed', () => {
  // The calendar suite alone takes `--product`; it must reach the caller rather than be rejected.
  const result = withArgv(['web', '--product', 'tv'], () =>
    hostArgs({ hosts: ['headless', 'web', 'macos'], options: { product: { type: 'string' } } }),
  );
  assert.equal(result.flags.get('--product'), 'tv');
});
