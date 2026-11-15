import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.includes('/packages/core-client/src/') &&
      [
        './index',
        './notifications',
        './library-writer',
        './follow',
        './reservations',
        './watch-statistics',
      ].includes(specifier)
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

const { CoreError, markNotificationRead, readNotifications, validNotificationSnapshot } =
  await import('../../packages/core-client/src/index.ts');

const scope = { owner_id: '9007199254740993', owner_epoch: 'epoch' };
const item = (read = false) => ({
  id: 'follow:9007199254740993:2:20',
  kind: 'follow_update',
  series_id: '123',
  title: '真实追更剧',
  episode: 2,
  message: '更新至第2集',
  created_at: 1700000000,
  read,
});
const snapshot = (items = [item()]) => ({
  ...scope,
  items,
  unread_count: items.filter((row) => !row.read).length,
  stale: false,
});
const invalidRequest = (error) =>
  error instanceof CoreError && error.code === 'ACCOUNT_REQUEST_INVALID';

test('notification snapshots stay exact-scope and unread-count consistent', () => {
  assert.equal(validNotificationSnapshot(snapshot(), scope), true);
  assert.equal(validNotificationSnapshot(snapshot([item(true)]), scope), true);
  assert.equal(validNotificationSnapshot(snapshot(), { ...scope, owner_epoch: '' }), false);
  assert.equal(
    validNotificationSnapshot({ ...snapshot(), items: [{ ...item(), id: '' }] }, scope),
    false,
  );
  assert.equal(validNotificationSnapshot({ ...snapshot(), owner_epoch: 'other' }, scope), false);
  assert.equal(validNotificationSnapshot({ ...snapshot(), unread_count: 0 }, scope), false);
  assert.equal(validNotificationSnapshot({ ...snapshot(), items: [item(), item()] }, scope), false);
});

test('notification reads capture the exact GET scope and reject malformed responses', async () => {
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    return snapshot();
  };
  assert.deepEqual(await readNotifications(request, scope), snapshot());
  assert.equal(calls[0], '/api/v1/notifications?owner_id=9007199254740993&owner_epoch=epoch');
  await assert.rejects(
    readNotifications(async () => ({ ...snapshot(), unread_count: 4 }), scope),
    (error) => error.code === 'ACCOUNT_NOTIFICATION_RESPONSE_INVALID',
  );
});

test('mark-read accepts exactly one operation and never dispatches malformed intent', async () => {
  const calls = [];
  const request = async (_path, _abort, body) => {
    calls.push(body);
    return snapshot([item(true)]);
  };
  await assert.rejects(markNotificationRead(request, scope), invalidRequest);
  await assert.rejects(
    markNotificationRead(request, { ...scope, all: true, id: item().id }),
    invalidRequest,
  );
  await assert.rejects(markNotificationRead(request, { ...scope, id: '' }), invalidRequest);
  assert.equal(calls.length, 0);
  await markNotificationRead(request, { ...scope, id: item().id });
  await markNotificationRead(request, { ...scope, all: true });
  assert.deepEqual(calls, [
    { ...scope, id: item().id },
    { ...scope, all: true },
  ]);
});
