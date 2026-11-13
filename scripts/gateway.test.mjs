import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startGateway } from './gateway.mjs';

test('gateway checks browser identity, preserves media Range, and does not expose upstream UI', async (t) => {
  const received = [];
  const core = http.createServer((req, res) => {
    received.push(req.headers);
    if (req.url.includes('.mp4')) {
      res.writeHead(206, { 'content-range': 'bytes 2-4/8', 'content-type': 'video/mp4' });
      res.end('234');
    } else res.end('{"ok":true}');
  });
  await new Promise((resolve) => core.listen(0, '127.0.0.1', resolve));
  const coreOrigin = `http://127.0.0.1:${core.address().port}`;
  const gateway = await startGateway({ coreOrigin, allowedOrigins: ['http://127.0.0.1:8790'] });
  t.after(async () => {
    await gateway.close();
    core.closeAllConnections();
    await new Promise((resolve) => core.close(resolve));
  });
  const request = (path, options) => fetch(gateway.origin + path, options);
  assert.equal(
    (await request('/api/v1/library', { headers: { Origin: 'https://evil.example' } })).status,
    403,
  );
  const invalidHost = await new Promise((resolve) => {
    http.get(gateway.origin + '/api/v1/library', { headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
  });
  assert.equal(invalidHost, 403);
  assert.equal(
    (await request('/api/v1/library', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
    403,
  );
  assert.equal(received.length, 0);
  assert.equal((await request('/')).status, 404);
  assert.equal((await request('/api/v1/library', { method: 'POST', body: '{}' })).status, 415);
  const valid = await request('/api/v1/library', { headers: { Origin: 'http://127.0.0.1:8790' } });
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8790');
  assert.equal(received[0].origin, coreOrigin);
  assert.equal(received[0].host, new URL(coreOrigin).host);
  const media = await request('/minireel-proxy/media/abcdef.mp4', {
    headers: { Range: 'bytes=2-4' },
  });
  assert.equal(media.status, 206);
  assert.equal(media.headers.get('content-range'), 'bytes 2-4/8');
  assert.equal(await media.text(), '234');
  assert.equal(received[1].range, 'bytes=2-4');
});
