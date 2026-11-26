import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonsFixture, seasonsFixtureSelfcheck } from '../src/seasons-fixture.mjs';
import { browsingFixture } from '../src/browsing-fixture.mjs';
import { createLibraryWriter } from '../../packages/core-client/src/library-writer.ts';

test('series fixture preserves exact identities, queued failures, real media ranges and isolated writes', async () => {
  await seasonsFixtureSelfcheck();
});

test('series host accepts only the production home directory query', async () => {
  const fixture = await seasonsFixture();
  try {
    const path = '/api/v1/category?genre=&category_dim_theme=&sort=&selectors=1';
    const response = await fetch(fixture.origin + path);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { items: [], filters: [], has_more: false });
    assert.deepEqual(fixture.unknown, []);
    for (const query of [path.replace('selectors=1', 'selectors=0'), path + '&genre=other'])
      assert.equal((await fetch(fixture.origin + query)).status, 400);
    assert.equal(fixture.unknown.length, 2);
    assert.deepEqual(fixture.writes, []);
  } finally {
    await fixture.close();
  }
});

for (const [name, create, series, video] of [
  ['series', seasonsFixture, '101', '1001'],
  ['feed', () => browsingFixture({ feed: true }), '123', '1000'],
])
  test(`${name} playback fixture serves the production writer and keeps original receipts on replay`, async () => {
    const fixture = await create();
    const request = async (path, _abort, body) => {
      const response = await fetch(fixture.origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result.data;
    };
    try {
      if (name === 'feed') await request('/api/v1/library');
      const { episodes: _episodes, ...drama } = await request(
        `/api/v1/series/detail?series_id=${series}&content_type=`,
      );
      const writer = createLibraryWriter(request);
      const progress = {
        action: 'progress',
        drama,
        episode: 1,
        video_id: video,
        position: 1,
        duration: 12,
      };
      const first = await writer.write(progress);
      const second = await writer.write({ ...progress, position: 5 });
      assert.equal(first.library.entries[0].position, 1);
      assert.equal(second.library.entries[0].position, 5);
      const path = `/api/v1/library/operation?session_id=${first.session_id}&operation_id=1`;
      const replay = await request(path, undefined, progress);
      assert.deepEqual(replay.outcome.library, first.library);
      await assert.rejects(request(path, undefined, { ...progress, position: 9 }), /Conflicting/);
      await assert.rejects(
        request(path.replace('operation_id=1', 'operation_id=4'), undefined, progress),
        /continuous/,
      );
      await assert.rejects(request('/api/v1/library', undefined, progress));
    } finally {
      await fixture.close();
    }
  });

test('pure browsing rejects session creation and operation writes', async () => {
  const fixture = await browsingFixture();
  try {
    for (const path of [
      '/api/v1/library/session',
      '/api/v1/library/operation?session_id=' + 'a'.repeat(32) + '&operation_id=1',
    ]) {
      const response = await fetch(fixture.origin + path, { method: 'POST', body: '{}' });
      assert.equal(response.status, 409);
    }
    assert.deepEqual(fixture.writes, []);
    assert.equal(fixture.requests.filter((request) => request.method === 'POST').length, 2);
  } finally {
    await fixture.close();
  }
});
