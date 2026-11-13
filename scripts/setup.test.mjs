import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { nshPath, root } from './toolchain.mjs';

test('doctor rejects unusable tools and honors the explicit NSH override', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'hongguo-doctor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const doctor = (env) =>
    spawnSync(process.execPath, [resolve(root, 'scripts/setup.mjs'), '--check'], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  const missingNsh = doctor({ NSH_BIN: resolve(directory, 'missing-nsh') });
  assert.equal(missingNsh.status, 1);
  assert.match(missingNsh.stderr, /Cannot run .*missing-nsh; install NSH/);
  const wrongNsh = doctor({ NSH_BIN: process.execPath });
  assert.equal(wrongNsh.status, 1);
  assert.match(wrongNsh.stderr, /Expected NSH/);
  const missingGo = doctor({ NSH_BIN: nshPath(), PATH: directory });
  assert.equal(missingGo.status, 1);
  assert.match(missingGo.stderr, /Go .* is required; install Go and add it to PATH/);
});
