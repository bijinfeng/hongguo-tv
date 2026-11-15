import assert from 'node:assert/strict';
import { browsingFixture } from './browsing-fixture.mjs';

export async function detailExtrasFixture(options = {}) {
  const fixture = await browsingFixture({ ...options, detailExtras: true });
  return {
    ...fixture,
    assertReadOnly: () => verifyDetailExtrasRequests(fixture, { completed: false }),
  };
}

/** Server evidence is independent of host request recording and catches hidden writes or media. */
export function verifyDetailExtrasRequests(fixture, { completed = true } = {}) {
  const { requests, writes, unknown, media } = fixture;
  assert.deepEqual(writes, [], 'Detail browsing must never write');
  assert.deepEqual(media, [], 'Detail browsing must never prepare or fetch media');
  assert.deepEqual(unknown, [], 'Every detail browsing request must match a known exact route');
  assert(
    requests.every(({ method }) => method === 'GET'),
    'Only GET is allowed',
  );
  const urls = requests.map(({ url }) => new URL(url, fixture.origin));
  assert(!urls.some(({ pathname }) => /\/play\/|\/media\/|\/minireel-proxy\//.test(pathname)));
  const details = urls.filter(({ pathname }) => pathname === '/api/v1/series/detail');
  const actors = urls.filter(({ pathname }) => pathname === '/api/v1/actors/works');
  if (completed) {
    for (const id of ['123', '124', '204', '343'])
      assert(
        details.some((url) => url.searchParams.get('series_id') === id),
        `Detail ${id} must be read`,
      );
    assert(actors.length, 'Actor works must be read');
  }
  assert(
    actors.every((url) => url.search === '?actor_id=9007199254740993'),
    'Actor identity must stay an exact decimal string',
  );
  assert(
    details.every(
      (url) => [...url.searchParams].length === 2 && url.searchParams.get('content_type') === '',
    ),
    'Detail requests must preserve the empty content type',
  );
  return {
    suite: 'detail-extras',
    passed: true,
    detailReads: details.length,
    actorReads: actors.length,
    writes: writes.length,
    media: media.length,
    unknown: unknown.length,
  };
}
