import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rankingsFixture } from './rankings-fixture.mjs';

/** Synthetic read-only source, with the existing application destinations behind the same origin. */
export async function radarFixture({
  port = 0,
  sequence = ['normal', 'partial', 'stale', 'error', 'normal'],
  detailDelayMs = 1600,
} = {}) {
  const official = await rankingsFixture();
  const requests = [];
  const writes = [];
  const detailAttempts = new Map();
  let reads = 0;
  const ids = [
    '101',
    '102',
    '201',
    ...Array.from({ length: 41 }, (_, index) => String(500 + index)),
  ];
  const item = (id, index) => ({
    id,
    title:
      id === '540'
        ? '较后位置的雷达故事：穿过漫长雨季重新遇见故人与山河之后仍然记得最初的约定和归途 540'
        : `雷达故事 ${id}`,
    rank: index + 1,
    delta: index === 0 ? 2 : index === 1 ? 0 : index === 2 ? -1 : null,
    badge: index === 3 ? '新进' : null,
    streak: index === 0 ? 0 : index === 1 ? 12 : null,
  });
  const growthItem = (id, index) => ({
    id,
    title: `雷达故事 ${id}`,
    type: ['real', 'ai', 'comic', 'unknown'][index % 4],
    hot: index === 0 ? '9223372036854775807' : index === 3 ? null : '0',
    fav: null,
    gap: 2,
    d_hot:
      index === 0
        ? '9007199254740992'
        : index === 1
          ? '9007199254740993'
          : index === 2
            ? '-12'
            : index === 3
              ? null
              : '0',
    d_fav: index === 0 ? '0' : index === 1 ? '-20' : null,
    r_hot: index === 0 ? 0 : index === 1 ? 0.12 : index === 2 ? -0.03 : null,
    d7_hot: index === 0 ? '0' : index === 1 ? '-1200' : null,
    d7_fav: null,
  });
  const bucket = (values) => ({
    rank_date: '2026-11-13',
    prev_rank_date: '2026-11-12',
    items: values.map((id) => item(id, ids.indexOf(id))),
  });
  const snapshot = (scenario) => ({
    ranks:
      scenario === 'growth-only'
        ? null
        : {
            hot: bucket(ids),
            real: bucket(['101']),
            ai: bucket(['102']),
            comic: bucket(['201']),
          },
    growth:
      scenario === 'partial'
        ? null
        : {
            date: '2026-11-14',
            prev_date: '2026-11-12',
            gap: 2,
            items: scenario === 'empty-growth' ? [] : ids.map(growthItem),
          },
    ranks_stale: scenario === 'stale',
    growth_stale: scenario === 'partial' || scenario === 'stale',
    ranks_fetched_at: scenario === 'growth-only' ? null : '2026-11-14T10:00:00Z',
    growth_fetched_at: scenario === 'partial' ? null : '2026-11-14T10:05:00Z',
    cache_write_failed: scenario === 'stale',
  });
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://127.0.0.1');
    const record = { method: req.method, path: url.pathname + url.search, url: req.url };
    requests.push(record);
    res.once('finish', () => {
      record.status = res.statusCode;
    });
    req.resume();
    if (req.method !== 'GET') {
      writes.push(req.url);
      send(res, 405, { ok: false, error: 'Read-only fixture' });
      return;
    }
    try {
      if (url.pathname === '/api/v1/lists/rank' && url.search === '') {
        reads = 0;
        detailAttempts.clear();
      }
      if (url.pathname === '/api/v1/radar') {
        assert.equal(url.search, '');
        const scenario = sequence[Math.min(reads++, sequence.length - 1)];
        if (scenario === 'error') send(res, 503, { ok: false, error: 'Radar fixture unavailable' });
        else send(res, 200, { ok: true, data: snapshot(scenario) });
        return;
      }
      if (url.pathname === '/api/v1/series/detail') {
        const id = url.searchParams.get('series_id');
        if (id === '102') {
          const attempt = (detailAttempts.get(id) ?? 0) + 1;
          detailAttempts.set(id, attempt);
          if (attempt === 1) {
            send(res, 200, {
              ok: true,
              data: { series_id: '101', title: '错误身份', cover: '', intro: '', episodes: [] },
            });
            return;
          }
          if (attempt === 2) {
            send(res, 503, { ok: false, error: 'Detail fixture unavailable' });
            return;
          }
        }
        if (id === '201') await new Promise((resolve) => setTimeout(resolve, detailDelayMs));
      }
      const upstream = await fetch(official.origin + req.url);
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      send(res, 500, { ok: false, error: String(error) });
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await official.close();
    },
    assertReadOnly() {
      assert.deepEqual(writes, []);
      assert(requests.every((request) => request.method === 'GET'));
      assert(!requests.some((request) => /\/play\/|\/media\//.test(request.path)));
      official.assertReadOnly();
    },
  };
}
