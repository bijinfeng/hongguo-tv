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
  export { createLibraryWriter, LibraryWriteError } from '${new URL('../../packages/core-client/src/library-writer.ts', import.meta.url).href}';
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
const snapshot = (owner_id = '') => ({ owner_id, entries: [] });
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
function fixture(handler = () => {}) {
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
  });
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
  stale.resolve({ owner_id: '', entries: [{ drama: { series_id: '999', title: 'stale' } }] });
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
