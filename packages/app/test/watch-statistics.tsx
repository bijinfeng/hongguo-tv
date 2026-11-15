import { expect, test } from 'nsh/test';
import {
  createWatchStatisticsCollector,
  type WatchStatisticsBatch,
  type WatchStatisticsScope,
} from '../src/watch-statistics';

const sample = (at: number, position: number, extra = {}) => ({
  at,
  position,
  active: true,
  ready: true,
  paused: false,
  buffering: false,
  ...extra,
});

export function registerWatchStatisticsTests() {
  test('collector counts only real advancing playback and keeps bounded metadata', async () => {
    const scope: WatchStatisticsScope = {
      ownerId: '',
      ownerEpoch: 'guest-epoch',
      revision: 'revision-1',
    };
    const batches: WatchStatisticsBatch[] = [];
    const collector = createWatchStatisticsCollector({
      scope: () => scope,
      id: () => 'batch-0001',
      send: async (batch) => batches.push(batch),
      day: () => '2026-11-16',
    });

    expect(collector.observe(sample(0, 30))).toBe(false);
    expect(collector.observe(sample(1000, 31, { type: 'real', genre: '甜剧' }))).toBe(true);
    expect(collector.observe(sample(2000, 31, { paused: true }))).toBe(false);
    expect(collector.observe(sample(3000, 32, { type: 'real', genre: '甜剧' }))).toBe(false);
    expect(collector.observe(sample(4000, 33, { seeking: true }))).toBe(false);
    expect(collector.observe(sample(5000, 34, { type: 'real', genre: '甜剧' }))).toBe(false);
    await collector.flush(true);

    expect(batches.length).toBe(1);
    expect(batches[0].batchId).toBe('batch-0001');
    expect(batches[0].ownerId).toBe('');
    expect(batches[0].items).toEqual([
      { day: '2026-11-16', durationMs: 1000, type: 'real', genre: '甜剧' },
    ]);
  });

  test('collector fences owner changes and never attributes old pending rows to the new scope', async () => {
    let current: WatchStatisticsScope = {
      ownerId: 'a',
      ownerEpoch: 'epoch-a',
      revision: 'revision-a',
    };
    const batches: WatchStatisticsBatch[] = [];
    const collector = createWatchStatisticsCollector({
      scope: () => current,
      id: () => 'batch-0002',
      send: async (batch) => batches.push(batch),
      day: () => '2026-11-16',
    });

    collector.observe(sample(0, 0));
    collector.observe(sample(1000, 1, { type: 'comic' }));
    current = { ownerId: 'b', ownerEpoch: 'epoch-b', revision: 'revision-b' };
    collector.setScope();
    await collector.drain();
    expect(batches.length).toBe(1);
    expect(batches[0].ownerId).toBe('a');
    expect(batches[0].ownerEpoch).toBe('epoch-a');

    collector.observe(sample(2000, 2, { type: 'ai' }));
    collector.observe(sample(3000, 3, { type: 'ai' }));
    await collector.flush(true);
    expect(batches.length).toBe(2);
    expect(batches[1].ownerId).toBe('b');
    expect(batches[1].items[0].type).toBe('ai');
  });

  test('collector rejects implausible jumps and preserves failed batches for recovery', async () => {
    let fail = true;
    const batches: WatchStatisticsBatch[] = [];
    const collector = createWatchStatisticsCollector({
      scope: () => ({ ownerId: 'a', ownerEpoch: 'epoch-a', revision: 'revision-a' }),
      id: () => 'batch-0003',
      send: async (batch) => {
        if (fail) throw new Error('offline');
        batches.push(batch);
      },
      day: () => '2026-11-16',
    });
    collector.observe(sample(0, 0));
    collector.observe(sample(1000, 1, { type: 'unknown' }));
    collector.observe(sample(2000, 100, { type: 'unknown' }));
    await collector.flush(true);
    expect(collector.queued()).toBe(1);
    fail = false;
    await collector.drain();
    expect(batches.length).toBe(1);
    expect(batches[0].items[0].durationMs).toBe(1000);
  });
}
