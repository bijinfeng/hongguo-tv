import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const clientURL = new URL('../../packages/core-client/src/index.ts', import.meta.url).href;
const reactiveURL =
  'data:text/javascript,' +
  encodeURIComponent(`
  let observer;
  export const signal = (initial) => {
    let value = initial;
    const listeners = new Set();
    return Object.assign(() => {
      if (observer) listeners.add(observer);
      return value;
    }, { set(next) {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    }});
  };
  export const effect = (work) => {
    const run = () => { const before = observer; observer = run; try { work(); } finally { observer = before; } };
    run();
  };
  export const untracked = (work) => {
    const before = observer; observer = undefined;
    try { return work(); } finally { observer = before; }
  };
  export const batch = (work) => work();
  export const cleanup = () => {};
`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'nsh') return { url: reactiveURL, shortCircuit: true };
    if (specifier === '@hongguo/core-client') return { url: clientURL, shortCircuit: true };
    if (
      context.parentURL?.includes('/packages/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { signal } = await import(reactiveURL);
const { CoreError } = await import(clientURL);
const { createFollowState } = await import('../../packages/app/src/follow-state.ts');
const settle = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const account = (owner_id = '123', owner_epoch = 'first') => ({
  logged_in: !!owner_id,
  owner_id,
  owner_epoch,
});
const snapshot = (ids = [], scope = account()) => ({
  owner_id: scope.owner_id,
  owner_epoch: scope.owner_epoch,
  items: ids.map((series_id) => ({ series_id })),
});
const receipt = (intent, ids) => ({
  ...intent,
  acknowledged: true,
  confirmed: true,
  snapshot: snapshot(ids, intent),
});
function fixture(handler, initial = account(), visible = true) {
  const owner = signal(initial);
  const active = signal(visible);
  const calls = [];
  let members = [];
  const request = async (path, abort, body) => {
    calls.push({ path, abort, body });
    const result = await handler?.(path, abort, body, owner());
    if (result !== undefined) return result;
    if (!body) return snapshot(members, owner());
    members = body.enabled
      ? [...new Set([...members, body.series_id])]
      : members.filter((id) => id !== body.series_id);
    return receipt(body, members);
  };
  return { state: createFollowState(request, owner, active), owner, active, calls };
}

test('guest and hidden pages issue no follow requests; entering reads one complete current snapshot', async () => {
  const f = fixture(undefined, account(''), false);
  f.active.set(true);
  await settle();
  assert.equal(f.calls.length, 0);
  f.owner.set(account());
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.state.membership('456'), false);
  assert.deepEqual(f.state.snapshot(), snapshot());
  f.state.dispose();
});

test('failed refresh keeps the previous list stale and cannot infer absence or permit writes', async () => {
  let fail = false;
  const f = fixture(() => {
    if (fail) throw new CoreError('Synthetic later-page failure', 'ACCOUNT_FOLLOW_INCOMPLETE', 502);
    return snapshot(['456']);
  });
  await settle();
  const before = f.state.snapshot();
  fail = true;
  await f.state.refresh();
  assert.equal(f.state.snapshot(), before);
  assert.equal(f.state.stale(), true);
  assert.equal(f.state.membership('456'), undefined);
  await f.state.set('789', true);
  assert.equal(
    f.calls.some(({ body }) => body),
    false,
  );
  assert.match(f.state.error(), /未完整读取/);
  f.state.dispose();
});

test('pending mutation neither changes membership optimistically nor admits duplicate or conflicting writes', async () => {
  const response = deferred();
  const f = fixture((_path, _abort, body) => (body ? response.promise : undefined));
  await settle();
  const pending = f.state.set('456', true);
  await settle();
  assert.equal(f.state.membership('456'), false);
  assert.equal(f.state.mutation().state, 'pending');
  await f.state.set('789', true);
  await f.state.retry();
  await f.state.refresh();
  assert.equal(f.calls.length, 2);
  response.resolve(receipt(f.calls.at(-1).body, ['456']));
  await pending;
  assert.equal(f.state.membership('456'), true);
  assert.equal(f.state.mutation(), undefined);
  f.state.dispose();
});

test('lost write response reconciles through a GET without reposting the intent', async () => {
  let applied = false;
  const f = fixture((_path, _abort, body) => {
    if (body) {
      applied = true;
      throw new Error('Synthetic lost reply');
    }
    return snapshot(applied ? ['456'] : []);
  });
  await settle();
  await f.state.set('456', true);
  assert.equal(f.state.membership('456'), true);
  assert.equal(f.state.mutation(), undefined);
  assert.deepEqual(
    f.calls.map(({ body }) => (body ? 'POST' : 'GET')),
    ['GET', 'POST', 'GET'],
  );
  f.state.dispose();
});

test('failed uncertain reconciliation retains its original intent; explicit retry cannot bypass a failed read', async () => {
  let fail = false;
  const f = fixture(() => {
    if (fail) throw new Error('Synthetic unavailable');
  });
  await settle();
  fail = true;
  await f.state.set('456', true);
  assert.deepEqual(f.state.mutation(), { series_id: '456', enabled: true, state: 'unknown' });
  const calls = f.calls.length;
  await f.state.retry();
  assert.equal(f.calls.length, calls + 1);
  assert.equal(f.calls.at(-1).body, undefined);
  assert.equal(f.state.stale(), true);
  f.state.dispose();
});

test('ACK with mismatching readback stays unconfirmed; explicit retry first reads then resends original absolute target', async () => {
  let attempts = 0;
  const f = fixture((_path, _abort, body) => {
    if (body && ++attempts === 1) return { ...receipt(body, []), confirmed: false };
  });
  await settle();
  await f.state.set('456', true);
  assert.equal(f.state.mutation().state, 'unconfirmed');
  assert.equal(f.state.membership('456'), undefined);
  await f.state.set('789', true);
  await f.state.retry();
  assert.deepEqual(
    f.calls.map(({ body }) => (body ? 'POST' : 'GET')),
    ['GET', 'POST', 'GET', 'POST'],
  );
  assert.deepEqual(f.calls[1].body, f.calls[3].body);
  assert.equal(f.state.membership('456'), true);
  assert.equal(f.state.membership('789'), false);
  f.state.dispose();
});

test('explicit business rejection is not converted to success by automatic reconciliation', async () => {
  const f = fixture((_path, _abort, body) => {
    if (body) throw new CoreError('Synthetic rejection', 'ACCOUNT_FOLLOW_REJECTED', 502);
  });
  await settle();
  await f.state.set('456', true);
  assert.equal(f.calls.length, 2);
  assert.equal(f.state.mutation(), undefined);
  assert.match(f.state.error(), /未接受/);
  assert.equal(f.state.stale(), true);
  f.state.dispose();
});

test('a late aborted read cannot overwrite a newer read or confirmed mutation snapshot', async () => {
  const old = deferred();
  let reads = 0;
  const f = fixture((_path, _abort, body) => {
    if (!body && ++reads === 2) return old.promise;
  });
  await settle();
  const reading = f.state.refresh();
  await settle();
  const oldAbort = f.calls.at(-1).abort;
  await f.state.refresh();
  await f.state.set('456', true);
  old.resolve(snapshot(['789']));
  await reading;
  assert.equal(oldAbort.aborted, true);
  assert.deepEqual(f.state.snapshot(), snapshot(['456']));
  f.state.dispose();
});

test('leaving during a write retains unknown intent and reentry reads without replay or stale publication', async () => {
  const write = deferred();
  let reads = 0;
  const f = fixture((_path, _abort, body) =>
    body ? write.promise : snapshot(++reads > 1 ? ['456'] : []),
  );
  await settle();
  const pending = f.state.set('456', true);
  await settle();
  const abort = f.calls.at(-1).abort;
  f.active.set(false);
  assert.equal(abort.aborted, true);
  assert.equal(f.state.mutation().state, 'unknown');
  write.resolve(receipt(f.calls.at(-1).body, ['456']));
  await pending;
  assert.equal(f.state.stale(), true);
  f.active.set(true);
  await settle();
  assert.equal(f.state.mutation(), undefined);
  assert.equal(f.state.membership('456'), true);
  assert.equal(f.calls.filter(({ body }) => body).length, 1);
  f.state.dispose();
});

test('A to B to A epoch rotation clears private data and fences late mutation responses', async () => {
  const write = deferred();
  const f = fixture((_path, _abort, body) => (body ? write.promise : undefined));
  await settle();
  const pending = f.state.set('456', true);
  await settle();
  const intent = f.calls.at(-1).body;
  f.owner.set(account('789', 'second'));
  assert.equal(f.state.snapshot(), undefined);
  assert.equal(f.state.mutation(), undefined);
  await settle();
  f.owner.set(account('123', 'third'));
  await settle();
  write.resolve(receipt(intent, ['456']));
  await pending;
  assert.deepEqual(f.state.snapshot(), snapshot([], account('123', 'third')));
  f.owner.set(account(''));
  assert.equal(f.state.snapshot(), undefined);
  assert.equal(f.state.membership('456'), undefined);
  f.state.dispose();
});

test('dispose aborts transport and fences continuation without awaiting an uncancellable caller', async () => {
  const read = deferred();
  const f = fixture(() => read.promise);
  await settle();
  f.state.dispose();
  assert.equal(f.calls[0].abort.aborted, true);
  assert.equal(f.state.loading(), false);
  read.resolve(snapshot(['456']));
  await settle();
  assert.equal(f.state.snapshot(), undefined);
  f.active.set(false);
  f.active.set(true);
  assert.equal(f.calls.length, 1);
});
