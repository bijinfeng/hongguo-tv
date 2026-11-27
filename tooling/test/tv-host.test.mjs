import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tvEmulator } from '../src/tv-host.mjs';

// Twelve TV suites used to repeat this preamble. `output` shells out to adb, so these tests hand
// it a fake adb: a node script that answers `devices` and `emu avd name` from a fixture and
// records every invocation. What matters is not adb but the three rules the copies disagreed on:
// exactly one ready emulator, the serial pinned onto every later call, and an optional AVD check.

const ONE_EMULATOR = 'List of devices attached\nemulator-5554\tdevice\n';

/** A throwaway adb that records calls and answers from `answers`. */
function fakeAdb(t, answers) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-adb-'));
  const script = join(dir, 'adb.mjs');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(
    script,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'devices') process.stdout.write(${JSON.stringify(answers.devices)});
else if (args.includes('emu') && args.includes('name'))
  process.stdout.write((${JSON.stringify(answers.avd ?? '')}) + '\\n');
`,
  );
  chmodSync(script, 0o755);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = () =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  return { script, calls };
}

test('accepts exactly one ready emulator and pins its serial', (t) => {
  const { script, calls } = fakeAdb(t, { devices: ONE_EMULATOR });
  const { serial, device } = tvEmulator({ adb: script });
  assert.equal(serial, 'emulator-5554');
  device(['shell', 'getprop']);
  assert.deepEqual(calls().at(-1), ['-s', 'emulator-5554', 'shell', 'getprop']);
});

test('rejects zero, several, or non-ready targets', (t) => {
  const none = fakeAdb(t, { devices: 'List of devices attached\n' });
  assert.throws(() => tvEmulator({ adb: none.script }), /exactly one Android TV emulator/);

  const two = fakeAdb(t, { devices: `${ONE_EMULATOR}emulator-5556\tdevice\n` });
  assert.throws(() => tvEmulator({ adb: two.script }), /exactly one Android TV emulator/);

  const offline = fakeAdb(t, { devices: 'List of devices attached\nemulator-5554\toffline\n' });
  assert.throws(() => tvEmulator({ adb: offline.script }), /exactly one Android TV emulator/);
});

test('keeps each suite its own wording', (t) => {
  const { script } = fakeAdb(t, { devices: 'List of devices attached\n' });
  assert.throws(
    () => tvEmulator({ adb: script, message: 'Requires one ready Android TV emulator' }),
    /^Error: Requires one ready Android TV emulator$/,
  );
});

test('pins the AVD name only when asked', (t) => {
  const pinned = fakeAdb(t, { devices: ONE_EMULATOR, avd: 'hongguo-tv-api34-arm64' });
  const { device } = tvEmulator({ adb: pinned.script, avd: 'hongguo-tv-api34-arm64' });
  assert.deepEqual(pinned.calls().at(-1), ['-s', 'emulator-5554', 'emu', 'avd', 'name']);
  device(['shell', 'true']);

  const wrong = fakeAdb(t, { devices: ONE_EMULATOR, avd: 'some-phone' });
  assert.throws(
    () => tvEmulator({ adb: wrong.script, avd: 'hongguo-tv-api34-arm64' }),
    /Requires the pinned hongguo-tv-api34-arm64 test AVD, got some-phone/,
  );
});

test('does not probe the AVD when none was requested', (t) => {
  const { script, calls } = fakeAdb(t, { devices: ONE_EMULATOR });
  tvEmulator({ adb: script });
  assert.equal(
    calls().filter((args) => args.includes('emu')).length,
    0,
    'an unpinned suite must not pay for an extra adb round trip',
  );
});
