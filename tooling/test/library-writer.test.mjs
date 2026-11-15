import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLibraryWriter,
  LibraryWriteError,
} from '../../packages/core-client/src/library-writer.ts';

const token = 'a'.repeat(32);
const empty = { owner_id: '', entries: [] };
const clear = { action: 'clear', kind: 'history', owner_id: '' };
const remove = { action: 'remove', kind: 'history', owner_id: '', series_id: '123' };
const receipt = (operation_id = '1', outcome = { status: 'committed', library: empty }) => ({
  session_id: token,
  operation_id,
  outcome,
});
const operationPath = (id = '1') =>
  `/api/v1/library/operation?session_id=${token}&operation_id=${id}`;
const unresolved = (error) => error instanceof LibraryWriteError && error.status === 'unresolved';

test('library writer lazily opens one guest session and advances exact decimal operation identities', async () => {
  const calls = [];
  const writer = createLibraryWriter(async (path, abort, body) => {
    calls.push({ path, abort, body });
    return path.endsWith('/session') ? { session_id: token } : receipt(String(calls.length - 1));
  });
  assert.equal(await writer.resolve(), undefined);
  assert.equal(calls.length, 0);
  assert.deepEqual(await writer.write(clear), {
    change: clear,
    library: empty,
    session_id: token,
    operation_id: '1',
  });
  assert.equal((await writer.write(remove)).operation_id, '2');
  assert.deepEqual(
    calls.map(({ path, body }) => ({ path, body })),
    [
      { path: '/api/v1/library/session', body: { owner_id: '' } },
      { path: operationPath(), body: clear },
      { path: operationPath('2'), body: remove },
    ],
  );
  await assert.rejects(writer.write({ ...clear, owner_id: 'another-owner' }));
  assert.equal(calls.length, 3);
});

test('lost session creation preserves the original intent and explicit resolve safely creates a new session', async () => {
  const calls = [];
  const writer = createLibraryWriter(async (path, _abort, body) => {
    calls.push({ path, body });
    if (calls.length === 1) throw new Error('session response lost');
    return path.endsWith('/session') ? { session_id: token } : receipt();
  });
  await assert.rejects(
    writer.write(remove),
    (error) =>
      unresolved(error) &&
      error.session_id === undefined &&
      error.operation_id === '1' &&
      error.change.series_id === '123',
  );
  await assert.rejects(writer.write(clear), unresolved);
  assert.equal(calls.length, 1);
  assert.deepEqual((await writer.resolve()).change, remove);
  assert.deepEqual(
    calls.map(({ path }) => path),
    ['/api/v1/library/session', '/api/v1/library/session', operationPath()],
  );
});

test('HTTP and network failures keep the same immutable identity and payload behind an explicit barrier', async () => {
  const input = { ...remove };
  const bodies = [];
  const paths = [];
  const writer = createLibraryWriter(async (path, _abort, body) => {
    if (path.endsWith('/session')) return { session_id: token };
    paths.push(path);
    bodies.push(structuredClone(body));
    if (paths.length === 1) {
      body.series_id = '999';
      throw Object.assign(new Error('service unavailable'), { code: 'LIBRARY_BUSY', status: 503 });
    }
    return receipt();
  });
  await assert.rejects(
    writer.write(input),
    (error) => unresolved(error) && error.code === 'LIBRARY_BUSY',
  );
  input.series_id = '456';
  await assert.rejects(writer.write(input), unresolved);
  const resolved = await writer.resolve();
  assert.deepEqual(resolved.change, remove);
  assert.deepEqual(paths, [operationPath(), operationPath()]);
  assert.deepEqual(bodies, [remove, remove]);
  assert.equal(await writer.resolve(), undefined);
});

test('only exact failed receipts release the original operation; business retries receive a new ID', async () => {
  const paths = [];
  const writer = createLibraryWriter(async (path) => {
    if (path.endsWith('/session')) return { session_id: token };
    paths.push(path);
    return paths.length === 1
      ? receipt('1', { status: 'failed', code: 'LIBRARY_IO', error: 'write rejected' })
      : receipt('2');
  });
  await assert.rejects(
    writer.write(clear),
    (error) =>
      error instanceof LibraryWriteError &&
      error.status === 'failed' &&
      error.code === 'LIBRARY_IO' &&
      error.operation_id === '1',
  );
  assert.equal(await writer.resolve(), undefined);
  assert.equal((await writer.write(clear)).operation_id, '2');
  assert.deepEqual(paths, [operationPath(), operationPath('2')]);
});

test('a failed error thrown by a transport cannot impersonate an exact failed receipt', async () => {
  let attempts = 0;
  const writer = createLibraryWriter(async (path) => {
    if (path.endsWith('/session')) return { session_id: token };
    if (++attempts === 1)
      throw new LibraryWriteError('failed', 'LIBRARY_IO', 'transport failure', clear, '1', token);
    return receipt();
  });
  await assert.rejects(writer.write(clear), unresolved);
  await assert.rejects(writer.write(remove), unresolved);
  assert.deepEqual((await writer.resolve()).change, clear);
});

test('mismatched identities and malformed outcomes never settle an original operation', async () => {
  const invalid = [
    { ...receipt(), session_id: 'b'.repeat(32) },
    { ...receipt(), operation_id: 1 },
    { ...receipt(), operation_id: '01' },
    receipt('1', { status: 'failed', error: 'missing code' }),
    receipt('1', { status: 'committed', library: { ...empty, owner_id: 'account' } }),
    receipt('1', { status: 'committed', library: { entries: [{}] } }),
    receipt('1', { status: 'pending' }),
  ];
  for (const value of invalid) {
    let reads = 0;
    const writer = createLibraryWriter(async (path) =>
      path.endsWith('/session') ? { session_id: token } : ++reads === 1 ? value : receipt(),
    );
    await assert.rejects(
      writer.write(clear),
      (error) => unresolved(error) && error.code === 'LIBRARY_RECEIPT_INVALID',
    );
    await assert.rejects(writer.write(remove), unresolved);
    assert.equal(reads, 1);
    assert.deepEqual((await writer.resolve()).change, clear);
  }
});

test('one in-flight dispatch blocks both a new write and a duplicate resolution request', async () => {
  let release;
  let calls = 0;
  const writer = createLibraryWriter(async (path) => {
    calls++;
    if (path.endsWith('/session')) return { session_id: token };
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const pending = writer.write(clear);
  await Promise.resolve();
  await assert.rejects(writer.write(remove), unresolved);
  await assert.rejects(
    writer.resolve(),
    (error) => unresolved(error) && error.code === 'LIBRARY_WRITE_BUSY',
  );
  assert.equal(calls, 2);
  release(receipt());
  assert.deepEqual((await pending).change, clear);
});

test('cancellation, including a late receipt after abort, remains unresolved until same-ID replay', async () => {
  const abort = new AbortController();
  const paths = [];
  const writer = createLibraryWriter(async (path, signal) => {
    if (path.endsWith('/session')) return { session_id: token };
    paths.push(path);
    if (paths.length === 1) {
      assert.equal(signal, abort.signal);
      abort.abort();
    }
    return receipt();
  });
  await assert.rejects(
    writer.write(clear, abort.signal),
    (error) => unresolved(error) && error.code === 'CORE_CANCELLED',
  );
  assert.deepEqual((await writer.resolve()).change, clear);
  assert.deepEqual(paths, [operationPath(), operationPath()]);
});

test('unknown or expired known sessions never trigger automatic session replacement', async () => {
  const paths = [];
  const writer = createLibraryWriter(async (path) => {
    paths.push(path);
    if (path.endsWith('/session')) return { session_id: token };
    throw Object.assign(new Error('expired session'), {
      code: 'LIBRARY_SESSION_UNKNOWN',
      status: 410,
    });
  });
  await assert.rejects(writer.write(clear), unresolved);
  await assert.rejects(writer.resolve(), unresolved);
  await assert.rejects(writer.write(remove), unresolved);
  assert.deepEqual(paths, ['/api/v1/library/session', operationPath(), operationPath()]);
});

test('invalid session tokens cannot dispatch writes or discard the original pending change', async () => {
  const paths = [];
  const writer = createLibraryWriter(async (path) => {
    paths.push(path);
    if (paths.length === 1) return { session_id: 'A'.repeat(32) };
    return path.endsWith('/session') ? { session_id: token } : receipt();
  });
  await assert.rejects(
    writer.write(remove),
    (error) => unresolved(error) && error.code === 'LIBRARY_SESSION_INVALID',
  );
  assert.deepEqual((await writer.resolve()).change, remove);
  assert.deepEqual(paths, ['/api/v1/library/session', '/api/v1/library/session', operationPath()]);
});

test('controller revocation before dispatch or during lazy session creation cannot dispatch or replay operations', async () => {
  for (const initiallyAllowed of [false, true]) {
    const paths = [];
    let allowed = initiallyAllowed;
    let finish;
    const writer = createLibraryWriter(
      async (path) => {
        paths.push(path);
        return new Promise((resolve) => {
          finish = () => resolve({ session_id: token });
        });
      },
      () => allowed,
    );
    const pending = writer.write(remove);
    if (initiallyAllowed) {
      assert.deepEqual(paths, ['/api/v1/library/session']);
      allowed = false;
      finish();
    }
    await assert.rejects(
      pending,
      (error) => unresolved(error) && error.code === 'LIBRARY_OWNER_DISPOSED',
    );
    await assert.rejects(
      writer.resolve(),
      (error) => unresolved(error) && error.code === 'LIBRARY_OWNER_DISPOSED',
    );
    assert.deepEqual(paths, initiallyAllowed ? ['/api/v1/library/session'] : []);
  }
});
