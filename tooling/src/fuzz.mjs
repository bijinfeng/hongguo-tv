import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cargo, root } from './process.mjs';

try {
  const channel = (await readFile(resolve(root, 'fuzz/rust-toolchain.toml'), 'utf8')).match(
    /^channel = "([^"]+)"/m,
  )[1];
  await cargo([`+${channel}`, 'fuzz', 'run', 'byte_range', '--', '-max_total_time=30']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
