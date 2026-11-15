import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const clientURL = new URL('../../packages/core-client/src/index.ts', import.meta.url).href;
// Execute the real client modules using the same extensionless imports as NSH's bundler.
registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.includes('/packages/core-client/src/') &&
      ['./index', './follow', './reservations', './library-writer'].includes(specifier)
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { readFollow, setFollow, validFollowSnapshot, validFollowMutationResult } =
  await import('../../packages/core-client/src/follow.ts');
const { CoreError } = await import(clientURL);
const scope = { owner_id: '123', owner_epoch: 'current' };
const series = '9999999999999999999';
const intent = { ...scope, series_id: series, enabled: true };
const snapshot = (items = [{ series_id: series }]) => ({ ...scope, items });
const receipt = (changes = {}) => ({
  ...intent,
  acknowledged: true,
  confirmed: true,
  snapshot: snapshot(),
  ...changes,
});
const invalid = (error) =>
  error instanceof CoreError && error.code === 'ACCOUNT_FOLLOW_RESPONSE_INVALID';

test('complete same-scope follow membership preserves exact identities and unavailable cards', () => {
  for (const value of [
    snapshot([]),
    snapshot(),
    snapshot([
      {
        series_id: series,
        series_status: 'ongoing',
        latest_watched_episode: 0,
        has_watched_latest_episode: false,
        show_update_frequency: '每周更新',
        follow_update_time: 0,
        drama: {
          series_id: series,
          title: '真实可选字段',
          cover: '',
          intro: '',
          content_type: '1004',
          episode_count: 30,
          series_status: 'ongoing',
          tags: ['短剧'],
        },
      },
      { series_id: '8888888888888888888', series_status: 'ended' },
    ]),
  ])
    assert.equal(validFollowSnapshot(value, scope), true);
  assert.equal(validFollowSnapshot(snapshot(), { ...scope, owner_id: '' }), false);
});

test('Rust compact cards retain supported content types and the public u32 episode count', async () => {
  for (const contentType of ['1', '7', '1004']) {
    // Matches the common/expand card emitted by the Rust mac-shape parser fixture.
    const observed = snapshot([
      {
        series_id: series,
        series_status: 'ongoing',
        latest_watched_episode: 4,
        has_watched_latest_episode: true,
        show_update_frequency: '每日更新',
        follow_update_time: 123,
        drama: {
          series_id: series,
          title: '追更剧',
          cover: '',
          intro: '',
          content_type: contentType,
          episode_count: contentType === '1' ? 12 : 0xffffffff,
          series_status: 'ongoing',
        },
      },
    ]);
    assert.deepEqual(await readFollow(async () => observed, scope), observed);
    const confirmed = receipt({ snapshot: observed });
    assert.deepEqual(await setFollow(async () => confirmed, intent), confirmed);
  }
});

test('partial malformed duplicate and wrong-scope follow snapshots cannot become membership', () => {
  const badItems = [
    null,
    { series_id: 123 },
    { series_id: '0' },
    { series_id: 'a'.repeat(32) },
    { series_id: series, series_status: 0 },
    { series_id: series, latest_watched_episode: -1 },
    { series_id: series, latest_watched_episode: 1.5 },
    { series_id: series, latest_watched_episode: 10001 },
    { series_id: series, has_watched_latest_episode: 1 },
    { series_id: series, follow_update_time: Number.MAX_SAFE_INTEGER + 1 },
    { series_id: series, follow_update_time: NaN },
    { series_id: series, show_update_frequency: 'x\nsecret' },
    { series_id: series, drama: null },
    { series_id: series, drama: { series_id: '456', title: '', cover: '', intro: '' } },
    {
      series_id: series,
      drama: { series_id: series, title: '', cover: '', intro: '', episodes: [] },
    },
    {
      series_id: series,
      drama: { series_id: series, title: '', cover: '', intro: '', vid_list: [] },
    },
    {
      series_id: series,
      drama: { series_id: series, title: '', cover: '', intro: '', content_type: '1010' },
    },
    {
      series_id: series,
      drama: { series_id: series, title: '', cover: '', intro: '', episode_count: 0x100000000 },
    },
    { series_id: series, cookie: 'private' },
  ];
  const values = [
    null,
    {},
    { items: [] },
    { ...snapshot(), owner_id: '456' },
    { ...snapshot(), owner_epoch: 'old' },
    { ...snapshot(), items: null },
    { ...snapshot(), has_more: true },
    { ...snapshot(), complete: false },
    snapshot([{ series_id: series }, { series_id: series }]),
    snapshot(Array.from({ length: 2001 }, (_, i) => ({ series_id: String(i + 1) }))),
    ...badItems.map((item) => snapshot([item])),
  ];
  for (const value of values) assert.equal(validFollowSnapshot(value, scope), false);
});

test('ACK and observed confirmation remain distinct and exact-intent bound', () => {
  for (const value of [
    receipt(),
    receipt({ confirmed: false, snapshot: snapshot([]) }),
    receipt({
      confirmed: false,
      snapshot: undefined,
      reconciliation_error: 'ACCOUNT_FOLLOW_INCOMPLETE',
    }),
  ])
    assert.equal(validFollowMutationResult(value, intent), true);
  const cancel = { ...intent, enabled: false };
  assert.equal(
    validFollowMutationResult({ ...receipt(), enabled: false, snapshot: snapshot([]) }, cancel),
    true,
  );
  for (const change of [
    { acknowledged: false },
    { acknowledged: undefined },
    { confirmed: undefined },
    { owner_id: '456' },
    { owner_epoch: 'old' },
    { series_id: '456' },
    { enabled: false },
    { snapshot: undefined },
    { snapshot: { ...snapshot(), owner_epoch: 'old' } },
    { snapshot: snapshot([]) },
    { confirmed: false },
    { confirmed: false, snapshot: undefined },
    { reconciliation_error: 'ACCOUNT_FOLLOW_INCOMPLETE' },
    {
      confirmed: false,
      snapshot: undefined,
      reconciliation_error: 'https://private.invalid/token',
    },
    { cookie: 'private' },
  ])
    assert.equal(validFollowMutationResult(receipt(change), intent), false);
});

test('read and write use the captured transport once and keep their original scope and intent', async () => {
  const calls = [];
  const abort = new AbortController();
  const request = async (path, signal, body) => {
    calls.push({ path, signal, body: structuredClone(body) });
    return body ? receipt() : snapshot();
  };
  assert.deepEqual(await readFollow(request, scope, abort.signal), snapshot());
  assert.deepEqual(await setFollow(request, intent, abort.signal), receipt());
  assert.deepEqual(calls, [
    {
      path: '/api/v1/follow?owner_id=123&owner_epoch=current',
      signal: abort.signal,
      body: undefined,
    },
    { path: '/api/v1/follow', signal: abort.signal, body: intent },
  ]);
  const mutable = { ...intent };
  await assert.rejects(
    setFollow(async (_path, _abort, body) => {
      mutable.series_id = '456';
      body.series_id = '456';
      return receipt({ series_id: '456' });
    }, mutable),
    invalid,
  );
  const original = { ...scope };
  assert.deepEqual(
    await readFollow(async () => {
      original.owner_epoch = 'later';
      return snapshot();
    }, original),
    snapshot(),
  );
});

test('invalid late or cancelled results never publish, and response loss never retries a POST', async () => {
  await assert.rejects(
    readFollow(async () => ({ ...snapshot(), owner_epoch: 'old' }), scope),
    invalid,
  );
  await assert.rejects(
    setFollow(async () => receipt({ acknowledged: false }), intent),
    invalid,
  );
  let calls = 0;
  const lost = new Error('response lost');
  await assert.rejects(
    setFollow(async () => {
      calls++;
      throw lost;
    }, intent),
    (error) => error === lost,
  );
  assert.equal(calls, 1);
  for (const run of [
    (request, abort) => readFollow(request, scope, abort),
    (request, abort) => setFollow(request, intent, abort),
  ]) {
    const early = new AbortController();
    early.abort();
    await assert.rejects(
      run(async () => {
        calls++;
      }, early.signal),
      { code: 'CORE_CANCELLED' },
    );
    assert.equal(calls, 1);
    const late = new AbortController();
    await assert.rejects(
      run(async () => {
        late.abort();
        return receipt();
      }, late.signal),
      { code: 'CORE_CANCELLED' },
    );
  }
  for (const run of [
    () =>
      readFollow(
        async () => {
          calls++;
        },
        { ...scope, owner_id: '' },
      ),
    () =>
      setFollow(
        async () => {
          calls++;
        },
        { ...intent, series_id: 'invalid' },
      ),
  ])
    await assert.rejects(run(), { code: 'ACCOUNT_REQUEST_INVALID' });
  assert.equal(calls, 1);
});
