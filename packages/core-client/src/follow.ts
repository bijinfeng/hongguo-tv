import type {
  FollowItem,
  FollowMutationRequest,
  FollowMutationResult,
  FollowQuery,
  FollowSnapshot,
} from '@hongguo/contracts';
import { CoreError, type CoreTransport } from './index';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const decimalId = (value: unknown) =>
  typeof value === 'string' && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const optionalInteger = (value: unknown, maximum: number) =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum);
const seriesStatus = (value: unknown) =>
  value === undefined || value === 'ongoing' || value === 'ended';
const scopeValid = (scope: FollowQuery) =>
  record(scope) &&
  decimalId(scope.owner_id) &&
  typeof scope.owner_epoch === 'string' &&
  scope.owner_epoch.length > 0 &&
  scope.owner_epoch.length <= 128;
const sameScope = (value: Record<string, unknown>, scope: FollowQuery) =>
  value.owner_id === scope.owner_id && value.owner_epoch === scope.owner_epoch;

function validItem(value: unknown): value is FollowItem {
  if (
    !record(value) ||
    !only(value, [
      'series_id',
      'drama',
      'series_status',
      'latest_watched_episode',
      'has_watched_latest_episode',
      'show_update_frequency',
      'follow_update_time',
    ]) ||
    !decimalId(value.series_id) ||
    !seriesStatus(value.series_status) ||
    !optionalInteger(value.latest_watched_episode, 10000) ||
    !optionalInteger(value.follow_update_time, Number.MAX_SAFE_INTEGER) ||
    (value.has_watched_latest_episode !== undefined &&
      typeof value.has_watched_latest_episode !== 'boolean') ||
    (value.show_update_frequency !== undefined &&
      (typeof value.show_update_frequency !== 'string' ||
        [...value.show_update_frequency].length > 100 ||
        [...value.show_update_frequency].some((char) => {
          const code = char.charCodeAt(0);
          return code < 32 || (code >= 127 && code <= 159);
        })))
  )
    return false;
  if (value.drama === undefined) return true;
  const drama = value.drama;
  return (
    record(drama) &&
    only(drama, [
      'series_id',
      'title',
      'cover',
      'cover_fallback',
      'intro',
      'episode_count',
      'series_status',
      'content_type',
      'tags',
    ]) &&
    drama.series_id === value.series_id &&
    typeof drama.title === 'string' &&
    typeof drama.cover === 'string' &&
    typeof drama.intro === 'string' &&
    (drama.cover_fallback === undefined || typeof drama.cover_fallback === 'string') &&
    (drama.content_type === undefined ||
      drama.content_type === '' ||
      drama.content_type === '1' ||
      drama.content_type === '7' ||
      drama.content_type === '1004') &&
    optionalInteger(drama.episode_count, 0xffffffff) &&
    seriesStatus(drama.series_status) &&
    (drama.tags === undefined ||
      (Array.isArray(drama.tags) && drama.tags.every((tag: unknown) => typeof tag === 'string')))
  );
}

/** Accept only a complete compact membership for the exact requested authenticated scope. */
export function validFollowSnapshot(value: unknown, scope: FollowQuery): value is FollowSnapshot {
  if (
    !scopeValid(scope) ||
    !record(value) ||
    !only(value, ['owner_id', 'owner_epoch', 'items']) ||
    !sameScope(value, scope) ||
    !Array.isArray(value.items) ||
    value.items.length > 2000
  )
    return false;
  const identities = new Set<string>();
  return value.items.every((item: unknown) => {
    if (!validItem(item) || identities.has(item.series_id)) return false;
    identities.add(item.series_id);
    return true;
  });
}

/** An ACK is not confirmation without a complete same-scope observation of this exact intent. */
export function validFollowMutationResult(
  value: unknown,
  intent: FollowMutationRequest,
): value is FollowMutationResult {
  if (
    !scopeValid(intent) ||
    !decimalId(intent.series_id) ||
    typeof intent.enabled !== 'boolean' ||
    !record(value) ||
    !only(value, [
      'owner_id',
      'owner_epoch',
      'series_id',
      'enabled',
      'acknowledged',
      'confirmed',
      'snapshot',
      'reconciliation_error',
    ]) ||
    !sameScope(value, intent) ||
    value.series_id !== intent.series_id ||
    value.enabled !== intent.enabled ||
    value.acknowledged !== true ||
    typeof value.confirmed !== 'boolean' ||
    (value.reconciliation_error !== undefined &&
      (typeof value.reconciliation_error !== 'string' ||
        !/^ACCOUNT_[A-Z0-9_]{1,80}$/.test(value.reconciliation_error)))
  )
    return false;
  if (value.snapshot === undefined)
    return !value.confirmed && value.reconciliation_error !== undefined;
  if (!validFollowSnapshot(value.snapshot, intent)) return false;
  const observed = value.snapshot.items.some((item) => item.series_id === intent.series_id);
  return value.confirmed
    ? observed === intent.enabled && value.reconciliation_error === undefined
    : observed !== intent.enabled;
}

const invalid = () =>
  new CoreError('追更响应无效，请刷新状态', 'ACCOUNT_FOLLOW_RESPONSE_INVALID', 502);
const cancelled = () => new CoreError('请求已取消', 'CORE_CANCELLED', 499);

/** One complete read through the mounted store's captured HTTP or native transport. */
export async function readFollow(
  request: CoreTransport['request'],
  scope: FollowQuery,
  abort?: AbortSignal,
): Promise<FollowSnapshot> {
  if (!scopeValid(scope)) throw new CoreError('追更账号参数无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = { owner_id: scope.owner_id, owner_epoch: scope.owner_epoch };
  const value = await request(
    `/api/v1/follow?owner_id=${encodeURIComponent(expected.owner_id)}&owner_epoch=${encodeURIComponent(expected.owner_epoch)}`,
    abort,
  );
  if (abort?.aborted) throw cancelled();
  if (!validFollowSnapshot(value, expected)) throw invalid();
  return value;
}

/** Send one absolute intent once; ambiguous delivery is recovered by readFollow, never replay here. */
export async function setFollow(
  request: CoreTransport['request'],
  intent: FollowMutationRequest,
  abort?: AbortSignal,
): Promise<FollowMutationResult> {
  if (!scopeValid(intent) || !decimalId(intent.series_id) || typeof intent.enabled !== 'boolean')
    throw new CoreError('追更参数无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = {
    owner_id: intent.owner_id,
    owner_epoch: intent.owner_epoch,
    series_id: intent.series_id,
    enabled: intent.enabled,
  };
  // Keep validation identity private even if a transport mutates its body while dispatching.
  const value = await request('/api/v1/follow', abort, { ...expected });
  if (abort?.aborted) throw cancelled();
  if (!validFollowMutationResult(value, expected)) throw invalid();
  return value;
}
