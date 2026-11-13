import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerFixture } from '../src/player-fixture.mjs';

test('player acceptance fixture serves original byte ranges and records only explicit progress', async () => {
  const fixture = await playerFixture();
  try {
    const json = (path, options) =>
      fetch(fixture.origin + path, options).then((response) => response.json());
    const info = await json('/api/v1/play/info?vid=456');
    assert.match(info.data.path, /^\/minireel-proxy\/media\/a{64}$/);
    const full = await fetch(fixture.origin + info.data.path);
    const bytes = new Uint8Array(await full.arrayBuffer());
    assert.equal(full.headers.get('Content-Type'), 'video/mp4');
    const range = await fetch(fixture.origin + info.data.path, {
      headers: { Range: 'bytes=8-15' },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('Content-Range'), `bytes 8-15/${bytes.length}`);
    assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.subarray(8, 16));
    const invalid = await fetch(fixture.origin + info.data.path, {
      headers: { Range: 'bytes=99-1' },
    });
    assert.equal(invalid.status, 416);
    assert.equal(
      (await fetch(fixture.origin + info.data.path, { method: 'HEAD' })).headers.get(
        'Content-Length',
      ),
      String(bytes.length),
    );
    assert.deepEqual(fixture.writes, []);
    const write = { position: 2, duration: 12, video_id: '456', completed: false };
    await json('/api/v1/library', { method: 'POST', body: JSON.stringify(write) });
    assert.deepEqual(fixture.writes, [write]);
    const bad = await fetch(fixture.origin + '/api/v1/library', { method: 'POST', body: '{' });
    assert.equal(bad.status, 400);
    assert.equal(fixture.writes.length, 1);
  } finally {
    await fixture.close();
  }
});
