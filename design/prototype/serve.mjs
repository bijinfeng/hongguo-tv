import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.HONGGUO_PROTOTYPE_PORT || 4178);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};
http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(root + sep) || !mime[extname(path)]) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(path);
      response.writeHead(200, {
        'Content-Type': mime[extname(path)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(data);
    } catch {
      response.writeHead(404).end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Prototype: http://127.0.0.1:${port}`));
