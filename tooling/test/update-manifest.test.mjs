import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executable, nshVersion, output } from '../src/process.mjs';
import { createReleaseRecord, sha256Sums } from '../src/release.mjs';
import {
  createTvManifest,
  openManifest,
  signManifest,
  verifyApkIdentity,
  verifyUpdateAssets,
} from '../src/update-manifest.mjs';

// Public test seed only; never a production signing key.
const secret = Buffer.alloc(32, 1).toString('base64');
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 1)]),
  format: 'der',
  type: 'pkcs8',
});
const publicKey = createPublicKey(privateKey)
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64');
const repository = 'bijinfeng/hongguo-tv';
const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const policy = {
  desktop: { id: 'dev.hongguo.desktop', updater: { publicKey } },
  tv: { id: 'dev.hongguo.tv' },
  android: { minSdk: 26, abis: ['arm64-v8a'] },
  signing: { publicKey, signingCertificateSha256: 'a'.repeat(64) },
};
const badging =
  "package: name='dev.hongguo.tv' versionCode='7' versionName='1.2.3' platformBuildVersionName='15'\nminSdkVersion:'26'\nnative-code: 'arm64-v8a'\n";
const certificates = `Signer #1 certificate SHA-256 digest: ${'a'.repeat(64)}\n`;

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hongguo-update-'));
  const versionPath = join(dir, 'version.json');
  await writeFile(versionPath, JSON.stringify({ version: '1.2.3', build: 7 }));
  const desktopDir = join(dir, 'desktop');
  const tvDir = join(dir, 'tv');
  for (const [destination, target, name] of [
    [desktopDir, 'desktop-macos-arm64', 'hongguo-desktop-1.2.3-macos-aarch64.tar.gz'],
    [tvDir, 'tv-android-arm64', 'hongguo-tv-1.2.3-android-arm64.apk'],
  ]) {
    await mkdir(destination);
    const path = join(destination, name);
    await writeFile(path, 'installer fixture');
    const record = await createReleaseRecord({
      input: {
        artifacts: [
          {
            target,
            path,
            kind: 'installer',
            url: `https://github.com/${repository}/releases/download/v1.2.3/${name}`,
            ...(target.startsWith('tv') ? { signingIdentity: `sha256:${'a'.repeat(64)}` } : {}),
          },
        ],
      },
      sourceRepository: repository,
      sourceSha,
      versionPath,
    });
    await writeFile(
      join(destination, target.startsWith('tv') ? 'tv-release.json' : 'desktop-release.json'),
      JSON.stringify(record),
    );
    await writeFile(
      join(destination, target.startsWith('tv') ? 'tv-SHA256SUMS' : 'desktop-SHA256SUMS'),
      sha256Sums(record),
    );
    if (target.startsWith('desktop')) {
      await writeFile(
        join(destination, 'nsh.json'),
        JSON.stringify({
          name: 'test',
          id: policy.desktop.id,
          version: '1.2.3',
          updater: { github: repository, publicKey },
        }),
      );
      await writeFile(join(destination, 'test.secret'), secret, { mode: 0o600 });
      output(executable('nsh'), [
        'update-manifest',
        '--entry',
        destination,
        '--key',
        join(destination, 'test.secret'),
        '--base-url',
        `https://github.com/${repository}/releases/download/v1.2.3`,
        '--out',
        destination,
        path,
      ]);
    }
  }
  const common = { repository, sourceSha, policy, versionPath };
  await createTvManifest({ ...common, dir: tvDir, key: secret, badging, certificates });
  return { ...common, dir, tvDir, desktopDir };
}

test('manifest signature matches pinned NSH CLI framing and rejects raw JSON signatures', async () => {
  assert.equal(output(executable('nsh'), ['--version']).split(/\s+/)[1], nshVersion);
  const dir = await mkdtemp(join(tmpdir(), 'hongguo-nsh-signature-'));
  await writeFile(
    join(dir, 'nsh.json'),
    JSON.stringify({
      name: 'test',
      id: policy.tv.id,
      version: '1.2.3',
      updater: { github: repository, publicKey },
    }),
  );
  await writeFile(join(dir, 'test.secret'), secret, { mode: 0o600 });
  output(executable('nsh'), [
    'update-manifest',
    '--entry',
    dir,
    '--key',
    join(dir, 'test.secret'),
    '--link',
    `android=https://github.com/${repository}/releases/download/v1.2.3/test.apk`,
    '--out',
    dir,
  ]);
  const bytes = await readFile(join(dir, 'latest.json'));
  const signature = await readFile(join(dir, 'latest.json.sig'), 'utf8');
  assert.equal(signManifest(bytes, secret, publicKey).trim(), signature.trim());
  assert.equal(openManifest(bytes, signature, publicKey).id, policy.tv.id);
  assert.throws(
    () => openManifest(bytes, sign(null, bytes, privateKey).toString('base64'), publicKey),
    /signature mismatch/,
  );
  assert.throws(
    () => openManifest(Buffer.concat([bytes, Buffer.from(' ')]), signature, publicKey),
    /signature mismatch/,
  );
  assert.throws(
    () => signManifest(bytes, secret, Buffer.alloc(32, 2).toString('base64')),
    /signature mismatch/,
  );
  assert.throws(() => openManifest(Buffer.alloc(65537), signature, publicKey), /size limit/);
  assert.throws(() => openManifest(bytes, 'not-base64', publicKey), /base64/);
});

test('signed TV manifest binds APK bytes, installation identity and immutable URL', async () => {
  const files = await fixture();
  await verifyUpdateAssets(files);
  const bytes = await readFile(join(files.tvDir, 'tv-latest.json'));
  const signature = await readFile(join(files.tvDir, 'tv-latest.json.sig'), 'utf8');
  const manifest = openManifest(bytes, signature, publicKey);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.channel, 'stable');
  assert.equal(manifest.platforms.android.versionCode, 7);
  assert.deepEqual(manifest.platforms.android.abis, ['arm64-v8a']);
  assert.equal(manifest.platforms.android.minSdk, 26);
  assert.equal(manifest.platforms.android.signingCertificateSha256, 'a'.repeat(64));
  assert.equal(JSON.stringify(manifest).includes(files.dir), false);
  await writeFile(join(files.tvDir, 'hongguo-tv-1.2.3-android-arm64.apk'), 'tampered!');
  await assert.rejects(verifyUpdateAssets(files), /size mismatch/);
});

test('APK reports reject wrong package, version, SDK, ABI, signer and multiple signers', () => {
  const record = { version: '1.2.3', build: 7 };
  verifyApkIdentity({ badging, certificates, record, policy });
  assert.throws(
    () =>
      verifyApkIdentity({
        badging: `${badging}application-debuggable\n`,
        certificates,
        record,
        policy,
      }),
    /must not be debuggable/,
  );
  for (const report of [
    badging.replace('dev.hongguo.tv', 'other.app'),
    badging.replace("'7'", "'8'"),
    badging.replace('1.2.3', '1.2.4'),
    badging.replace("'26'", "'27'"),
    badging.replace('arm64-v8a', 'x86_64'),
    badging.replace("'arm64-v8a'", "'arm64-v8a' 'x86_64'"),
    `${badging}${badging}`,
    '',
  ]) {
    assert.throws(
      () => verifyApkIdentity({ badging: report, certificates, record, policy }),
      /APK/,
    );
  }
  for (const report of [
    '',
    certificates.replace('a'.repeat(64), 'b'.repeat(64)),
    `${certificates}${certificates.replace('#1', '#2')}`,
  ]) {
    assert.throws(
      () => verifyApkIdentity({ badging, certificates: report, record, policy }),
      /signer/,
    );
  }
});

test('publish verification rejects edited checksum files and missing signatures', async () => {
  const files = await fixture();
  const sums = join(files.tvDir, 'tv-SHA256SUMS');
  const original = await readFile(sums);
  await writeFile(sums, 'b'.repeat(64));
  await assert.rejects(verifyUpdateAssets(files), /checksum file mismatch/);
  await writeFile(sums, original);
  await writeFile(join(files.tvDir, 'tv-latest.json.sig'), '');
  await assert.rejects(verifyUpdateAssets(files), /base64/);
});

test('publish verification rejects correctly signed but mismatched metadata', async () => {
  const files = await fixture();
  const original = JSON.parse(await readFile(join(files.tvDir, 'tv-latest.json'), 'utf8'));
  for (const change of [
    (m) => {
      m.schemaVersion = 2;
    },
    (m) => {
      m.channel = 'preview';
    },
    (m) => {
      m.id = 'other.app';
    },
    (m) => {
      m.version = '9.9.9';
    },
    (m) => {
      m.platforms.android.sha256 = 'b'.repeat(64);
    },
    (m) => {
      delete m.platforms.android.size;
    },
    (m) => {
      m.platforms.android.url = m.platforms.android.url.replace('v1.2.3', 'latest');
    },
    (m) => {
      m.platforms.android.versionCode = 8;
    },
    (m) => {
      m.platforms.android.signingCertificateSha256 = 'b'.repeat(64);
    },
  ]) {
    const manifest = structuredClone(original);
    change(manifest);
    const bytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(join(files.tvDir, 'tv-latest.json'), bytes);
    await writeFile(
      join(files.tvDir, 'tv-latest.json.sig'),
      signManifest(bytes, secret, publicKey),
    );
    await assert.rejects(verifyUpdateAssets(files), /manifest/);
  }
});

test('publish verification rejects desktop wrong platform, signature, URL and hashes', async () => {
  const files = await fixture();
  const file = join(files.desktopDir, 'latest.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const change of [
    (m) => {
      m.platforms['macos-arm64'] = m.platforms['macos-aarch64'];
      delete m.platforms['macos-aarch64'];
    },
    (m) => {
      m.platforms['macos-aarch64'].sha256 = 'b'.repeat(64);
    },
    (m) => {
      m.platforms['macos-aarch64'].url = 'https://other.test/app.tar.gz';
    },
  ]) {
    const manifest = structuredClone(original);
    change(manifest);
    const bytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(file, bytes);
    await writeFile(`${file}.sig`, signManifest(bytes, secret, publicKey));
    await assert.rejects(verifyUpdateAssets(files), /Desktop update/);
  }
  await writeFile(`${file}.sig`, signManifest(Buffer.from('{}'), secret, publicKey));
  await assert.rejects(verifyUpdateAssets(files), /signature mismatch/);
  await assert.rejects(verifyUpdateAssets({ ...files, sourceSha: 'f'.repeat(40) }), /sourceSha/);
});
