import assert from 'node:assert/strict';
import test from 'node:test';
import { tvGridColumns } from '../../packages/app/src/shell/tv-layout-metrics.ts';
import { collectionTargetVisible } from '../../packages/app/src/collection-visibility.ts';

test('return focus accepts a viewport-filling large row while rejecting clipped ordinary rows', () => {
  assert.equal(collectionTargetVisible(108, 100, 100, 300, 8), true);
  assert.equal(collectionTargetVisible(100, 100, 100, 300, 8), false);
  assert.equal(collectionTargetVisible(50, 500, 100, 300, 8), true);
  assert.equal(collectionTargetVisible(350, 500, 100, 300, 8), false);
  assert.equal(collectionTargetVisible(100, 0, 100, 300, 8), false);
  assert.equal(collectionTargetVisible(100, 100, 100, 0, 8), false);
});

test('TV text thresholds reduce columns independently of output resolution', () => {
  const expected = {
    collection: [6, 5, 4],
    search: [4, 3, 2],
    ranking: [5, 4, 3],
    episodes: [10, 8, 6],
    continue: [3, 2, 2],
  };
  for (const [kind, columns] of Object.entries(expected)) {
    for (const [scale, tier] of [
      [1, 0],
      [1.249, 0],
      [1.25, 1],
      [1.3, 1],
      [1.749, 1],
      [1.75, 2],
      [2, 2],
    ])
      assert.equal(tvGridColumns(kind, 876, scale), columns[tier], `${kind} at ${scale}`);
  }
});

test('narrow regions reduce density without losing the final target', () => {
  assert.equal(tvGridColumns('collection', 271, 1), 1);
  assert.equal(tvGridColumns('collection', 272, 1), 2);
  assert.equal(tvGridColumns('episodes', 360, 1), 6);
  assert.equal(tvGridColumns('episodes', 360, 2), 6);
  assert.equal(tvGridColumns('search', 575, 1), 4);
  assert.equal(tvGridColumns('search', 575, 2), 2);
  assert.equal(tvGridColumns('continue', -1, 1), 1);
  assert.equal(tvGridColumns('collection', 0, 2), 1);
});
