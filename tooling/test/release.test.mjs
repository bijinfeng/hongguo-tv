import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkReleaseVersion,
  createArtifactMetadata,
  createReleaseRecord,
  readProductVersion,
  sha256File,
  sha256Sums,
  syncReleaseVersion,
  verifyReleaseRecord,
} from '../src/release.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hongguo-release-'));
  const version = join(dir, 'product-version.json');
  const web = join(dir, 'web.json');
  const desktop = join(dir, 'desktop.json');
  const packageFile = join(dir, 'package.json');
  await writeFile(version, JSON.stringify({ version: '1.2.3', build: 7 }));
  await writeFile(web, JSON.stringify({ version: '1.2.3', build: 7 }));
  await writeFile(desktop, JSON.stringify({ version: '1.2.3', build: 7 }));
  await writeFile(packageFile, JSON.stringify({ name: 'fixture', version: '1.2.3' }));
  return { dir, version, web, desktop, packageFile };
}

test('release version is validated against every app manifest', async () => {
  const files = await fixture();
  assert.deepEqual(await readProductVersion(files.version), { version: '1.2.3', build: 7 });
  assert.deepEqual(
    await checkReleaseVersion({
      versionPath: files.version,
      manifests: [files.web, files.desktop],
      packagePath: files.packageFile,
    }),
    { version: '1.2.3', build: 7 },
  );
  await writeFile(files.desktop, JSON.stringify({ version: '1.2.4', build: 8 }));
  await assert.rejects(
    checkReleaseVersion({
      versionPath: files.version,
      manifests: [files.web, files.desktop],
      packagePath: files.packageFile,
    }),
    /Release version drift/,
  );
  await syncReleaseVersion({
    versionPath: files.version,
    manifests: [files.desktop],
    packagePath: files.packageFile,
  });
  await writeFile(files.packageFile, JSON.stringify({ name: 'fixture', version: '9.9.9' }));
  await assert.rejects(
    checkReleaseVersion({
      versionPath: files.version,
      manifests: [files.web, files.desktop],
      packagePath: files.packageFile,
    }),
    /package\.json: expected version/,
  );
  await syncReleaseVersion({
    versionPath: files.version,
    manifests: [],
    packagePath: files.packageFile,
  });
  assert.deepEqual(
    await checkReleaseVersion({
      versionPath: files.version,
      manifests: [files.desktop],
      packagePath: files.packageFile,
    }),
    { version: '1.2.3', build: 7 },
  );
  assert.equal(JSON.parse(await readFile(files.packageFile, 'utf8')).version, '1.2.3');
});

test('artifact metadata is deterministic and contains a content digest', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'Hongguo-test.apk');
  await writeFile(artifact, 'release fixture\n');
  const metadata = await createArtifactMetadata({
    artifact,
    target: 'tv-arm64',
    sourceSha: 'abc123',
    versionPath: files.version,
  });
  assert.deepEqual(metadata, {
    schemaVersion: 1,
    target: 'tv-arm64',
    artifact: 'Hongguo-test.apk',
    size: 16,
    sha256: await sha256File(artifact),
    version: '1.2.3',
    build: 7,
    sourceSha: 'abc123',
  });
  assert.equal(JSON.parse(await readFile(files.version, 'utf8')).build, 7);
});

test('artifact target rejects path-like values', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'app.zip');
  await writeFile(artifact, 'x');
  await assert.rejects(
    createArtifactMetadata({ artifact, target: '../release', versionPath: files.version }),
    /lowercase letters/,
  );
});

test('release record contains public hashes without leaking local paths', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'Hongguo-tv.apk');
  await writeFile(artifact, 'candidate apk\n');
  const record = await createReleaseRecord({
    input: {
      channel: 'stable',
      artifacts: [
        {
          target: 'tv-arm64',
          path: artifact,
          url: 'https://github.com/bijinfeng/hongguo-tv/releases/download/v1.2.3/Hongguo-tv.apk',
          kind: 'installer',
          signingIdentity: 'sha256:release-cert',
        },
      ],
    },
    sourceRepository: 'bijinfeng/hongguo-tv',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    versionPath: files.version,
  });
  assert.deepEqual(record, {
    schemaVersion: 1,
    sourceRepository: 'bijinfeng/hongguo-tv',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    version: '1.2.3',
    build: 7,
    channel: 'stable',
    artifacts: [
      {
        target: 'tv-arm64',
        artifact: 'Hongguo-tv.apk',
        url: 'https://github.com/bijinfeng/hongguo-tv/releases/download/v1.2.3/Hongguo-tv.apk',
        size: 14,
        sha256: await sha256File(artifact),
        kind: 'installer',
        signingIdentity: 'sha256:release-cert',
      },
    ],
  });
  assert.equal(JSON.stringify(record).includes(files.dir), false);
  assert.equal(sha256Sums(record), `${record.artifacts[0].sha256}  Hongguo-tv.apk\n`);
});

test('release record rejects unsafe or ambiguous artifact descriptors', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'candidate.zip');
  await writeFile(artifact, 'candidate');
  const base = {
    sourceRepository: 'bijinfeng/hongguo-tv',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    versionPath: files.version,
  };
  const descriptor = (overrides = {}) => ({
    target: 'desktop-macos',
    path: artifact,
    url: 'https://github.com/bijinfeng/hongguo-tv/releases/download/v1.2.3/candidate.zip',
    ...overrides,
  });
  await assert.rejects(
    createReleaseRecord({
      ...base,
      input: { artifacts: [descriptor({ url: 'http://example.test/a' })] },
    }),
    /must be HTTPS/,
  );
  await assert.rejects(
    createReleaseRecord({
      ...base,
      input: { artifacts: [descriptor(), descriptor({ path: artifact })] },
    }),
    /duplicate release artifact target/,
  );
  await assert.rejects(
    createReleaseRecord({ ...base, input: { artifacts: [descriptor({ target: 'Desktop' })] } }),
    /target must use lowercase/,
  );
  await assert.rejects(
    createReleaseRecord({ ...base, input: { artifacts: [descriptor()] }, sourceSha: 'abc' }),
    /40-character Git SHA/,
  );
});

test('release record verification binds metadata to the downloaded bytes', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'candidate.apk');
  await writeFile(artifact, 'candidate');
  const record = await createReleaseRecord({
    input: {
      channel: 'stable',
      artifacts: [
        {
          target: 'tv-android-arm64',
          path: artifact,
          url: 'https://github.com/bijinfeng/hongguo-tv/releases/download/v1.2.3/candidate.apk',
        },
      ],
    },
    sourceRepository: 'bijinfeng/hongguo-tv',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    versionPath: files.version,
  });
  assert.deepEqual(
    await verifyReleaseRecord({
      record,
      artifactDir: files.dir,
      sourceRepository: 'bijinfeng/hongguo-tv',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      versionPath: files.version,
    }),
    record,
  );
  await writeFile(artifact, 'tampered!');
  await assert.rejects(
    verifyReleaseRecord({
      record,
      artifactDir: files.dir,
      sourceRepository: 'bijinfeng/hongguo-tv',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      versionPath: files.version,
    }),
    /sha256 mismatch/,
  );
});

test('release record verification rejects identity and path drift', async () => {
  const files = await fixture();
  const artifact = join(files.dir, 'candidate.zip');
  await writeFile(artifact, 'candidate');
  const base = await createReleaseRecord({
    input: {
      artifacts: [
        {
          target: 'desktop-macos-aarch64',
          path: artifact,
          url: 'https://github.com/bijinfeng/hongguo-tv/releases/download/v1.2.3/candidate.zip',
        },
      ],
    },
    sourceRepository: 'bijinfeng/hongguo-tv',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    versionPath: files.version,
  });
  await assert.rejects(
    verifyReleaseRecord({
      record: { ...base, sourceSha: 'fedcba9876543210fedcba9876543210fedcba98' },
      sourceRepository: 'bijinfeng/hongguo-tv',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      versionPath: files.version,
    }),
    /sourceSha does not match/,
  );
  await assert.rejects(
    verifyReleaseRecord({
      record: {
        ...base,
        artifacts: [{ ...base.artifacts[0], artifact: '../candidate.zip' }],
      },
      sourceRepository: 'bijinfeng/hongguo-tv',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      versionPath: files.version,
    }),
    /artifact name is invalid/,
  );
});
