import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, nsh, nativeTarget, root, run, rustEnvironment, targets } from './process.mjs';
import {
  hostArgs,
  hostProducts,
  previewArgs,
  uiComponentsOptions,
} from './ui-components-options.mjs';

const { command, target, explicit, display, windowSize, port } = uiComponentsOptions(
  process.argv.slice(2),
);
const entry = 'BaseComponentsPreview.tsx';
const host = command in hostProducts;
if (command === 'check') {
  for (const project of explicit ? [target] : targets) {
    await nsh('check', project);
    await nsh('build', project, [entry]);
  }
} else if (command === 'preview') {
  // The fixed port keeps one session per product: a repeat replaces its dev session and window.
  await nsh(
    'run',
    target,
    previewArgs(entry, target, nativeTarget(target), { port, display, windowSize }),
  );
} else {
  // Each host command runs one product, so a run opens exactly one window and ends.
  const selected = [host ? hostProducts[command] : target];
  for (const product of selected) {
    const cwd = resolve(root, 'apps', product);
    const artifacts = resolve(
      root,
      'artifacts/ui-components',
      host ? 'macos' : 'headless',
      product,
    );
    await mkdir(resolve(cwd, '.nsh'), { recursive: true });
    await mkdir(artifacts, { recursive: true });
    const test = resolve(cwd, `.nsh/BaseComponents.${command}.test.tsx`);
    let sweepEntry = `../${entry}`;
    if (host) {
      // The flat entry mounts every group at once, so one window captures the whole gallery.
      sweepEntry = `./BaseComponents.${command}.flat.tsx`;
      await writeFile(
        resolve(cwd, `.nsh/BaseComponents.${command}.flat.tsx`),
        `import { mount } from 'nsh';\nimport { ComponentGallery } from '@hongguo/ui/preview';\nmount(() => <ComponentGallery target="${product === 'tv' ? 'tv' : 'desktop'}" flat />);\n`,
      );
    }
    await writeFile(
      test,
      host
        ? // A host is for looking, not for assertions: one window captures the whole gallery.
          `import {registerComponentVisualSweep} from '@hongguo/ui/testing';\nregisterComponentVisualSweep('${sweepEntry}', ${JSON.stringify({ artifacts, host: 'macos', target: product === 'tv' ? 'tv' : 'desktop' })});\n`
        : `import {registerComponentTests,registerOverlayTests} from '@hongguo/ui/testing';\nregisterComponentTests('../${entry}', ${JSON.stringify({ artifacts, target: product === 'tv' ? 'tv' : 'desktop' })});\nregisterOverlayTests('../${entry}', ${JSON.stringify({ target: product === 'tv' ? 'tv' : 'desktop' })});\n`,
    );
    await run(executable('nsh'), hostArgs(test, host ? 'macos' : undefined, display), {
      cwd,
      env: rustEnvironment(),
    });
  }
}
