import type {
  ReservationItem,
  ReservationMutationRequest,
  ReservationMutationResult,
  ReservationQuery,
  ReservationSnapshot,
  ReservationTarget,
} from '@hongguo/contracts';
import { CoreError, type CoreTransport } from './index';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const reservationId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,18}$/.test(value) &&
  (value.length < 19 || value <= '9223372036854775807');
const optionalInteger = (value: unknown, maximum: number) =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum);
const shortText = (value: unknown, maximum: number) =>
  typeof value === 'string' &&
  [...value].length <= maximum &&
  ![...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
const scopeValid = (scope: ReservationQuery) =>
  record(scope) &&
  typeof scope.owner_id === 'string' &&
  /^[0-9]{1,32}$/.test(scope.owner_id) &&
  /[1-9]/.test(scope.owner_id) &&
  typeof scope.owner_epoch === 'string' &&
  scope.owner_epoch.length > 0 &&
  scope.owner_epoch.length <= 128;
const sameScope = (value: Record<string, unknown>, scope: ReservationQuery) =>
  value.owner_id === scope.owner_id && value.owner_epoch === scope.owner_epoch;
const validTarget = (target: unknown): target is ReservationTarget =>
  record(target) &&
  only(target, ['kind', 'id']) &&
  (target.kind === 'item' || target.kind === 'series') &&
  reservationId(target.id);
const sameTarget = (left: ReservationTarget, right: ReservationTarget) =>
  left.kind === right.kind && left.id === right.id;

function validItem(value: unknown): value is ReservationItem {
  if (
    !record(value) ||
    !only(value, [
      'reservation_id',
      'series_id',
      'online',
      'drama',
      'title',
      'cover',
      'cover_fallback',
      'intro',
      'publish_time',
      'publish_text',
      'tags',
    ]) ||
    (value.reservation_id === undefined && value.series_id === undefined) ||
    (value.reservation_id !== undefined && !reservationId(value.reservation_id)) ||
    (value.series_id !== undefined && !reservationId(value.series_id)) ||
    typeof value.online !== 'boolean' ||
    (value.title !== undefined && !shortText(value.title, 100)) ||
    typeof value.cover !== 'string' ||
    typeof value.cover_fallback !== 'string' ||
    !shortText(value.intro, 1024) ||
    !optionalInteger(value.publish_time, 253402300799) ||
    (value.publish_text !== undefined && !shortText(value.publish_text, 100)) ||
    !Array.isArray(value.tags) ||
    value.tags.length > 8 ||
    !value.tags.every((tag: unknown) => shortText(tag, 24))
  )
    return false;
  if (value.drama === undefined) return true;
  const drama = value.drama;
  return (
    value.online &&
    value.series_id !== undefined &&
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
      (typeof drama.content_type === 'string' &&
        ['', '1', '7', '1004'].includes(drama.content_type))) &&
    optionalInteger(drama.episode_count, 0xffffffff) &&
    (drama.series_status === undefined ||
      drama.series_status === 'ongoing' ||
      drama.series_status === 'ended') &&
    (drama.tags === undefined ||
      (Array.isArray(drama.tags) && drama.tags.every((tag: unknown) => typeof tag === 'string')))
  );
}

/** Validate the complete online and upcoming membership for one exact authenticated scope. */
export function validReservationSnapshot(
  value: unknown,
  scope: ReservationQuery,
): value is ReservationSnapshot {
  if (
    !scopeValid(scope) ||
    !record(value) ||
    !only(value, ['owner_id', 'owner_epoch', 'items', 'online_total', 'upcoming_total']) ||
    !sameScope(value, scope) ||
    !Array.isArray(value.items) ||
    value.items.length > 2000 ||
    !optionalInteger(value.online_total, 0xffffffff) ||
    !optionalInteger(value.upcoming_total, 0xffffffff)
  )
    return false;
  const identities = new Set<string>();
  return value.items.every((item: unknown) => {
    if (!validItem(item)) return false;
    const key = item.reservation_id ? `item:${item.reservation_id}` : `series:${item.series_id}`;
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  });
}

/** Missing target-mode identity cannot prove absence, including after a title becomes online. */
export function reservationMembership(
  snapshot: ReservationSnapshot,
  target: ReservationTarget,
): boolean | undefined {
  const key = target.kind === 'item' ? 'reservation_id' : 'series_id';
  if (snapshot.items.some((item) => item[key] === target.id)) return true;
  return snapshot.items.some((item) => item[key] === undefined) ? undefined : false;
}

/** An exact ACK confirms only when complete same-scope membership proves the desired state. */
export function validReservationMutationResult(
  value: unknown,
  intent: ReservationMutationRequest,
): value is ReservationMutationResult {
  if (
    !scopeValid(intent) ||
    !validTarget(intent.target) ||
    typeof intent.enabled !== 'boolean' ||
    !record(value) ||
    !only(value, [
      'owner_id',
      'owner_epoch',
      'target',
      'enabled',
      'acknowledged',
      'confirmed',
      'snapshot',
      'reconciliation_error',
    ]) ||
    !sameScope(value, intent) ||
    !validTarget(value.target) ||
    !sameTarget(value.target, intent.target) ||
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
  if (!validReservationSnapshot(value.snapshot, intent) || value.reconciliation_error !== undefined)
    return false;
  const observed = reservationMembership(value.snapshot, intent.target);
  return value.confirmed ? observed === intent.enabled : observed !== intent.enabled;
}

const invalid = () =>
  new CoreError('预约响应无效，请刷新状态', 'ACCOUNT_RESERVATION_RESPONSE_INVALID', 502);
const cancelled = () => new CoreError('请求已取消', 'CORE_CANCELLED', 499);

/** Read both complete groups through the store's captured HTTP or native transport. */
export async function readReservations(
  request: CoreTransport['request'],
  scope: ReservationQuery,
  abort?: AbortSignal,
): Promise<ReservationSnapshot> {
  if (!scopeValid(scope)) throw new CoreError('预约账号参数无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = { owner_id: scope.owner_id, owner_epoch: scope.owner_epoch };
  const value = await request(
    `/api/v1/reservations?owner_id=${encodeURIComponent(expected.owner_id)}&owner_epoch=${encodeURIComponent(expected.owner_epoch)}`,
    abort,
  );
  if (abort?.aborted) throw cancelled();
  if (!validReservationSnapshot(value, expected)) throw invalid();
  return value;
}

/** Send one absolute reservation intent once; never replay a possibly delivered POST. */
export async function setReservation(
  request: CoreTransport['request'],
  intent: ReservationMutationRequest,
  abort?: AbortSignal,
): Promise<ReservationMutationResult> {
  if (!scopeValid(intent) || !validTarget(intent.target) || typeof intent.enabled !== 'boolean')
    throw new CoreError('预约参数无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = {
    owner_id: intent.owner_id,
    owner_epoch: intent.owner_epoch,
    target: { ...intent.target },
    enabled: intent.enabled,
  };
  const value = await request('/api/v1/reservations', abort, {
    ...expected,
    target: { ...expected.target },
  });
  if (abort?.aborted) throw cancelled();
  if (!validReservationMutationResult(value, expected)) throw invalid();
  return value;
}
