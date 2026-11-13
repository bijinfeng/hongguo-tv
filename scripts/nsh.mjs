import { legacyUiDir, nshPath, run, runtimeConfig } from './toolchain.mjs';

try {
  await runtimeConfig();
  await run(nshPath(), process.argv.slice(2), { cwd: legacyUiDir });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
