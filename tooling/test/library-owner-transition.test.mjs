import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Queue ownership only: tiny synchronous signal ports do not constitute NSH or functional acceptance.
const reactivePort =
  'data:text/javascript,' +
  encodeURIComponent(`
  export const signal = (initial) => {
    let value = initial;
    return Object.assign(() => value, { set: (next) => { value = next; } });
  };
  export const batch = (work) => work();
  export const effect = (work) => work();
  export const cleanup = () => {};
  export const untracked = (work) => work();
`);
const clientPort =
  'data:text/javascript,' +
  encodeURIComponent(`
  export { createLibraryWriter, LibraryWriteError, validLibrarySnapshot } from '${new URL('../../packages/core-client/src/library-writer.ts', import.meta.url).href}';
  export class CoreError extends Error {
    constructor(message, code, status) { super(message); this.code = code; this.status = status; }
  }
`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'nsh') return { url: reactivePort, shortCircuit: true };
    if (specifier === '@hongguo/core-client') return { url: clientPort, shortCircuit: true };
    if (specifier === './library-writer' || specifier === './error-messages')
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { createLibraryState } = await import('../../packages/app/src/library-state.ts');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const snapshot = (owner_id = '') => ({ owner_id, favorites: [], entries: [] });
const progress = (owner_id = '', position = 1) => ({
  action: 'progress',
  owner_id,
  drama: { series_id: '123', title: 'Synthetic', cover: '', intro: '' },
  episode: 1,
  video_id: '456',
  position,
  duration: 100,
  completed: false,
});
function fixture(handler = () => {}, accountScope) {
  const calls = [];
  let sessions = 0;
  const state = createLibraryState(async (path, abort, body) => {
    calls.push({ path, abort, body });
    const result = handler(path, abort, body);
    if (result !== undefined) return result;
    if (path.endsWith('/session')) return { session_id: String(++sessions).padStart(32, 'a') };
    if (path.startsWith('/api/v1/library/operation?')) {
      const url = new URL(path, 'http://synthetic');
      return {
        session_id: url.searchParams.get('session_id'),
        operation_id: url.searchParams.get('operation_id'),
        outcome: { status: 'committed', library: snapshot(body.owner_id) },
      };
    }
    return snapshot();
  }, accountScope);
  return { state, calls, sessions: () => sessions };
}

test('transition synchronously blocks new admission and reads while draining accepted writes', async () => {
  const write = deferred();
  const switched = deferred();
  let original;
  const f = fixture((path) => {
    if (path.startsWith('/api/v1/library/operation?') && !original) {
      original = path;
      return write.promise;
    }
  });
  await settle();
  const saved = f.state.save(progress());
  await settle();
  let dispatched = false;
  const transition = f.state.transitionOwner(async () => {
    dispatched = true;
    return switched.promise;
  });
  assert.equal(f.state.ownerBlocked(), true);
  await f.state.save(progress('', 2));
  await f.state.library.refetch();
  await settle();
  assert.equal(dispatched, false);
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/library').length, 1);
  const url = new URL(original, 'http://synthetic');
  write.resolve({
    session_id: url.searchParams.get('session_id'),
    operation_id: '1',
    outcome: { status: 'committed', library: snapshot() },
  });
  await saved;
  await settle();
  assert.equal(dispatched, true);
  switched.resolve(snapshot('123'));
  await transition;
  assert.equal(f.state.ownerBlocked(), false);
  assert.equal(f.state.library().owner_id, '123');
  assert.equal(f.state.warning(), '');
  await f.state.save(progress('123'));
  assert.equal(f.sessions(), 2);
});

test('an unconfirmed account command keeps all writes sealed until authoritative recovery', async () => {
  const f = fixture();
  await settle();
  await assert.rejects(
    f.state.transitionOwner(async () => {
      throw new Error('lost response');
    }),
  );
  assert.equal(f.state.ownerBlocked(), true);
  await f.state.save(progress());
  await f.state.library.refetch();
  assert.equal(f.sessions(), 0);
  assert.equal(f.calls.length, 1);
  await f.state.transitionOwner(async () => snapshot('123'));
  assert.equal(f.state.ownerBlocked(), false);
  await f.state.save(progress('123'));
  assert.equal(f.sessions(), 1);
});

test('stale same-owner reads cannot overwrite a completed owner round trip and each return opens a new session', async () => {
  const stale = deferred();
  let reads = 0;
  const f = fixture((path, _abort, body) => {
    if (path === '/api/v1/library' && !body && ++reads === 2) return stale.promise;
  });
  await settle();
  await f.state.save(progress());
  const read = f.state.library.refetch();
  await settle();
  await f.state.transitionOwner(async () => snapshot('123'));
  await f.state.save(progress('123'));
  await f.state.transitionOwner(async () => snapshot());
  stale.resolve({
    owner_id: '',
    favorites: [],
    entries: [{ drama: { series_id: '999', title: 'stale' } }],
  });
  await read;
  assert.deepEqual(f.state.library(), snapshot());
  await f.state.save(progress());
  assert.equal(f.sessions(), 3);
});

test('transition resolves accepted failed progress before executing the owner command', async () => {
  let writes = 0;
  const f = fixture((path) => {
    if (path.startsWith('/api/v1/library/operation?') && ++writes === 1)
      return Promise.reject(new Error('synthetic lost receipt'));
  });
  await settle();
  await f.state.save(progress());
  let commandWrites = 0;
  await f.state.transitionOwner(async () => {
    commandWrites = writes;
    return snapshot('123');
  });
  assert.equal(commandWrites, 2);
  assert.equal(f.state.warning(), '');
  assert.equal(f.state.library().owner_id, '123');
});

test('a malformed owner snapshot leaves the barrier sealed and concurrent transitions cannot race', async () => {
  const gate = deferred();
  const f = fixture();
  await settle();
  const transition = f.state.transitionOwner(() => gate.promise);
  await assert.rejects(f.state.transitionOwner(async () => snapshot('456')));
  gate.resolve(snapshot('invalid'));
  await assert.rejects(transition);
  assert.equal(f.state.ownerBlocked(), true);
  assert.equal(f.state.library().owner_id, '');
  await f.state.transitionOwner(async () => snapshot('123'));
  assert.equal(f.state.library().owner_id, '123');
});

test('a rejected stale-owner checkpoint cannot poison the new owner retry queue', async () => {
  const f = fixture();
  await settle();
  await f.state.transitionOwner(async () => snapshot('123'));
  await f.state.save(progress(''));
  await f.state.transitionOwner(async () => snapshot('456'));
  assert.equal(f.state.library().owner_id, '456');
  assert.equal(f.sessions(), 0);
});

const card = (series_id = '123') => ({ series_id, title: 'Synthetic', cover: '', intro: '' });
const favorite = (series_id = '123', value = true, owner_id = '') => ({
  action: 'favorite',
  owner_id,
  drama: card(series_id),
  value,
});
const favoriteSnapshot = (ids, owner_id = '') => ({
  ...snapshot(owner_id),
  favorites: ids.map((id) => ({ drama: card(id), favorite_at: 1000 })),
});
const committed = (path, library) => {
  const url = new URL(path, 'http://synthetic');
  return {
    session_id: url.searchParams.get('session_id'),
    operation_id: url.searchParams.get('operation_id'),
    outcome: { status: 'committed', library },
  };
};

test('a read invalidated while waiting on accepted writes never dispatches or schedules a redundant replacement', async () => {
  const first = deferred();
  const second = deferred();
  const paths = [];
  const f = fixture((path) => {
    if (path.includes('/operation?')) {
      paths.push(path);
      return paths.length === 1 ? first.promise : second.promise;
    }
  });
  await settle();
  const savingFirst = f.state.save(progress('', 20));
  await settle();
  const waitingRead = f.state.library.refetch();
  const savingSecond = f.state.save(progress('', 40));
  await settle();
  first.resolve(committed(paths[0], snapshot()));
  await savingFirst;
  await settle();
  assert.equal(paths.length, 2);
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/library').length, 1);
  second.resolve(committed(paths[1], snapshot()));
  await savingSecond;
  await waitingRead;
  await settle();
  assert.equal(f.calls.filter(({ path }) => path === '/api/v1/library').length, 1);
  assert.equal(f.state.library.loading(), false);
});

test('shutdown aborts an unknown-owner initial read without dispatching a checkpoint or removal', async () => {
  const read = deferred();
  let signal;
  const f = fixture((path, abort) => {
    if (path === '/api/v1/library') {
      signal = abort;
      return read.promise;
    }
  });
  await settle();
  await f.state.save(progress());
  assert.throws(() => f.state.management.remove(['123']));
  const finish = f.state.beginShutdown(() => {});
  await f.state.drain();
  finish();
  assert.equal(signal.aborted, true);
  assert.deepEqual(
    f.calls.map(({ path }) => path),
    ['/api/v1/library'],
  );
  assert.equal(f.state.library(), undefined);
  assert.equal(f.state.management.operation(), undefined);
  read.resolve(snapshot());
  await settle();
  assert.equal(f.state.library(), undefined);
});

test('favorites and checkpoints use one ordered session, exact season IDs and immutable desired membership', async () => {
  const gate = deferred();
  let firstPath;
  const f = fixture((path, _abort, body) => {
    if (path.startsWith('/api/v1/library/operation?') && body.action === 'progress') {
      firstPath = path;
      return gate.promise;
    }
    if (path.startsWith('/api/v1/library/operation?'))
      return committed(path, favoriteSnapshot([body.drama.series_id]));
  });
  await settle();
  const saving = f.state.save(progress());
  const input = favorite('124');
  const adding = f.state.favorite(input);
  input.drama.series_id = '999';
  input.value = false;
  await settle();
  assert.equal(f.state.favoriteOperation().status, 'pending');
  assert.deepEqual(f.state.library().favorites, []);
  assert.equal(f.calls.filter(({ path }) => path.includes('/operation?')).length, 1);
  gate.resolve(committed(firstPath, snapshot()));
  await Promise.all([saving, adding]);
  const operations = f.calls.filter(({ path }) => path.includes('/operation?'));
  assert.equal(f.sessions(), 1);
  assert.equal(
    new URL(operations[1].path, 'http://synthetic').searchParams.get('operation_id'),
    '2',
  );
  assert.deepEqual(operations[1].body, favorite('124'));
  assert.deepEqual(f.state.library().entries, []);
  assert.equal(f.state.library().favorites[0].drama.series_id, '124');
  assert.equal(f.state.favoriteOperation().status, 'complete');
});

test('lost favorite receipts prohibit toggles and GET until same-ID recovery then refresh newer sync data', async () => {
  let attempts = 0;
  let reads = 0;
  const paths = [];
  const f = fixture((path, _abort, body) => {
    if (path === '/api/v1/library')
      return ++reads === 1 ? snapshot() : favoriteSnapshot(['123', '124']);
    if (path.includes('/operation?')) {
      paths.push({ path, body });
      if (++attempts === 1) throw new Error('Synthetic committed receipt lost');
      return committed(path, favoriteSnapshot(['123']));
    }
  });
  await settle();
  await f.state.favorite(favorite());
  assert.equal(f.state.favoriteOperation().status, 'unresolved');
  assert.deepEqual(f.state.library().favorites, []);
  assert.throws(() => f.state.favorite(favorite('123', false)));
  await f.state.library.refetch();
  assert.equal(reads, 1);
  assert.equal(f.state.library.state(), 'ready');
  await f.state.retryFavorite(f.state.favoriteOperation().id);
  await settle();
  assert.deepEqual(paths[0], paths[1]);
  assert.equal(reads, 2);
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['123', '124'],
  );
  assert.equal(f.state.favoriteOperation().status, 'complete');
});

test('a known favorite failure retries the same boolean with a new operation identity', async () => {
  const paths = [];
  const f = fixture((path, _abort, body) => {
    if (!path.includes('/operation?')) return;
    paths.push({ path, body });
    if (paths.length === 1) {
      const receipt = committed(path, snapshot());
      return {
        ...receipt,
        outcome: { status: 'failed', code: 'LIBRARY_IO', error: 'Synthetic failure' },
      };
    }
    return committed(path, favoriteSnapshot(['123']));
  });
  await settle();
  await f.state.favorite(favorite());
  assert.equal(f.state.favoriteOperation().status, 'failed');
  assert.throws(() => f.state.assertSaved());
  await f.state.retryFavorite(f.state.favoriteOperation().id);
  assert.equal(f.state.favoriteOperation().status, 'complete');
  assert.equal(new URL(paths[1].path, 'http://synthetic').searchParams.get('operation_id'), '2');
  assert.deepEqual(paths[0].body, paths[1].body);
});

test('favorite cancellation and device-local clear preserve history and distinct category recovery', async () => {
  const history = { drama: card(), episode: 1, position: 2, last_played_at: 1 };
  let library = { ...favoriteSnapshot(['123', '124']), entries: [history] };
  const f = fixture((path, _abort, body) => {
    if (path === '/api/v1/library') return library;
    if (path.includes('/operation?')) {
      assert.equal(body.kind, 'favorites');
      library = {
        ...library,
        favorites:
          body.action === 'clear'
            ? []
            : library.favorites.filter(({ drama }) => drama.series_id !== body.series_id),
      };
      return committed(path, library);
    }
  });
  await settle();
  await f.state.favoritesManagement.remove(['123']);
  assert.equal(f.state.management.operation(), undefined);
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['124'],
  );
  assert.deepEqual(f.state.library().entries, [history]);
  await f.state.favoritesManagement.clear();
  assert.deepEqual(f.state.library().favorites, []);
  assert.deepEqual(f.state.library().entries, [history]);
  assert.equal(f.state.favoritesManagement.operation().status, 'complete');
});

test('backgrounding ignores stale sync reads but still drains accepted favorites and refreshes on return', async () => {
  const stale = deferred();
  const write = deferred();
  let writePath;
  let reads = 0;
  const f = fixture((path) => {
    if (path === '/api/v1/library')
      return ++reads === 2 ? stale.promise : favoriteSnapshot(reads > 2 ? ['123', '124'] : []);
    if (path.includes('/operation?')) {
      writePath = path;
      return write.promise;
    }
  });
  await settle();
  const reading = f.state.library.refetch();
  await settle();
  const saving = f.state.favorite(favorite());
  f.state.setActive(false);
  await settle();
  write.resolve(committed(writePath, favoriteSnapshot(['123'])));
  await saving;
  stale.resolve(favoriteSnapshot(['999']));
  await reading;
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['123'],
  );
  assert.equal(reads, 2);
  f.state.setActive(true);
  await settle();
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['123', '124'],
  );
  assert.equal(reads, 3);
});

test('A to B to A invalidates old refreshes and clears favorite UI jobs with fresh writer sessions', async () => {
  let scope = { owner_id: '', owner_epoch: 'a'.repeat(32) };
  const stale = deferred();
  let reads = 0;
  const f = fixture(
    (path, _abort, body) => {
      if (path === '/api/v1/library') return ++reads === 2 ? stale.promise : snapshot();
      if (path.includes('/operation?'))
        return committed(path, favoriteSnapshot([body.drama.series_id], body.owner_id));
    },
    () => scope,
  );
  await settle();
  await f.state.favorite(favorite());
  const read = f.state.library.refetch();
  await settle();
  await f.state.transitionOwner(
    async () => snapshot('123'),
    () => {
      scope = { owner_id: '123', owner_epoch: 'b'.repeat(32) };
    },
  );
  await f.state.favorite(favorite('124', true, '123'));
  await f.state.transitionOwner(
    async () => snapshot(),
    () => {
      scope = { owner_id: '', owner_epoch: 'c'.repeat(32) };
    },
  );
  stale.resolve(favoriteSnapshot(['999']));
  await read;
  assert.equal(f.state.favoriteOperation(), undefined);
  assert.deepEqual(f.state.library(), snapshot());
  await f.state.favorite(favorite('125'));
  assert.equal(f.sessions(), 3);
  assert.equal(f.state.library().favorites[0].drama.series_id, '125');
});

test('late receipts with a changed core owner epoch cannot publish favorite membership', async () => {
  let scope = { owner_id: '', owner_epoch: 'a'.repeat(32) };
  const gate = deferred();
  let path;
  const f = fixture(
    (next) => {
      if (next.includes('/operation?')) {
        path = next;
        return gate.promise;
      }
    },
    () => scope,
  );
  await settle();
  const pending = f.state.favorite(favorite());
  await settle();
  assert.equal(f.state.favoriteOperation().ownerEpoch, 'a'.repeat(32));
  scope = { ...scope, owner_epoch: 'b'.repeat(32) };
  gate.resolve(committed(path, favoriteSnapshot(['123'])));
  await pending;
  assert.deepEqual(f.state.library(), snapshot());
  assert.equal(f.state.favoriteOperation().status, 'failed');
  assert.equal(f.state.favoriteOperation().ownerEpoch, 'a'.repeat(32));
  assert.throws(() => f.state.retryFavorite(f.state.favoriteOperation().id));
});

test('owner switches resolve a lost favorite before changing scope, keeping original desired state', async () => {
  let attempts = 0;
  let callsAtSwitch = 0;
  const f = fixture((path) => {
    if (!path.includes('/operation?')) return;
    if (++attempts === 1) throw new Error('Synthetic favorite response lost');
    return committed(path, favoriteSnapshot(['123']));
  });
  await settle();
  await f.state.favorite(favorite());
  await f.state.transitionOwner(async () => {
    callsAtSwitch = attempts;
    return snapshot('123');
  });
  assert.equal(callsAtSwitch, 2);
  assert.equal(f.state.favoriteOperation(), undefined);
  assert.equal(f.state.library().owner_id, '123');
});

test('shutdown seals favorite admission while draining the accepted write and final checkpoint', async () => {
  const gate = deferred();
  let firstPath;
  const f = fixture((path, _abort, body) => {
    if (!path.includes('/operation?')) return;
    if (body.action === 'favorite') {
      firstPath = path;
      return gate.promise;
    }
    return committed(path, favoriteSnapshot(['123']));
  });
  await settle();
  const saving = f.state.favorite(favorite());
  const finish = f.state.beginShutdown(() => {
    void f.state.save(progress());
  });
  let drained = false;
  const draining = f.state.drain().then(() => {
    drained = true;
  });
  await settle();
  assert.equal(drained, false);
  assert.throws(() => f.state.favorite(favorite('124')));
  gate.resolve(committed(firstPath, favoriteSnapshot(['123'])));
  await Promise.all([saving, draining]);
  f.state.assertSaved();
  finish();
  assert.equal(f.calls.filter(({ path }) => path.includes('/operation?')).length, 2);
  assert.deepEqual(f.state.library().entries, []);
});

test('epoch changes during lazy session creation fence the old favorite before operation dispatch', async () => {
  let scope = { owner_id: '', owner_epoch: 'a'.repeat(32) };
  const session = deferred();
  const f = fixture(
    (path) => (path.endsWith('/session') ? session.promise : undefined),
    () => scope,
  );
  await settle();
  const pending = f.state.favorite(favorite());
  await settle();
  scope = { ...scope, owner_epoch: 'b'.repeat(32) };
  session.resolve({ session_id: 'a'.repeat(32) });
  await pending;
  assert.equal(f.calls.filter(({ path }) => path.includes('/operation?')).length, 0);
  assert.deepEqual(f.state.library(), snapshot());
  assert.equal(f.state.favoriteOperation().status, 'unresolved');
});

test('explicit favorite false affects only the exact season and retains viewing history', async () => {
  const history = { drama: card('123'), episode: 1, position: 2, last_played_at: 1 };
  let library = { ...favoriteSnapshot(['123', '124']), entries: [history] };
  const changes = [];
  const f = fixture((path, _abort, body) => {
    if (path === '/api/v1/library') return library;
    if (!path.includes('/operation?')) return;
    changes.push(body);
    library = {
      ...library,
      favorites: library.favorites.filter(({ drama }) => drama.series_id !== body.drama.series_id),
    };
    return committed(path, library);
  });
  await settle();
  await f.state.favorite(favorite('124', false));
  assert.deepEqual(changes, [favorite('124', false)]);
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['123'],
  );
  assert.deepEqual(f.state.library().entries, [history]);
});

test('history partial removal still replays the exact receipt and history clear preserves favorites', async () => {
  let library = {
    ...favoriteSnapshot(['123']),
    entries: ['123', '124'].map((id) => ({ drama: card(id), episode: 1, last_played_at: 1 })),
  };
  const receipts = new Map();
  let lost = false;
  const paths = [];
  const f = fixture((path, _abort, body) => {
    if (path === '/api/v1/library') return library;
    if (!path.includes('/operation?')) return;
    paths.push(path);
    if (receipts.has(path)) return receipts.get(path);
    assert.equal(body.kind, 'history');
    library = {
      ...library,
      entries:
        body.action === 'clear'
          ? []
          : library.entries.filter(({ drama }) => drama.series_id !== body.series_id),
    };
    const receipt = committed(path, library);
    receipts.set(path, receipt);
    if (body.series_id === '124' && !lost) {
      lost = true;
      throw new Error('Synthetic removal receipt lost');
    }
    return receipt;
  });
  await settle();
  await f.state.management.remove(['123', '124']);
  const job = f.state.management.operation();
  assert.equal(job.status, 'unresolved');
  assert.deepEqual(job.completedIds, ['123']);
  assert.deepEqual(job.remainingIds, ['124']);
  await f.state.management.retry(job.id);
  assert.equal(paths[1], paths[2]);
  assert.equal(f.state.management.operation().status, 'complete');
  await f.state.management.clear();
  assert.deepEqual(f.state.library().entries, []);
  assert.deepEqual(
    f.state.library().favorites.map(({ drama }) => drama.series_id),
    ['123'],
  );
});

test('shutdown cancels an outstanding sync observation and never publishes or restarts it', async () => {
  const stale = deferred();
  let reads = 0;
  const f = fixture((path) =>
    path === '/api/v1/library' && ++reads === 2 ? stale.promise : undefined,
  );
  await settle();
  const reading = f.state.library.refetch();
  await settle();
  const finish = f.state.beginShutdown(() => {});
  stale.resolve(favoriteSnapshot(['999']));
  await reading;
  await f.state.library.refetch();
  await f.state.drain();
  finish();
  assert.deepEqual(f.state.library(), snapshot());
  assert.equal(reads, 2);
});

test('management recovery publishes the terminal failed state of an earlier lost favorite receipt', async () => {
  let attempts = 0;
  const f = fixture((path) => {
    if (!path.includes('/operation?')) return;
    if (++attempts === 1) throw new Error('Synthetic favorite failed receipt lost');
    const url = new URL(path, 'http://synthetic');
    return {
      session_id: url.searchParams.get('session_id'),
      operation_id: url.searchParams.get('operation_id'),
      outcome: {
        status: 'failed',
        code: 'LIBRARY_STORAGE_UNAVAILABLE',
        error: 'Synthetic terminal favorite failure',
      },
    };
  });
  await settle();
  await f.state.favorite(favorite());
  assert.equal(f.state.favoriteOperation().status, 'unresolved');
  await f.state.management.clear();
  const job = f.state.management.operation();
  assert.equal(job.status, 'unresolved');
  await f.state.management.retry(job.id);
  assert.equal(f.state.favoriteOperation().status, 'failed');
  assert.equal(f.state.management.operation().status, 'partial');
  assert.equal(attempts, 2);
});
