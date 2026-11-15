import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Detail intent boundaries only. Real NSH rendering, persistence and cloud writes are separate.
const reactivePort =
  'data:text/javascript,' +
  encodeURIComponent(`
    export const signal = (initial) => {
      let value = initial;
      return Object.assign(() => value, { set: (next) => { value = next; } });
    };
  `);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'nsh') return { url: reactivePort, shortCircuit: true };
    if (specifier === './error-messages') return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { createDetailFavorite } = await import('../../packages/app/src/detail-favorite.ts');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const card = (series_id) => ({ series_id, title: `Synthetic ${series_id}`, cover: '', intro: '' });
function fixture() {
  let summary = card('123');
  let active = true;
  let epoch = 'a'.repeat(32);
  let owner = '123';
  let libraryOwner = owner;
  let job;
  let pending;
  const members = new Set();
  const calls = [];
  const store = {
    account: () => ({ owner_id: owner, owner_epoch: epoch }),
    library: () => ({ owner_id: libraryOwner, entries: [], favorites: [] }),
    favoriteOperation: () => job,
    isFavorite: (drama) => members.has(drama.series_id),
    setFavorite: (drama, value) => {
      calls.push({ drama, value });
      job = {
        id: calls.length,
        ownerId: owner,
        ownerEpoch: epoch,
        seriesId: drama.series_id,
        value,
        status: 'pending',
        error: '',
      };
      pending = deferred();
      return pending.promise;
    },
    retryFavorite: async (id) => {
      calls.push({ retry: id });
    },
  };
  return {
    action: createDetailFavorite(
      store,
      () => summary,
      () => active,
    ),
    calls,
    members,
    summary: (next) => {
      summary = next;
    },
    active: (next) => {
      active = next;
    },
    epoch: (next) => {
      epoch = next;
    },
    owner: (next) => {
      owner = next;
    },
    libraryOwner: (next) => {
      libraryOwner = next;
    },
    job: () => job,
    status: (status) => {
      job = { ...job, status, error: status === 'complete' ? '' : 'Synthetic receipt unknown' };
    },
    resolve: () => pending.resolve(),
    reject: () => pending.reject(new Error('Synthetic admission error')),
  };
}

test('membership changes only from committed store data and pending work cannot retarget another season', async () => {
  const f = fixture();
  const pending = f.action.press();
  assert.equal(f.action.pending(), true);
  assert.equal(f.action.selected(), false);
  assert.deepEqual(f.calls, [{ drama: card('123'), value: true }]);
  f.summary(card('124'));
  await f.action.press();
  assert.equal(f.calls.length, 1);
  assert.equal(f.action.disabled(), true);
  f.members.add('123');
  f.status('complete');
  f.resolve();
  await pending;
  assert.equal(f.action.selected(), false);
  f.summary(card('123'));
  assert.equal(f.action.selected(), true);
});

test('an unresolved cancellation retries its original operation without deriving a new toggle', async () => {
  const f = fixture();
  f.members.add('123');
  const pending = f.action.press();
  f.status('unresolved');
  f.resolve();
  await pending;
  assert.equal(f.action.selected(), true);
  assert.equal(f.action.retryLabel(), '确认收藏结果');
  assert.equal(f.action.disabled(), true);
  await f.action.press();
  await f.action.retry();
  assert.deepEqual(f.calls, [{ drama: card('123'), value: false }, { retry: 1 }]);
  f.summary(card('124'));
  assert.equal(f.action.retryable(), true);
  assert.equal(f.action.retryLabel(), '确认上一条收藏结果');
  await f.action.retry();
  assert.deepEqual(f.calls.at(-1), { retry: 1 });
  assert.equal(f.calls.length, 3);
});

test('owner epoch rotation, background and mismatched libraries cannot admit or retry an old intent', async () => {
  const f = fixture();
  const pending = f.action.press();
  f.status('failed');
  f.resolve();
  await pending;
  f.epoch('b'.repeat(32));
  assert.equal(f.action.retryable(), false);
  await f.action.retry();
  f.active(false);
  await f.action.press();
  f.active(true);
  f.libraryOwner('456');
  await f.action.press();
  assert.equal(f.calls.length, 1);
});

test('late admission errors do not leak into a new season or a hidden detail page', async () => {
  for (const change of ['season', 'inactive', 'epoch']) {
    const f = fixture();
    const pending = f.action.press();
    if (change === 'season') f.summary(card('124'));
    else if (change === 'inactive') f.active(false);
    else f.epoch('b'.repeat(32));
    f.reject();
    await pending;
    assert.equal(f.action.message(), '');
  }
});
