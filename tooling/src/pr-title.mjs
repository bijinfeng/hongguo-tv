import { child, root } from './process.mjs';
import { resolve } from 'node:path';

try {
  const title = process.env.PR_TITLE;
  if (!title?.trim()) throw new Error('PR_TITLE is required');
  const command = resolve(
    root,
    'node_modules/.bin',
    process.platform === 'win32' ? 'commitlint.cmd' : 'commitlint',
  );
  const check = child(command, [], {
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  check.stdin.end(title + '\n');
  await check.done;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
