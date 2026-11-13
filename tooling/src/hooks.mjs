import { run, root } from './process.mjs';

try {
  await run(process.execPath, ['tooling/src/cli.mjs', 'fmt:check'], { cwd: root });
  await run(process.execPath, ['tooling/src/cli.mjs', 'lint'], { cwd: root });
  await run(process.execPath, ['tooling/src/codegen.mjs', '--check'], { cwd: root });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
