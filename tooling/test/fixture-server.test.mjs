import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeFixtureServer, listenLoopback, loopbackFixture } from '../src/fixture-server.mjs';

// Six fixtures bound a server and built its origin from the assigned port with the same three
// lines; four closed it with the same four. These tests use a real server on a real ephemeral
// port, because the thing being tested is the binding, not a string.

test('binds to loopback and reports the assigned port', async () => {
  const { server, origin, port } = await loopbackFixture((_request, response) =>
    response.end('ok'),
  );
  try {
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(origin, `http://127.0.0.1:${port}`);
    assert.ok(port > 0, 'port 0 must resolve to a real port');
    const body = await (await fetch(origin)).text();
    assert.equal(body, 'ok');
  } finally {
    await closeFixtureServer(server);
  }
});

test('the origin is not reachable on a non-loopback address', async () => {
  // Fixtures serve fabricated catalogue data; they must never bind to every interface.
  const { server, port } = await loopbackFixture((_request, response) => response.end('ok'));
  try {
    const address = server.address();
    assert.equal(address.address, '127.0.0.1', `bound to ${address.address}`);
    assert.equal(address.port, port);
  } finally {
    await closeFixtureServer(server);
  }
});

test('close releases the port even with a socket still open', async () => {
  // A host that keeps a keep-alive socket would otherwise hang an acceptance run on shutdown.
  const { server, origin } = await loopbackFixture((_request, response) => response.end('ok'));
  const keepAlive = await fetch(origin, { headers: { connection: 'keep-alive' } });
  assert.equal(await keepAlive.text(), 'ok');
  await closeFixtureServer(server);
  await assert.rejects(() => fetch(origin), /fetch failed|ECONNREFUSED/i);
});

test('listenLoopback works on a server the caller already has', async () => {
  // The browsing fixture builds its own server and only wants the bind step.
  const { createServer } = await import('node:http');
  const server = createServer((_request, response) => response.end('own'));
  const bound = await listenLoopback(server);
  try {
    assert.match(bound.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(await (await fetch(bound.origin)).text(), 'own');
  } finally {
    await closeFixtureServer(server);
  }
});

test('a port conflict rejects instead of hanging', async () => {
  // The rankings fixture guarded this and the others did not; a bind error with no listener
  // leaves the promise pending forever, which reads as a hung acceptance run.
  const first = await loopbackFixture((_request, response) => response.end('ok'));
  try {
    const { createServer } = await import('node:http');
    const clash = createServer((_request, response) => response.end('x'));
    await assert.rejects(() => listenLoopback(clash, { port: first.port }), /EADDRINUSE/);
    await closeFixtureServer(clash);
  } finally {
    await closeFixtureServer(first.server);
  }
});
