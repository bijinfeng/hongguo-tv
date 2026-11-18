import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, nsh, nativeTarget, root, run, rustEnvironment } from './process.mjs';
import { hostArgs, previewArgs, uiComponentsOptions } from './ui-components-options.mjs';

const { command, target, explicit, display, windowSize, port } = uiComponentsOptions(
  process.argv.slice(2),
);
const entry = 'BaseComponentsPreview.tsx';
if (command === 'check') {
  for (const product of explicit ? [target] : ['web', 'desktop', 'tv']) {
    await nsh('check', product);
    await nsh('build', product, [entry]);
  }
} else if (command === 'preview') {
  // The fixed port keeps one session per product: a repeat replaces its dev session and window.
  await nsh(
    'run',
    target,
    previewArgs(entry, target, nativeTarget(target), { port, display, windowSize }),
  );
} else {
  const selected = explicit
    ? [target]
    : command === 'host'
      ? ['web', 'tv']
      : ['web', 'desktop', 'tv'];
  const host = command === 'host' ? 'macos' : undefined;
  for (const product of selected) {
    const cwd = resolve(root, 'apps', product);
    const artifacts = resolve(root, 'artifacts/ui-components', host ?? 'headless', product);
    await mkdir(resolve(cwd, '.nsh'), { recursive: true });
    await mkdir(artifacts, { recursive: true });
    const test = resolve(cwd, `.nsh/BaseComponents.${command}.test.tsx`);
    await writeFile(
      test,
      `import {registerComponentTests,registerOverlayTests} from '@hongguo/ui/testing';\nregisterComponentTests('../${entry}', ${JSON.stringify({ artifacts, host, target: product === 'tv' ? 'tv' : 'desktop' })});\nregisterOverlayTests('../${entry}', ${JSON.stringify({ target: product === 'tv' ? 'tv' : 'desktop' })});\n`,
    );
    await run(executable('nsh'), hostArgs(test, host, display), { cwd, env: rustEnvironment() });
  }
}
