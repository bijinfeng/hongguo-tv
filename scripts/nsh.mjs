import { appDir, nshPath, run, runtimeConfig } from './toolchain.mjs';

try {
  await runtimeConfig();
  await run(nshPath(), process.argv.slice(2), { cwd: appDir });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
