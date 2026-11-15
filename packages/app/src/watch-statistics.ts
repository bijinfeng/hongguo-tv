/**
 * Collects real advancing playback time into bounded, retryable batches.
 *
 * This module deliberately knows nothing about the transport or the history
 * store. The Player owns eligibility (foreground, ready, unpaused, unbuffered)
 * and passes those facts with each media sample. A position or history row on
 * its own is never treated as watch time.
 */

export type WatchContentType = 'real' | 'comic' | 'ai' | 'unknown';

export interface WatchStatisticsScope {
  ownerId: string;
  ownerEpoch: string;
  revision: string;
}

export interface WatchStatisticsItem {
  day: string;
  durationMs: number;
  type: WatchContentType;
  genre?: string;
}

export interface WatchStatisticsBatch {
  batchId: string;
  ownerId: string;
  ownerEpoch: string;
  revision: string;
  items: WatchStatisticsItem[];
}

export interface WatchPlaybackSample {
  /** Monotonic timestamp in milliseconds. */
  at: number;
  /** Media position in seconds. */
  position: number;
  /** Playback rate used by the media host. */
  rate?: number;
  /** Player eligibility gates. */
  active: boolean;
  ready: boolean;
  paused: boolean;
  buffering: boolean;
  ended?: boolean;
  seeking?: boolean;
  type?: WatchContentType;
  genre?: string;
}

export interface WatchStatisticsCollectorOptions {
  scope: () => WatchStatisticsScope | undefined;
  send: (batch: WatchStatisticsBatch) => Promise<unknown>;
  now?: () => number;
  id?: () => string;
  /** Convert a wall-clock value to the host-local calendar day. */
  day?: (wallClockMs: number) => string;
}

const MAX_SAMPLE_GAP_MS = 5_000;
const MAX_BATCH_MS = 120_000;
const MAX_ITEM_MS = 60_000;
const FLUSH_MS = 30_000;
const MAX_ROWS = 64;
const MAX_QUEUE = 12;

const validDay = /^\d{4}-\d{2}-\d{2}$/;
const validGenre = (value: string | undefined) => {
  if (!value) return undefined;
  if (Array.from(value).some((char) => /\p{Cc}/u.test(char))) return undefined;
  const trimmed = Array.from(value).join('').trim();
  if (Array.from(trimmed).length > 40) return undefined;
  return trimmed || undefined;
};

const validBatchId = (value: string) => /^[A-Za-z0-9_-]{8,96}$/.test(value);

const contentType = (value: WatchContentType | undefined): WatchContentType =>
  value === 'real' || value === 'comic' || value === 'ai' ? value : 'unknown';

/** Map the catalog's existing classification into the statistics closed set. */
export function watchContentType(value: string | undefined): WatchContentType {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized.includes('ai') || normalized === '3') return 'ai';
  if (normalized.includes('comic') || normalized.includes('漫') || normalized === '1004')
    return 'comic';
  if (
    normalized === '1' ||
    normalized.includes('real') ||
    normalized.includes('真人') ||
    normalized.includes('short_play')
  )
    return 'real';
  return 'unknown';
}

const localDay = (value: number) => {
  const date = new Date(value);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function nextLocalMidnight(value: number) {
  const date = new Date(value);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function addSplit(
  rows: Map<string, WatchStatisticsItem>,
  startAt: number,
  endAt: number,
  durationMs: number,
  type: WatchContentType,
  genre: string | undefined,
  day: (value: number) => string,
) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) return;
  const totalElapsed = Math.max(1, endAt - startAt);
  let cursor = startAt;
  let remaining = durationMs;
  while (cursor < endAt && remaining > 0) {
    const boundary = Math.min(endAt, nextLocalMidnight(cursor));
    const portion =
      boundary >= endAt
        ? remaining
        : Math.min(
            remaining,
            Math.max(1, Math.round(((boundary - cursor) / totalElapsed) * durationMs)),
          );
    const key = `${day(cursor)}\u0000${type}\u0000${genre ?? ''}`;
    const current = rows.get(key);
    rows.set(key, {
      day: day(cursor),
      durationMs: (current?.durationMs ?? 0) + portion,
      type,
      ...(genre ? { genre } : {}),
    });
    remaining -= portion;
    cursor = boundary;
  }
  if (remaining > 0) {
    const key = `${day(endAt)}\u0000${type}\u0000${genre ?? ''}`;
    const current = rows.get(key);
    rows.set(key, {
      day: day(endAt),
      durationMs: (current?.durationMs ?? 0) + remaining,
      type,
      ...(genre ? { genre } : {}),
    });
  }
}

function validScope(scope: WatchStatisticsScope | undefined): scope is WatchStatisticsScope {
  if (!scope) return false;
  return (
    typeof scope.ownerId === 'string' &&
    typeof scope.ownerEpoch === 'string' &&
    typeof scope.revision === 'string' &&
    scope.ownerId.length <= 128 &&
    scope.ownerEpoch.length > 0 &&
    scope.ownerEpoch.length <= 128 &&
    scope.revision.length > 0 &&
    scope.revision.length <= 128
  );
}

/** Shared desktop/TV collector. The Player provides samples; no synthetic time is generated. */
export function createWatchStatisticsCollector(options: WatchStatisticsCollectorOptions) {
  const now = options.now ?? (() => Date.now());
  const day = options.day ?? localDay;
  const makeId = options.id ?? (() => `${Math.floor(now())}-${sequence++}`);
  const pending = new Map<string, WatchStatisticsItem>();
  const queue: WatchStatisticsBatch[] = [];
  let pendingScope: WatchStatisticsScope | undefined;
  let anchor: { at: number; position: number; scope: WatchStatisticsScope } | undefined;
  let pendingMs = 0;
  let disposed = false;
  let draining: Promise<void> | undefined;

  const resetAnchor = () => {
    anchor = undefined;
  };

  const enqueue = () => {
    const scope = pendingScope;
    if (!validScope(scope) || queue.length >= MAX_QUEUE || !pending.size) return false;
    const rows = [...pending.values()]
      .filter(
        (row) => validDay.test(row.day) && Number.isInteger(row.durationMs) && row.durationMs > 0,
      )
      .sort((a, b) => a.day.localeCompare(b.day) || a.type.localeCompare(b.type));
    if (!rows.length) {
      pending.clear();
      pendingMs = 0;
      return false;
    }
    const items: WatchStatisticsItem[] = [];
    const consumed = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      let remaining = Math.min(Math.floor(row.durationMs), 86_400_000);
      const key = `${row.day}\u0000${row.type}\u0000${row.genre ?? ''}`;
      while (remaining > 0 && items.length < 128 && total < MAX_BATCH_MS) {
        const durationMs = Math.min(remaining, MAX_ITEM_MS, MAX_BATCH_MS - total);
        items.push({ ...row, durationMs });
        remaining -= durationMs;
        total += durationMs;
        consumed.set(key, (consumed.get(key) ?? 0) + durationMs);
      }
      if (items.length >= 128 || total >= MAX_BATCH_MS) break;
    }
    if (!items.length) return false;
    queue.push({
      batchId: (() => {
        const candidate = makeId();
        return validBatchId(candidate)
          ? candidate
          : `batch-${Date.now().toString(36)}-${sequence++}`;
      })(),
      ownerId: scope.ownerId,
      ownerEpoch: scope.ownerEpoch,
      revision: scope.revision,
      items,
    });
    for (const [key, amount] of consumed) {
      const row = pending.get(key);
      if (!row) continue;
      const remaining = row.durationMs - amount;
      if (remaining > 0) pending.set(key, { ...row, durationMs: remaining });
      else pending.delete(key);
    }
    pendingMs = [...pending.values()].reduce((sum, item) => sum + item.durationMs, 0);
    if (!pendingMs) pendingScope = undefined;
    return true;
  };

  const drain = async () => {
    if (draining) return draining;
    draining = (async () => {
      while (!disposed && queue.length) {
        const batch = queue[0];
        try {
          await options.send(batch);
          queue.shift();
        } catch {
          // Keep the exact batch for explicit recovery; never repost it to a new scope.
          break;
        }
      }
    })().finally(() => {
      draining = undefined;
    });
    return draining;
  };

  const flush = async (force = false) => {
    if (disposed || (!force && pendingMs < FLUSH_MS && pending.size < MAX_ROWS)) return;
    if (enqueue()) await drain();
  };

  const observe = (sample: WatchPlaybackSample) => {
    if (disposed) return false;
    const scope = options.scope();
    const eligible =
      validScope(scope) &&
      sample.active &&
      sample.ready &&
      !sample.paused &&
      !sample.buffering &&
      !sample.ended &&
      !sample.seeking &&
      Number.isFinite(sample.at) &&
      Number.isFinite(sample.position) &&
      sample.position >= 0;
    if (!eligible) {
      resetAnchor();
      return false;
    }
    if (
      !anchor ||
      anchor.scope.ownerId !== scope.ownerId ||
      anchor.scope.ownerEpoch !== scope.ownerEpoch ||
      anchor.scope.revision !== scope.revision
    ) {
      anchor = { at: sample.at, position: sample.position, scope };
      return false;
    }
    const elapsed = sample.at - anchor.at;
    const advance = sample.position - anchor.position;
    const rate = Number.isFinite(sample.rate) && (sample.rate ?? 0) > 0 ? sample.rate! : 1;
    anchor = { at: sample.at, position: sample.position, scope };
    if (!(elapsed > 0 && elapsed <= MAX_SAMPLE_GAP_MS && advance > 0)) return false;
    const plausible = advance * 1000 <= elapsed * rate + 1_000;
    if (!plausible) return false;
    const durationMs = Math.max(1, Math.min(elapsed, Math.round((advance * 1000) / rate)));
    const type = contentType(sample.type);
    const genre = validGenre(sample.genre);
    if (!pendingScope) pendingScope = scope;
    if (
      pendingScope.ownerId !== scope.ownerId ||
      pendingScope.ownerEpoch !== scope.ownerEpoch ||
      pendingScope.revision !== scope.revision
    ) {
      // The previous scope must be flushed explicitly before a new scope can add rows.
      void flush(true);
      return false;
    }
    addSplit(pending, anchor.at - elapsed, sample.at, durationMs, type, genre, day);
    pendingMs += durationMs;
    void flush();
    return true;
  };

  const setScope = () => {
    resetAnchor();
    if (pendingMs > 0) void flush(true);
  };

  const reset = resetAnchor;

  const dispose = async () => {
    resetAnchor();
    await flush(true);
    await drain();
    disposed = true;
  };

  return {
    observe,
    flush,
    drain,
    setScope,
    reset,
    dispose,
    pending: () => pendingMs,
    queued: () => queue.length,
  };
}

let sequence = 0;
