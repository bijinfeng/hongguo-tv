import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';

/** Acceptance-only HTTP fixture; never imported or started by a product entry. */
export async function browsingFixture() {
  const requests = [];
  const continuations = new Map();
  let keywords = ['重生', '古装'];
  let clearAttempts = 0;
  let origin;
  const episodes = Array.from({ length: 75 }, (_, i) => ({
    index: i + 1,
    video_id: String(1000 + i),
    locked: i === 59,
  }));
  const drama = (i = 0) => ({
    series_id: String(123 + i),
    title: i ? `重生之后 ${i + 1}` : '重生之后',
    cover: `${origin}/cover/${i % 4}`,
    intro: '重新开始的故事。面对熟悉的选择，这一次她决定走自己的路。',
    episode_count: 75,
    episodes,
  });
  const server = createServer(async (req, res) => {
    const record = { method: req.method, url: req.url };
    requests.push(record);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/cover/')) {
      const image = ['home', 'night', 'return', 'spring'][Number(url.pathname.at(-1))];
      res.setHeader('Content-Type', 'image/png');
      res.end(await readFile(resolve(root, `design/prototype/assets/${image}.png`)));
      return;
    }
    const reply = (data, status = 200) => {
      res
        .writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, error: data }));
    };
    if (url.pathname === '/api/v1/search/history') {
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) return reply('Fixture keyword request too large', 413);
        }
        let action;
        try {
          action = JSON.parse(body);
        } catch {
          return reply('Invalid fixture JSON', 400);
        }
        record.body = action;
        if (action.action === 'clear') {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (++clearAttempts % 2) return reply('合成清空失败', 503);
          keywords = [];
        } else if (action.action === 'add' && typeof action.query === 'string') {
          keywords = [action.query, ...keywords.filter((term) => term !== action.query)].slice(
            0,
            10,
          );
        } else return reply('Invalid fixture keyword action', 400);
      }
      return reply({ items: keywords });
    }
    if (req.method === 'POST') {
      reply('Acceptance fixture rejects writes', 409);
      return;
    }
    if (url.pathname === '/api/v1/library') {
      reply({
        owner_id: '',
        entries: [
          { drama: drama(), episode: 59, video_id: '1058', position: 15, last_played_at: 123 },
        ],
      });
      return;
    }
    if (url.pathname === '/api/v1/account') {
      reply({ logged_in: false, qr_login_available: false });
      return;
    }
    if (url.pathname === '/api/v1/search') {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!offset) continuations.set(url.searchParams.get('q'), 0);
      if (offset) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const term = url.searchParams.get('q');
        const attempt = (continuations.get(term) || 0) + 1;
        continuations.set(term, attempt);
        if (offset === 1 && attempt === 1) {
          reply('合成分页失败', 503);
          return;
        }
      }
      const start = offset === 0 ? 0 : offset === 1 ? 39 : 63;
      const count = offset === 0 ? 40 : offset === 1 ? 25 : 17;
      reply({
        items: Array.from({ length: count }, (_, i) => drama(start + i)),
        has_more: offset < 2,
        next_offset: offset + 1,
        source: 'web',
      });
      return;
    }
    if (url.pathname === '/api/v1/series/detail') {
      reply(drama(Number(url.searchParams.get('series_id')) - 123));
      return;
    }
    if (url.pathname === '/api/v1/play/info') {
      reply('CORE_NOT_IMPLEMENTED', 501);
      return;
    }
    reply('Unknown acceptance route', 404);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}
