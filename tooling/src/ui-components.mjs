import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executable, nsh, nativeTarget, root, run, rustEnvironment } from './process.mjs';

const [command, ...rest] = process.argv.slice(2);
if (!['check', 'test', 'host', 'preview'].includes(command))
  throw new Error('Expected check|test|host|preview');
let target = 'desktop';
if (rest.length) {
  if (rest.length !== 2 || rest[0] !== '--target' || !['desktop', 'web', 'tv'].includes(rest[1]))
    throw new Error('Expected --target desktop|web|tv');
  target = rest[1];
}
const entry = 'BaseComponentsPreview.tsx';
if (command === 'check') {
  for (const product of rest.length ? [target] : ['web', 'desktop', 'tv']) {
    await nsh('check', product);
    await nsh('build', product, [entry]);
  }
} else if (command === 'preview') {
  await nsh('run', target, [entry, '--target', nativeTarget(target)]);
} else {
  const selected = rest.length
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
    await run(executable('nsh'), ['test', test, ...(host ? ['--target', host] : [])], {
      cwd,
      env: rustEnvironment(),
    });
  }
}
