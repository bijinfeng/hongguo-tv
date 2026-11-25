import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { executable, output, root } from './process.mjs';
import {
  sha256Sums,
  verifyReleaseRecord,
  createReleaseRecord,
  readProductVersion,
} from './release.mjs';
import { verifyDesktopArchive } from './desktop-archive.mjs';

// NSH 0.7.0 3f8ecd8 nsh-updater::sign/verify; sign the original bytes, including whitespace.
const context = Buffer.from('nsh-updater-manifest\0');
const privatePrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const publicPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

function decode(text, length) {
  if (typeof text !== 'string') throw new Error('Expected base64 signing material');
  const value = text.trim();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== length || bytes.toString('base64') !== value)
    throw new Error('Invalid base64 signing material');
  return bytes;
}

export function signManifest(bytes, secret, publicKey) {
  const key = createPrivateKey({
    key: Buffer.concat([privatePrefix, decode(secret, 32)]),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.concat([context, bytes]), key).toString('base64');
  openManifest(bytes, signature, publicKey);
  return `${signature}\n`;
}

export function openManifest(bytes, signature, publicKey) {
  if (!bytes.length || bytes.length > 65536) throw new Error('Update manifest exceeds size limit');
  const key = createPublicKey({
    key: Buffer.concat([publicPrefix, decode(publicKey, 32)]),
    format: 'der',
    type: 'spki',
  });
  if (!verify(null, Buffer.concat([context, bytes]), key, decode(signature, 64)))
    throw new Error('Update manifest signature mismatch');
  return JSON.parse(bytes.toString('utf8'));
}

export async function releasePolicy() {
  return {
    desktop: await json(resolve(root, 'apps/desktop/nsh.json')),
    tv: await json(resolve(root, 'apps/tv/nsh.json')),
    android: (await json(resolve(root, 'tooling/tv-toolchain.json'))).android,
    signing: (await json(resolve(root, 'tooling/release-policy.json'))).tv,
  };
}

/**
 * Desktop archives, in the order the release publishes them. The archive name is what
 * NSH parses into its `<os>-<arch>` platform key, so it keeps the underscore
 * (`x86_64`); a release record's target only allows hyphens.
 */
function desktopAssets(version) {
  return [
    {
      target: 'desktop-macos-arm64',
      platform: 'macos-aarch64',
      name: `hongguo-desktop-${version}-macos-aarch64.tar.gz`,
    },
    {
      target: 'desktop-windows-x64',
      platform: 'windows-x86_64',
      name: `hongguo-desktop-${version}-windows-x86_64.zip`,
    },
    {
      target: 'desktop-linux-x64',
      platform: 'linux-x86_64',
      name: `hongguo-desktop-${version}-linux-x86_64.tar.gz`,
    },
  ];
}

function installer(record, target, repository, name) {
  if (record.channel !== 'stable')
    throw new Error('Stable release must only contain stable channel assets');
  const asset = record.artifacts.find((entry) => entry.target === target);
  if (!asset) throw new Error(`Release installer is missing for ${target}`);
  if (asset.size >= 2 ** 31) throw new Error('Release installer exceeds GitHub asset size limit');
  const url = `https://github.com/${repository}/releases/download/v${record.version}/${name}`;
  if (asset.kind !== 'installer' || asset.artifact !== name || asset.url !== url)
    throw new Error('Release installer identity or immutable URL mismatch');
  return asset;
}

function tvManifest(record, repository, policy) {
  if (record.build > 2100000000) throw new Error('TV versionCode exceeds Android limit');
  const asset = installer(
    record,
    'tv-android-arm64',
    repository,
    `hongguo-tv-${record.version}-android-arm64.apk`,
  );
  if (asset.signingIdentity !== `sha256:${policy.signing.signingCertificateSha256}`)
    throw new Error('TV release signing certificate mismatch');
  return {
    schemaVersion: 1,
    channel: 'stable',
    id: policy.tv.id,
    version: record.version,
    platforms: {
      android: {
        url: asset.url,
        sha256: asset.sha256,
        size: asset.size,
        versionCode: record.build,
        packageName: policy.tv.id,
        minSdk: policy.android.minSdk,
        abis: policy.android.abis,
        signingCertificateSha256: policy.signing.signingCertificateSha256,
      },
    },
  };
}

export function verifyApkIdentity({ badging, certificates, record, policy }) {
  if (/^application-debuggable\r?$/m.test(badging))
    throw new Error('Release APK must not be debuggable');
  const packages = [
    ...badging.matchAll(
      /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'[^\r\n]*$/gm,
    ),
  ];
  const sdks = [...badging.matchAll(/^minSdkVersion:'(\d+)'\r?$/gm)];
  const abis = [...badging.matchAll(/^native-code: (.+)\r?$/gm)];
  const signers = [
    ...certificates.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})\r?$/gm),
  ];
  const [entry] = packages;
  if (
    packages.length !== 1 ||
    entry[1] !== policy.tv.id ||
    entry[2] !== String(record.build) ||
    entry[3] !== record.version
  )
    throw new Error('APK package or version mismatch');
  if (sdks.length !== 1 || Number(sdks[0][1]) !== policy.android.minSdk)
    throw new Error('APK minSdk mismatch');
  const actualAbis = abis.length === 1 ? abis[0][1].trim().split(/\s+/) : [];
  if (
    !isDeepStrictEqual(
      actualAbis,
      policy.android.abis.map((abi) => `'${abi}'`),
    )
  )
    throw new Error('APK ABI mismatch');
  if (
    signers.length !== 1 ||
    signers[0][1].toLowerCase() !== policy.signing.signingCertificateSha256
  )
    throw new Error('APK signer set mismatch');
}

/**
 * Builds one desktop release from the archives the three platform jobs produced: checks
 * each archive is the bundle NSH stages, records the bytes, and signs the manifest NSH
 * reads. The platform keys are `<os>-<arch>` because that is what `nsh-updater` looks up
 * at runtime, and the archive name is what the CLI parses them from.
 */
export async function createDesktopRelease({
  dir,
  entry = resolve(root, 'apps/desktop'),
  repository,
  sourceSha,
  keyPath,
  policy,
  versionPath,
}) {
  const product = await readProductVersion(versionPath);
  const artifacts = [];
  for (const { target, platform, name } of desktopAssets(product.version)) {
    const path = join(dir, name);
    verifyDesktopArchive({ archive: path, platform, policy: { id: policy.desktop.id } });
    artifacts.push({
      target,
      path,
      kind: 'installer',
      url: `https://github.com/${repository}/releases/download/v${product.version}/${name}`,
    });
  }
  const record = await createReleaseRecord({
    input: { channel: 'stable', artifacts },
    sourceRepository: repository,
    sourceSha,
    versionPath,
  });
  await writeFile(join(dir, 'desktop-release.json'), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(join(dir, 'desktop-SHA256SUMS'), sha256Sums(record));
  output(
    executable('nsh'),
    [
      'update-manifest',
      '--entry',
      entry,
      '--key',
      keyPath,
      '--base-url',
      `https://github.com/${repository}/releases/download/v${product.version}`,
      '--out',
      dir,
      ...desktopAssets(product.version).map(({ name }) => join(dir, name)),
    ],
    { cwd: dir },
  );
  await verifyDesktopUpdate({ dir, repository, sourceSha, policy, versionPath });
  return record;
}

export async function createTvManifest({
  dir,
  repository,
  sourceSha,
  badging,
  certificates,
  key,
  policy,
  versionPath,
}) {
  const record = await verifyReleaseRecord({
    record: await json(join(dir, 'tv-release.json')),
    artifactDir: dir,
    sourceRepository: repository,
    sourceSha,
    versionPath,
  });
  verifyApkIdentity({ badging, certificates, record, policy });
  const bytes = Buffer.from(`${JSON.stringify(tvManifest(record, repository, policy), null, 2)}\n`);
  const signature = signManifest(bytes, key, policy.signing.publicKey);
  await writeFile(join(dir, 'tv-latest.json'), bytes);
  await writeFile(join(dir, 'tv-latest.json.sig'), signature);
}

/**
 * Rejects a desktop manifest that offers anything but this release's archives: the
 * platform keys are NSH's `<os>-<arch>`, so a renamed or extra entry would be dead
 * weight at best and a misdirected download at worst.
 */
export function verifyDesktopManifest({ manifest, record, repository, policy }) {
  const expected = desktopAssets(record.version);
  if (manifest.id !== policy.desktop.id) throw new Error('Desktop update app id mismatch');
  if (manifest.version !== record.version) throw new Error('Desktop update version mismatch');
  if (manifest.package !== undefined) throw new Error('Desktop update must not offer a package');
  if (
    !isDeepStrictEqual(
      Object.keys(manifest.platforms || {}).sort(),
      expected.map((entry) => entry.platform).sort(),
    )
  )
    throw new Error('Desktop update platform mismatch');
  for (const { target, platform, name } of expected) {
    const asset = installer(record, target, repository, name);
    const offered = manifest.platforms[platform];
    if (offered.url !== asset.url || offered.sha256 !== asset.sha256 || offered.size !== asset.size)
      throw new Error(`Desktop update manifest metadata mismatch: ${platform}`);
  }
}

export async function verifyDesktopUpdate({ dir, repository, sourceSha, policy, versionPath }) {
  const record = await verifyReleaseRecord({
    record: await json(join(dir, 'desktop-release.json')),
    artifactDir: dir,
    sourceRepository: repository,
    sourceSha,
    versionPath,
  });
  const sums = await readFile(join(dir, 'desktop-SHA256SUMS'), 'utf8');
  if (sums !== sha256Sums(record)) throw new Error('Release checksum file mismatch');
  const manifest = openManifest(
    await readFile(join(dir, 'latest.json')),
    await readFile(join(dir, 'latest.json.sig'), 'utf8'),
    policy.desktop.updater.publicKey,
  );
  if (manifest.id !== policy.desktop.id || manifest.version !== record.version)
    throw new Error('Desktop update manifest app or version mismatch');
  verifyDesktopManifest({ manifest, record, repository, policy });
  return record;
}

export async function verifyTvUpdate({ dir, repository, sourceSha, policy, versionPath }) {
  const record = await verifyReleaseRecord({
    record: await json(join(dir, 'tv-release.json')),
    artifactDir: dir,
    sourceRepository: repository,
    sourceSha,
    versionPath,
  });
  const sums = await readFile(join(dir, 'tv-SHA256SUMS'), 'utf8');
  if (sums !== sha256Sums(record)) throw new Error('Release checksum file mismatch');
  const manifest = openManifest(
    await readFile(join(dir, 'tv-latest.json')),
    await readFile(join(dir, 'tv-latest.json.sig'), 'utf8'),
    policy.signing.publicKey,
  );
  if (manifest.id !== policy.tv.id || manifest.version !== record.version)
    throw new Error('TV update manifest app or version mismatch');
  if (!isDeepStrictEqual(manifest, tvManifest(record, repository, policy)))
    throw new Error('TV update manifest metadata mismatch');
  return record;
}

export async function verifyUpdateAssets({ desktopDir, tvDir, ...common }) {
  await verifyDesktopUpdate({ ...common, dir: desktopDir });
  await verifyTvUpdate({ ...common, dir: tvDir });
}

async function main([command, ...args]) {
  const allowed =
    command === 'tv'
      ? ['dir', 'repository', 'source-sha', 'badging', 'certificates', 'key']
      : command === 'desktop'
        ? ['dir', 'repository', 'source-sha', 'key']
        : command === 'verify'
          ? ['desktop-dir', 'tv-dir', 'repository', 'source-sha']
          : [];
  if (!allowed.length) throw new Error('Expected update-manifest.mjs desktop|tv|verify');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i].slice(2);
    if (
      !args[i].startsWith('--') ||
      !allowed.includes(name) ||
      options[name] ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw new Error('Invalid or duplicate update manifest option');
    options[name] = args[i + 1];
  }
  for (const name of allowed) if (!options[name]) throw new Error(`Missing --${name}`);
  const common = {
    repository: options.repository,
    sourceSha: options['source-sha'],
    policy: await releasePolicy(),
  };
  if (command === 'desktop') {
    await createDesktopRelease({
      ...common,
      dir: options.dir,
      keyPath: options.key,
    });
  } else if (command === 'tv') {
    await createTvManifest({
      ...common,
      dir: options.dir,
      badging: await readFile(options.badging, 'utf8'),
      certificates: await readFile(options.certificates, 'utf8'),
      key: await readFile(options.key, 'utf8'),
    });
  } else {
    await verifyUpdateAssets({
      ...common,
      desktopDir: options['desktop-dir'],
      tvDir: options['tv-dir'],
    });
  }
  console.log(JSON.stringify({ ok: true, command }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
