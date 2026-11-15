import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.includes('/packages/core-client/src/') &&
      [
        './index',
        './follow',
        './reservations',
        './notifications',
        './watch-statistics',
        './library-writer',
      ].includes(specifier)
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const {
  CoreError,
  readReservations,
  setReservation,
  reservationMembership,
  validReservationSnapshot,
  validReservationMutationResult,
} = await import('../../packages/core-client/src/index.ts');
const scope = { owner_id: '123', owner_epoch: 'current' };
const itemId = '9223372036854775807';
const seriesId = '9007199254740993';
const target = { kind: 'item', id: itemId };
const intent = { ...scope, target, enabled: true };
const member = (extra = {}) => ({
  reservation_id: itemId,
  online: false,
  cover: '',
  cover_fallback: '',
  intro: '',
  tags: [],
  ...extra,
});
const snapshot = (items = [member()]) => ({ ...scope, items });
const receipt = (extra = {}) => ({
  ...intent,
  acknowledged: true,
  confirmed: true,
  snapshot: snapshot(),
  ...extra,
});
const invalidResponse = (error) =>
  error instanceof CoreError && error.code === 'ACCOUNT_RESERVATION_RESPONSE_INVALID';
const invalidRequest = (error) =>
  error instanceof CoreError && error.code === 'ACCOUNT_REQUEST_INVALID';

test('complete membership retains exact large IDs, both groups and optional remote totals', async () => {
  const observed = {
    ...snapshot([
      member({
        title: '待上线',
        publish_time: 253402300799,
        publish_text: '即将上线',
        tags: ['短剧'],
      }),
      member({ reservation_id: '2', series_id: seriesId, online: true }),
      member({ reservation_id: '3', series_id: seriesId, online: false }),
      member({ reservation_id: undefined, series_id: '4', online: true }),
    ]),
    online_total: 0xffffffff,
    upcoming_total: 2,
  };
  assert.deepEqual(await readReservations(async () => observed, scope), observed);
  assert.equal(reservationMembership(observed, target), true);
  assert.equal(reservationMembership(observed, { kind: 'series', id: seriesId }), true);
  assert.equal(validReservationSnapshot(snapshot([]), scope), true);
  for (const content_type of [undefined, '1', '7', '1004']) {
    const online = snapshot([
      member({
        online: true,
        series_id: seriesId,
        drama: {
          series_id: seriesId,
          title: '已上线',
          cover: '',
          intro: '',
          content_type,
          episode_count: 0xffffffff,
        },
      }),
    ]);
    assert.equal(validReservationSnapshot(online, scope), true);
  }
});

test('missing target-mode identities cannot confirm cancellation after an upcoming title becomes online', () => {
  const online = snapshot([
    member({ reservation_id: undefined, series_id: seriesId, online: true }),
  ]);
  assert.equal(reservationMembership(online, target), undefined);
  assert.equal(reservationMembership(online, { kind: 'series', id: seriesId }), true);
  assert.equal(reservationMembership(snapshot(), { kind: 'series', id: seriesId }), undefined);
  assert.equal(reservationMembership(snapshot([]), target), false);
  assert.equal(reservationMembership(snapshot([member({ reservation_id: '2' })]), target), false);
  const cancelled = { ...intent, enabled: false };
  const result = receipt({ enabled: false, confirmed: false, snapshot: online });
  assert.equal(validReservationMutationResult(result, cancelled), true);
  assert.equal(validReservationMutationResult({ ...result, confirmed: true }, cancelled), false);
  const released = snapshot([member({ online: true, series_id: seriesId })]);
  assert.equal(reservationMembership(released, target), true);
  assert.equal(
    validReservationMutationResult(receipt({ enabled: false, snapshot: released }), cancelled),
    false,
  );
  assert.equal(
    reservationMembership({ ...online, items: [...online.items, member()] }, target),
    true,
  );
  const changedMode = { ...intent, target: { kind: 'series', id: itemId } };
  assert.equal(validReservationMutationResult(receipt(), changedMode), false);
});

test('strict snapshots reject partial, duplicate, malformed, stale and fabricated playable data', () => {
  for (const value of [
    null,
    {},
    { ...snapshot(), owner_epoch: 'old' },
    { ...snapshot(), owner_id: '456' },
    { ...snapshot(), has_more: true },
    { ...snapshot(), upcoming_total: 0x100000000 },
    snapshot([member(), member({ online: true, series_id: seriesId })]),
    snapshot([member({ reservation_id: undefined })]),
    snapshot([member({ reservation_id: Number(itemId) })]),
    snapshot([member({ reservation_id: '9223372036854775808' })]),
    snapshot([member({ reservation_id: '01' })]),
    snapshot([member({ series_id: null })]),
    snapshot([member({ online: 'true' })]),
    snapshot([member({ publish_time: 253402300800 })]),
    snapshot([member({ title: 'x'.repeat(101) })]),
    snapshot([member({ intro: 'x'.repeat(1025) })]),
    snapshot([member({ publish_text: 'private\nvalue' })]),
    snapshot([member({ tags: ['x'.repeat(25)] })]),
    snapshot([member({ tags: Array(9).fill('tag') })]),
    snapshot([member({ cookie: 'private' })]),
    snapshot([member({ drama: { series_id: seriesId, title: '', cover: '', intro: '' } })]),
    snapshot([
      member({
        online: true,
        series_id: seriesId,
        drama: { series_id: '1', title: '', cover: '', intro: '' },
      }),
    ]),
    snapshot([
      member({
        online: true,
        series_id: seriesId,
        drama: { series_id: seriesId, title: '', cover: '', intro: '', episodes: [] },
      }),
    ]),
    snapshot(
      Array.from({ length: 2001 }, (_, index) => member({ reservation_id: String(index + 1) })),
    ),
  ])
    assert.equal(validReservationSnapshot(value, scope), false);
});

test('ACK remains separate from confirmation and exact target identity', () => {
  for (const result of [
    receipt(),
    receipt({ confirmed: false, snapshot: snapshot([]) }),
    receipt({
      confirmed: false,
      snapshot: undefined,
      reconciliation_error: 'ACCOUNT_RESERVATION_INCOMPLETE',
    }),
  ])
    assert.equal(validReservationMutationResult(result, intent), true);
  for (const extra of [
    { acknowledged: false },
    { confirmed: false },
    { snapshot: undefined },
    { snapshot: snapshot([]) },
    { owner_epoch: 'old' },
    { target: { kind: 'item', id: '9007199254740992' } },
    { target: { kind: 'series', id: itemId } },
    { target: { kind: 'item', id: Number(itemId) } },
    { target: { ...target, url: 'https://private.invalid' } },
    { reconciliation_error: 'ACCOUNT_RESERVATION_INCOMPLETE' },
    { confirmed: false, snapshot: undefined, reconciliation_error: 'private-value' },
  ])
    assert.equal(validReservationMutationResult(receipt(extra), intent), false);
});

test('captured transport preserves decimal targets and isolates nested caller and transport mutations', async () => {
  const calls = [];
  const abort = new AbortController();
  const request = async (path, signal, body) => {
    calls.push({ path, signal, body: structuredClone(body) });
    return body ? receipt() : snapshot();
  };
  await readReservations(request, scope, abort.signal);
  await setReservation(request, intent, abort.signal);
  assert.deepEqual(calls, [
    {
      path: '/api/v1/reservations?owner_id=123&owner_epoch=current',
      signal: abort.signal,
      body: undefined,
    },
    { path: '/api/v1/reservations', signal: abort.signal, body: intent },
  ]);
  const mutable = structuredClone(intent);
  await assert.rejects(
    setReservation(async (_path, _abort, body) => {
      mutable.target.id = '2';
      body.target.id = '2';
      return receipt({ target: { kind: 'item', id: '2' } });
    }, mutable),
    invalidResponse,
  );
  for (const id of [0, Number(itemId), '0', '01', '-1', '1.0', '9223372036854775808']) {
    await assert.rejects(
      setReservation(async () => assert.fail('must reject before dispatch'), {
        ...intent,
        target: { kind: 'item', id },
      }),
      invalidRequest,
    );
  }
});

test('cancelled or lost responses never publish or retry a possibly delivered POST', async () => {
  await assert.rejects(
    readReservations(async () => ({ ...snapshot(), owner_epoch: 'old' }), scope),
    invalidResponse,
  );
  let calls = 0;
  const lost = new Error('response lost');
  await assert.rejects(
    setReservation(async () => {
      calls++;
      throw lost;
    }, intent),
    (error) => error === lost,
  );
  assert.equal(calls, 1);
  for (const run of [
    (request, signal) => readReservations(request, scope, signal),
    (request, signal) => setReservation(request, intent, signal),
  ]) {
    const early = new AbortController();
    early.abort();
    const cancelled = (error) => error instanceof CoreError && error.code === 'CORE_CANCELLED';
    await assert.rejects(
      run(async () => assert.fail('cancelled before dispatch'), early.signal),
      cancelled,
    );
    const late = new AbortController();
    await assert.rejects(
      run(async (_path, _signal, body) => {
        late.abort();
        return body ? receipt() : snapshot();
      }, late.signal),
      cancelled,
    );
  }
});
