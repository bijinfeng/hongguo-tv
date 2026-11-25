import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { executable, nshVersion, output } from '../src/process.mjs';
import { createReleaseRecord, sha256Sums } from '../src/release.mjs';
import {
  createDesktopRelease,
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

const desktopArchives = [
  ['hongguo-desktop-1.2.3-macos-aarch64.tar.gz', 'macos-aarch64'],
  ['hongguo-desktop-1.2.3-windows-x86_64.zip', 'windows-x86_64'],
  ['hongguo-desktop-1.2.3-linux-x86_64.tar.gz', 'linux-x86_64'],
];

/** The bundle `nsh package` writes, so the updater's staging rules apply to the fixture. */
async function writeArchive(dir, name, platform) {
  const staged = await mkdtemp(join(dir, 'staged-'));
  const app = join(staged, platform === 'macos-aarch64' ? '红果.app' : '红果');
  const binary =
    platform === 'macos-aarch64'
      ? join(app, 'Contents/MacOS/App')
      : join(app, platform === 'windows-x86_64' ? '红果.exe' : 'App');
  await mkdir(
    platform === 'macos-aarch64' ? join(app, 'Contents/Resources/nsh') : join(app, 'nsh'),
    {
      recursive: true,
    },
  );
  await mkdir(dirname(binary), { recursive: true });
  await writeFile(
    join(app, platform === 'macos-aarch64' ? 'Contents/Resources/nsh' : 'nsh', 'app.json'),
    JSON.stringify({ id: policy.desktop.id }),
  );
  await writeFile(binary, 'runner');
  // The updater refuses a staged Unix executable without an execute bit; tar keeps the mode.
  if (platform !== 'windows-x86_64') await output('chmod', ['+x', binary]);
  const file = join(dir, name);
  if (platform === 'windows-x86_64')
    output('zip', ['-q', '-r', file, basename(app)], { cwd: staged });
  else output('tar', ['-C', staged, '-czf', file, basename(app)]);
  await rm(staged, { recursive: true, force: true });
  return file;
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hongguo-update-'));
  const versionPath = join(dir, 'version.json');
  await writeFile(versionPath, JSON.stringify({ version: '1.2.3', build: 7 }));
  const desktopDir = join(dir, 'desktop');
  await mkdir(desktopDir);
  for (const [name, platform] of desktopArchives) await writeArchive(desktopDir, name, platform);
  // The entry NSH reads the app's id, version and updater key from; the fixture's own key.
  await writeFile(
    join(desktopDir, 'nsh.json'),
    JSON.stringify({
      name: 'test',
      id: policy.desktop.id,
      version: '1.2.3',
      updater: { github: repository, publicKey },
    }),
  );
  // NSH 0.7.0 resolves an app directory through its TSX entry when reading metadata.
  await writeFile(join(desktopDir, 'App.tsx'), 'export default function App() { return null; }\n');
  await writeFile(join(desktopDir, 'test.secret'), secret, { mode: 0o600 });
  const common = { repository, sourceSha, policy, versionPath };
  await createDesktopRelease({
    ...common,
    dir: desktopDir,
    entry: desktopDir,
    keyPath: join(desktopDir, 'test.secret'),
  });
  const tvDir = join(dir, 'tv');
  await mkdir(tvDir);
  const name = 'hongguo-tv-1.2.3-android-arm64.apk';
  const path = join(tvDir, name);
  await writeFile(path, 'installer fixture tv');
  const record = await createReleaseRecord({
    input: {
      artifacts: [
        {
          target: 'tv-android-arm64',
          path,
          kind: 'installer',
          url: `https://github.com/${repository}/releases/download/v1.2.3/${name}`,
          signingIdentity: `sha256:${'a'.repeat(64)}`,
        },
      ],
    },
    sourceRepository: repository,
    sourceSha,
    versionPath,
  });
  await writeFile(join(tvDir, 'tv-release.json'), JSON.stringify(record));
  await writeFile(join(tvDir, 'tv-SHA256SUMS'), sha256Sums(record));
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
  await writeFile(join(dir, 'App.tsx'), 'export default function App() { return null; }\n');
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

test('desktop manifest covers every published platform and rejects a missing archive', async () => {
  const files = await fixture();
  const record = JSON.parse(await readFile(join(files.desktopDir, 'desktop-release.json'), 'utf8'));
  const manifest = openManifest(
    await readFile(join(files.desktopDir, 'latest.json')),
    await readFile(join(files.desktopDir, 'latest.json.sig'), 'utf8'),
    publicKey,
  );
  assert.equal(manifest.id, policy.desktop.id);
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(Object.keys(manifest.platforms).sort(), [
    'linux-x86_64',
    'macos-aarch64',
    'windows-x86_64',
  ]);
  for (const artifact of record.artifacts) {
    const offered = Object.values(manifest.platforms).find((entry) => entry.url === artifact.url);
    assert.equal(offered?.sha256, artifact.sha256);
    assert.equal(offered?.size, artifact.size);
  }
  // The manifest must offer the archives this release checksums, not a name that merely parses.
  const windows = join(files.desktopDir, 'hongguo-desktop-1.2.3-windows-x86_64.zip');
  await rm(windows);
  await assert.rejects(
    async () =>
      createDesktopRelease({
        dir: files.desktopDir,
        repository: files.repository,
        sourceSha: files.sourceSha,
        policy: files.policy,
        versionPath: files.versionPath,
        keyPath: join(files.desktopDir, 'test.secret'),
        entry: files.desktopDir,
      }),
    /Missing desktop archive|Unsupported desktop archive/i,
  );
});

test('publish verification rejects desktop wrong platform, signature, URL and hashes', async () => {
  const files = await fixture();
  const file = join(files.desktopDir, 'latest.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(original.platforms).sort(), [
    'linux-x86_64',
    'macos-aarch64',
    'windows-x86_64',
  ]);
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
    (m) => {
      delete m.platforms['windows-x86_64'];
    },
    (m) => {
      m.platforms['linux-x64'] = m.platforms['linux-x86_64'];
      delete m.platforms['linux-x86_64'];
    },
    (m) => {
      m.platforms['windows-x86_64'].url = m.platforms['windows-x86_64'].url.replace(
        'windows-x86_64',
        'windows-x64',
      );
    },
    (m) => {
      m.platforms['linux-x86_64'].size += 1;
    },
    (m) => {
      m.package = { version: '1.2.3', build: 7, url: 'https://other.test/a.nshpkg' };
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
