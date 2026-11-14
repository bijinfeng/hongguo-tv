import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calendarFixture as createCalendarData } from '../../packages/app/test/calendar-fixture.ts';
import { root } from './process.mjs';

/** GET-only local calendar fixture; never contacts a real source, account or player. */
export async function calendarFixture({
  port = 0,
  terminalDelayMs = 0,
  longLists = false,
  longAnnouncement = false,
  emptyTomorrow = false,
} = {}) {
  const covers = await Promise.all(
    ['home', 'night', 'return', 'spring'].map((name) =>
      readFile(resolve(root, `design/prototype/assets/${name}.png`)),
    ),
  );
  const requests = [];
  let data;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const record = { method: request.method, url: url.pathname + url.search };
    requests.push(record);
    request.resume();
    const cover = /^\/calendar-cover\/([0-3])$/.exec(url.pathname);
    if (request.method === 'GET' && cover) {
      record.status = 200;
      response
        .writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        .end(covers[Number(cover[1])]);
      return;
    }
    const result = await data.handle({ method: request.method, url: url.href, headers: {} });
    if (result.delay) await new Promise((done) => setTimeout(done, result.delay));
    record.status = result.status ?? 200;
    response
      .writeHead(record.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      .end(JSON.stringify(result.body));
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  data = createCalendarData({
    terminalDelayMs,
    longLists,
    longAnnouncement,
    emptyTomorrow,
    coverOrigin: origin,
  });
  return {
    origin,
    requests,
    reads: data.reads,
    writes: data.writes,
    unknown: data.unknown,
    terminalReads: data.terminalReads,
    async close() {
      server.closeAllConnections();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
