import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Production store orchestration only; these ports do not establish NSH or real account acceptance.
const port = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const reactivePort = port(`
  export const signal = (initial) => {
    let value = initial;
    return Object.assign(() => value, {
      set: (next) => { value = next; }, update: (work) => { value = work(value); }
    });
  };
  export const batch = (work) => work();
  export const effect = (work) => work();
  export const cleanup = () => {};
  export const untracked = (work) => work();
  export const lifecycle = () => 'active';
  export const resource = (source, fetcher) => {
    let value, state = 'unresolved', error;
    const read = async () => {
      const key = fetcher ? source() : true;
      if (key === undefined) return;
      state = value ? 'refreshing' : 'pending';
      try {
        value = await (fetcher ? fetcher(key, { signal: new AbortController().signal })
          : source({ signal: new AbortController().signal }));
        state = 'ready';
      } catch (cause) { error = cause; state = 'errored'; }
    };
    const result = Object.assign(() => value, {
      state: () => state, error: () => error, refetch: read,
      mutate: (next) => { value = next; state = 'ready'; }
    });
    void read();
    return result;
  };
`);
const clientPort = port(`
  export { createLibraryWriter, LibraryWriteError, validLibrarySnapshot } from '${new URL('../../packages/core-client/src/library-writer.ts', import.meta.url).href}';
  export const readFollow = () => { throw new Error('Unexpected follow read'); };
  export const setFollow = () => { throw new Error('Unexpected follow mutation'); };
  export const readReservations = () => { throw new Error('Unexpected reservation read'); };
  export const setReservation = () => { throw new Error('Unexpected reservation mutation'); };
  export const readNotifications = () => { throw new Error('Unexpected notification read'); };
  export const markNotificationRead = () => { throw new Error('Unexpected notification mutation'); };
  export const validNotificationSnapshot = () => false;
  export const configureTransport = () => {};
  export const reservationMembership = () => undefined;
  export class CoreError extends Error {
    constructor(message, code, status) { super(message); this.code = code; this.status = status; }
  }
  let request;
  export const configureRequest = (next) => { request = next; };
  export const captureRequest = () => request;
  export const libraryDrama = ({ episodes, ...summary }) => summary;
`);
const navigationPort = port(`
  export const createNavStack = (initial) => {
    let routes = initial;
    return { routes: () => routes, push: (route) => routes.push(route),
      pop: () => routes.pop(), popToRoot: () => { routes = routes.slice(0, 1); } };
  };
`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'nsh') return { url: reactivePort, shortCircuit: true };
    if (specifier === 'nsh/base') return { url: navigationPort, shortCircuit: true };
    if (specifier === '@hongguo/core-client') return { url: clientPort, shortCircuit: true };
    if (specifier.startsWith('./') && !specifier.endsWith('.ts'))
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { createStore } = await import('../../packages/app/src/store.ts');
const { configureRequest, CoreError } = await import(clientPort);
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const card = { series_id: '123', title: 'Synthetic', cover: '', intro: '' };
const snapshot = () => ({
  account: {
    logged_in: true,
    owner_id: '123',
    owner_epoch: 'a'.repeat(32),
    sync: { state: 'local', pending: 0 },
    guest_history: { available: 2, total: 3 },
  },
  library: { owner_id: '123', entries: [], favorites: [] },
});
function fixture(handler) {
  let current = snapshot();
  const calls = [];
  configureRequest(async (path, abort, body) => {
    calls.push({ path, abort, body });
    const result = await handler?.(path, abort, body, current);
    if (result !== undefined) return result;
    if (path === '/api/v1/account') return current.account;
    if (path === '/api/v1/library') return current.library;
    if (path === '/api/v1/account/state') return current;
    if (path === '/api/v1/library/session') return { session_id: 'b'.repeat(32) };
    if (path.includes('/operation?')) {
      current = {
        ...current,
        library: { ...current.library, favorites: [{ drama: body.drama, favorite_at: 1 }] },
      };
      const url = new URL(path, 'http://synthetic');
      return {
        session_id: url.searchParams.get('session_id'),
        operation_id: url.searchParams.get('operation_id'),
        outcome: { status: 'committed', library: current.library },
      };
    }
    throw new Error(`Unexpected synthetic request: ${path}`);
  });
  return { store: createStore('desktop'), calls };
}

test('guest import drains the existing writer and preserves the original import receipt', async () => {
  const write = deferred();
  const receipt = { imported: 2, remaining: 0 };
  let operationPath;
  const f = fixture((path, _abort, body, current) => {
    if (path.includes('/operation?')) {
      operationPath = path;
      return write.promise;
    }
    if (path === '/api/v1/account/command') {
      assert.deepEqual(body, {
        owner_id: '123',
        owner_epoch: 'a'.repeat(32),
        command: { action: 'import_guest_history' },
      });
      return { ...current, import_history: receipt };
    }
  });
  await settle();
  const saving = f.store.setFavorite(card, true);
  await settle();
  const importing = f.store.importGuestHistory();
  await settle();
  assert.equal(
    f.calls.some(({ path }) => path === '/api/v1/account/command'),
    false,
  );
  write.resolve({
    session_id: 'b'.repeat(32),
    operation_id: new URL(operationPath, 'http://synthetic').searchParams.get('operation_id'),
    outcome: { status: 'committed', library: snapshot().library },
  });
  await saving;
  assert.equal(await importing, receipt);
});

test('lost import receipt publishes authoritative state without inventing original counts', async () => {
  const f = fixture((path, _abort, _body, current) => {
    if (path === '/api/v1/account/command') throw new Error('Synthetic lost import receipt');
    if (path === '/api/v1/account/state')
      return {
        ...current,
        account: { ...current.account, guest_history: { available: 0, total: 3 } },
        import_history: { imported: 999, remaining: 0 },
      };
  });
  await settle();
  assert.equal(await f.store.importGuestHistory(), undefined);
  assert.deepEqual(f.store.account().guest_history, { available: 0, total: 3 });
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/command').length, 1);
  await assert.rejects(f.store.accountCommand({ action: 'import_guest_history' }));
});

test('explicit import rejections survive successful state reconciliation without fabricated counts', async () => {
  for (const [code, status] of [
    ['LIBRARY_SYNC_QUEUE_FULL', 409],
    ['ACCOUNT_OWNER_CHANGED', 409],
    ['LIBRARY_STORAGE_UNAVAILABLE', 500],
  ]) {
    const rejected = new CoreError('Synthetic explicit import rejection', code, status);
    const f = fixture((path, _abort, _body, current) => {
      if (path === '/api/v1/account/command') throw rejected;
      if (path === '/api/v1/account/state')
        return {
          ...current,
          account: { ...current.account, guest_history: { available: 1, total: 3 } },
          import_history: { imported: 999, remaining: 0 },
        };
    });
    await settle();
    await assert.rejects(f.store.importGuestHistory(), (cause) => cause === rejected);
    assert.deepEqual(f.store.account().guest_history, { available: 1, total: 3 });
    assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/command').length, 1);
    assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 1);
  }
});

test('uncertain core delivery reconciles current state without reconstructing import counts', async () => {
  for (const code of ['CORE_CANCELLED', 'CORE_RESPONSE_INVALID']) {
    const f = fixture((path, _abort, _body, current) => {
      if (path === '/api/v1/account/command')
        throw new CoreError('Synthetic uncertain delivery', code, 499);
      if (path === '/api/v1/account/state')
        return { ...current, import_history: { imported: 999, remaining: 0 } };
    });
    await settle();
    assert.equal(await f.store.importGuestHistory(), undefined);
    assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/command').length, 1);
  }
});

test('failed authoritative import recovery remains rejected and cannot permit a favorite write', async () => {
  const f = fixture((path) => {
    if (path === '/api/v1/account/command' || path === '/api/v1/account/state')
      throw new Error('Synthetic unavailable account state');
  });
  await settle();
  await assert.rejects(f.store.importGuestHistory());
  assert.throws(() => f.store.setFavorite(card, true));
  assert.equal(
    f.calls.some(({ path }) => path.includes('/operation?')),
    false,
  );
});

test('authoritative refresh publishes account sync, guest statistics and library from one read', async () => {
  const next = snapshot();
  next.account.sync = { state: 'synced', pending: 0 };
  next.account.guest_history = { available: 0, total: 3 };
  next.library.favorites = [{ drama: card, favorite_at: 1 }];
  const f = fixture((path) => (path === '/api/v1/account/state' ? next : undefined));
  await settle();
  f.calls.length = 0;
  await f.store.refreshAccountLibraryState();
  assert.equal(f.store.account(), next.account);
  assert.equal(f.store.library(), next.library);
  assert.deepEqual(
    f.calls.map(({ path }) => path),
    ['/api/v1/account/state'],
  );
  assert.equal(f.store.libraryKind(), 'history');
  f.store.openLibrary('favorites');
  assert.equal(f.store.libraryKind(), 'favorites');
  assert.equal(f.store.section(), 'history');
});

test('queued refresh rechecks its active guard before any state read or owner transition', async () => {
  const command = deferred();
  let active = true;
  let guardCalls = 0;
  const f = fixture((path) => {
    if (path === '/api/v1/account/command') return command.promise;
  });
  await settle();
  const syncing = f.store.accountCommand({ action: 'sync' });
  await settle();
  const refreshing = f.store.refreshAccountLibraryState(() => {
    guardCalls++;
    return active;
  });
  await settle();
  assert.equal(guardCalls, 0);
  active = false;
  command.resolve(snapshot());
  await syncing;
  await refreshing;
  assert.equal(guardCalls, 1);
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 0);

  // A skipped observation must not reset an existing operation or seal new writes.
  await f.store.setFavorite(card, true);
  const operation = f.store.favoriteOperation();
  const library = f.store.library();
  assert.equal(operation.status, 'complete');
  await f.store.refreshAccountLibraryState(() => false);
  assert.equal(f.store.favoriteOperation(), operation);
  assert.equal(f.store.library(), library);
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 0);
  await f.store.setFavorite(card, false);
});

test('a transient account observation failure preserves committed data and leaves writes and reloads usable', async () => {
  const f = fixture((path) => {
    if (path === '/api/v1/account/state') throw new Error('Synthetic transient read failure');
  });
  await settle();
  const account = f.store.account();
  const library = f.store.library();
  await assert.rejects(f.store.refreshAccountLibraryState());
  assert.equal(f.store.account(), account);
  assert.equal(f.store.library(), library);
  await f.store.setFavorite(card, true);
  assert.equal(f.store.favoriteOperation().status, 'complete');
  const reads = f.calls.filter(({ path }) => path === '/api/v1/library').length;
  await f.store.library.refetch();
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/library').length, reads + 1);
});

test('same-scope observations preserve partial history and favorite management jobs and writer identities', async () => {
  for (const kind of ['history', 'favorites']) {
    let failed = false;
    let library = {
      ...snapshot().library,
      entries: [{ drama: card, episode: 1, video_id: '456', last_played_at: 1000 }],
      favorites: [{ drama: card, favorite_at: 1000 }],
    };
    const f = fixture((path, _abort, _body, current) => {
      if (path === '/api/v1/library') return library;
      if (path === '/api/v1/account/state') return { ...current, library };
      if (path.includes('/operation?')) {
        const url = new URL(path, 'http://synthetic');
        const identity = {
          session_id: url.searchParams.get('session_id'),
          operation_id: url.searchParams.get('operation_id'),
        };
        if (!failed) {
          failed = true;
          return {
            ...identity,
            outcome: {
              status: 'failed',
              code: 'LIBRARY_STORAGE_UNAVAILABLE',
              error: 'Synthetic disk failure',
            },
          };
        }
        library = { ...library, [kind === 'history' ? 'entries' : 'favorites']: [] };
        return { ...identity, outcome: { status: 'committed', library } };
      }
    });
    await settle();
    const management = kind === 'history' ? f.store.historyManagement : f.store.favoritesManagement;
    await management.remove(['123']);
    const job = management.operation();
    assert.equal(job.status, 'partial');
    assert.deepEqual(job.remainingIds, ['123']);
    await f.store.refreshAccountLibraryState();
    assert.equal(management.operation(), job);
    await management.retry(job.id);
    assert.equal(management.operation().status, 'complete');
    assert.equal(f.calls.filter(({ path }) => path === '/api/v1/library/session').length, 1);
    assert.deepEqual(
      f.calls
        .filter(({ path }) => path.includes('/operation?'))
        .map(({ path }) => new URL(path, 'http://synthetic').searchParams.get('operation_id')),
      ['1', '2'],
    );
  }
});

test('an observation guard is rechecked after draining an accepted write and before state dispatch', async () => {
  const write = deferred();
  let active = true;
  let operationPath;
  const f = fixture((path) => {
    if (path.includes('/operation?')) {
      operationPath = path;
      return write.promise;
    }
  });
  await settle();
  const saving = f.store.setFavorite(card, true);
  await settle();
  const refreshing = f.store.refreshAccountLibraryState(() => active);
  await settle();
  active = false;
  write.resolve({
    session_id: 'b'.repeat(32),
    operation_id: new URL(operationPath, 'http://synthetic').searchParams.get('operation_id'),
    outcome: { status: 'committed', library: snapshot().library },
  });
  await saving;
  await refreshing;
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 0);
  assert.equal(f.store.favoriteOperation().status, 'complete');
  assert.equal(f.store.library.state(), 'ready');
});

test('a late observation cannot publish after navigation or overwrite a newer admitted favorite', async () => {
  for (const change of ['navigation', 'favorite']) {
    const state = deferred();
    let active = true;
    let stateAbort;
    const f = fixture((path, abort) => {
      if (path === '/api/v1/account/state') {
        stateAbort = abort;
        return state.promise;
      }
    });
    await settle();
    const account = f.store.account();
    const refreshing = f.store.refreshAccountLibraryState(() => active);
    await settle();
    if (change === 'navigation') active = false;
    else {
      await f.store.setFavorite(card, true);
      assert.equal(stateAbort.aborted, true);
    }
    const library = f.store.library();
    const stale = snapshot();
    stale.account.sync = { state: 'synced', pending: 0 };
    state.resolve(stale);
    await refreshing;
    assert.equal(f.store.account(), account);
    assert.equal(f.store.library(), library);
    assert.equal(f.store.library.state(), 'ready');
  }
});

test('an unsolicited owner epoch change is not published by a same-scope observation', async () => {
  const next = snapshot();
  next.account.owner_epoch = 'c'.repeat(32);
  const f = fixture((path) => (path === '/api/v1/account/state' ? next : undefined));
  await settle();
  const account = f.store.account();
  await assert.rejects(
    f.store.refreshAccountLibraryState(),
    (cause) => cause.code === 'ACCOUNT_OWNER_CHANGED',
  );
  assert.equal(f.store.account(), account);
  await f.store.setFavorite(card, true);
  assert.equal(f.store.favoriteOperation().ownerEpoch, account.owner_epoch);
});

test('an observation cannot replace a lost favorite receipt or retry its desired state implicitly', async () => {
  let attempts = 0;
  const f = fixture((path) => {
    if (path.includes('/operation?') && ++attempts === 1) throw new Error('Synthetic lost receipt');
  });
  await settle();
  await f.store.setFavorite(card, true);
  const job = f.store.favoriteOperation();
  assert.equal(job.status, 'unresolved');
  await f.store.refreshAccountLibraryState();
  assert.equal(attempts, 1);
  assert.equal(f.store.favoriteOperation(), job);
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 0);
  await f.store.retryFavorite(job.id);
  assert.equal(f.store.favoriteOperation().status, 'complete');
  assert.equal(attempts, 2);
  assert.equal(
    new Set(f.calls.filter(({ path }) => path.includes('/operation?')).map(({ path }) => path))
      .size,
    1,
  );
  await f.store.refreshAccountLibraryState();
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/account/state').length, 1);
});

test('authoritative recovery after an uncertain account command still releases its owner barrier', async () => {
  let unavailable = true;
  const f = fixture((path) => {
    if (path === '/api/v1/account/command' || (path === '/api/v1/account/state' && unavailable))
      throw new Error('Synthetic unavailable owner response');
  });
  await settle();
  await assert.rejects(f.store.importGuestHistory());
  assert.throws(
    () => f.store.setFavorite(card, true),
    (cause) => cause.code === 'LIBRARY_OWNER_TRANSITION',
  );
  unavailable = false;
  await f.store.refreshAccountLibraryState();
  await f.store.setFavorite(card, true);
  assert.equal(f.store.favoriteOperation().status, 'complete');
});

test('remote history without a playable identity remains readable through observations and favorite receipts', async () => {
  const next = snapshot();
  next.library.entries = [
    { drama: card, episode: 0, position: 0, duration: 30, completed: false, last_played_at: 1000 },
  ];
  const f = fixture((path) => {
    if (path === '/api/v1/library') return next.library;
    if (path === '/api/v1/account/state') return next;
    if (path.includes('/operation?')) {
      const url = new URL(path, 'http://synthetic');
      next.library = { ...next.library, favorites: [{ drama: card, favorite_at: 1000 }] };
      return {
        session_id: url.searchParams.get('session_id'),
        operation_id: url.searchParams.get('operation_id'),
        outcome: { status: 'committed', library: next.library },
      };
    }
  });
  await settle();
  assert.equal(f.store.library.state(), 'ready');
  await f.store.refreshAccountLibraryState();
  await f.store.setFavorite(card, true);
  assert.equal(f.store.favoriteOperation().status, 'complete');
  assert.equal(f.store.library().entries[0].episode, 0);
  assert.equal(f.store.library().entries[0].video_id, undefined);
  assert.equal(f.store.isFavorite(card), true);
});
