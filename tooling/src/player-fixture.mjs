import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';

/** Actual APK decoder/input acceptance only: original footage and explicit stub APIs. */
export async function playerFixture({ port = 0 } = {}) {
  const samples = await Promise.all(
    ['a', 'b'].map((name) => readFile(resolve(root, `apps/tv/fixtures/t0-${name}.mp4`))),
  );
  const requests = [];
  const writes = [];
  let librarySession = 0n;
  let nextLibraryOperation = 1n;
  let entries = [];
  const libraryReceipts = new Map();
  const drama = {
    series_id: '123',
    title: '自制媒体验收',
    cover: '',
    intro: '',
    episode_count: 3,
    episodes: [
      { index: 1, video_id: '456', locked: false },
      { index: 2, video_id: '457', locked: false },
      { index: 3, video_id: '458', locked: true },
    ],
  };
  let origin;
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url });
    const url = new URL(request.url, origin);
    const reply = (data, status = 200) =>
      response
        .writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        .end(JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, error: data }));
    if (url.pathname.startsWith('/minireel-proxy/media/')) {
      const token = url.pathname.split('/').at(-1);
      const sample =
        token === 'a'.repeat(64) ? samples[0] : token === 'b'.repeat(64) ? samples[1] : undefined;
      if (!sample || !['GET', 'HEAD'].includes(request.method))
        return reply('Unknown media fixture', 404);
      let start = 0,
        end = sample.length - 1;
      response.setHeader('Content-Type', 'video/mp4');
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Cache-Control', 'no-store');
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (
          !range ||
          Number(range[1]) >= sample.length ||
          (range[2] && Number(range[2]) < Number(range[1]))
        ) {
          response.writeHead(416, { 'Content-Range': `bytes */${sample.length}` }).end();
          return;
        }
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), end) : end;
        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${sample.length}`);
      }
      response.setHeader('Content-Length', end - start + 1);
      response.end(request.method === 'HEAD' ? undefined : sample.subarray(start, end + 1));
      return;
    }
    if (
      ['/api/v1/library/session', '/api/v1/library/operation'].includes(url.pathname) &&
      request.method === 'POST'
    ) {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 65536) return reply('Fixture request too large', 413);
      }
      let change;
      try {
        change = JSON.parse(body);
      } catch {
        return reply('Invalid fixture JSON', 400);
      }
      if (url.pathname === '/api/v1/library/session') {
        if (url.search || JSON.stringify(change) !== JSON.stringify({ owner_id: '' }))
          return reply('Invalid fixture guest session', 400);
        librarySession++;
        nextLibraryOperation = 1n;
        libraryReceipts.clear();
        return reply({ session_id: librarySession.toString(16).padStart(32, '0') });
      }
      const session = librarySession.toString(16).padStart(32, '0');
      const operation = url.searchParams.get('operation_id');
      if (
        !librarySession ||
        url.searchParams.get('session_id') !== session ||
        url.searchParams.getAll('session_id').length !== 1 ||
        url.searchParams.getAll('operation_id').length !== 1 ||
        [...url.searchParams.keys()].length !== 2 ||
        !/^[1-9][0-9]*$/.test(operation ?? '')
      )
        return reply('Invalid fixture operation identity', 409);
      const payload = JSON.stringify(change);
      const previous = libraryReceipts.get(operation);
      if (previous)
        return previous.payload === payload
          ? reply(previous.receipt)
          : reply('Conflicting fixture operation payload', 409);
      if (operation !== String(nextLibraryOperation))
        return reply('Non-continuous fixture operation identity', 409);
      if (
        change?.action !== 'progress' ||
        (change.owner_id ?? '') !== '' ||
        change.drama?.series_id !== drama.series_id ||
        change.drama.episodes !== undefined ||
        !drama.episodes.some(
          (episode) =>
            !episode.locked &&
            episode.index === change.episode &&
            episode.video_id === change.video_id,
        )
      )
        return reply('Player fixture accepts compact matching guest progress only', 400);
      writes.push(change);
      nextLibraryOperation++;
      const { action: _action, owner_id: _ownerId, ...entry } = change;
      entries = [{ ...entry, last_played_at: Date.now() }];
      const receipt = {
        session_id: session,
        operation_id: operation,
        outcome: { status: 'committed', library: { owner_id: '', entries } },
      };
      libraryReceipts.set(operation, { payload, receipt });
      return reply(receipt);
    }
    if (url.pathname === '/api/v1/library' && request.method === 'GET')
      return reply({ owner_id: '', entries });
    if (url.pathname.startsWith('/api/v1/library')) return reply('Unexpected library write', 409);
    if (url.pathname === '/api/v1/search/history') return reply({ items: [] });
    if (url.pathname === '/api/v1/search/suggestions') return reply({ items: [] });
    if (url.pathname === '/api/v1/search/discovery') return reply({ guesses: [], boards: [] });
    if (url.pathname === '/api/v1/account')
      return reply({ logged_in: false, qr_login_available: false });
    if (url.pathname === '/api/v1/search') return reply({ items: [drama], has_more: false });
    if (url.pathname === '/api/v1/series/detail') return reply(drama);
    if (
      url.pathname === '/api/v1/series/seasons' &&
      request.method === 'GET' &&
      url.search === '?series_id=123'
    )
      return reply({ items: [] });
    if (url.pathname === '/api/v1/play/info')
      return reply({
        path:
          '/minireel-proxy/media/' + (url.searchParams.get('vid') === '457' ? 'b' : 'a').repeat(64),
        vid: url.searchParams.get('vid'),
        video_codec: 'h264',
        quality: '720P',
        qualities: ['720P'],
      });
    if (url.pathname === '/api/v1/play/release') return reply({ released: true });
    return reply('Unknown player fixture route', 404);
  });
  await new Promise((done) => server.listen(port, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    writes,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
