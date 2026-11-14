import { test } from 'node:test';
import { seasonsFixtureSelfcheck } from '../src/seasons-fixture.mjs';

test('series fixture preserves exact identities, queued failures, real media ranges and isolated writes', async () => {
  await seasonsFixtureSelfcheck();
});
