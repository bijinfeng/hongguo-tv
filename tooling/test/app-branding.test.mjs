import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { root } from '../src/process.mjs';
import { prepareTvBranding } from '../src/tv-host.mjs';

/** Decode a non-interlaced 8-bit RGBA PNG far enough to read single pixels. */
function decodeRgba(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png.readUInt8(24), 8, 'brand PNG must be 8-bit');
  assert.equal(png.readUInt8(25), 6, 'brand PNG must carry an alpha channel');
  assert.equal(png.readUInt8(28), 0, 'brand PNG must not be interlaced');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const paeth = () => {
        const p = left + above - upperLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - above), Math.abs(p - upperLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      };
      const predictor = [0, left, above, (left + above) >> 1, paeth()][filter];
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => [...pixels.subarray(y * stride + x * 4, y * stride + x * 4 + 4)],
  };
}

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

test('the brand PNG is transparent outside its rounded tile, never a white plate', async () => {
  const png = await readFile(resolve(root, 'packages/ui/assets/brand/app-icon.png'));
  const icon = decodeRgba(png);
  for (const [x, y] of [
    [0, 0],
    [icon.width - 1, 0],
    [0, icon.height - 1],
    [icon.width - 1, icon.height - 1],
  ])
    assert.equal(icon.pixel(x, y)[3], 0, `corner ${x},${y} must be transparent`);
  const inset = Math.round(icon.width * 0.04);
  assert.equal(icon.pixel(inset, inset)[3], 0, 'the rounded corner keeps its background clear');
  // The play window's white stays part of the artwork, not a hole.
  assert.equal(icon.pixel(Math.floor(icon.width / 2), Math.floor(icon.height / 2))[3], 255);
  assert.equal(icon.pixel(icon.width / 2, 0)[3], 255, 'the tile edge keeps its cover colour');
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
