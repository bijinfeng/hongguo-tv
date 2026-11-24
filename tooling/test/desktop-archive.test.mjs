import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { output } from '../src/process.mjs';
import { verifyDesktopArchive } from '../src/desktop-archive.mjs';

const policy = { id: 'dev.hongguo.desktop' };
const platform = 'linux-x86_64';

/** `nsh package`'s output: one directory, the executable, and the bundle's app.json. */
async function archive({ bundle = '红果', executable = 'App', id = policy.id, mode = 0o755 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hongguo-archive-test-'));
  const app = join(dir, bundle);
  await mkdir(join(app, 'nsh'), { recursive: true });
  if (id !== null) await writeFile(join(app, 'nsh', 'app.json'), JSON.stringify({ id }));
  if (executable !== null) {
    await writeFile(join(app, executable), 'binary');
    await output('chmod', [mode.toString(8), join(app, executable)]);
  }
  const file = join(dir, `${bundle}.tar.gz`);
  output('tar', ['-C', dir, '-czf', file, bundle]);
  return file;
}

test('desktop archive verification accepts the bundle NSH stages', async () => {
  assert.equal(verifyDesktopArchive({ archive: await archive(), platform, policy }), '红果');
});

test('desktop archive verification rejects what the updater would refuse to stage', async () => {
  for (const [options, message] of [
    [{ executable: null }, /has no executable/],
    // The updater refuses a staged Unix executable without an execute bit.
    [{ mode: 0o644 }, /has no executable/],
    [{ id: 'other.app' }, /holds other.app/],
    [{ id: null }, /no readable bundle/],
  ]) {
    await assert.rejects(
      async () => verifyDesktopArchive({ archive: await archive(options), platform, policy }),
      message,
    );
  }
  await assert.rejects(
    async () =>
      verifyDesktopArchive({ archive: await archive(), platform: 'android-arm64', policy }),
    /Unsupported desktop platform/,
  );
});
