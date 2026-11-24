// Which CI jobs a change can affect. ENGINEERING §8 allows trimming the matrix once it is
// stable, so a change that cannot reach a target skips it. Anything whose reach is not
// provably limited returns `null`, which the caller must treat as the full matrix.
import { root } from './process.mjs';

/** Everything: shared packages, contracts, Rust crates, toolchains and CI itself. */
export const all = Object.freeze({ rust: true, web: true, desktop: true, tv: true });
/** Nothing to build; only documentation-formatting checks still apply. */
export const none = Object.freeze({ rust: false, web: false, desktop: false, tv: false });

// The Rust workspace members inside the apps; their sources are crates, not app code.
const NATIVE = /^apps\/(?:desktop|tv)\/native\//;

// Documentation, history and read-only references never reach a build or a type check.
const DOCS = /^(?:docs\/|design\/|openspec\/|upstream\/)/;
const DOC_FILES = /^(?:README\.md|PRODUCT\.md|LICENSE|THIRD_PARTY_NOTICES\.md)$/i;

/**
 * Job selection for one changed path, or `null` when paths alone cannot decide. Every
 * unlisted location (root configs, tooling, contracts, packages, crates, services) is
 * shared and therefore returns `null`.
 */
export function classify(path) {
  const normalized = String(path ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  if (!normalized) return null;
  if (DOCS.test(normalized) || DOC_FILES.test(normalized)) return none;
  // A native crate is a Rust workspace member even though it lives under an app.
  if (NATIVE.test(normalized)) return { ...none, rust: true };
  // An app's own sources and tests produce that target's binaries alone.
  const app = /^apps\/(web|desktop|tv)\//.exec(normalized);
  if (app) return { ...none, [app[1]]: true };
  return null;
}

/** Merge per-path verdicts; an undecidable path forces the full matrix. */
export function combine(verdicts) {
  const merged = { rust: false, web: false, desktop: false, tv: false };
  for (const verdict of verdicts) {
    if (!verdict) return all;
    for (const name of Object.keys(merged)) if (verdict[name]) merged[name] = true;
  }
  return Object.freeze(merged);
}

/** Select the CI jobs for a list of changed paths. */
export function select(paths) {
  if (!Array.isArray(paths) || !paths.length) return all;
  return combine(paths.map(classify));
}

// One runner per target; desktop additionally gates on the Windows and Linux hosts, matching
// the ENGINEERING matrix's desktop-windows / desktop-linux rows.
const ENTRY_HOSTS = {
  web: ['macos-15'],
  desktop: ['macos-15', 'windows-2025', 'ubuntu-24.04'],
  tv: ['macos-15'],
};

/**
 * The `entry` job's matrix for a selection. A job-level `if` cannot read `matrix`, so the
 * scope computes the matrix instead and the job expands whatever it is given.
 */
export function entryMatrix(selection) {
  return Object.entries(ENTRY_HOSTS)
    .filter(([target]) => selection[target])
    .flatMap(([target, hosts]) => hosts.map((os) => ({ target, os })));
}

async function git(args, cwd) {
  const { execFile } = await import('node:child_process');
  return new Promise((done, fail) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) fail(error);
      else done(stdout);
    });
  });
}

/**
 * Changed paths of the commit range GitHub reports for this run. A push that creates a
 * branch has no merge base, so its own commits are described instead.
 */
export async function changedPaths({ base, head = 'HEAD', cwd = root } = {}) {
  const zero = /^0+$/;
  const usable = typeof base === 'string' && /^[0-9a-f]{7,40}$/.test(base) && !zero.test(base);
  const args = usable
    ? ['diff', '--name-only', `${base}...${head}`]
    : ['diff-tree', '--no-commit-id', '--name-only', '--root', '-r', head];
  return (await git(args, cwd))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Job selection for this run; any Git failure means the full matrix rather than a skip. */
export async function selectJobs(options) {
  try {
    return select(await changedPaths(options));
  } catch {
    return all;
  }
}
