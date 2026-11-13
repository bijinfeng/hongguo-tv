import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { nshVersion, output, root, run } from './process.mjs';

export function tvHostEnvironment() {
  const androidHome =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    resolve(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  const javaHome =
    process.env.TV_JAVA_HOME ||
    (process.platform === 'darwin' &&
    existsSync('/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home')
      ? '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
      : process.env.JAVA_HOME);
  const java = javaHome
    ? resolve(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
  if (!output(java, ['-version']).includes('"17.'))
    throw new Error('The TV Gradle host requires JDK 17; set TV_JAVA_HOME.');
  return {
    ...process.env,
    ANDROID_HOME: androidHome,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
}

export function tvBuildType(env = process.env) {
  const buildType = env.HONGGUO_TV_BUILD_TYPE || 'debug';
  if (buildType !== 'debug' && buildType !== 'release')
    throw new Error('HONGGUO_TV_BUILD_TYPE must be debug or release');
  return buildType;
}

// The upstream AAR is immutable and checked before extracting its embedding classes.
const archiveHash = '4e0c943c75c4618e84a0139394719068de341f5c4386714502a2fb1cba802d7f';
export async function packageTvHost() {
  const buildType = tvBuildType();
  const toolchain = JSON.parse(await readFile(resolve(root, 'tooling/tv-toolchain.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(resolve(root, 'apps/tv/nsh.json'), 'utf8'));
  const generated = resolve(root, 'apps/tv/.nsh/android-host');
  const cache = resolve(root, '.local/tools/nsh-embed-android.zip');
  await mkdir(resolve(root, '.local/tools'), { recursive: true });
  if (!existsSync(cache)) {
    await run('curl', [
      '--fail',
      '--location',
      '--retry',
      '3',
      '--output',
      `${cache}.download`,
      `https://github.com/longbridge/nsh/releases/download/v${nshVersion}/nsh-embed-android.zip`,
    ]);
    const downloaded = createHash('sha256')
      .update(await readFile(`${cache}.download`))
      .digest('hex');
    if (downloaded !== archiveHash) throw new Error('NSH embedding download checksum mismatch');
    await rename(`${cache}.download`, cache);
  }
  const digest = createHash('sha256')
    .update(await readFile(cache))
    .digest('hex');
  if (digest !== archiveHash) throw new Error(`NSH embedding archive checksum mismatch: ${cache}`);
  await mkdir(generated, { recursive: true });
  await run('unzip', ['-oq', cache, '-d', resolve(generated, 'embed')]);
  const aar = resolve(generated, 'embed/nsh-embed-android/nsh.aar');
  await run('unzip', ['-oq', aar, 'classes.jar', '-d', generated]);
  await cp(resolve(generated, 'classes.jar'), resolve(generated, 'nsh-classes.jar'));
  const apk = resolve(root, `apps/tv/.nsh/out/${metadata.name}.apk`);
  await rm(resolve(generated, 'assets'), { recursive: true, force: true });
  await run('unzip', ['-oq', apk, 'lib/arm64-v8a/libnsh.so', '-d', generated]);
  // NSH package can reuse an older release bundle. The custom host must use this build's entry.
  const fresh = resolve(root, 'apps/tv/.nsh/out');
  const assets = resolve(generated, 'assets/nsh');
  await mkdir(assets, { recursive: true });
  for (const file of ['bundle.nshc', 'app.json'])
    await cp(resolve(fresh, file), resolve(assets, file));
  if (existsSync(resolve(fresh, 'assets')))
    await cp(resolve(fresh, 'assets'), resolve(assets, 'assets'), { recursive: true });
  await mkdir(resolve(generated, 'jni/arm64-v8a'), { recursive: true });
  await cp(
    resolve(generated, 'lib/arm64-v8a/libnsh.so'),
    resolve(generated, 'jni/arm64-v8a/libnsh.so'),
  );
  const theme = JSON.parse(await readFile(resolve(root, 'packages/ui/theme.json'), 'utf8'));
  for (const [mode, folder] of [
    ['light', 'values'],
    ['dark', 'values-night'],
  ]) {
    const tokens = theme.cssVars[mode];
    await mkdir(resolve(generated, 'res', folder), { recursive: true });
    const colors = ['background', 'primary', 'primary-foreground', 'ring']
      .map((token) => `<color name="tv_${token.replaceAll('-', '_')}">${tokens[token]}</color>`)
      .join('\n');
    await writeFile(
      resolve(generated, 'res', folder, 'colors.xml'),
      `<resources>\n${colors}\n<dimen name="tv_radius">${theme.cssVars.theme.radius.replace('px', 'dp')}</dimen>\n</resources>\n`,
    );
  }
  const env = tvHostEnvironment();
  const host = resolve(root, 'apps/tv/android');
  await run(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [
      '--no-daemon',
      `assemble${buildType[0].toUpperCase()}${buildType.slice(1)}`,
      `lint${buildType[0].toUpperCase()}${buildType.slice(1)}`,
    ],
    { cwd: host, env },
  );
  await cp(resolve(host, `app/build/outputs/apk/${buildType}/app-${buildType}.apk`), apk);
  const packedBundle = resolve(generated, 'packed-bundle');
  await run('unzip', ['-oq', apk, 'assets/nsh/bundle.nshc', '-d', packedBundle]);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (
    hash(await readFile(resolve(assets, 'bundle.nshc'))) !==
    hash(await readFile(resolve(packedBundle, 'assets/nsh/bundle.nshc')))
  )
    throw new Error('TV APK bundle differs from the current NSH build');
  const buildTools = resolve(env.ANDROID_HOME, 'build-tools', toolchain.android.buildTools);
  output(resolve(buildTools, 'apksigner'), ['verify', '--verbose', apk]);
  output(resolve(buildTools, 'zipalign'), ['-c', '-P', '16', '4', apk]);
  console.log(
    `TV ${buildType} host APK: ${apk}\nSHA256 ${createHash('sha256')
      .update(await readFile(apk))
      .digest('hex')}`,
  );
}
