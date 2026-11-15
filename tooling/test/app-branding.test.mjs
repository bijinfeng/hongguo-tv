import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { root } from '../src/process.mjs';
import { prepareTvBranding } from '../src/tv-host.mjs';

test('all app manifests use the approved name and the same square brand PNG', async () => {
  let source;
  for (const target of ['web', 'desktop', 'tv']) {
    const appDirectory = resolve(root, 'apps', target);
    const metadata = JSON.parse(await readFile(resolve(appDirectory, 'nsh.json'), 'utf8'));
    assert.equal(metadata.name, '红果');
    assert.equal(metadata.id, `dev.hongguo.${target}`);
    const icon = resolve(appDirectory, metadata.icon);
    source ??= icon;
    assert.equal(icon, source);
    const png = await readFile(icon);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
    assert.ok(png.readUInt32BE(16) >= 512, 'Keep the approved high-resolution brand source');
    assert.deepEqual(png, await readFile(resolve(appDirectory, 'assets/hongguo-logo.png')));
  }
});

test('custom TV host copies the configured brand source and replaces stale generated art', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'hongguo-branding-'));
  try {
    const appDirectory = resolve(directory, 'app');
    const generated = resolve(directory, 'generated');
    const png = await readFile(resolve(root, 'packages/ui/assets/brand/app-icon.png'));
    await mkdir(resolve(appDirectory, 'brand'), { recursive: true });
    await writeFile(resolve(appDirectory, 'brand/selected.png'), png);
    const metadata = { icon: 'brand/selected.png' };
    await prepareTvBranding(metadata, appDirectory, generated);
    const output = resolve(generated, 'res/drawable-nodpi/app_icon.png');
    assert.deepEqual(await readFile(output), png);
    await writeFile(output, 'stale placeholder');
    await prepareTvBranding(metadata, appDirectory, generated);
    assert.deepEqual(await readFile(output), png);
    await assert.rejects(prepareTvBranding({}, appDirectory, generated), /shared PNG icon/);
    await assert.rejects(prepareTvBranding({ icon: 'missing.png' }, appDirectory, generated), {
      code: 'ENOENT',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
