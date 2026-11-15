import type {
  NotificationItem,
  NotificationKind,
  NotificationMarkReadRequest,
  NotificationQuery,
  NotificationSnapshot,
} from '@hongguo/contracts';
import { CoreError, type CoreTransport } from './index';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const decimalId = (value: unknown) => typeof value === 'string' && /^[1-9][0-9]{0,31}$/.test(value);
const sameScope = (value: Record<string, unknown>, scope: NotificationQuery) =>
  value.owner_id === scope.owner_id && value.owner_epoch === scope.owner_epoch;
const short = (value: unknown, max: number) =>
  typeof value === 'string' &&
  [...value].length <= max &&
  ![...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
const nonEmptyShort = (value: unknown, max: number) =>
  short(value, max) && (value as string).length > 0;
const scopeValid = (scope: NotificationQuery) =>
  record(scope) && decimalId(scope.owner_id) && nonEmptyShort(scope.owner_epoch, 128);
const optionalDecimalId = (value: unknown) => value === undefined || decimalId(value);
const optionalUint = (value: unknown, max: number) =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max);

function validDrama(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    only(value, [
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
    decimalId(value.series_id) &&
    short(value.title, 200) &&
    typeof value.cover === 'string' &&
    short(value.intro, 1024) &&
    (value.cover_fallback === undefined || typeof value.cover_fallback === 'string') &&
    optionalUint(value.episode_count, 0xffffffff) &&
    (value.series_status === undefined ||
      value.series_status === 'ongoing' ||
      value.series_status === 'ended') &&
    (value.content_type === undefined ||
      value.content_type === '' ||
      ['1', '7', '1004'].includes(String(value.content_type))) &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.length <= 8 &&
        value.tags.every((tag) => short(tag, 64))))
  );
}

function validItem(value: unknown): value is NotificationItem {
  if (
    !record(value) ||
    !only(value, [
      'id',
      'kind',
      'series_id',
      'reservation_id',
      'title',
      'episode',
      'message',
      'created_at',
      'read',
      'drama',
    ]) ||
    !nonEmptyShort(value.id, 256) ||
    !(['follow_update', 'reservation_online'] as NotificationKind[]).includes(
      value.kind as NotificationKind,
    ) ||
    !short(value.title, 200) ||
    !short(value.message, 300) ||
    !optionalDecimalId(value.series_id) ||
    !optionalDecimalId(value.reservation_id) ||
    !optionalUint(value.episode, 0xffffffff) ||
    !optionalUint(value.created_at, 253402300799) ||
    typeof value.read !== 'boolean' ||
    (value.drama !== undefined && !validDrama(value.drama))
  )
    return false;
  if (value.kind === 'follow_update' && value.series_id === undefined) return false;
  if (
    value.kind === 'reservation_online' &&
    value.series_id === undefined &&
    value.reservation_id === undefined
  )
    return false;
  return true;
}

export function validNotificationSnapshot(
  value: unknown,
  scope: NotificationQuery,
): value is NotificationSnapshot {
  if (
    !scopeValid(scope) ||
    !record(value) ||
    !only(value, [
      'owner_id',
      'owner_epoch',
      'items',
      'unread_count',
      'checked_at',
      'stale',
      'error',
    ]) ||
    !sameScope(value, scope) ||
    !Array.isArray(value.items) ||
    value.items.length > 200 ||
    !optionalUint(value.unread_count, 200) ||
    !optionalUint(value.checked_at, 253402300799) ||
    typeof value.stale !== 'boolean' ||
    (value.error !== undefined && !short(value.error, 300))
  )
    return false;
  const ids = new Set<string>();
  let unread = 0;
  for (const item of value.items) {
    if (!validItem(item) || ids.has(item.id)) return false;
    ids.add(item.id);
    if (!item.read) unread++;
  }
  return value.unread_count === unread;
}

const invalid = () =>
  new CoreError('更新提醒响应无效，请刷新状态', 'ACCOUNT_NOTIFICATION_RESPONSE_INVALID', 502);
const cancelled = () => new CoreError('请求已取消', 'CORE_CANCELLED', 499);

export async function readNotifications(
  request: CoreTransport['request'],
  scope: NotificationQuery,
  abort?: AbortSignal,
): Promise<NotificationSnapshot> {
  if (!scopeValid(scope))
    throw new CoreError('更新提醒账号参数无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = { owner_id: scope.owner_id, owner_epoch: scope.owner_epoch };
  const value = await request(
    `/api/v1/notifications?owner_id=${encodeURIComponent(expected.owner_id)}&owner_epoch=${encodeURIComponent(expected.owner_epoch)}`,
    abort,
  );
  if (abort?.aborted) throw cancelled();
  if (!validNotificationSnapshot(value, expected)) throw invalid();
  return value;
}

export async function markNotificationRead(
  request: CoreTransport['request'],
  intent: NotificationMarkReadRequest,
  abort?: AbortSignal,
): Promise<NotificationSnapshot> {
  if (!scopeValid(intent) || (intent.id === undefined) === (intent.all !== true))
    throw new CoreError('更新提醒操作无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (intent.id !== undefined && (intent.id.length === 0 || !short(intent.id, 256)))
    throw new CoreError('更新提醒操作无效', 'ACCOUNT_REQUEST_INVALID', 400);
  if (abort?.aborted) throw cancelled();
  const expected = { ...intent };
  const value = await request('/api/v1/notifications', abort, expected);
  if (abort?.aborted) throw cancelled();
  if (!validNotificationSnapshot(value, intent)) throw invalid();
  return value;
}
