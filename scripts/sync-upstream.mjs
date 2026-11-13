import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(resolve(root, 'upstream.lock.json'), 'utf8'));
const hash = (bytes) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
let cursor = 0;
let downloaded = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (cursor < lock.files.length) {
      const file = lock.files[cursor++];
      const target = resolve(root, 'upstream/hongguo', file.path);
      try {
        if (hash(await readFile(target)) === file.sha) continue;
        throw new Error(`Local upstream file changed: ${file.path}; restore it before syncing.`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      let bytes;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(
            `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${file.path}`,
            {
              signal: AbortSignal.timeout(45000),
            },
          );
          if (!response.ok) throw new Error(`${response.status}: ${file.path}`);
          bytes = Buffer.from(await response.arrayBuffer());
          if (hash(bytes) !== file.sha) throw new Error(`Integrity check failed: ${file.path}`);
          break;
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      downloaded++;
    }
  }),
);
console.log(
  `Upstream ${lock.commit.slice(0, 12)}: verified ${lock.files.length} files, downloaded ${downloaded}.`,
);
