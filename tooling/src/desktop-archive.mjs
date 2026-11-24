import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { output, root } from './process.mjs';

/**
 * What NSH's updater needs from an archive before it stages it (`nsh-updater`'s
 * `Installation::stage`): one top-level entry, this app's id in the bundle, and the
 * executable at the path the installed app runs from. Checking the same shape here
 * catches an archive that only looks right by name and hash.
 */
const layouts = {
  'macos-aarch64': {
    appBundle: true,
    resources: 'Contents/Resources/nsh',
    executable: (app) => executableFiles(join(app, 'Contents/MacOS'))[0],
  },
  'windows-x86_64': {
    resources: 'nsh',
    executable: (app) => readdirSync(app).find((name) => name.endsWith('.exe')),
  },
  'linux-x86_64': {
    resources: 'nsh',
    // The updater refuses a staged Unix executable without an execute bit.
    executable: (app) => isExecutable(join(app, 'App')) && 'App',
  },
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isExecutable(path) {
  try {
    const mode = statSync(path).mode;
    return (mode & 0o111) !== 0 && isFile(path);
  } catch {
    return false;
  }
}

function executableFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => isExecutable(join(dir, name)));
  } catch {
    return [];
  }
}

function unpack(archive, into) {
  if (!isFile(archive)) throw new Error(`Missing desktop archive: ${basename(archive)}`);
  if (archive.endsWith('.zip')) output('unzip', ['-q', archive, '-d', into]);
  else if (archive.endsWith('.tar.gz')) output('tar', ['-xzf', archive, '-C', into]);
  else throw new Error(`Unsupported desktop archive: ${basename(archive)}`);
}

/**
 * Throws unless `archive` unpacks to one directory holding this app for `platform`;
 * returns that directory's name so callers can log what will be staged.
 */
export function verifyDesktopArchive({ archive, platform, policy }) {
  const layout = layouts[platform];
  if (!layout) throw new Error(`Unsupported desktop platform: ${platform}`);
  const file = basename(resolve(archive));
  const scratch = mkdtempSync(join(tmpdir(), 'hongguo-archive-'));
  try {
    unpack(resolve(archive), scratch);
    const top = readdirSync(scratch);
    if (top.length !== 1)
      throw new Error(`${file} must hold one top-level entry, found ${top.length}`);
    const app = join(scratch, top[0]);
    if (!statSync(app).isDirectory()) throw new Error(`${file}: ${top[0]} is not a directory`);
    if (layout.appBundle && !top[0].endsWith('.app'))
      throw new Error(`${file}: ${top[0]} is not a .app bundle`);
    if (!layout.executable(app)) throw new Error(`${file} has no executable for ${platform}`);
    let id;
    try {
      id = JSON.parse(readFileSync(join(app, layout.resources, 'app.json'), 'utf8')).id;
    } catch (error) {
      throw new Error(`${file} has no readable bundle: ${error.message}`);
    }
    if (id !== policy.id) throw new Error(`${file} holds ${id}, this app is ${policy.id}`);
    return top[0];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main(argv) {
  const usage = 'Usage: desktop-archive.mjs --archive FILE --platform <os>-<arch>';
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--') || !argv[index + 1]) throw new Error(usage);
    options[argv[index].slice(2)] = argv[++index];
  }
  if (!options.archive || !options.platform) throw new Error(usage);
  const policy = JSON.parse(
    readFileSync(resolve(root, options.policy || 'apps/desktop/nsh.json'), 'utf8'),
  );
  const staged = verifyDesktopArchive({
    archive: options.archive,
    platform: options.platform,
    policy,
  });
  console.log(JSON.stringify({ ok: true, archive: basename(options.archive), staged }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
