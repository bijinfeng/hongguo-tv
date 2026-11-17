import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { coverImages } from './fixture-covers.mjs';

const ids = {
  weekly: 'weekly & raw',
  actor: 'actor/榜 & 9',
  later: 'later/榜 & 48',
  dense: 'dense/32 & raw',
  sub: 'sub & 2',
  deep: 'deep/子榜 & 3',
  panel: 'panel/7 & raw',
};
const option = (id, label, selected = false) => ({
  id,
  label,
  selected,
  children: [],
  panels: [],
});

/** Synthetic GET-only HTTP source for the production rankings page and its destinations. */
export async function rankingsFixture({ port = 0, terminalDelayMs = 1600 } = {}) {
  const images = await coverImages();
  const requests = [];
  const writes = [];
  const unknown = [];
  let origin;
  let epoch = 0;
  let sessions = new Map();
  let attempts = new Map();
  const picture = (id) => `${origin}/rankings-cover/${Number(id) % images.length}`;
  const drama = (id) => ({
    series_id: id,
    title:
      id === '102' || id === '540'
        ? `归乡之后仍然记得那年春山与故人的漫长故事 ${id}`
        : `榜单故事 ${id}`,
    cover: id === '102' || id === '540' ? '' : picture(id),
    intro: '榜单合成故事，只提供公开详情，不触发播放或账号操作。',
    episode_count: 2,
    tags: ['都市'],
  });
  const rankedDrama = (id, rank) => ({
    entry: { kind: 'drama', drama: drama(id) },
    ...(rank === undefined ? {} : { rank }),
    heat: '公开热度 1234',
  });
  const rankedActor = (id, rank) => ({
    entry: {
      kind: 'actor',
      actor: { id, name: `榜单演员 ${id}`, avatar: picture(id), description: '公开演员资料' },
      tags: ['演员'],
    },
    rank,
    badge: '人气演员',
  });
  const menus = () => {
    let child = option('sub/8 & raw', '第八层子榜', true);
    for (let depth = 7; depth > 0; depth--)
      child = {
        ...option(`sub/${depth} & raw`, `第${depth}层子榜`, true),
        children: [child],
      };
    return [
      {
        ...option(ids.weekly, '服务端周榜', true),
        children: [
          option('sub/default', '默认子榜', true),
          { ...option(ids.sub, '服务端第二子榜'), children: [option(ids.deep, '更深子榜', true)] },
        ],
        panels: [
          {
            type: 'period & raw',
            label: '服务端时段',
            options: [option('', '默认时段', true), option(ids.panel, '近七天')],
          },
        ],
      },
      option(ids.actor, '服务端演员榜'),
      option(ids.later, '长列表榜单'),
      {
        ...option(ids.dense, '密集动态榜单'),
        children: [child],
        panels: Array.from({ length: 32 }, (_, index) => ({
          type: `group/${index}`,
          label: `具名筛选组 ${index + 1}`,
          options: [option(`choice/${index} & raw`, `筛选值 ${index + 1}`, true)],
        })),
      },
      option('', '服务端空值榜'),
    ];
  };
  const ok = (data) => ({ status: 200, body: { ok: true, data } });
  const invalid = (path, reason) => {
    unknown.push({ path, reason });
    return { status: 400, body: { ok: false, code: 'FIXTURE_UNEXPECTED', error: reason } };
  };
  const knownDrama = (id) =>
    ['101', '102', '201', '501', '901', '902'].includes(id) || /^5[0-4]\d$|^55[01]$/.test(id ?? '');
  const handle = (url) => {
    const path = url.pathname + url.search;
    const params = url.searchParams;
    if (url.pathname === '/api/v1/library')
      return ok({ owner_id: 'rankings-fixture', entries: [], favorites: [] });
    if (url.pathname === '/api/v1/account')
      return ok({
        logged_in: false,
        qr_login_available: false,
        sync: { state: 'local', pending: 0 },
      });
    if (url.pathname === '/api/v1/search/history' || url.pathname === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (url.pathname === '/api/v1/lists/recommend')
      return ok({
        channel: params.get('channel'),
        items: [drama('101')],
        has_more: false,
        next_offset: 0,
        feed_cell: '123',
        feed_plan: '456',
        session_id: 'rankings-home',
      });
    if (url.pathname === '/api/v1/series/seasons') {
      if ([...params.keys()].length !== 1 || !knownDrama(params.get('series_id')))
        return invalid(path, 'Unexpected seasonless drama identity or parameters');
      return ok({ items: [] });
    }
    if (url.pathname === '/api/v1/series/detail') {
      const id = params.get('series_id');
      if (!knownDrama(id)) return invalid(path, 'Actor identity or unknown ID was used as a drama');
      if (
        [...params.keys()].some((key) => !['series_id', 'content_type'].includes(key)) ||
        params.getAll('series_id').length !== 1 ||
        params.getAll('content_type').length !== 1 ||
        params.get('content_type') !== ''
      )
        return invalid(path, 'Unexpected detail parameters');
      return ok({
        ...drama(id),
        episodes: [1, 2].map((index) => ({ index, video_id: `${id}${index}`, locked: false })),
      });
    }
    if (url.pathname === '/api/v1/actors/works') {
      const id = params.get('actor_id');
      if (!['101', '202'].includes(id) || [...params.keys()].some((key) => key !== 'actor_id'))
        return invalid(path, 'Unexpected actor works identity');
      return ok({
        actor: { id, name: `榜单演员 ${id}`, description: '公开演员作品', avatar: picture(id) },
        items: [drama('501')],
      });
    }
    if (url.pathname !== '/api/v1/lists/rank') return invalid(path, 'Unknown fixture path');
    if (!url.search) {
      // Each fresh App starts with an omitted selector; explicit selections never reset a run.
      epoch++;
      sessions = new Map();
      attempts = new Map();
    }
    if (
      [...params.keys()].some(
        (key) => !['rank', 'rank_sub', 'rank_panel', 'offset', 'session_id', 'shown'].includes(key),
      ) ||
      [...params.keys()].some((key) => params.getAll(key).length !== 1)
    )
      return invalid(path, 'Unknown or duplicate ranking parameters');
    const rank = params.get('rank') ?? ids.weekly;
    const sub = params.get('rank_sub');
    const panel = params.get('rank_panel');
    if ((sub !== null || panel !== null) && !params.has('rank'))
      return invalid(path, 'An explicit descendant must preserve its root identity');
    if (![ids.weekly, ids.actor, ids.later, ids.dense, ''].includes(rank))
      return invalid(path, 'A ranking ID was invented or normalized');
    if (
      (rank === ids.weekly &&
        ((sub !== null && !['sub/default', ids.sub, ids.deep].includes(sub)) ||
          (panel !== null && !['', ids.panel].includes(panel)))) ||
      (rank === ids.dense &&
        ((sub !== null && !/^sub\/[1-8] & raw$/.test(sub)) ||
          (panel !== null && !/^choice\/(?:[0-9]|[12][0-9]|3[01]) & raw$/.test(panel)))) ||
      (![ids.weekly, ids.dense].includes(rank) && (sub !== null || panel !== null))
    )
      return invalid(path, 'A selector escaped its server-provided parent');
    const key = JSON.stringify([rank, sub, panel]);
    const offset = params.get('offset');
    if (offset === null) {
      if (params.has('shown') || params.has('session_id'))
        return invalid(path, 'First page must omit continuation context');
      const items =
        rank === ''
          ? []
          : rank === ids.actor
            ? [rankedActor('202', 7)]
            : rank === ids.later
              ? Array.from({ length: 52 }, (_, index) =>
                  rankedDrama(String(500 + index), index + 11),
                )
              : rank === ids.dense
                ? [rankedDrama('901', 21)]
                : [rankedDrama('101', 9), rankedActor('101', 13), rankedDrama('102')];
      const session = `rankings-${epoch}-${sessions.size + 1}`;
      sessions.set(key, {
        session,
        ids: [...new Set(items.map((item) => item.entry.drama?.series_id ?? item.entry.actor.id))],
      });
      return ok({
        items,
        ranks: menus(),
        has_more: [ids.weekly, ids.dense].includes(rank),
        next_offset: [ids.weekly, ids.dense].includes(rank) ? 20 : 0,
        session_id: session,
      });
    }
    const owner = sessions.get(key);
    if (
      !owner ||
      owner.session !== params.get('session_id') ||
      owner.ids.join(',') !== params.get('shown')
    )
      return invalid(path, 'Continuation lost its exact owner, session or raw shown IDs');
    if (![ids.weekly, ids.dense].includes(rank))
      return invalid(path, 'Terminal list requested another page');
    if (offset === '20') {
      const count = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, count);
      if (count === 1)
        return {
          status: 503,
          body: { ok: false, code: 'FIXTURE_OFFLINE', error: '服务暂时不可用，请稍后重试' },
        };
      return ok({
        items: [],
        ranks: [],
        has_more: true,
        next_offset: 45,
        session_id: owner.session,
      });
    }
    if (offset !== '45') return invalid(path, 'Continuation offset was derived from item count');
    return {
      ...ok({
        items: [rankedDrama(rank === ids.dense ? '902' : '201', 30)],
        ranks: [],
        has_more: false,
        next_offset: 80,
        session_id: owner.session,
      }),
      delay: terminalDelayMs,
    };
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const record = { method: request.method, url: url.pathname + url.search, epoch };
    requests.push(record);
    request.resume();
    if (request.method !== 'GET') {
      record.status = 405;
      writes.push(record);
      response.writeHead(405, { 'Access-Control-Allow-Origin': '*' }).end();
      return;
    }
    const image = /^\/rankings-cover\/([0-3])$/.exec(url.pathname);
    const result = image ? { status: 200, body: images[Number(image[1])] } : handle(url);
    record.epoch = epoch;
    record.status = result.status;
    if (result.delay) await new Promise((done) => setTimeout(done, result.delay));
    if (response.destroyed) return;
    response
      .writeHead(result.status, {
        'Content-Type': image ? 'image/png' : 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      .end(image ? result.body : JSON.stringify(result.body));
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    writes,
    unknown,
    assertReadOnly() {
      assert.deepEqual(writes, [], 'Rankings acceptance must not write business data');
      assert.deepEqual(unknown, [], 'Rankings acceptance made an unexpected request');
      assert.equal(
        requests.some(({ url }) => /\/play\/|series_id=202(?:&|$)/.test(url)),
        false,
        'Actor-only identities must never enter drama or playback requests',
      );
      for (const request of requests.filter(({ url }) =>
        url.startsWith('/api/v1/series/seasons'),
      )) {
        const url = new URL(request.url, origin);
        assert(
          request.method === 'GET' &&
            url.pathname === '/api/v1/series/seasons' &&
            [...url.searchParams.keys()].length === 1 &&
            knownDrama(url.searchParams.get('series_id')),
          'Only exact known seasonless drama reads are allowed',
        );
      }
    },
    async close() {
      server.closeAllConnections();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
