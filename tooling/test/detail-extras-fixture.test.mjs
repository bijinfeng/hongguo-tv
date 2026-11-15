import assert from 'node:assert/strict';
import test from 'node:test';
import { detailExtrasFixture, verifyDetailExtrasRequests } from '../src/detail-extras-fixture.mjs';

test('detail extras HTTP fixture preserves identities, season scope and read-only evidence', async () => {
  const fixture = await detailExtrasFixture();
  const read = async (path) => (await (await fetch(`${fixture.origin}${path}`)).json()).data;
  try {
    const library = await read('/api/v1/library');
    assert.equal(library.entries[0].drama.series_id, '123');
    assert.equal(library.entries[0].drama.episodes, undefined);
    const detail = await read('/api/v1/series/detail?series_id=123&content_type=');
    assert.equal(detail.actors[0].actor_id, '9007199254740993');
    assert.equal(detail.actors[1].actor_id, undefined);
    assert.equal(detail.related.at(-1).series_id, '343');
    assert.equal(detail.episodes[0].video_id, '1231');
    const works = await read('/api/v1/actors/works?actor_id=9007199254740993');
    assert.equal(works.items.at(-1).series_id, '204');
    for (const id of ['124', '204', '343']) {
      const other = await read(`/api/v1/series/detail?series_id=${id}&content_type=`);
      assert.deepEqual(other.actors, []);
      assert.deepEqual(other.related, []);
      assert.equal(other.episodes[0].video_id, `${id}1`);
    }
    const seasons = await read('/api/v1/series/seasons?series_id=123');
    assert.deepEqual(
      seasons.items.map(({ drama }) => drama.series_id),
      ['123', '124'],
    );
    assert(seasons.items.every(({ playable }) => playable));
    const namesOnly = await read('/api/v1/series/detail?series_id=300&content_type=');
    assert.equal(namesOnly.actors.length, 1);
    assert.equal(namesOnly.actors[0].actor_id, undefined);
    assert.equal([...namesOnly.actors[0].name].length, 100);
    assert.deepEqual(namesOnly.related, []);
    verifyDetailExtrasRequests(fixture);
  } finally {
    await fixture.close();
  }
});

test('detail extras HTTP fixture records rejected writes, media and rounded actor IDs', async () => {
  const fixture = await detailExtrasFixture();
  try {
    await fetch(`${fixture.origin}/api/v1/library`, { method: 'POST', body: '{}' });
    await fetch(`${fixture.origin}/api/v1/play/info?series_id=123&vid=1231`);
    await fetch(`${fixture.origin}/api/v1/actors/works?actor_id=9007199254740992`);
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.media.length, 1);
    assert.equal(fixture.unknown.length, 1);
    assert.throws(() => verifyDetailExtrasRequests(fixture, { completed: false }));
  } finally {
    await fixture.close();
  }
});
