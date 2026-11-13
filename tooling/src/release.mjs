import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { output, root } from './process.mjs';

const versionFile = resolve(root, 'product-version.json');
const packageFile = resolve(root, 'package.json');
const appManifests = [
  resolve(root, 'apps/web/nsh.json'),
  resolve(root, 'apps/desktop/nsh.json'),
  resolve(root, 'apps/tv/nsh.json'),
];

export async function readProductVersion(file = versionFile) {
  let value;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read product version ${file}: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('product-version.json must contain an object');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.version))
    throw new Error('product-version.json version must be a SemVer string');
  if (!Number.isSafeInteger(value.build) || value.build < 1)
    throw new Error('product-version.json build must be a positive safe integer');
  return { version: value.version, build: value.build };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

export async function checkReleaseVersion({
  versionPath = versionFile,
  manifests = appManifests,
  packagePath = packageFile,
} = {}) {
  const product = await readProductVersion(versionPath);
  const mismatches = [];
  for (const file of manifests) {
    const manifest = await readJson(file);
    if (manifest.version !== product.version || manifest.build !== product.build)
      mismatches.push(`${file}: expected ${product.version} (${product.build})`);
  }
  if (packagePath !== null) {
    const packageManifest = await readJson(packagePath);
    if (packageManifest.version !== product.version)
      mismatches.push(`${packagePath}: expected version ${product.version}`);
  }
  if (mismatches.length) throw new Error(`Release version drift:\n${mismatches.join('\n')}`);
  return product;
}

export async function syncReleaseVersion({
  versionPath = versionFile,
  manifests = appManifests,
  packagePath = packageFile,
} = {}) {
  const product = await readProductVersion(versionPath);
  for (const file of manifests) {
    const manifest = await readJson(file);
    await writeFile(
      file,
      `${JSON.stringify({ ...manifest, version: product.version, build: product.build }, null, 2)}\n`,
    );
  }
  if (packagePath !== null) {
    const packageManifest = await readJson(packagePath);
    await writeFile(
      packagePath,
      `${JSON.stringify({ ...packageManifest, version: product.version }, null, 2)}\n`,
    );
  }
  return product;
}

export async function sha256File(file) {
  const digest = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  return digest;
}

export async function createArtifactMetadata({
  artifact,
  target,
  sourceSha,
  versionPath = versionFile,
}) {
  const product = await readProductVersion(versionPath);
  const fileStat = await stat(artifact);
  if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target))
    throw new Error('artifact target must use lowercase letters, numbers and hyphens');
  return {
    schemaVersion: 1,
    target,
    artifact: basename(artifact),
    size: fileStat.size,
    sha256: await sha256File(artifact),
    version: product.version,
    build: product.build,
    sourceSha: sourceSha || process.env.GITHUB_SHA || (await gitSha()),
  };
}

function sourceShaValue(sourceSha) {
  const value = sourceSha || process.env.GITHUB_SHA;
  if (value && !/^[0-9a-f]{40}$/i.test(value))
    throw new Error('sourceSha must be a 40-character Git SHA');
  return value || gitSha();
}

function validateHttpsUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`artifact URL is invalid: ${url}`);
  }
  if (parsed.protocol !== 'https:' || parsed.search || parsed.hash)
    throw new Error(`artifact URL must be HTTPS without query or hash: ${url}`);
  return parsed.href;
}

/**
 * Build the public, deterministic record that travels with a release candidate.
 * Local paths are read to calculate the digest and are never written to the record.
 */
export async function createReleaseRecord({
  input,
  sourceRepository = process.env.GITHUB_REPOSITORY,
  sourceSha,
  versionPath = versionFile,
}) {
  const product = await readProductVersion(versionPath);
  if (!sourceRepository || !/^[^/\s]+\/[^/\s]+$/.test(sourceRepository))
    throw new Error('sourceRepository must use the owner/repository form');
  const sha = sourceShaValue(sourceSha);
  if (!sha) throw new Error('sourceSha is required outside a Git checkout');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('release record input must contain an object');
  const channel = input.channel || 'stable';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(channel))
    throw new Error('release channel must use lowercase letters, numbers and hyphens');
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0)
    throw new Error('release record requires at least one artifact');

  const seenTargets = new Set();
  const artifacts = [];
  for (const descriptor of input.artifacts) {
    if (!descriptor || typeof descriptor !== 'object')
      throw new Error('release artifact descriptors must be objects');
    const { target, path, url } = descriptor;
    if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target))
      throw new Error('release artifact target must use lowercase letters, numbers and hyphens');
    if (seenTargets.has(target)) throw new Error(`duplicate release artifact target: ${target}`);
    seenTargets.add(target);
    if (!path || typeof path !== 'string')
      throw new Error(`release artifact ${target} needs a path`);
    if (!url || typeof url !== 'string') throw new Error(`release artifact ${target} needs a URL`);
    const file = resolve(path);
    const fileStat = await stat(file);
    if (!fileStat.isFile()) throw new Error(`release artifact is not a file: ${file}`);
    const artifact = {
      target,
      artifact: basename(file),
      url: validateHttpsUrl(url),
      size: fileStat.size,
      sha256: await sha256File(file),
    };
    if (descriptor.kind !== undefined) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(descriptor.kind))
        throw new Error(`release artifact kind is invalid: ${target}`);
      artifact.kind = descriptor.kind;
    }
    if (descriptor.signingIdentity !== undefined) {
      if (typeof descriptor.signingIdentity !== 'string' || !descriptor.signingIdentity.trim())
        throw new Error(`release artifact signingIdentity is invalid: ${target}`);
      artifact.signingIdentity = descriptor.signingIdentity;
    }
    artifacts.push(artifact);
  }
  return {
    schemaVersion: 1,
    sourceRepository,
    sourceSha: sha,
    version: product.version,
    build: product.build,
    channel,
    artifacts,
  };
}

export function sha256Sums(record) {
  return `${record.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.artifact}`).join('\n')}\n`;
}

async function gitSha() {
  try {
    return output('git', ['rev-parse', 'HEAD']);
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
  return options;
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === 'check') {
    const product = await checkReleaseVersion();
    console.log(JSON.stringify({ ok: true, ...product }));
    return;
  }
  if (command === 'sync') {
    const product = await syncReleaseVersion();
    console.log(JSON.stringify({ ok: true, synced: true, ...product }));
    return;
  }
  if (command === 'metadata') {
    const options = parseArgs(rest);
    if (!options.artifact || !options.target)
      throw new Error('metadata requires --artifact and --target');
    const metadata = await createArtifactMetadata({
      ...options,
      sourceSha: options['source-sha'],
      versionPath: options['version-file'] || versionFile,
    });
    const text = `${JSON.stringify(metadata, null, 2)}\n`;
    if (options.out) await writeFile(resolve(root, options.out), text);
    else process.stdout.write(text);
    return;
  }
  if (command === 'record') {
    const options = parseArgs(rest);
    if (!options.input) throw new Error('record requires --input FILE');
    const input = await readJson(resolve(root, options.input));
    const record = await createReleaseRecord({
      input,
      sourceRepository: options.repository,
      sourceSha: options['source-sha'],
      versionPath: options['version-file'] || versionFile,
    });
    const text = `${JSON.stringify(record, null, 2)}\n`;
    if (options.out) await writeFile(resolve(root, options.out), text);
    else process.stdout.write(text);
    if (options.checksums) await writeFile(resolve(root, options.checksums), sha256Sums(record));
    return;
  }
  throw new Error(
    'Usage: release.mjs check | sync | metadata --artifact FILE --target TARGET [--out FILE] | record --input FILE [--out FILE] [--checksums FILE]',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
