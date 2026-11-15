import type { components } from '@hongguo/contracts';
import { request, requestWithMethod } from './index';

export type WatchStatisticsContentType = components['schemas']['WatchStatisticsContentType'];
export type WatchStatisticsSegment = components['schemas']['WatchStatisticsSegment'];
export type WatchStatisticsBatch = components['schemas']['WatchStatisticsBatch'];
export type WatchStatisticsSnapshot = components['schemas']['WatchStatisticsSnapshot'];
export type WatchStatisticsAppendResult = components['schemas']['WatchStatisticsAppendResult'];

export interface WatchStatisticsQuery {
  ownerId: string;
  ownerEpoch: string;
  day: string;
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const batchPattern = /^[A-Za-z0-9_-]{8,96}$/;
const kinds = new Set<WatchStatisticsContentType>(['real', 'comic', 'ai', 'unknown']);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

function invalid(message = '观看统计参数无效'): Error {
  return new Error(message);
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !dayPattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function validScope(query: WatchStatisticsQuery): void {
  if (
    typeof query.ownerId !== 'string' ||
    query.ownerId.length > 32 ||
    (query.ownerId !== '' && !/^\d{1,32}$/.test(query.ownerId)) ||
    typeof query.ownerEpoch !== 'string' ||
    query.ownerEpoch.length < 1 ||
    query.ownerEpoch.length > 128 ||
    ![...query.ownerEpoch].every((char) => char.charCodeAt(0) < 128 && !/\p{Cc}/u.test(char)) ||
    !validDay(query.day)
  )
    throw invalid();
}

function validGenre(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string' || !value || value.trim() !== value || [...value].length > 40)
    return false;
  if (
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  )
    return false;
  if (/[\\/<>:]/u.test(value) || /^(?:__proto__|constructor|prototype)$/.test(value)) return false;
  return true;
}

export function validWatchStatisticsBatch(value: unknown): value is WatchStatisticsBatch {
  if (!record(value) || !only(value, ['owner_id', 'owner_epoch', 'id', 'revision', 'items']))
    return false;
  const batch = value as WatchStatisticsBatch;
  if (
    typeof batch.owner_id !== 'string' ||
    typeof batch.owner_epoch !== 'string' ||
    typeof batch.id !== 'string' ||
    !batchPattern.test(batch.id) ||
    typeof batch.revision !== 'string' ||
    !/^[\da-f]{32}$/i.test(batch.revision) ||
    !Array.isArray(batch.items) ||
    batch.items.length < 1 ||
    batch.items.length > 128
  )
    return false;
  let total = 0;
  for (const item of batch.items) {
    if (!record(item) || !only(item, ['day', 'ms', 'type', 'genre'])) return false;
    const row = item as WatchStatisticsSegment;
    if (
      !validDay(row.day) ||
      !Number.isInteger(row.ms) ||
      row.ms < 1 ||
      row.ms > 60_000 ||
      !kinds.has(row.type) ||
      !validGenre(row.genre)
    )
      return false;
    total += row.ms;
  }
  return total <= 120_000;
}

export function validWatchStatisticsSnapshot(value: unknown): value is WatchStatisticsSnapshot {
  if (!record(value) || !only(value, ['version', 'since', 'reset_at_ms', 'revision', 'days']))
    return false;
  const snapshot = value as WatchStatisticsSnapshot;
  return (
    snapshot.version === 1 &&
    validDay(snapshot.since) &&
    Number.isInteger(snapshot.reset_at_ms) &&
    snapshot.reset_at_ms > 0 &&
    typeof snapshot.revision === 'string' &&
    /^[\da-f]{32}$/i.test(snapshot.revision) &&
    Array.isArray(snapshot.days) &&
    snapshot.days.length <= 366 &&
    snapshot.days.every((day) => {
      if (!record(day) || !only(day, ['day', 'duration_ms', 'content_types', 'genres']))
        return false;
      if (
        !validDay(day.day) ||
        !Number.isSafeInteger(day.duration_ms) ||
        day.duration_ms < 1 ||
        day.duration_ms > 86_400_000
      )
        return false;
      return [day.content_types, day.genres].every(
        (buckets) =>
          Array.isArray(buckets) &&
          buckets.length <= 16 &&
          buckets.every(
            (bucket) =>
              record(bucket) &&
              only(bucket, ['key', 'duration_ms']) &&
              typeof bucket.key === 'string' &&
              bucket.key.length > 0 &&
              Number.isSafeInteger(bucket.duration_ms) &&
              bucket.duration_ms > 0,
          ),
      );
    })
  );
}

function path(query: WatchStatisticsQuery) {
  validScope(query);
  const params = new URLSearchParams({
    owner_id: query.ownerId,
    owner_epoch: query.ownerEpoch,
    day: query.day,
  });
  return `/api/v1/watch-statistics?${params}`;
}

export async function readWatchStatistics(query: WatchStatisticsQuery, abort?: AbortSignal) {
  const value = await request<WatchStatisticsSnapshot>(path(query), abort);
  if (!validWatchStatisticsSnapshot(value)) throw invalid('核心统计响应无效，请重试');
  return value;
}

export async function appendWatchStatistics(
  query: WatchStatisticsQuery,
  batch: WatchStatisticsBatch,
  abort?: AbortSignal,
) {
  validScope(query);
  if (
    batch.owner_id !== query.ownerId ||
    batch.owner_epoch !== query.ownerEpoch ||
    !validWatchStatisticsBatch(batch)
  )
    throw invalid();
  const value = await requestWithMethod<WatchStatisticsAppendResult>(
    path(query),
    'POST',
    abort,
    batch,
  );
  if (
    !value ||
    value.id !== batch.id ||
    typeof value.applied !== 'boolean' ||
    !validWatchStatisticsSnapshot(value.snapshot)
  )
    throw invalid('核心统计响应无效，请重试');
  return value;
}

export async function resetWatchStatistics(query: WatchStatisticsQuery, abort?: AbortSignal) {
  const value = await requestWithMethod<WatchStatisticsSnapshot>(path(query), 'DELETE', abort);
  if (!validWatchStatisticsSnapshot(value)) throw invalid('核心统计响应无效，请重试');
  return value;
}
