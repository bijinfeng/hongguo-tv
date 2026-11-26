import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';
import { coverImages } from './fixture-covers.mjs';

const ids = ['101', '201', '301', '401'];
const videos = { 101: ['1001', '1002'], 201: ['2001', '2002'] };
const paths = {
  detail: '/api/v1/series/detail',
  seasons: '/api/v1/series/seasons',
  next: '/api/v1/series/next-season',
};
const mediaPaths = ['a', 'b'].map((letter) => `/minireel-proxy/media/${letter.repeat(64)}`);
const clone = (value) => structuredClone(value);

/** Synthetic public series and local media; history never leaves this process. */
export async function seasonsFixture({ port = 0 } = {}) {
  const [samples, images] = await Promise.all([
    Promise.all(
      ['a', 'b'].map((name) => readFile(resolve(root, `apps/tv/fixtures/t0-${name}.mp4`))),
    ),
    coverImages(['spring', 'home', 'night', 'return']),
  ]);
  const requests = [],
    writes = [],
    unknown = [],
    plans = [],
    timers = new Map();
  let entries = [];
  let keywords = [];
  let librarySession = 0n;
  let nextLibraryOperation = 1n;
  const libraryReceipts = new Map();
  let origin;
  const drama = (id) => ({
    series_id: id,
    title: `春山不负 · 第${ids.indexOf(id) + 1}季`,
    cover: `${origin}/seasons-cover/${ids.indexOf(id)}`,
    intro: '合成系列故事，使用本地自制媒体。',
    episode_count: id === '301' ? 0 : 2,
    tags: ['都市'],
    content_type: '',
  });
  const seasons = () =>
    ids.map((id, index) => ({
      drama: drama(id),
      season_index: index + 1,
      label: `第${index + 1}季`,
      playable: id in videos,
      upcoming: id === '301',
      ...(id in videos ? { first_video_id: videos[id][0] } : {}),
      ...(id === '301' ? { reservation_id: id } : {}),
    }));
  const detail = (id) => ({
    ...drama(id),
    episodes: (videos[id] ?? []).map((video_id, index) => ({
      index: index + 1,
      video_id,
      locked: false,
    })),
  });
  const snapshot = () => ({ owner_id: '', favorites: [], entries: clone(entries) });
  const ok = (data) => ({ status: 200, body: { ok: true, data } });
  const invalid = (record, reason) => {
    unknown.push({ ...record, reason });
    return { status: 400, body: { ok: false, code: 'FIXTURE_UNEXPECTED', error: reason } };
  };
  const exact = (params, keys) =>
    keys.every((key) => params.getAll(key).length === 1) &&
    [...params.keys()].every((key) => keys.includes(key));
  const body = async (request) => {
    let text = '';
    for await (const chunk of request) {
      text += chunk;
      if (Buffer.byteLength(text) > 32768) throw new Error('Fixture body exceeds 32 KiB');
    }
    return JSON.parse(text);
  };
  const handle = async (request, url, record) => {
    const params = url.searchParams;
    if (
      request.method === 'OPTIONS' &&
      [
        '/api/v1/library/session',
        '/api/v1/library/operation',
        '/api/v1/play/release',
        '/api/v1/search/history',
      ].includes(url.pathname)
    )
      return { status: 204 };
    if (request.method === 'POST') {
      let change;
      try {
        change = await body(request);
      } catch (error) {
        return invalid(record, error.message);
      }
      writes.push({ ...record, body: clone(change) });
      if (url.pathname === '/api/v1/search/history' && !url.search) {
        if (
          change.action === 'add' &&
          Object.keys(change).length === 2 &&
          typeof change.query === 'string' &&
          change.query.trim() &&
          change.query.length <= 256
        ) {
          const query = change.query.trim();
          keywords = [query, ...keywords.filter((item) => item !== query)].slice(0, 10);
        } else if (change.action === 'clear' && Object.keys(change).length === 1) keywords = [];
        else return invalid(record, 'Unexpected recent search mutation');
        return ok({ items: keywords });
      }
      if (
        url.pathname === '/api/v1/play/release' &&
        Object.keys(change).length === 1 &&
        mediaPaths.includes(change.path)
      )
        return ok({ released: true });
      if (url.pathname === '/api/v1/library/session' && !url.search) {
        if (JSON.stringify(change) !== JSON.stringify({ owner_id: '' }))
          return invalid(record, 'Unexpected fixture session owner');
        librarySession++;
        nextLibraryOperation = 1n;
        libraryReceipts.clear();
        return ok({ session_id: librarySession.toString(16).padStart(32, '0') });
      }
      const session = librarySession.toString(16).padStart(32, '0');
      const operation = params.get('operation_id');
      if (
        url.pathname !== '/api/v1/library/operation' ||
        !librarySession ||
        !exact(params, ['session_id', 'operation_id']) ||
        params.get('session_id') !== session ||
        !/^[1-9][0-9]*$/.test(operation ?? '') ||
        (change.owner_id != null && change.owner_id !== '')
      )
        return invalid(record, 'Unexpected fixture write or owner');
      const payload = JSON.stringify(change);
      const previous = libraryReceipts.get(operation);
      if (previous)
        return previous.payload === payload
          ? ok(clone(previous.receipt))
          : invalid(record, 'Conflicting fixture operation payload');
      if (operation !== String(nextLibraryOperation))
        return invalid(record, 'Non-continuous fixture operation identity');
      if (change.action === 'progress') {
        const id = change.drama?.series_id;
        const episode = change.episode;
        if (
          !videos[id] ||
          !Number.isInteger(episode) ||
          videos[id][episode - 1] !== change.video_id ||
          !['position', 'duration'].every(
            (key) => Number.isFinite(change[key]) && change[key] >= 0 && change[key] <= 86400,
          ) ||
          (change.completed !== undefined && typeof change.completed !== 'boolean') ||
          Object.keys(change).some(
            (key) =>
              ![
                'action',
                'owner_id',
                'drama',
                'episode',
                'video_id',
                'position',
                'duration',
                'completed',
              ].includes(key),
          ) ||
          Object.keys(change.drama).some(
            (key) =>
              ![
                'series_id',
                'title',
                'cover',
                'cover_fallback',
                'intro',
                'episode_count',
                'tags',
                'content_type',
              ].includes(key),
          )
        )
          return invalid(record, 'History must contain only compact, matching fixture progress');
        const { action: _action, owner_id: _ownerId, ...entry } = change;
        entries = [
          { ...clone(entry), last_played_at: Date.now() },
          ...entries.filter((row) => row.drama.series_id !== id),
        ];
      } else if (
        change.action === 'remove' &&
        change.kind === 'history' &&
        ids.includes(change.series_id)
      ) {
        entries = entries.filter((row) => row.drama.series_id !== change.series_id);
      } else if (change.action === 'clear' && change.kind === 'history') entries = [];
      else return invalid(record, 'Unsupported fixture history mutation');
      nextLibraryOperation++;
      const receipt = {
        session_id: session,
        operation_id: operation,
        outcome: { status: 'committed', library: snapshot() },
      };
      libraryReceipts.set(operation, { payload, receipt });
      return ok(clone(receipt));
    }
    if (!['GET', 'HEAD'].includes(request.method)) return invalid(record, 'Unexpected method');
    const media = mediaPaths.indexOf(url.pathname);
    if (media >= 0 && !url.search) {
      const sample = samples[media];
      let start = 0,
        end = sample.length - 1;
      const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (
          !range ||
          Number(range[1]) >= sample.length ||
          (range[2] && Number(range[2]) < Number(range[1]))
        )
          return {
            status: 416,
            headers: { ...headers, 'Content-Range': `bytes */${sample.length}` },
          };
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), end) : end;
        headers['Content-Range'] = `bytes ${start}-${end}/${sample.length}`;
      }
      return {
        status: request.headers.range ? 206 : 200,
        headers: { ...headers, 'Content-Length': end - start + 1 },
        raw: sample.subarray(start, end + 1),
      };
    }
    if (request.method !== 'GET') return invalid(record, 'HEAD is only valid for media');
    if (url.pathname === '/api/v1/category') {
      if (
        !exact(params, ['genre', 'category_dim_theme', 'sort', 'selectors']) ||
        ['genre', 'category_dim_theme', 'sort'].some((key) => params.get(key) !== '') ||
        params.get('selectors') !== '1'
      )
        return invalid(record, 'Unexpected home directory parameters');
      return ok({ items: [], filters: [], has_more: false });
    }
    const cover = /^\/seasons-cover\/([0-3])$/.exec(url.pathname);
    if (cover && !url.search)
      return {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
        raw: images[Number(cover[1])],
      };
    const endpoint = Object.keys(paths).find((key) => paths[key] === url.pathname);
    if (endpoint) {
      const id = params.get('series_id');
      if (
        !ids.includes(id) ||
        !exact(params, endpoint === 'detail' ? ['series_id', 'content_type'] : ['series_id']) ||
        (endpoint === 'detail' && params.get('content_type') !== '')
      )
        return invalid(record, 'Unexpected series identity or parameters');
      const index = plans.findIndex((plan) => plan.endpoint === endpoint && plan.seriesId === id);
      const plan = index < 0 ? {} : plans.splice(index, 1)[0];
      const data =
        endpoint === 'detail'
          ? detail(id)
          : endpoint === 'seasons'
            ? { items: seasons() }
            : {
                current_season: ids.indexOf(id) + 1,
                next: id === '101' ? seasons()[1] : null,
              };
      return {
        status: plan.status ?? 200,
        delayMs: plan.delayMs ?? 0,
        body: Object.hasOwn(plan, 'body')
          ? plan.body
          : (plan.status ?? 200) === 200
            ? { ok: true, data: Object.hasOwn(plan, 'data') ? plan.data : data }
            : { ok: false, code: 'FIXTURE_OFFLINE', error: '服务暂时不可用，请稍后重试' },
      };
    }
    if (url.pathname === '/api/v1/play/info') {
      const id = params.get('series_id'),
        vid = params.get('vid');
      const index = videos[id]?.indexOf(vid) ?? -1;
      if (
        !exact(params, ['series_id', 'vid', 'mode', 'codec_mode', 'content_type', 'quality']) ||
        index < 0 ||
        params.get('mode') !== 'range' ||
        params.get('codec_mode') !== 'default' ||
        params.get('content_type') !== '' ||
        !['', '720P'].includes(params.get('quality'))
      )
        return invalid(record, 'Media preparation escaped the selected playable fixture episode');
      return ok({
        path: mediaPaths[index],
        vid,
        video_codec: 'h264',
        quality: '720P',
        qualities: ['720P'],
      });
    }
    if (url.pathname === '/api/v1/library' && !url.search) return ok(snapshot());
    if (url.pathname === '/api/v1/account')
      return ok({
        logged_in: false,
        sync: { state: 'local', pending: 0 },
        qr_login_available: false,
      });
    if (url.pathname === '/api/v1/search/history') return ok({ items: keywords });
    if (url.pathname === '/api/v1/search/suggestions') return ok({ items: [] });
    if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (url.pathname === '/api/v1/search') return ok({ items: ids.map(drama), has_more: false });
    if (url.pathname === '/api/v1/lists/recommend')
      return ok({
        channel: params.get('channel'),
        items: [drama('101')],
        has_more: false,
        next_offset: 0,
        feed_cell: '123',
        feed_plan: '456',
        session_id: 'seasons-home',
      });
    return invalid(record, 'Unknown fixture path');
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const record = {
      index: requests.length,
      method: request.method,
      url: url.pathname + url.search,
      receivedAt: Date.now(),
    };
    requests.push(record);
    response.once('finish', () => {
      record.completedAt = Date.now();
    });
    response.once('close', () => {
      if (!record.completedAt) record.abortedAt = Date.now();
    });
    let result;
    try {
      result = await handle(request, url, record);
    } catch (error) {
      result = invalid(record, error.message);
    }
    if (request.method !== 'POST') request.resume();
    record.status = result.status;
    if (result.delayMs)
      await new Promise((done) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          done();
        }, result.delayMs);
        timers.set(timer, done);
      });
    if (response.destroyed) return;
    response.writeHead(result.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      ...result.headers,
    });
    response.end(
      request.method === 'HEAD' || result.status === 204
        ? undefined
        : (result.raw ?? JSON.stringify(result.body)),
    );
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    dramas: Object.fromEntries(ids.map((id) => [id, detail(id)])),
    requests,
    writes,
    unknown,
    queue(endpoint, seriesId, { status = 200, delayMs = 0, ...payload } = {}) {
      assert(
        Object.hasOwn(paths, endpoint) && ids.includes(seriesId),
        'Unknown fixture control target',
      );
      assert(
        Number.isInteger(status) &&
          status >= 200 &&
          status <= 599 &&
          Number.isFinite(delayMs) &&
          delayMs >= 0,
        'Invalid fixture response control',
      );
      assert(
        Object.keys(payload).every((key) => ['data', 'body'].includes(key)) &&
          !(Object.hasOwn(payload, 'data') && Object.hasOwn(payload, 'body')),
        'Use either data or a complete body',
      );
      plans.push({ endpoint, seriesId, status, delayMs, ...clone(payload) });
    },
    assertReadOnly({ since = 0 } = {}) {
      assert.deepEqual(
        writes.filter((row) => row.index >= since),
        [],
        'Browsing must not mutate history or release media',
      );
      assert.deepEqual(
        unknown.filter((row) => row.index >= since),
        [],
        'Unexpected fixture request',
      );
      assert(
        !requests.slice(since).some((row) => /\/play\/|\/minireel-proxy\//.test(row.url)),
        'Browsing must not prepare or fetch media',
      );
    },
    async close() {
      for (const [timer, done] of timers) {
        clearTimeout(timer);
        done();
      }
      timers.clear();
      server.closeAllConnections();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}

export async function seasonsFixtureSelfcheck() {
  const fixture = await seasonsFixture();
  const get = (path, options) => fetch(fixture.origin + path, options);
  try {
    const selector = await (await get(`${paths.seasons}?series_id=101`)).json();
    assert.deepEqual(
      selector.data.items.map((row) => row.drama.series_id),
      ids,
    );
    assert(!selector.data.items[2].first_video_id && !selector.data.items[3].first_video_id);
    assert.equal(
      (await (await get(`${paths.detail}?series_id=101&content_type=`)).json()).data.episodes
        .length,
      2,
    );
    fixture.queue('detail', '101', { status: 503 });
    assert.equal((await get(`${paths.detail}?series_id=101&content_type=`)).status, 503);
    assert.equal((await get(`${paths.detail}?series_id=101&content_type=`)).status, 200);
    fixture.queue('detail', '101', { data: { ...fixture.dramas['101'], series_id: '999' } });
    assert.equal(
      (await (await get(`${paths.detail}?series_id=101&content_type=`)).json()).data.series_id,
      '999',
    );
    fixture.queue('next', '101', { delayMs: 35 });
    const started = Date.now();
    assert.equal(
      (await (await get(`${paths.next}?series_id=101`)).json()).data.next.drama.series_id,
      '201',
    );
    assert(Date.now() - started >= 30);
    fixture.queue('next', '101', { status: 503 });
    assert.equal((await get(`${paths.next}?series_id=101`)).status, 503);
    assert.equal((await get(`${paths.next}?series_id=101`)).status, 200);
    fixture.queue('detail', '201', { delayMs: 200 });
    const controller = new AbortController();
    const pending = get(`${paths.detail}?series_id=201&content_type=`, {
      signal: controller.signal,
    });
    while (!fixture.requests.some((row) => row.url.includes('detail?series_id=201')))
      await new Promise((done) => setTimeout(done, 5));
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    await new Promise((done) => setTimeout(done, 20));
    assert(fixture.requests.at(-1).abortedAt);
    fixture.assertReadOnly();
    const keyword = await (
      await get('/api/v1/search/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', query: '春山' }),
      })
    ).json();
    assert.deepEqual(keyword.data.items, ['春山']);
    const afterSearch = fixture.requests.length;
    assert.deepEqual((await (await get('/api/v1/search/history')).json()).data.items, ['春山']);
    fixture.assertReadOnly({ since: afterSearch });
    const info = await (
      await get(
        '/api/v1/play/info?series_id=201&vid=2002&mode=range&codec_mode=default&content_type=&quality=',
      )
    ).json();
    const media = await get(info.data.path, { headers: { Range: 'bytes=1-8' } });
    assert.equal(media.status, 206);
    assert.equal((await media.arrayBuffer()).byteLength, 8);
    assert.equal(
      (await get(info.data.path, { method: 'HEAD' })).headers.get('content-type'),
      'video/mp4',
    );
    const progress = {
      action: 'progress',
      drama: { ...fixture.dramas['201'] },
      episode: 2,
      video_id: '2002',
      position: 1,
      duration: 6,
    };
    delete progress.drama.episodes;
    const session = await (
      await get('/api/v1/library/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: '' }),
      })
    ).json();
    const saved = await (
      await get(`/api/v1/library/operation?session_id=${session.data.session_id}&operation_id=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progress),
      })
    ).json();
    assert.equal(saved.data.outcome.library.entries[0].drama.series_id, '201');
    assert.equal((await (await get('/api/v1/library')).json()).data.entries.length, 1);
    assert.throws(() => fixture.assertReadOnly());
    assert.deepEqual(fixture.unknown, []);
    assert.equal((await get(`${paths.detail}?series_id=101&content_type=bad`)).status, 400);
    assert.equal((await get(`${paths.seasons}?series_id=101&extra=`)).status, 400);
    return {
      requests: fixture.requests.length,
      writes: fixture.writes.length,
      invalidRequestsRejected: fixture.unknown.length,
    };
  } finally {
    await fixture.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv.includes('--selfcheck')
)
  console.log(JSON.stringify(await seasonsFixtureSelfcheck()));
