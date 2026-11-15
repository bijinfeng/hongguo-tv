import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLibraryWriter,
  LibraryWriteError,
  validLibrarySnapshot,
} from '../../packages/core-client/src/library-writer.ts';

const token = 'a'.repeat(32);
const empty = { owner_id: '', entries: [], favorites: [] };
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

test('account writers capture exact owner in session and every payload and receipt', async () => {
  const calls = [];
  const owner_id = '00123456789012345678901234567890';
  const writer = createLibraryWriter(async (path, _abort, body) => {
    calls.push({ path, body });
    return path.endsWith('/session')
      ? { session_id: token }
      : receipt('1', {
          status: 'committed',
          library: { ...empty, owner_id },
        });
  });
  assert.equal((await writer.write({ ...clear, owner_id })).library.owner_id, owner_id);
  assert.deepEqual(calls[0].body, { owner_id });
  await assert.rejects(writer.write(clear));
  assert.equal(calls.length, 2);
});

test('an account receipt cannot cross owner boundaries even with a correct operation identity', async () => {
  let reads = 0;
  const writer = createLibraryWriter(async (path) =>
    path.endsWith('/session')
      ? { session_id: token }
      : receipt('1', {
          status: 'committed',
          library: { ...empty, owner_id: ++reads === 1 ? '456' : '123' },
        }),
  );
  await assert.rejects(writer.write({ ...clear, owner_id: '123' }), unresolved);
  await assert.rejects(writer.write({ ...clear, owner_id: '456' }), unresolved);
  assert.equal((await writer.resolve()).library.owner_id, '123');
});

test('reset rejects pending and in-flight work; successful same-owner reentry opens a fresh session', async () => {
  let finish;
  let sessions = 0;
  let operations = 0;
  const writer = createLibraryWriter(async (path) => {
    if (path.endsWith('/session')) {
      sessions++;
      return { session_id: token };
    }
    operations++;
    if (operations === 1)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return receipt('1', { status: 'committed', library: { ...empty, owner_id: '123' } });
  });
  const pending = writer.write({ ...clear, owner_id: '123' });
  await Promise.resolve();
  assert.throws(() => writer.reset());
  finish(receipt('1', { status: 'committed', library: { ...empty, owner_id: '123' } }));
  await pending;
  writer.reset();
  assert.equal((await writer.write({ ...clear, owner_id: '123' })).operation_id, '1');
  assert.equal(sessions, 2);
});

test('invalid owner identifiers fail before any session is admitted', async () => {
  let requests = 0;
  for (const owner_id of ['0', '000', '-1', '1e4', '123 ', '1'.repeat(33), {}, 123]) {
    const writer = createLibraryWriter(async () => {
      requests++;
    });
    await assert.rejects(writer.write({ ...clear, owner_id }));
  }
  assert.equal(requests, 0);
});

const drama = {
  series_id: '123',
  title: 'Synthetic compact card',
  cover: '',
  intro: '',
};

test('readable cloud history may lack a playable episode while malformed identities remain invalid', async () => {
  for (const video_id of [undefined, '456']) {
    const library = {
      ...empty,
      entries: [
        {
          drama,
          episode: 0,
          video_id,
          position: 0,
          duration: 30,
          completed: false,
          last_played_at: 1000,
        },
      ],
    };
    assert.equal(validLibrarySnapshot(library), true);
    const writer = createLibraryWriter(async (path) =>
      path.endsWith('/session')
        ? { session_id: token }
        : receipt('1', { status: 'committed', library }),
    );
    assert.deepEqual((await writer.write(clear)).library, library);
    for (const patch of [
      { episode: -1 },
      { episode: 0.5 },
      { episode: 10001 },
      { episode: null },
      { video_id: '' },
      { video_id: '0' },
      { video_id: 'bad' },
      { video_id: null },
    ])
      assert.equal(
        validLibrarySnapshot({ ...library, entries: [{ ...library.entries[0], ...patch }] }),
        false,
      );
  }
});

test('synthetic committed snapshots keep favorites independent of history at safe timestamp bounds', async () => {
  for (const favorite_at of [1, 1731600000000, Number.MAX_SAFE_INTEGER]) {
    const library = {
      ...empty,
      entries: [{ drama, episode: 2, video_id: '456', position: 30, last_played_at: 1000 }],
      favorites: [{ drama: { ...drama, series_id: '789' }, favorite_at }],
    };
    const writer = createLibraryWriter(async (path) =>
      path.endsWith('/session')
        ? { session_id: token }
        : receipt('1', { status: 'committed', library }),
    );
    const result = await writer.write(clear);
    assert.deepEqual(result.library, library);
    assert.deepEqual(
      result.library.entries.map(({ drama }) => drama.series_id),
      ['123'],
    );
    assert.deepEqual(
      result.library.favorites.map(({ drama }) => drama.series_id),
      ['789'],
    );
  }
});

test('synthetic malformed favorite snapshots preserve the exact unresolved write until valid replay', async () => {
  const favorite = { drama, favorite_at: 1731600000000 };
  const invalid = [
    { owner_id: '', entries: [] },
    ...[null, {}, 'favorites'].map((favorites) => ({ ...empty, favorites })),
    ...[undefined, null, {}, { favorite_at: 1 }].map((entry) => ({ ...empty, favorites: [entry] })),
    ...[undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map(
      (favorite_at) => ({ ...empty, favorites: [{ drama, favorite_at }] }),
    ),
    ...[
      undefined,
      [],
      { ...drama, series_id: '0' },
      { ...drama, series_id: '1'.repeat(33) },
      { ...drama, title: 123 },
      { ...drama, cover: null },
      { ...drama, intro: false },
      { ...drama, episode_count: 10001 },
      { ...drama, episode_count: 1.5 },
      { ...drama, tags: ['valid', 1] },
      { ...drama, episodes: [] },
      { ...drama, episodes: [{ video_id: '456' }] },
    ].map((drama) => ({ ...empty, favorites: [{ ...favorite, drama }] })),
    { ...empty, favorites: [{ ...favorite, episode: 1 }] },
    { ...empty, favorites: [{ ...favorite, position: 30 }] },
    { ...empty, entries: [{ drama: { ...drama, episodes: [] } }] },
  ];
  for (const library of invalid) {
    let reads = 0;
    const writer = createLibraryWriter(async (path) =>
      path.endsWith('/session')
        ? { session_id: token }
        : ++reads === 1
          ? receipt('1', { status: 'committed', library })
          : receipt(),
    );
    await assert.rejects(
      writer.write(clear),
      (error) =>
        unresolved(error) && error.code === 'LIBRARY_RECEIPT_INVALID' && error.operation_id === '1',
    );
    await assert.rejects(writer.write(remove), unresolved);
    assert.equal(reads, 1);
    assert.deepEqual((await writer.resolve()).change, clear);
    assert.equal(reads, 2);
  }
});
