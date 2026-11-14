import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browsingFixture } from '../src/browsing-fixture.mjs';
import { calendarFixture } from '../src/calendar-fixture.mjs';
import { playerFixture } from '../src/player-fixture.mjs';
import { rankingsFixture } from '../src/rankings-fixture.mjs';

for (const [name, create, id, invalidId] of [
  ['browsing', browsingFixture, '123', '9007199254740993'],
  ['calendar', calendarFixture, '101', '301'],
  ['player', playerFixture, '123', '999'],
  ['rankings', rankingsFixture, '101', '202'],
]) {
  test(`${name} HTTP fixture serves empty seasons only for exact known GET identities`, async () => {
    const fixture = await create();
    const read = (query, options) =>
      fetch(`${fixture.origin}/api/v1/series/seasons${query}`, options);
    try {
      if (name === 'browsing') await fetch(`${fixture.origin}/api/v1/library`);
      const response = await read(`?series_id=${id}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, data: { items: [] } });
      assert.deepEqual(fixture.writes, []);
      fixture.assertReadOnly?.();
      for (const query of [
        '',
        `?series_id=${invalidId}`,
        `?series_id=${id}&extra=1`,
        `?series_id=${id}&series_id=${id}`,
      ])
        assert.notEqual((await read(query)).status, 200, query);
      assert.notEqual((await read(`?series_id=${id}`, { method: 'POST' })).status, 200);
      if (fixture.assertReadOnly) assert.throws(() => fixture.assertReadOnly());
    } finally {
      await fixture.close();
    }
  });
}
