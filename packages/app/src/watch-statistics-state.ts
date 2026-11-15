import { signal } from 'nsh';
import type { Account, WatchStatisticsSnapshot } from '@hongguo/core-client';
import {
  appendWatchStatistics,
  readWatchStatistics,
  resetWatchStatistics,
  type WatchStatisticsBatch,
} from '@hongguo/core-client';
import type { WatchStatisticsBatch as CollectedBatch } from './watch-statistics';

const today = () => {
  const value = new Date();
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : '观看统计暂时不可用，请重试。';

export function createWatchStatisticsState(account: () => Account | undefined) {
  const snapshot = signal<WatchStatisticsSnapshot | undefined>(undefined);
  const loading = signal(false);
  const error = signal('');
  let scopeKey = '';
  let revision = 0;
  let active: Promise<WatchStatisticsSnapshot | undefined> | undefined;

  const scope = () => {
    const value = account();
    if (!value || typeof value.owner_epoch !== 'string') return undefined;
    return { ownerId: value.owner_id ?? '', ownerEpoch: value.owner_epoch };
  };
  const key = (value: ReturnType<typeof scope>) =>
    value ? `${value.ownerId}\u0000${value.ownerEpoch}` : '';

  const refetch = async (force = true) => {
    const current = scope();
    if (!current) return undefined;
    const currentKey = key(current);
    if (!force && snapshot() && scopeKey === currentKey) return snapshot();
    const owned = ++revision;
    loading.set(true);
    error.set('');
    const request = readWatchStatistics({
      ownerId: current.ownerId,
      ownerEpoch: current.ownerEpoch,
      day: today(),
    });
    active = request;
    try {
      const result = await request;
      if (owned !== revision || key(scope()) !== currentKey) return undefined;
      scopeKey = currentKey;
      snapshot.set(result);
      return result;
    } catch (cause) {
      if (owned === revision && key(scope()) === currentKey) error.set(message(cause));
      return undefined;
    } finally {
      if (active === request) active = undefined;
      if (owned === revision) loading.set(false);
    }
  };

  const ensure = () => refetch(false);

  const append = async (batch: CollectedBatch) => {
    const current = scope();
    if (!current || !snapshot() || scopeKey !== key(current))
      throw new Error('观看统计范围已变化，请重新加载。');
    const wire: WatchStatisticsBatch = {
      owner_id: batch.ownerId,
      owner_epoch: batch.ownerEpoch,
      id: batch.batchId,
      revision: batch.revision,
      items: batch.items.map((item) => ({
        day: item.day,
        ms: item.durationMs,
        type: item.type,
        ...(item.genre ? { genre: item.genre } : {}),
      })),
    };
    const result = await appendWatchStatistics(
      { ownerId: current.ownerId, ownerEpoch: current.ownerEpoch, day: today() },
      wire,
    );
    if (key(scope()) === scopeKey) snapshot.set(result.snapshot);
    return result;
  };

  const reset = async () => {
    const current = scope();
    if (!current) throw new Error('账号状态尚未准备好，请稍后重试。');
    loading.set(true);
    error.set('');
    try {
      const result = await resetWatchStatistics({
        ownerId: current.ownerId,
        ownerEpoch: current.ownerEpoch,
        day: today(),
      });
      if (key(scope()) === key(current)) {
        scopeKey = key(current);
        snapshot.set(result);
      }
      return result;
    } catch (cause) {
      error.set(message(cause));
      throw cause;
    } finally {
      loading.set(false);
    }
  };

  return { snapshot, loading, error, scope, ensure, refetch, append, reset };
}

export type WatchStatisticsState = ReturnType<typeof createWatchStatisticsState>;
