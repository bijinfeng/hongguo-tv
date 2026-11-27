/**
 * Starting and stopping the loopback fixture servers used by the host suites.
 *
 * Six fixtures each wrote the same three lines to bind (`listen` on `127.0.0.1` plus building the
 * origin from the assigned port), and four wrote the same `close` — force-close keep-alive sockets,
 * then await the server's own close. `seasons` adds timer cleanup before closing, which is why the
 * caller keeps its own hook rather than this guessing.
 *
 * Bind to loopback only: these servers hand out fabricated catalogue data and must never be
 * reachable off the machine.
 */
import { createServer } from 'node:http';

/**
 * Starts `server` on an ephemeral loopback port.
 *
 * @param {import('node:http').Server} server
 * @param {{ port?: number }} [options] `0` picks a free port.
 * @returns {Promise<{ origin: string, port: number }>}
 */
export async function listenLoopback(server, { port = 0 } = {}) {
  // Watch for `error` during bind: without it a port conflict rejects nothing and the run hangs.
  // The rankings fixture was the only copy that did this; it is the right behaviour for all of them.
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  const assigned = server.address().port;
  return { origin: `http://127.0.0.1:${assigned}`, port: assigned };
}

/**
 * Force-closes a fixture server.
 *
 * `closeAllConnections` first, because a host that keeps a socket alive would otherwise make an
 * acceptance run hang on shutdown instead of failing where the problem is. A server that never
 * bound — a port conflict, say — is already closed, and `close` on it throws
 * ERR_SERVER_NOT_RUNNING; teardown after a failed bind must not turn into a second error.
 */
export async function closeFixtureServer(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

/**
 * Creates a fixture server plus the bind/close pair, for fixtures with no extra teardown.
 *
 * `handler` is the request listener. The returned `close` replaces the hand-written copy that
 * appeared in the calendar, rankings and radar fixtures.
 */
export async function loopbackFixture(handler, { port = 0 } = {}) {
  const server = createServer(handler);
  const bound = await listenLoopback(server, { port });
  return { server, ...bound, close: () => closeFixtureServer(server) };
}
