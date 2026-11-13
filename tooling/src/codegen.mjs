import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { output, executable, pnpm, root } from './process.mjs';

export async function codegen(check = false) {
  const dir = await mkdtemp(resolve(tmpdir(), 'hongguo-contract-'));
  try {
    const schema = output(executable('cargo'), [
      'run',
      '--locked',
      '--quiet',
      '-p',
      'hongguo-http-api',
      '--example',
      'openapi',
    ]);
    await writeFile(resolve(dir, 'openapi.json'), schema + '\n');
    await pnpm([
      'exec',
      'openapi-typescript',
      resolve(dir, 'openapi.json'),
      '--output',
      resolve(dir, 'generated.ts'),
    ]);
    for (const [source, target] of [
      ['openapi.json', 'contracts/openapi.json'],
      ['generated.ts', 'packages/contracts/src/generated.ts'],
    ]) {
      const generated = await readFile(resolve(dir, source), 'utf8');
      if (check) {
        let existing;
        try {
          existing = await readFile(resolve(root, target), 'utf8');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (generated !== existing) throw new Error(`Contract drift: ${target}; run pnpm codegen`);
      } else await writeFile(resolve(root, target), generated);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--check'))
      throw new Error('Expected --check or no arguments');
    await codegen(process.argv.includes('--check'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
