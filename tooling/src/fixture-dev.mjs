import { resolve } from 'node:path';
import { browsingFixture } from './browsing-fixture.mjs';
import { freePort, stop } from './dev.mjs';
import {
  child,
  executable,
  nativeTarget,
  root,
  run,
  runtimeConfig,
  rustEnvironment,
} from './process.mjs';

/**
 * Development-only preview: the real app against the browsing fixture instead of the Rust core.
 * Fixture responses are synthetic, so this entry never counts as acceptance evidence — acceptance
 * runs `pnpm dev --target …` (or a packaged build) against the real core.
 */
export async function fixtureDev(target) {
  const fixture = await browsingFixture({ feed: false });
  const port = await freePort();
  let host, reversePort;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await stop(host);
    if (reversePort) await run('adb', ['reverse', '--remove', `tcp:${reversePort}`]);
    await fixture.close();
  };
  const onSignal = () => {
    void close().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await runtimeConfig(target, fixture.origin);
    if (target === 'tv') {
      reversePort = new URL(fixture.origin).port;
      await run('adb', ['reverse', `tcp:${reversePort}`, `tcp:${reversePort}`]);
    }
    if (closing) return;
    console.log(
      `Fixture core ${fixture.origin}; UI http://127.0.0.1:${port}. Synthetic data for development only — acceptance uses pnpm dev against the real core.`,
    );
    host = child(
      executable('nsh'),
      ['run', '--target', nativeTarget(target), '--port', String(port)],
      { cwd: resolve(root, 'apps', target), env: rustEnvironment() },
    );
    await host.done;
  } catch (error) {
    if (!closing) throw error;
  } finally {
    await close();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
