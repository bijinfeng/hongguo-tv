import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

/** Disable Lefthook's implicit stash/index handling for every installed hook. */
export function hookArgs(args) {
  return args[0] === 'run' ? [...args, '--no-stage-fixed', '--no-auto-install'] : args;
}
if (import.meta.main) {
  try {
    const require = createRequire(import.meta.url);
    const result = spawnSync(
      process.execPath,
      [require.resolve('lefthook/bin/index.js'), ...hookArgs(process.argv.slice(2))],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
