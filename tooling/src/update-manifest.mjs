import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { root } from './process.mjs';
import { sha256Sums, verifyReleaseRecord } from './release.mjs';

// NSH 0.5.0 f4d68f7 nsh-updater::sign/verify; sign the original bytes, including whitespace.
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

function installer(record, target, repository, name) {
  if (record.channel !== 'stable' || record.artifacts.length !== 1)
    throw new Error('Stable release must contain exactly one installer per platform');
  const asset = record.artifacts[0];
  if (asset.size >= 2 ** 31) throw new Error('Release installer exceeds GitHub asset size limit');
  const url = `https://github.com/${repository}/releases/download/v${record.version}/${name}`;
  if (
    asset.target !== target ||
    asset.kind !== 'installer' ||
    asset.artifact !== name ||
    asset.url !== url
  )
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

export async function verifyUpdateAssets({
  desktopDir,
  tvDir,
  repository,
  sourceSha,
  policy,
  versionPath,
}) {
  for (const [dir, name, publicKey, id, target] of [
    [
      desktopDir,
      'latest',
      policy.desktop.updater.publicKey,
      policy.desktop.id,
      'desktop-macos-arm64',
    ],
    [tvDir, 'tv-latest', policy.signing.publicKey, policy.tv.id, 'tv-android-arm64'],
  ]) {
    const record = await verifyReleaseRecord({
      record: await json(
        join(dir, target.startsWith('desktop') ? 'desktop-release.json' : 'tv-release.json'),
      ),
      artifactDir: dir,
      sourceRepository: repository,
      sourceSha,
      versionPath,
    });
    const sums = await readFile(
      join(dir, target.startsWith('desktop') ? 'desktop-SHA256SUMS' : 'tv-SHA256SUMS'),
      'utf8',
    );
    if (sums !== sha256Sums(record)) throw new Error('Release checksum file mismatch');
    const manifest = openManifest(
      await readFile(join(dir, `${name}.json`)),
      await readFile(join(dir, `${name}.json.sig`), 'utf8'),
      publicKey,
    );
    if (manifest.id !== id || manifest.version !== record.version)
      throw new Error('Update manifest app or version mismatch');
    if (name === 'tv-latest') {
      if (!isDeepStrictEqual(manifest, tvManifest(record, repository, policy)))
        throw new Error('TV update manifest metadata mismatch');
    } else {
      const asset = installer(
        record,
        target,
        repository,
        `hongguo-desktop-${record.version}-macos-aarch64.tar.gz`,
      );
      if (
        !isDeepStrictEqual(Object.keys(manifest.platforms || {}), ['macos-aarch64']) ||
        manifest.package
      )
        throw new Error('Desktop update platform mismatch');
      const offered = manifest.platforms['macos-aarch64'];
      if (
        offered.url !== asset.url ||
        offered.sha256 !== asset.sha256 ||
        offered.size !== asset.size
      )
        throw new Error('Desktop update manifest metadata mismatch');
    }
  }
}

async function main([command, ...args]) {
  const allowed =
    command === 'tv'
      ? ['dir', 'repository', 'source-sha', 'badging', 'certificates', 'key']
      : command === 'verify'
        ? ['desktop-dir', 'tv-dir', 'repository', 'source-sha']
        : [];
  if (!allowed.length) throw new Error('Expected update-manifest.mjs tv|verify');
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
  if (command === 'tv') {
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
