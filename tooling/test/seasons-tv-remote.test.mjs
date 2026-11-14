import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seasonsFixture } from '../src/seasons-fixture.mjs';
import { verifySeasonRequests } from '../src/seasons-tv-remote.mjs';

const detail = (id) => `/api/v1/series/detail?series_id=${id}&content_type=`;
const info = (id, video) =>
  `/api/v1/play/info?series_id=${id}&vid=${video}&mode=range&codec_mode=default&content_type=&quality=`;
const search = (fixture) =>
  fetch(fixture.origin + '/api/v1/search/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', query: 'story' }),
  });

test('TV series traffic evidence requires exact retry and rejects browsing side effects and unknown routes', async () => {
  for (const suite of ['details', 'mismatch']) {
    const fixture = await seasonsFixture();
    try {
      await search(fixture);
      await fetch(fixture.origin + detail('101'));
      fixture.queue(
        'detail',
        '201',
        suite === 'details'
          ? { status: 503 }
          : { data: { ...fixture.dramas['201'], series_id: '999' } },
      );
      await fetch(fixture.origin + detail('201'));
      await fetch(fixture.origin + detail('201'));
      assert.equal(verifySeasonRequests(fixture, suite).passed, true);
      await fetch(fixture.origin + detail('301'));
      assert.throws(() => verifySeasonRequests(fixture, suite), /Upcoming selection/);
      fixture.requests.pop();
      await fetch(fixture.origin + info('101', '1001'));
      assert.throws(() => verifySeasonRequests(fixture, suite), /Browsing must not/);
      fixture.requests.pop();
      await fetch(fixture.origin + '/api/v1/not-a-route');
      assert.throws(() => verifySeasonRequests(fixture, suite), /Unexpected fixture traffic/);
    } finally {
      await fixture.close();
    }
  }
});

test('TV player series evidence allows only two confirmed media identities and compact matching progress', async () => {
  const fixture = await seasonsFixture();
  try {
    await search(fixture);
    await fetch(fixture.origin + detail('101'));
    await fetch(fixture.origin + info('101', '1001'));
    await fetch(fixture.origin + detail('201'));
    await fetch(fixture.origin + info('201', '2001'));
    const { episodes: _episodes, ...drama } = fixture.dramas['101'];
    await fetch(fixture.origin + '/api/v1/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'progress',
        drama,
        episode: 1,
        video_id: '1001',
        position: 1,
        duration: 12,
        completed: false,
      }),
    });
    assert.equal(verifySeasonRequests(fixture, 'player-browse').preparations, 2);
    fixture.writes.at(-1).body.drama.episodes = [];
    assert.throws(
      () => verifySeasonRequests(fixture, 'player-browse'),
      /History must remain compact/,
    );
    delete fixture.writes.at(-1).body.drama.episodes;
    await fetch(fixture.origin + info('101', '1001'));
    assert.throws(() => verifySeasonRequests(fixture, 'player-browse'), /Only two confirmed/);
  } finally {
    await fixture.close();
  }
});
