import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from '../src/process.mjs';

// A pre-commit hook that measures the whole worktree blocks every commit while another session
// has one half-formatted file. This branch lost three commits to that, each going in with
// --no-verify and therefore running no checks at all. The configuration is asserted here so a
// future edit cannot quietly widen it back.

const config = async () => readFile(resolve(root, 'lefthook.yml'), 'utf8');
const lintStaged = async () => readFile(resolve(root, 'lint-staged.config.mjs'), 'utf8');

test('pre-commit checks only the staged files', async () => {
  const text = await config();
  const preCommit = text.slice(text.indexOf('pre-commit:'), text.indexOf('commit-msg:'));
  assert.match(preCommit, /lint-staged/, 'pre-commit delegates to lint-staged');
  assert.doesNotMatch(
    preCommit,
    /hooks:check/,
    'the whole-tree gate belongs to pre-push; putting it back here re-breaks parallel commits',
  );
});

test('pre-commit never stashes the worktree', async () => {
  // lint-staged's default stashes the whole worktree to isolate the index, which would sweep up
  // another session's in-flight edits. --no-stash passes the staged content only.
  const text = await config();
  assert.match(text, /lint-staged --no-stash/);
});

test('pre-push keeps the whole-tree gate', async () => {
  const text = await config();
  const prePush = text.slice(text.indexOf('pre-push:'));
  assert.match(
    prePush,
    /hooks:check/,
    'contract drift and package boundaries are too expensive for a commit but must run before push',
  );
});

test('formatters rewrite staged files instead of failing on them', async () => {
  // oxfmt without --check formats and exits zero, and lint-staged re-stages the result. That is
  // the documented trade: a commit is fixed rather than rejected, and only staged paths are
  // passed, so nothing unstaged can be committed by the hook.
  const text = await lintStaged();
  assert.match(text, /oxfmt/);
  assert.doesNotMatch(
    text,
    /oxfmt[^'"`]*--check/,
    'a --check formatter would reject instead of fix',
  );
});

test('lint fails the commit on a real error', async () => {
  const text = await lintStaged();
  assert.match(text, /oxlint --deny-warnings/, 'warnings are errors here, as in pnpm lint');
});

test('staged paths are quoted', async () => {
  // lint-staged interpolates file paths into a shell command; an unquoted path with a space
  // would split into two arguments.
  const text = await lintStaged();
  assert.match(text, /JSON\.stringify\(path\)/, 'paths go through the shell, so they are quoted');
});
