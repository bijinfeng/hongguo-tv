/**
 * Pre-commit checks the files being committed, not the whole worktree. A whole-tree check blocks
 * every commit while another session has an unrelated file half-edited — that is how a docs-only
 * commit ends up unable to pass its own hook, which happened three times before this existed.
 *
 * `--no-stash` is required by AGENTS.md and is not the same as lint-staged's default. Measured on
 * a partial stage (index holds one version, the worktree adds another line): with `--no-stash` the
 * formatter receives the staged content only, the reformatted result lands in the index, and the
 * unstaged line survives untouched in the worktree. Stashing the worktree to get the same result
 * would also sweep up other sessions' in-flight edits.
 *
 * `lint-staged` still re-stages what a formatter rewrites, and that is the point: only paths that
 * were already staged are passed, so nothing unstaged can be committed by this hook.
 */
export default {
  '*': (files) => `oxfmt --ignore-path .oxfmtignore ${files.map(quote).join(' ')}`,
  '*.{ts,tsx,js,mjs,cjs}': (files) => `oxlint --deny-warnings ${files.map(quote).join(' ')}`,
};

/** Paths can contain spaces, and the command runs through a shell. */
function quote(path) {
  return JSON.stringify(path);
}
