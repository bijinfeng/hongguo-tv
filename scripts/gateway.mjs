import http from 'node:http';

const routes = new Set([
  '/api/v1/status',
  '/api/v1/search',
  '/api/v1/series/detail',
  '/api/v1/play/info',
  '/api/v1/library',
  '/api/v1/account',
  '/api/v1/account/qr/start',
  '/api/v1/account/qr/status',
  '/api/v1/account/qr/cancel',
]);
const hopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export async function startGateway({ coreOrigin, allowedOrigins = [], port = 0 }) {
  const upstream = new URL(coreOrigin);
  if (upstream.hostname !== '127.0.0.1' || upstream.protocol !== 'http:')
    throw new Error('Core must be on IPv4 loopback');
  const origins = new Set(allowedOrigins);
  const server = http.createServer((req, res) => {
    const fail = (status, message) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    };
    const origin = req.headers.origin;
    const ownOrigin = `http://127.0.0.1:${server.address().port}`;
    if (req.headers.host !== new URL(ownOrigin).host) return fail(403, 'Invalid Host');
    // Check browser identity BEFORE adapting the core's same-origin headers.
    if (origin && origin !== ownOrigin && !origins.has(origin))
      return fail(403, 'Origin not allowed');
    if (!origin && req.headers['sec-fetch-site'] === 'cross-site')
      return fail(403, 'Cross-site request');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const path = req.url.split('?')[0];
    const media = /^\/minireel-proxy\/media\/[a-zA-Z0-9_-]+\.mp4$/.test(path);
    if (!routes.has(path) && !media) return fail(404, 'Unknown route');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, HEAD, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      });
      return res.end();
    }
    if (!['GET', 'HEAD', 'POST'].includes(req.method) || (media && req.method === 'POST'))
      return fail(405, 'Method not allowed');
    if (req.method === 'POST' && !/^application\/json\b/i.test(req.headers['content-type'] ?? ''))
      return fail(415, 'JSON required');
    const headers = { ...req.headers, host: upstream.host, origin: upstream.origin };
    delete headers.referer;
    delete headers['sec-fetch-site'];
    for (const name of hopHeaders) delete headers[name];
    const proxy = http.request(
      new URL(req.url, upstream),
      { method: req.method, headers },
      (response) => {
        const forwarded = { ...response.headers };
        for (const name of [...hopHeaders, 'set-cookie', 'access-control-allow-origin'])
          delete forwarded[name];
        res.writeHead(response.statusCode, forwarded);
        response.on('error', () => res.destroy());
        response.pipe(res);
      },
    );
    proxy.on('error', () => {
      if (!res.headersSent) fail(502, '本地服务连接失败');
      else res.destroy();
    });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => {
      if (!res.writableFinished) proxy.destroy();
    });
    req.pipe(proxy);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
