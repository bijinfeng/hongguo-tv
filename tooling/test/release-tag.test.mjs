import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/release-publish.yml', import.meta.url),
  'utf8',
);
const step = workflow
  .split('      - name: Ensure release tag matches source\n')[1]
  ?.split('\n      - name:')[0];
assert.ok(step, 'publish must check or create the exact tag before creating a draft');
const script = step
  .split('        run: |\n')[1]
  .split('\n')
  .map((line) => line.replace(/^ {10}/, ''))
  .join('\n');
const sha = 'a'.repeat(40);

test('release tag preparation handles first release, existing tag, mismatch and API failure without rewriting tags', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'hongguo-release-tag-'));
  try {
    const record = resolve(dir, 'calls.jsonl');
    await writeFile(
      resolve(dir, 'gh'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TAG_CALLS, JSON.stringify(args) + '\\n');
if (args.includes('--method')) {
  if (process.env.TAG_CASE === 'network' || process.env.TAG_CASE === 'race') process.exit(1);
} else if (args[1].includes('/git/ref/')) {
  if (['missing', 'network', 'race'].includes(process.env.TAG_CASE)) process.exit(1);
} else if (args[1].includes('/commits/')) {
  process.stdout.write(process.env.TAG_CASE === 'mismatch' ? 'b'.repeat(40) : process.env.SOURCE_SHA);
} else process.exit(2);
`,
      { mode: 0o755 },
    );
    for (const scenario of ['existing', 'missing', 'mismatch', 'network', 'race']) {
      await writeFile(record, '');
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: dir + delimiter + process.env.PATH,
          GITHUB_REPOSITORY: 'bijinfeng/hongguo-tv',
          RELEASE_TAG: 'v0.1.0',
          SOURCE_SHA: sha,
          TAG_CASE: scenario,
          TAG_CALLS: record,
        },
      });
      assert.ifError(result.error);
      assert.equal(result.status === 0, ['existing', 'missing'].includes(scenario), scenario);
      const calls = (await readFile(record, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.ok(
        calls.every((args) => !args.includes('PATCH')),
        'existing tags must never be overwritten',
      );
      const posts = calls.filter((args) => args.includes('POST'));
      assert.equal(
        posts.length,
        ['missing', 'network', 'race'].includes(scenario) ? 1 : 0,
        scenario,
      );
      if (posts.length) {
        assert.ok(posts[0].includes('ref=refs/tags/v0.1.0'));
        assert.ok(posts[0].includes('sha=' + sha));
      }
      if (['network', 'race'].includes(scenario)) assert.equal(calls.length, 2, scenario);
    }
    assert.match(workflow, /gh release create[\s\S]*?--verify-tag/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
